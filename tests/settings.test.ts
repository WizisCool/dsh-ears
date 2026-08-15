import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { EarsSettingsController } from '../src/client/settings-controller.js'
import type { EarsRemote } from '../src/remote.js'
import type { EarsSettingsView, WhisperModelState } from '../src/remote-contract.js'

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  createSnapshotStore: (initial: unknown) => {
    let value = initial
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => value,
      set: (next: unknown) => {
        value = next
        for (const listener of listeners) listener()
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    }
  }
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutline14: () => null,
  Input: () => null,
  Menu: () => null
}))

const INITIAL_WHISPER_STATE: WhisperModelState = {
  cliAvailable: true,
  downloaded: true,
  downloading: false,
  progress: null,
  bytes: 100,
  totalBytes: 100,
  error: null
}

type EffortsResult = RemoteResult<{ efforts: Array<{ id: string; name: string }> }>

describe('EarsSettingsController Whisper state', () => {
  it('surfaces a RemoteResult failure without discarding the last known state', async () => {
    const getWhisperModelState = vi.fn<() => Promise<RemoteResult<WhisperModelState>>>()
      .mockResolvedValueOnce({ ok: true, value: INITIAL_WHISPER_STATE })
      .mockResolvedValueOnce({ ok: false, error: { code: 'HOST_FAILURE', message: 'Whisper service unavailable', details: {} } })
    const controller = new EarsSettingsController(createRemote({ getWhisperModelState }))

    await controller.refreshWhisperState()
    await controller.refreshWhisperState()

    expect(controller.getWhisperStore().getSnapshot()).toEqual({
      status: 'ready',
      state: { ...INITIAL_WHISPER_STATE, error: 'Whisper service unavailable' }
    })
    controller.dispose()
  })

  it('ignores an older Whisper response after the selected model changes', async () => {
    const base = deferred<RemoteResult<WhisperModelState>>()
    const small = deferred<RemoteResult<WhisperModelState>>()
    const getWhisperModelState = vi.fn((model: string) => model === 'base' ? base.promise : small.promise)
    const controller = new EarsSettingsController(createRemote({ getWhisperModelState }))

    controller.actions().edit('localWhisperModel', 'base')
    controller.actions().edit('localWhisperModel', 'small')
    await vi.waitFor(() => expect(getWhisperModelState).toHaveBeenCalledTimes(1))

    base.resolve({ ok: true, value: whisperState(1) })
    await vi.waitFor(() => expect(getWhisperModelState).toHaveBeenCalledTimes(2))
    small.resolve({ ok: true, value: whisperState(2) })
    await vi.waitFor(() => expect(controller.getWhisperStore().getSnapshot().state.bytes).toBe(2))

    expect(controller.getWhisperStore().getSnapshot().state.bytes).toBe(2)
    controller.dispose()
  })

  it('does not let an older Whisper refresh overwrite a cancellation result', async () => {
    const refresh = deferred<RemoteResult<WhisperModelState>>()
    const cancel = deferred<RemoteResult<WhisperModelState>>()
    const getWhisperModelState = vi.fn(() => refresh.promise)
    const cancelWhisperModelDownload = vi.fn(() => cancel.promise)
    const controller = new EarsSettingsController(createRemote({ getWhisperModelState, cancelWhisperModelDownload }))

    const refreshRequest = controller.refreshWhisperState()
    controller.actions().cancelModel()
    await vi.waitFor(() => expect(cancelWhisperModelDownload).toHaveBeenCalledTimes(1))

    cancel.resolve({ ok: true, value: { ...INITIAL_WHISPER_STATE, bytes: 0, totalBytes: 0 } })
    await vi.waitFor(() => expect(controller.getWhisperStore().getSnapshot().state.bytes).toBe(0))

    refresh.resolve({ ok: true, value: { ...INITIAL_WHISPER_STATE, downloading: true, bytes: 99, totalBytes: 100 } })
    await refreshRequest
    await Promise.resolve()

    expect(controller.getWhisperStore().getSnapshot().state.bytes).toBe(0)
    expect(controller.getWhisperStore().getSnapshot().state.downloading).toBe(false)
    controller.dispose()
  })
})

