import { describe, expect, it, vi } from 'vitest'
import type { EarsCardState } from '../src/client/settings-controller.js'
import { EarsSettingsSection, localeEn } from '../src/client/settings.js'

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn()
}))

vi.mock('react', () => ({
  useEffect: reactMocks.useEffect,
  useId: () => 'settings-test',
  useRef: <T>(initial: T) => ({ current: initial }),
  useState: <T>(initial: T) => [initial, vi.fn()] as const,
  useSyncExternalStore: vi.fn()
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutline14: () => null,
  Input: () => null,
  Menu: () => null
}))

const field = (text: string) => ({ text, overridden: false, invalid: false })
const cardState: EarsCardState = {
  available: true,
  writable: true,
  loaded: true,
  loadFailed: false,
  saving: false,
  failed: false,
  dirty: true,
  invalid: false,
  asrBackend: field('web-speech'),
  localWhisperModel: field('base'),
  cloudAsrProvider: field('groq'),
  cloudAsrApiKey: field(''),
  cloudAsrApiKeyConfigured: false,
  cloudAsrApiKeyClearPending: false,
  cloudAsrEndpoint: field(''),
  cloudAsrModel: field(''),
  language: field('en-US'),
  maxRecordingSeconds: field('120'),
  polishingEnabled: field('off'),
  polishProvider: field(''),
  polishModel: field(''),
  polishReasoningEffort: field('')
}

describe('EarsSettingsSection lifecycle', () => {
  it('discards drafts when the settings section unmounts', () => {
    reactMocks.useEffect.mockClear()
    const discard = vi.fn()

    EarsSettingsSection({
      useEarsCard: (selector) => selector(cardState),
      useEarsRoutes: (selector) => selector({ status: 'ready', routes: [] }),
      useEarsReasoning: (selector) => selector({ status: 'ready', efforts: [] }),
      useEarsWhisper: (selector) => selector({
        status: 'ready',
        state: {
          cliAvailable: false,
          downloaded: false,
          downloading: false,
          progress: null,
          bytes: null,
          totalBytes: null,
          error: null
        }
      }),
      useEarsCloudModels: (selector) => selector({ status: 'ready', view: { status: 'unsupported' } }),
      earsT: (key) => localeEn[key],
      edit: vi.fn(),
      setApiKey: vi.fn(),
      clearApiKey: vi.fn(),
      undoClearApiKey: vi.fn(),
      save: vi.fn(),
      discard,
      retryCloudModels: vi.fn(),
      downloadModel: vi.fn(),
      cancelModel: vi.fn(),
      deleteModel: vi.fn()
    })

    const lifecycleEffect = reactMocks.useEffect.mock.calls.find(([, dependencies]) => Array.isArray(dependencies) && dependencies.length === 0)
    expect(lifecycleEffect).toBeDefined()
    const cleanup = lifecycleEffect?.[0]()
    expect(cleanup).toBeTypeOf('function')
    cleanup?.()
    expect(discard).toHaveBeenCalledOnce()
  })
})
