import { describe, expect, it, vi } from 'vitest'
import type { EarsCardState } from '../src/client/settings-controller.js'
import { EarsSettingsSection, localeEn, localeZh } from '../src/client/settings.js'

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn(),
  useState: vi.fn()
}))

vi.mock('react', () => ({
  useEffect: reactMocks.useEffect,
  useId: () => 'settings-test',
  useRef: <T>(initial: T) => ({ current: initial }),
  useState: reactMocks.useState,
  useSyncExternalStore: vi.fn()
}))

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutline14: () => null,
  Input: () => null,
  Menu: ({ anchor }: { anchor: unknown }) => anchor
}))

vi.mock('@thesvg/react/github', () => ({
  default: () => null
}))

const field = (text: string) => ({ text, overridden: false, invalid: false })
const cardState: EarsCardState = {
  available: true,
  writable: true,
  loaded: true,
  loadFailed: false,
  recoveredSettingsFields: [],
  saving: false,
  failed: false,
  dirty: true,
  invalid: false,
  asrBackend: field('web-speech'),
  webSpeechLanguage: field('en-US'),
  localWhisperModel: field('base'),
  localWhisperAcceleration: field('default'),
  localWhisperLanguage: field(''),
  cloudAsrProvider: field('groq'),
  cloudAsrGroqApiKey: field(''),
  cloudAsrGroqApiKeyConfigured: false,
  cloudAsrGroqApiKeyClearPending: false,
  cloudAsrGroqLanguage: field(''),
  cloudAsrCustomApiKey: field(''),
  cloudAsrCustomApiKeyConfigured: false,
  cloudAsrCustomApiKeyClearPending: false,
  cloudAsrBailianApiKey: field(''),
  cloudAsrBailianApiKeyConfigured: false,
  cloudAsrBailianApiKeyClearPending: false,
  cloudAsrBailianLanguage: field(''),
  cloudAsrTencentSecretKey: field(''),
  cloudAsrTencentSecretKeyConfigured: false,
  cloudAsrTencentSecretKeyClearPending: false,
  cloudAsrCustomEndpoint: field(''),
  cloudAsrCustomModel: field(''),
  cloudAsrCustomLanguage: field(''),
  cloudAsrBailianHost: field(''),
  cloudAsrGroqModel: field(''),
  cloudAsrBailianModel: field(''),
  cloudAsrTencentAppId: field(''),
  cloudAsrTencentSecretId: field(''),
  cloudAsrTencentEngineType: field('16k_zh'),
  cloudAsrTencentService: field('recording-file'),
  maxRecordingSeconds: field('120'),
  voiceShortcutEnabled: field('on'),
  voiceShortcut: field('ctrl+shift+space'),
  voiceSoundsEnabled: field('on'),
  settingsDisplayName: field('dsh-ears'),
  polishingEnabled: field('off'),
  polishProvider: field(''),
  polishModel: field(''),
  polishReasoningEffort: field(''),
  polishPrompt: field('')
}

