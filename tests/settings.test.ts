import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { EarsSettingsController } from '../src/client/settings.js'
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
