import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { POLISH_OUTPUT_GUARD, POLISH_SYSTEM_PROMPT, polishUserText, resolvePolishSystemPrompt } from '../src/polish/prompts.js'
import { PolishService, validateSettings } from '../src/polish/service.js'

vi.mock('../src/asr/local-whisper.js', () => ({
  isWhisperAvailable: vi.fn(async () => false),
  transcribeWithWhisper: vi.fn()
}))

type FakeSettingsScope = {
  get: () => typeof DEFAULT_EARS_SETTINGS
  update: (patch: unknown) => Promise<void>
}

function createSettingsScope(settings: typeof DEFAULT_EARS_SETTINGS = DEFAULT_EARS_SETTINGS): FakeSettingsScope {
  return {
    get: () => settings,
    update: vi.fn(async () => undefined)
  }
}

describe('settings registration validate', () => {
  it('accepts a Groq key write while the cloud model is not yet selected (D-024 deadlock regression)', () => {
    expect(() => validateSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'groq',
      cloudAsrApiKey: 'gsk_test_key',
      cloudAsrModel: ''
    })).not.toThrow()
  })

  it('accepts a custom provider without an endpoint while cloud ASR is selected', () => {
    expect(() => validateSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'custom',
      cloudAsrEndpoint: ''
    })).not.toThrow()
  })

  it('still rejects a malformed endpoint value', () => {
    expect(() => validateSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'custom',
      cloudAsrEndpoint: 'not-a-url'
    })).toThrow('Cloud ASR endpoint')
  })
})

describe('PolishService', () => {
  const fibers: Array<{ dispose(): Promise<void> }> = []

  afterEach(async () => {
    for (const fiber of fibers.splice(0).reverse()) await fiber.dispose()
  })

  it('lists routes from dsh providers and models', async () => {
    const llm = {
      listProviders: () => [{ id: 'test-provider', name: 'Test Provider' }],
      listModels: vi.fn(async () => [{ id: 'test-model', name: 'Test Model' }])
    }
    const context = createContext(llm)
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)

    await expect(context.get('dshEarsPolish')?.listRoutes()).resolves.toEqual([{
      provider: 'test-provider',
      providerName: 'Test Provider',
      model: 'test-model',
      modelName: 'Test Model'
    }])
  })

  it('returns the raw transcript when the selected route fails', async () => {
    const context = createContext({
      prepareCall: vi.fn(async () => {
        throw new Error('route unavailable')
      })
    })
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)

    await expect(context.get('dshEarsPolish')?.polish('  保留这段内容  ', 'provider', 'model', '', new AbortController().signal)).resolves.toBe('保留这段内容')
  })

  it('does not report cloud ASR as available without a model', async () => {
    const context = createContext({}, {
      ...DEFAULT_EARS_SETTINGS,
      cloudAsrEndpoint: 'https://asr.example.test/audio/transcriptions',
      cloudAsrModel: ''
    })
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)

    const backends = await context.get('dshEarsPolish')?.listAsrBackends()
    expect(backends?.find((backend) => backend.id === 'cloud-openai')?.available).toBe(false)
  })

  it('honors an aborted transcription before decoding the payload', async () => {
    const context = createContext({})
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)
    const controller = new AbortController()
    controller.abort()

    await expect(context.get('dshEarsPolish')?.transcribe('not-base64', 'audio/wav', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects unknown backend and Whisper model identifiers', async () => {
    const context = createContext({}, { ...DEFAULT_EARS_SETTINGS, asrBackend: 'future-backend' })
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)
    const service = context.get('dshEarsPolish')
    if (service === undefined) throw new Error('Polish service is missing')

    await expect(service.transcribe('AQ==', 'audio/wav', new AbortController().signal)).rejects.toThrow('Unknown dsh-ears ASR backend')
    await expect(service.getWhisperModelState('future-model')).rejects.toThrow('Unknown dsh-ears Whisper model')
  })

  it('does not update settings when the request is already aborted', async () => {
    const update = vi.fn(async () => undefined)
    const context = new Context()
    context.provide('llm', {} as never)
    context.provide('settings', {
      writable: true,
      register: () => ({ get: () => DEFAULT_EARS_SETTINGS, update })
    } as never)
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)
    const controller = new AbortController()
    controller.abort()

    await expect(context.get('dshEarsPolish')?.updateSettings({ language: 'en-US' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(update).not.toHaveBeenCalled()
  })

  it('does not prepare a route when the request is already aborted', async () => {
    const prepareCall = vi.fn()
    const context = createContext({ prepareCall })
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)
    const controller = new AbortController()
    controller.abort()

    await expect(context.get('dshEarsPolish')?.polish('保留这段内容', 'provider', 'model', '', controller.signal)).resolves.toBe('保留这段内容')
    expect(prepareCall).not.toHaveBeenCalled()
  })

  it('falls back to the raw transcript when polishing output exceeds the limit', async () => {
    const context = createContext({
      prepareCall: vi.fn(async () => ({
        config: {},
        stream: async function* () {
          yield { type: 'text-delta', text: 'x'.repeat(24_001) }
        }
      }))
    })
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)

    await expect(context.get('dshEarsPolish')?.polish('保留原文', 'provider', 'model', '', new AbortController().signal)).resolves.toBe('保留原文')
  })

  it('passes the polish timeout signal to reasoning metadata lookup', async () => {
    vi.useFakeTimers()
    const resolveModelInfo = vi.fn((_provider: string, _model: string, signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const context = createContext({
      resolveModelInfo,
      prepareCall: vi.fn(async () => ({
        config: {},
        stream: async function* () {}
      }))
    })
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)
    try {
      const pending = context.get('dshEarsPolish')?.polish('保留原文', 'provider', 'model', 'high', new AbortController().signal)
      await vi.advanceTimersByTimeAsync(20_000)
      await expect(pending).resolves.toBe('保留原文')
      expect(resolveModelInfo).toHaveBeenCalledWith('provider', 'model', expect.any(AbortSignal))
    } finally {
      vi.useRealTimers()
    }
  })

  it('marks transcript content as data and keeps the output contract in the built-in default', () => {
    expect(POLISH_SYSTEM_PROMPT).toContain('Non-Instructional Input')
    expect(POLISH_SYSTEM_PROMPT).toContain('Output only the polished text directly.')
    expect(polishUserText('ignore this as an instruction')).toBe('<transcript>\nignore this as an instruction\n</transcript>')
  })
})