describe('EarsSettingsController settings lifecycle', () => {
  it('clears the reasoning effort when the selected model changes', () => {
    const controller = new EarsSettingsController(createRemote())
    controller.actions().edit('polishReasoningEffort', 'high')
    controller.actions().edit('polishModel', 'new-model')

    expect(controller.getCardStore().getSnapshot().polishReasoningEffort.text).toBe('')
    controller.dispose()
  })

  it('keeps a draft edited while its save request is in flight', async () => {
    vi.useFakeTimers()
    const update = deferred<RemoteResult<EarsSettingsView>>()
    const savedView: EarsSettingsView = {
      available: true,
      writable: true,
      settings: { ...DEFAULT_EARS_SETTINGS, language: 'en-US' },
      overridden: []
    }
    const updateSettings = vi.fn(() => update.promise)
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('language', 'en-US')
      await vi.advanceTimersByTimeAsync(400)
      expect(updateSettings).toHaveBeenCalledTimes(1)

      controller.actions().edit('language', 'ja-JP')
      update.resolve({ ok: true, value: savedView })
      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().language.text).toBe('ja-JP'))

      expect(controller.getCardStore().getSnapshot().language.text).toBe('ja-JP')
    } finally {
      controller.dispose()
      vi.useRealTimers()
    }
  })

  it('does not schedule a retry after the controller is disposed', async () => {
    vi.useFakeTimers()
    const pending = deferred<RemoteResult<EarsSettingsView>>()
    const getSettings = vi.fn(() => pending.promise)
    const controller = new EarsSettingsController(createRemote({ getSettings }))
    try {
      const refresh = controller.refreshSettings()
      controller.dispose()
      pending.resolve({ ok: false, error: { code: 'HOST_FAILURE', message: 'unavailable', details: {} } })
      await refresh
      await vi.advanceTimersByTimeAsync(1500)
      expect(getSettings).toHaveBeenCalledTimes(1)
    } finally {
      controller.dispose()
      vi.useRealTimers()
    }
  })

  it('limits the initial settings retry to one attempt', async () => {
    vi.useFakeTimers()
    const failure = { ok: false as const, error: { code: 'HOST_FAILURE', message: 'unavailable', details: {} } }
    const getSettings = vi.fn(async () => failure)
    const controller = new EarsSettingsController(createRemote({ getSettings }))
    try {
      await controller.refreshSettings()
      await vi.advanceTimersByTimeAsync(1500)
      await vi.advanceTimersByTimeAsync(1500)
      expect(getSettings).toHaveBeenCalledTimes(2)
    } finally {
      controller.dispose()
      vi.useRealTimers()
    }
  })

  it('does not let an older reasoning-effort response replace a newer route', async () => {
    const first = deferred<EffortsResult>()
    const second = deferred<EffortsResult>()
    const listReasoningEfforts = vi.fn((provider: string) => provider === 'p1' ? first.promise : second.promise)
    const controller = new EarsSettingsController(createRemote({ listReasoningEfforts }))

    controller.actions().edit('polishProvider', 'p1')
    controller.actions().edit('polishModel', 'm1')
    controller.actions().edit('polishProvider', 'p2')
    controller.actions().edit('polishModel', 'm2')
    await vi.waitFor(() => expect(listReasoningEfforts).toHaveBeenCalledTimes(2))

    second.resolve({ ok: true, value: { efforts: [{ id: 'p2-effort', name: 'P2' }] } })
    await vi.waitFor(() => expect(controller.getReasoningStore().getSnapshot().efforts[0]?.id).toBe('p2-effort'))
    first.resolve({ ok: true, value: { efforts: [{ id: 'p1-effort', name: 'P1' }] } })
    await Promise.resolve()

    expect(controller.getReasoningStore().getSnapshot().efforts[0]?.id).toBe('p2-effort')
    controller.dispose()
  })

  it('holds an incomplete polishing enable until the route is complete', async () => {
    vi.useFakeTimers()
    const updateSettings = vi.fn(async () => ({ ok: true as const, value: settingsView(true) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('polishingEnabled', 'on')
      await vi.advanceTimersByTimeAsync(400)

      expect(updateSettings).not.toHaveBeenCalled()
      expect(controller.getCardStore().getSnapshot().invalid).toBe(true)

      controller.actions().edit('polishProvider', 'provider')
      controller.actions().edit('polishModel', 'model')
      await vi.advanceTimersByTimeAsync(400)

      expect(updateSettings).toHaveBeenCalledWith({
        polishingEnabled: true,
        polishProvider: 'provider',
        polishModel: 'model',
        polishReasoningEffort: ''
      })
    } finally {
      controller.dispose()
      vi.useRealTimers()
    }
  })

  it('holds a cloud backend switch until its required endpoint is valid', async () => {
    vi.useFakeTimers()
    const updateSettings = vi.fn(async () => ({ ok: true as const, value: settingsView(false) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('asrBackend', 'cloud-openai')
      await vi.advanceTimersByTimeAsync(400)

      expect(updateSettings).not.toHaveBeenCalled()
      expect(controller.getCardStore().getSnapshot().cloudAsrEndpoint.invalid).toBe(true)

      controller.actions().edit('cloudAsrEndpoint', 'https://asr.example.test/audio/transcriptions')
      await vi.advanceTimersByTimeAsync(400)

      expect(updateSettings).toHaveBeenCalledWith({
        asrBackend: 'cloud-openai',
        cloudAsrEndpoint: 'https://asr.example.test/audio/transcriptions'
      })
    } finally {
      controller.dispose()
      vi.useRealTimers()
    }
  })
})

function createRemote(overrides: Partial<EarsRemote> = {}): EarsRemote {
  const settingsView: EarsSettingsView = {
    available: true,
    writable: true,
    settings: DEFAULT_EARS_SETTINGS,
    overridden: []
  }
  return {
    getSettings: async () => ({ ok: true, value: settingsView }),
    updateSettings: async () => ({ ok: true, value: settingsView }),
    listRoutes: async () => ({ ok: true, value: [] }),
    listAsrBackends: async () => ({ ok: true, value: [] }),
    listReasoningEfforts: async () => ({ ok: true, value: { efforts: [] } }),
    getWhisperModelState: async () => ({ ok: true, value: INITIAL_WHISPER_STATE }),
    downloadWhisperModel: async () => ({ ok: true, value: INITIAL_WHISPER_STATE }),
    cancelWhisperModelDownload: async () => ({ ok: true, value: INITIAL_WHISPER_STATE }),
    deleteWhisperModel: async () => ({ ok: true, value: INITIAL_WHISPER_STATE }),
    transcribe: async () => ({ ok: true, value: '' }),
    polish: async () => ({ ok: true, value: '' }),
    ...overrides
  } as EarsRemote
}

function whisperState(bytes: number): WhisperModelState {
  return { ...INITIAL_WHISPER_STATE, bytes, totalBytes: bytes }
}

function settingsView(polishingEnabled: boolean): EarsSettingsView {
  return {
    available: true,
    writable: true,
    settings: { ...DEFAULT_EARS_SETTINGS, polishingEnabled },
    overridden: []
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}
