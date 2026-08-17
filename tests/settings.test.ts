import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { DEFAULT_EARS_SETTINGS, MAX_POLISH_PROMPT_LENGTH } from '../src/config.js'
import type { EarsSettings } from '../src/config.js'
import { EarsSettingsController, SETTINGS_SAVE_DEBOUNCE_MS } from '../src/client/settings-controller.js'
import { localeEn, localeZh } from '../src/client/settings.js'
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
  Menu: () => null,
  Tooltip: ({ children }: { children: unknown }) => children
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
    const first = deferred<RemoteResult<EarsSettingsView>>()
    const second = deferred<RemoteResult<EarsSettingsView>>()
    const updateSettings = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('language', 'en-US')
      controller.actions().save()
      expect(updateSettings).toHaveBeenCalledTimes(1)

      controller.actions().edit('language', 'ja-JP')
      first.resolve({
        ok: true,
        value: {
          available: true,
          writable: true,
          settings: { ...DEFAULT_EARS_SETTINGS, language: 'en-US' },
          cloudAsrApiKeyConfigured: false,
          overridden: []
        }
      })
      await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2))
      expect(controller.getCardStore().getSnapshot().language.text).toBe('ja-JP')
      expect(controller.getCardStore().getSnapshot().dirty).toBe(true)

      second.resolve({
        ok: true,
        value: {
          available: true,
          writable: true,
          settings: { ...DEFAULT_EARS_SETTINGS, language: 'ja-JP' },
          cloudAsrApiKeyConfigured: false,
          overridden: []
        }
      })
      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().dirty).toBe(false))
    } finally {
      controller.dispose()
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

  it('stages edits and auto-saves after the debounce window', async () => {
    vi.useFakeTimers()
    const updateSettings = vi.fn(async () => ({ ok: true as const, value: settingsView(false) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('polishingEnabled', 'on')
      expect(updateSettings).not.toHaveBeenCalled()
      const snapshot = controller.getCardStore().getSnapshot()
      expect(snapshot.dirty).toBe(true)
      expect(snapshot.invalid).toBe(false)
      expect(snapshot.failed).toBe(false)

      await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DEBOUNCE_MS)
      expect(updateSettings).toHaveBeenCalledWith({ polishingEnabled: true })
      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().dirty).toBe(false))
    } finally {
      controller.dispose()
      vi.useRealTimers()
    }
  })

  it('saves the polishing toggle and its pair together', async () => {
    const updateSettings = vi.fn(async () => ({ ok: true as const, value: settingsView(true) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('polishingEnabled', 'on')
      controller.actions().edit('polishProvider', 'provider')
      controller.actions().edit('polishModel', 'model')
      controller.actions().save()

      expect(updateSettings).toHaveBeenCalledWith({
        polishingEnabled: true,
        polishProvider: 'provider',
        polishModel: 'model',
        polishReasoningEffort: ''
      })
    } finally {
      controller.dispose()
    }
  })

  it('preserves the selected polishing model while switching providers', () => {
    const controller = new EarsSettingsController(createRemote())
    try {
      controller.actions().edit('polishProvider', 'provider-a')
      controller.actions().edit('polishModel', 'model-a')
      controller.actions().edit('polishReasoningEffort', 'high')
      controller.actions().edit('polishProvider', 'provider-b')
      expect(controller.getCardStore().getSnapshot().polishModel.text).toBe('')

      controller.actions().edit('polishModel', 'model-b')
      controller.actions().edit('polishProvider', 'provider-a')

      expect(controller.getCardStore().getSnapshot().polishModel.text).toBe('model-a')
      expect(controller.getCardStore().getSnapshot().polishReasoningEffort.text).toBe('high')
    } finally {
      controller.dispose()
    }
  })

  it('saves a Groq backend switch with its model when save is clicked', async () => {
    const saved = { ...DEFAULT_EARS_SETTINGS }
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(saved, patch)
      return { ok: true as const, value: settingsViewFrom(saved) }
    })
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('asrBackend', 'cloud-openai')
      expect(updateSettings).not.toHaveBeenCalled()

      controller.actions().edit('cloudAsrModel', 'whisper-large-v3-turbo')
      controller.actions().save()

      expect(updateSettings).toHaveBeenCalledWith({
        asrBackend: 'cloud-openai',
        cloudAsrModel: 'whisper-large-v3-turbo'
      })
      expect(controller.getCardStore().getSnapshot().cloudAsrModel.invalid).toBe(false)
    } finally {
      controller.dispose()
    }
  })

  it('does not refetch the cloud model list when only the selected model changes', async () => {
    const saved = { ...DEFAULT_EARS_SETTINGS }
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(saved, patch)
      return { ok: true as const, value: settingsViewFrom(saved) }
    })
    const listCloudProviderModels = vi.fn(async () => ({ ok: true as const, value: { status: 'ok' as const, models: ['whisper-large-v3-turbo'] } }))
    const controller = new EarsSettingsController(createRemote({ updateSettings, listCloudProviderModels }))
    try {
      await controller.refreshSettings()
      expect(listCloudProviderModels).toHaveBeenCalledTimes(1)

      controller.actions().edit('asrBackend', 'cloud-openai')
      await vi.waitFor(() => expect(listCloudProviderModels).toHaveBeenCalledTimes(2))
      controller.actions().save()
      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().dirty).toBe(false))

      controller.actions().edit('cloudAsrModel', 'whisper-large-v3-turbo')
      controller.actions().save()
      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().dirty).toBe(false))

      expect(listCloudProviderModels).toHaveBeenCalledTimes(2)
    } finally {
      controller.dispose()
    }
  })

  it('preserves each cloud provider model while switching between providers', async () => {
    const controller = new EarsSettingsController(createRemote())
    try {
      await controller.refreshSettings()
      controller.actions().edit('asrBackend', 'cloud-openai')
      controller.actions().edit('cloudAsrModel', 'whisper-large-v3-turbo')
      controller.actions().edit('cloudAsrProvider', 'custom')
      expect(controller.getCardStore().getSnapshot().cloudAsrModel.text).toBe('whisper-1')

      controller.actions().edit('cloudAsrModel', 'custom-model')
      controller.actions().edit('cloudAsrProvider', 'groq')

      expect(controller.getCardStore().getSnapshot().cloudAsrModel.text).toBe('whisper-large-v3-turbo')
    } finally {
      controller.dispose()
    }
  })

  it('saves a custom cloud switch with its defaulted model and clears the empty endpoint', async () => {
    const saved = { ...DEFAULT_EARS_SETTINGS }
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(saved, patch)
      return { ok: true as const, value: settingsViewFrom(saved) }
    })
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('asrBackend', 'cloud-openai')
      controller.actions().edit('cloudAsrProvider', 'custom')
      controller.actions().edit('cloudAsrEndpoint', '')
      controller.actions().save()

      expect(updateSettings).toHaveBeenCalledTimes(1)
      expect(updateSettings).toHaveBeenCalledWith({
        asrBackend: 'cloud-openai',
        cloudAsrProvider: 'custom',
        cloudAsrModel: 'whisper-1',
        cloudAsrEndpoint: ''
      })
      expect(controller.getCardStore().getSnapshot().cloudAsrEndpoint.invalid).toBe(false)
      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().dirty).toBe(false))

      controller.actions().edit('cloudAsrEndpoint', 'https://asr.example.test/audio/transcriptions')
      controller.actions().save()

      await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2))
      expect(updateSettings).toHaveBeenCalledWith({
        cloudAsrEndpoint: 'https://asr.example.test/audio/transcriptions'
      })
    } finally {
      controller.dispose()
    }
  })

  it('reports load failure only after the single retry fails and clears it on recovery', async () => {
    vi.useFakeTimers()
    const failure = { ok: false as const, error: { code: 'HOST_FAILURE', message: 'unavailable', details: {} } }
    const success = { ok: true as const, value: settingsView(false) }
    const getSettings = vi.fn(async () => failure)
    const controller = new EarsSettingsController(createRemote({ getSettings }))
    try {
      expect(controller.getCardStore().getSnapshot().loadFailed).toBe(false)
      await controller.refreshSettings()
      expect(controller.getCardStore().getSnapshot().loadFailed).toBe(false)
      await vi.advanceTimersByTimeAsync(1500)
      expect(getSettings).toHaveBeenCalledTimes(2)
      expect(controller.getCardStore().getSnapshot().loadFailed).toBe(true)

      getSettings.mockResolvedValueOnce(success)
      await controller.refreshSettings()
      expect(controller.getCardStore().getSnapshot().loaded).toBe(true)
      expect(controller.getCardStore().getSnapshot().loadFailed).toBe(false)
    } finally {
      controller.dispose()
      vi.useRealTimers()
    }
  })

  it('marks typed-invalid values red immediately and skips only those fields', async () => {
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => ({
      ok: true as const,
      value: settingsViewFrom({ ...DEFAULT_EARS_SETTINGS, ...patch } as EarsSettings)
    }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('language', '')
      const first = controller.getCardStore().getSnapshot()
      expect(first.language.invalid).toBe(true)
      expect(first.invalid).toBe(true)
      expect(first.dirty).toBe(true)

      controller.actions().save()
      expect(updateSettings).not.toHaveBeenCalled()

      controller.actions().edit('language', 'en-US')
      controller.actions().edit('cloudAsrEndpoint', 'not-a-url')
      controller.actions().save()
      expect(updateSettings).toHaveBeenCalledWith({ language: 'en-US' })
      expect(controller.getCardStore().getSnapshot().cloudAsrEndpoint.invalid).toBe(true)

      controller.actions().setApiKey('x'.repeat(513))
      controller.actions().save()
      expect(updateSettings).toHaveBeenCalledTimes(1)
      expect(controller.getCardStore().getSnapshot().cloudAsrApiKey.invalid).toBe(true)

      controller.actions().setApiKey('')
      expect(controller.getCardStore().getSnapshot().cloudAsrApiKey.invalid).toBe(false)
    } finally {
      controller.dispose()
    }
  })

  it('never marks an untouched persisted value invalid', async () => {
    const getSettings = vi.fn(async () => ({ ok: true as const, value: settingsViewFrom({ ...DEFAULT_EARS_SETTINGS, language: '' }) }))
    const controller = new EarsSettingsController(createRemote({ getSettings }))

    await controller.refreshSettings()

    const snapshot = controller.getCardStore().getSnapshot()
    expect(snapshot.language.text).toBe('')
    expect(snapshot.language.invalid).toBe(false)
    controller.dispose()
  })

  it('resets an emptied recording limit to the default on save', async () => {
    const saved = { ...DEFAULT_EARS_SETTINGS }
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(saved, patch)
      return { ok: true as const, value: settingsViewFrom(saved) }
    })
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('maxRecordingSeconds', '')
      const snapshot = controller.getCardStore().getSnapshot()
      expect(snapshot.maxRecordingSeconds.invalid).toBe(false)
      expect(snapshot.invalid).toBe(false)

      controller.actions().save()
      expect(updateSettings).toHaveBeenCalledWith({ maxRecordingSeconds: 120 })
      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().dirty).toBe(false))
    } finally {
      controller.dispose()
    }
  })

  it('stages a non-blank API key and commits it on save', async () => {
    const saved = { ...DEFAULT_EARS_SETTINGS }
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => {
      Object.assign(saved, patch)
      return { ok: true as const, value: settingsViewFrom(saved) }
    })
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().setApiKey('gsk_test')
      expect(updateSettings).not.toHaveBeenCalled()
      expect(controller.getCardStore().getSnapshot().cloudAsrApiKey.text).toBe('gsk_test')
      expect(controller.getCardStore().getSnapshot().dirty).toBe(true)

      controller.actions().save()
      await vi.waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ cloudAsrApiKey: 'gsk_test' }))
      expect(controller.getCardStore().getSnapshot().dirty).toBe(false)

      controller.actions().setApiKey('')
      expect(controller.getCardStore().getSnapshot().dirty).toBe(false)
    } finally {
      controller.dispose()
    }
  })

  it('stages the clear action and typing a new key cancels the pending clear', async () => {
    const updateSettings = vi.fn(async () => ({ ok: true as const, value: settingsView(false) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().clearApiKey()
      expect(controller.getCardStore().getSnapshot().dirty).toBe(true)
      expect(controller.getCardStore().getSnapshot().cloudAsrApiKeyClearPending).toBe(true)
      expect(updateSettings).not.toHaveBeenCalled()

      controller.actions().undoClearApiKey()
      expect(controller.getCardStore().getSnapshot().dirty).toBe(false)
      expect(controller.getCardStore().getSnapshot().cloudAsrApiKeyClearPending).toBe(false)
      controller.actions().clearApiKey()
      expect(controller.getCardStore().getSnapshot().cloudAsrApiKeyClearPending).toBe(true)

      controller.actions().setApiKey('gsk_new')
      controller.actions().save()
      expect(updateSettings).toHaveBeenCalledWith({ cloudAsrApiKey: 'gsk_new' })

      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().dirty).toBe(false))
      controller.actions().clearApiKey()
      controller.actions().save()
      expect(updateSettings).toHaveBeenCalledWith({ cloudAsrApiKey: '' })
    } finally {
      controller.dispose()
    }
  })

  it('keeps staged drafts after a rejected save and discards them on demand', async () => {
    const updateSettings = vi.fn(async () => ({ ok: false as const, error: { code: 'HOST_FAILURE', message: 'rejected', details: {} } }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    try {
      await controller.refreshSettings()
      controller.actions().edit('language', 'en-US')
      controller.actions().save()
      await vi.waitFor(() => expect(controller.getCardStore().getSnapshot().failed).toBe(true))

      const snapshot = controller.getCardStore().getSnapshot()
      expect(snapshot.dirty).toBe(true)
      expect(snapshot.language.text).toBe('en-US')

      controller.actions().discard()
      const after = controller.getCardStore().getSnapshot()
      expect(after.dirty).toBe(false)
      expect(after.failed).toBe(false)
      expect(after.language.text).toBe('zh-CN')
    } finally {
      controller.dispose()
    }
  })

  it('populates the cloud model store from the provider listing RPC', async () => {
    const listCloudProviderModels = vi.fn(async () => ({ ok: true as const, value: { status: 'ok' as const, models: ['whisper-large-v3-turbo'] } }))
    const controller = new EarsSettingsController(createRemote({ listCloudProviderModels }))

    await controller.refreshSettings()

    expect(controller.getCloudModelsStore().getSnapshot()).toEqual({
      status: 'ready',
      view: { status: 'ok', models: ['whisper-large-v3-turbo'] }
    })
    controller.dispose()
  })

  it('marks the custom provider model listing as unsupported', async () => {
    const listCloudProviderModels = vi.fn(async () => ({ ok: true as const, value: { status: 'no-key' as const } }))
    const controller = new EarsSettingsController(createRemote({ listCloudProviderModels }))

    controller.actions().edit('cloudAsrProvider', 'custom')
    await vi.waitFor(() => expect(controller.getCloudModelsStore().getSnapshot().view.status).toBe('unsupported'))
    expect(listCloudProviderModels).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('does not let an older cloud model listing replace a newer provider state', async () => {
    const listing = deferred<RemoteResult<{ status: 'ok'; models: string[] }>>()
    const listCloudProviderModels = vi.fn(() => listing.promise)
    const controller = new EarsSettingsController(createRemote({ listCloudProviderModels }))
    try {
      const first = controller.refreshCloudModels()
      controller.actions().edit('cloudAsrProvider', 'custom')
      expect(controller.getCloudModelsStore().getSnapshot().view.status).toBe('unsupported')

      listing.resolve({ ok: true, value: { status: 'ok', models: ['whisper-large-v3-turbo'] } })
      await first
      await Promise.resolve()

      expect(controller.getCloudModelsStore().getSnapshot().view.status).toBe('unsupported')
    } finally {
      controller.dispose()
    }
  })
})

describe('Locale parity', () => {
  it('contains identical keys for Chinese and English dictionaries', () => {
    const zhKeys = Object.keys(localeZh).sort()
    const enKeys = Object.keys(localeEn).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('provides non-empty translations for voice button states', () => {
    const buttonKeys = [
      'voiceStart',
      'voiceStop',
      'voiceStarting',
      'voiceTranscribing',
      'voicePolishing',
      'voicePolishFailed',
      'voiceError',
      'voiceUnavailable',
      'voiceUnavailableWebSpeech',
      'voiceUnavailableRecorder'
    ] as const

    for (const key of buttonKeys) {
      expect(localeZh[key]).toBeTruthy()
      expect(localeEn[key]).toBeTruthy()
      expect(typeof localeZh[key]).toBe('string')
      expect(typeof localeEn[key]).toBe('string')
    }
  })
})

function createRemote(overrides: Partial<EarsRemote> = {}): EarsRemote {
  const settingsView: EarsSettingsView = {
    available: true,
    writable: true,
    settings: DEFAULT_EARS_SETTINGS,
    cloudAsrApiKeyConfigured: false,
    overridden: []
  }
  return {
    getSettings: async () => ({ ok: true, value: settingsView }),
    updateSettings: async () => ({ ok: true, value: settingsView }),
    listCloudProviderModels: async () => ({ ok: true, value: { status: 'unsupported' } }),
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
  return settingsViewFrom({ ...DEFAULT_EARS_SETTINGS, polishingEnabled })
}

function settingsViewFrom(settings: EarsSettings): EarsSettingsView {
  return {
    available: true,
    writable: true,
    settings,
    cloudAsrApiKeyConfigured: settings.cloudAsrApiKey.trim() !== '',
    overridden: []
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('EarsSettingsController voice shortcut fields', () => {
  it('stages and saves the shortcut enable switch as a boolean', async () => {
    const saved: EarsSettingsView = settingsViewFrom(DEFAULT_EARS_SETTINGS)
    const updateSettings = vi.fn(async () => ({ ok: true as const, value: saved }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    await controller.refreshSettings()

    expect(controller.getCardStore().getSnapshot().voiceShortcutEnabled.text).toBe('on')
    controller.actions().edit('voiceShortcutEnabled', 'off')
    expect(controller.getCardStore().getSnapshot().voiceShortcutEnabled.text).toBe('off')
    await controller.actions().save()

    expect(updateSettings).toHaveBeenCalledWith({ voiceShortcutEnabled: false })
    controller.dispose()
  })

  it('saves valid fields while an invalid shortcut draft stays local', async () => {
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => ({
      ok: true as const,
      value: settingsViewFrom({ ...DEFAULT_EARS_SETTINGS, ...patch } as EarsSettings)
    }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    await controller.refreshSettings()

    controller.actions().edit('voiceShortcut', 'alt+a')
    expect(controller.getCardStore().getSnapshot().voiceShortcut.invalid).toBe(true)
    expect(controller.getCardStore().getSnapshot().invalid).toBe(true)

    controller.actions().edit('language', 'en-US')
    await controller.actions().save()

    expect(updateSettings).toHaveBeenCalledWith({ language: 'en-US' })
    expect(controller.getCardStore().getSnapshot().language.text).toBe('en-US')
    expect(controller.getCardStore().getSnapshot().voiceShortcut.text).toBe('alt+a')
    expect(controller.getCardStore().getSnapshot().voiceShortcut.invalid).toBe(true)
    controller.dispose()
  })

  it('accepts a capturable chord and clears a stored shortcut back to the default', async () => {
    const updateSettings = vi.fn(async (_patch: object) => ({ ok: true as const, value: settingsViewFrom(DEFAULT_EARS_SETTINGS) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    await controller.refreshSettings()

    controller.actions().edit('voiceShortcut', 'ctrl+shift+f9')
    expect(controller.getCardStore().getSnapshot().voiceShortcut.invalid).toBe(false)
    expect(controller.getCardStore().getSnapshot().invalid).toBe(false)
    await controller.actions().save()
    expect(updateSettings).toHaveBeenCalledWith({ voiceShortcut: 'ctrl+shift+f9' })

    controller.actions().edit('voiceShortcut', DEFAULT_EARS_SETTINGS.voiceShortcut)
    await controller.actions().save()
    expect(updateSettings).toHaveBeenLastCalledWith({ voiceShortcut: 'ctrl+shift+space' })
    controller.dispose()
  })

  it('treats a lone modifier chord as invalid', () => {
    const controller = new EarsSettingsController(createRemote())
    controller.actions().edit('voiceShortcut', 'ctrl+shift')
    expect(controller.getCardStore().getSnapshot().voiceShortcut.invalid).toBe(true)
    controller.dispose()
  })

  it('falls back to the shortcut defaults when the persisted view predates the fields', async () => {
    const legacySettings: EarsSettings = { ...DEFAULT_EARS_SETTINGS } as EarsSettings
    delete (legacySettings as Partial<EarsSettings>).voiceShortcutEnabled
    delete (legacySettings as Partial<EarsSettings>).voiceShortcut
    const controller = new EarsSettingsController(createRemote({
      getSettings: async () => ({ ok: true as const, value: settingsViewFrom(legacySettings) })
    }))
    await controller.refreshSettings()

    expect(controller.getCardStore().getSnapshot().voiceShortcut.text).toBe('ctrl+shift+space')
    expect(controller.getCardStore().getSnapshot().voiceShortcutEnabled.text).toBe('on')
    expect(controller.getCardStore().getSnapshot().voiceShortcut.invalid).toBe(false)
    controller.dispose()
  })
})

describe('EarsSettingsController custom polish prompt', () => {
  it('stages and saves a custom polish prompt as a plain string', async () => {
    const updateSettings = vi.fn(async (_patch: object) => ({ ok: true as const, value: settingsViewFrom(DEFAULT_EARS_SETTINGS) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    await controller.refreshSettings()

    controller.actions().edit('polishPrompt', 'Polish like a friend.')
    expect(controller.getCardStore().getSnapshot().dirty).toBe(true)
    await controller.actions().save()

    expect(updateSettings).toHaveBeenCalledWith({ polishPrompt: 'Polish like a friend.' })
    controller.dispose()
  })

  it('writes an empty draft as an explicit clear back to the built-in default', async () => {
    const updateSettings = vi.fn(async (_patch: object) => ({ ok: true as const, value: settingsViewFrom(DEFAULT_EARS_SETTINGS) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    await controller.refreshSettings()

    controller.actions().edit('polishPrompt', '')
    await controller.actions().save()

    expect(updateSettings).toHaveBeenCalledWith({ polishPrompt: '' })
    controller.dispose()
  })

  it('flags an over-length prompt invalid and skips it until it is shortened', async () => {
    const updateSettings = vi.fn(async (_patch: object) => ({ ok: true as const, value: settingsViewFrom(DEFAULT_EARS_SETTINGS) }))
    const controller = new EarsSettingsController(createRemote({ updateSettings }))
    await controller.refreshSettings()

    controller.actions().edit('polishPrompt', 'p'.repeat(MAX_POLISH_PROMPT_LENGTH + 1))
    const over = controller.getCardStore().getSnapshot()
    expect(over.polishPrompt.invalid).toBe(true)
    expect(over.invalid).toBe(true)

    controller.actions().edit('language', 'en-US')
    await controller.actions().save()
    expect(updateSettings).toHaveBeenCalledWith({ language: 'en-US' })
    expect(controller.getCardStore().getSnapshot().polishPrompt.invalid).toBe(true)

    controller.actions().edit('polishPrompt', 'p'.repeat(MAX_POLISH_PROMPT_LENGTH))
    const within = controller.getCardStore().getSnapshot()
    expect(within.polishPrompt.invalid).toBe(false)
    expect(within.invalid).toBe(false)

    await controller.actions().save()
    expect(updateSettings).toHaveBeenCalledWith({ polishPrompt: 'p'.repeat(MAX_POLISH_PROMPT_LENGTH) })
    controller.dispose()
  })
})