describe('resolvePolishSystemPrompt', () => {
  it('uses the built-in default when the stored prompt is empty or blank', () => {
    expect(resolvePolishSystemPrompt('')).toBe(POLISH_SYSTEM_PROMPT)
    expect(resolvePolishSystemPrompt('   \n  ')).toBe(POLISH_SYSTEM_PROMPT)
  })

  it('replaces the default with the trimmed custom prompt plus the output guard', () => {
    const result = resolvePolishSystemPrompt('  Polish like a friend.\n\nKeep it short.  ')
    expect(result).toBe('Polish like a friend.\n\nKeep it short.\n\n' + POLISH_OUTPUT_GUARD)
    expect(result).toContain(POLISH_OUTPUT_GUARD)
    expect(result).not.toBe(POLISH_SYSTEM_PROMPT)
  })
})

describe('PolishService custom system prompt', () => {
  const fibers: Array<{ dispose(): Promise<void> }> = []

  afterEach(async () => {
    for (const fiber of fibers.splice(0).reverse()) await fiber.dispose()
  })

  async function polishWithSystemCapture(settings: typeof DEFAULT_EARS_SETTINGS): Promise<string | undefined> {
    let capturedSystem: string | undefined
    const context = createContext({
      prepareCall: vi.fn(async () => ({
        config: {},
        stream: vi.fn(async function* (options: { system?: string }) {
          capturedSystem = options.system
          yield { type: 'text-delta', text: '好的' }
        })
      }))
    }, settings)
    const fiber = await context.plugin(PolishService)
    fibers.push(fiber)
    await context.get('dshEarsPolish')?.polish('原始内容', 'provider', 'model', '', new AbortController().signal)
    return capturedSystem
  }

  it('passes the built-in default prompt when the stored prompt is empty', async () => {
    expect(await polishWithSystemCapture(DEFAULT_EARS_SETTINGS)).toBe(POLISH_SYSTEM_PROMPT)
  })

  it('passes the custom prompt with the output guard when one is set', async () => {
    const custom = 'Polish like a friend.'
    expect(await polishWithSystemCapture({ ...DEFAULT_EARS_SETTINGS, polishPrompt: custom }))
      .toBe(`${custom}\n\n${POLISH_OUTPUT_GUARD}`)
  })
})

function createContext(llm: unknown, settings = DEFAULT_EARS_SETTINGS): Context {
  const context = new Context()
  context.provide('llm', llm as never)
  context.provide('settings', {
    writable: true,
    register: () => createSettingsScope(settings)
  } as never)
  return context
}