describe('EarsSettingsSection lifecycle', () => {
  it('flushes pending auto-saves when the settings section unmounts', () => {
    reactMocks.useEffect.mockClear()
    reactMocks.useState.mockReset()
    reactMocks.useState.mockImplementation((initial) => [initial, vi.fn()])
    const flush = vi.fn()

    EarsSettingsSection({
      useEarsCard: (selector) => selector(cardState),
      useEarsRoutes: (selector) => selector({ status: 'ready', routes: [] }),
      useEarsReasoning: (selector) => selector({ status: 'ready', efforts: [] }),
      useEarsWhisper: (selector) => selector({
        status: 'ready',
        state: {
          runtimeAvailable: false,
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
      setCustomApiKey: vi.fn(),
      clearCustomApiKey: vi.fn(),
      undoClearCustomApiKey: vi.fn(),
      setBailianApiKey: vi.fn(),
      clearBailianApiKey: vi.fn(),
      undoClearBailianApiKey: vi.fn(),
      setTencentSecretKey: vi.fn(),
      clearTencentSecretKey: vi.fn(),
      undoClearTencentSecretKey: vi.fn(),
      setSiliconFlowApiKey: vi.fn(),
      clearSiliconFlowApiKey: vi.fn(),
      undoClearSiliconFlowApiKey: vi.fn(),
      flush,
      retryCloudModels: vi.fn(),
      downloadModel: vi.fn(),
      cancelModel: vi.fn(),
      deleteModel: vi.fn(),
      loadAbout: vi.fn(async () => null),
      checkForUpdate: vi.fn(async () => ({ status: 'unpublished' as const, installed: '0.1.0', latest: null, updateCommand: 'dsh plugin --profile web update dsh-ears' }))
    })

    const lifecycleEffect = reactMocks.useEffect.mock.calls.find(([, dependencies]) => Array.isArray(dependencies) && dependencies.length === 0)
    expect(lifecycleEffect).toBeDefined()
    const cleanup = lifecycleEffect?.[0]()
    expect(cleanup).toBeTypeOf('function')
    cleanup?.()
    expect(flush).toHaveBeenCalledOnce()
  })

  it('renders projected dynamic Agent defaults directly without a fake default label', () => {
    reactMocks.useEffect.mockClear()
    reactMocks.useState.mockReset()
    reactMocks.useState
      .mockImplementationOnce(() => ['polishing', vi.fn()])
      .mockImplementation((initial) => [initial, vi.fn()])

    const tree = EarsSettingsSection({
      useEarsCard: (selector) => selector({
        ...cardState,
        dirty: false,
        polishingEnabled: field('on'),
        polishProvider: field('deepseek-official'),
        polishModel: field('dynamic-model'),
        polishReasoningEffort: field('')
      }),
      useEarsRoutes: (selector) => selector({ status: 'ready', routes: [] }),
      useEarsReasoning: (selector) => selector({ status: 'ready', efforts: [] }),
      useEarsWhisper: (selector) => selector({
        status: 'ready',
        state: {
          runtimeAvailable: true,
          downloaded: true,
          downloading: false,
          progress: null,
          bytes: 100,
          totalBytes: 100,
          error: null
        }
      }),
      useEarsCloudModels: (selector) => selector({ status: 'ready', view: { status: 'unsupported' } }),
      earsT: (key) => localeEn[key],
      edit: vi.fn(),
      setApiKey: vi.fn(),
      clearApiKey: vi.fn(),
      undoClearApiKey: vi.fn(),
      setCustomApiKey: vi.fn(),
      clearCustomApiKey: vi.fn(),
      undoClearCustomApiKey: vi.fn(),
      setBailianApiKey: vi.fn(),
      clearBailianApiKey: vi.fn(),
      undoClearBailianApiKey: vi.fn(),
      setTencentSecretKey: vi.fn(),
      clearTencentSecretKey: vi.fn(),
      undoClearTencentSecretKey: vi.fn(),
      setSiliconFlowApiKey: vi.fn(),
      clearSiliconFlowApiKey: vi.fn(),
      undoClearSiliconFlowApiKey: vi.fn(),
      flush: vi.fn(),
      retryCloudModels: vi.fn(),
      downloadModel: vi.fn(),
      cancelModel: vi.fn(),
      deleteModel: vi.fn(),
      loadAbout: vi.fn(async () => null),
      checkForUpdate: vi.fn(async () => ({ status: 'unpublished' as const, installed: '0.1.0', latest: null, updateCommand: 'dsh plugin --profile web update dsh-ears' }))
    })

    const text = textContent(renderHostElements(tree))
    expect(text).toContain('deepseek-official')
    expect(text).toContain('dynamic-model')
    // Projected values must render directly; falling back to placeholder copy
    // means the dynamic Agent default stopped being projected.
    const placeholderCopy = [localeEn.providerPlaceholder, localeEn.modelPlaceholder, localeZh.providerPlaceholder, localeZh.modelPlaceholder]
    expect(placeholderCopy.some((label) => text.includes(label))).toBe(false)
  })

  it('does not keep prior Whisper error styling while a new acceleration is being checked', () => {
    reactMocks.useEffect.mockClear()
    reactMocks.useState.mockReset()
    reactMocks.useState
      .mockImplementationOnce(() => ['recognition', vi.fn()])
      .mockImplementation((initial) => [initial, vi.fn()])

    const tree = EarsSettingsSection({
      useEarsCard: (selector) => selector({
        ...cardState,
        asrBackend: field('local-whisper'),
        localWhisperAcceleration: field('cuda')
      }),
      useEarsRoutes: (selector) => selector({ status: 'ready', routes: [] }),
      useEarsReasoning: (selector) => selector({ status: 'ready', efforts: [] }),
      useEarsWhisper: (selector) => selector({
        status: 'loading',
        state: {
          runtimeAvailable: false,
          downloaded: true,
          downloading: false,
          progress: null,
          bytes: 100,
          totalBytes: 100,
          error: 'Restart dsh to switch Local Whisper acceleration',
          errorCode: 'whisper.restartRequired',
          errorParams: { loadedVariant: 'vulkan', requestedVariant: 'cuda' }
        }
      }),
      useEarsCloudModels: (selector) => selector({ status: 'ready', view: { status: 'unsupported' } }),
      earsT: (key) => localeEn[key],
      edit: vi.fn(),
      setApiKey: vi.fn(),
      clearApiKey: vi.fn(),
      undoClearApiKey: vi.fn(),
      setCustomApiKey: vi.fn(),
      clearCustomApiKey: vi.fn(),
      undoClearCustomApiKey: vi.fn(),
      setBailianApiKey: vi.fn(),
      clearBailianApiKey: vi.fn(),
      undoClearBailianApiKey: vi.fn(),
      setSiliconFlowApiKey: vi.fn(),
      clearSiliconFlowApiKey: vi.fn(),
      undoClearSiliconFlowApiKey: vi.fn(),
      flush: vi.fn(),
      retryCloudModels: vi.fn(),
      downloadModel: vi.fn(),
      cancelModel: vi.fn(),
      deleteModel: vi.fn(),
      loadAbout: vi.fn(async () => null),
      checkForUpdate: vi.fn(async () => ({ status: 'unpublished' as const, installed: '0.1.0', latest: null, updateCommand: 'dsh plugin --profile web update dsh-ears' }))
    })

    const checkingRow = renderHostElements(tree).find((element) =>
      element.type === 'div' && textContent(element.props?.children) === localeEn.whisperChecking
    )
    expect(checkingRow).toBeDefined()
    expect(checkingRow?.props?.role).toBeUndefined()
    expect(String(checkingRow?.props?.className ?? '')).not.toContain('invalid')
  })
})

interface ElementLike {
  type?: unknown
  props?: Record<string, unknown>
}

function renderHostElements(node: unknown): ElementLike[] {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return []
  if (Array.isArray(node)) return node.flatMap(renderHostElements)
  const element = node as ElementLike
  if (typeof element.type === 'function') return renderHostElements(element.type(element.props ?? {}))
  return [element, ...renderHostElements(element.props?.children)]
}

function textContent(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  const element = node as ElementLike
  return textContent(element.props?.children)
}
