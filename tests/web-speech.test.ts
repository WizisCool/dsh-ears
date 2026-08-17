import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSpeechSession, appendSpeech, isWebSpeechAvailable } from '../src/asr/web-speech.js'

class FakeRecognition {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 0
  onstart: (() => void) | null = null
  onresult: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn(() => this.onstart?.())
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn(() => this.onend?.())

  emitResult(...results: Array<{ isFinal: boolean; transcript: string }>): void {
    const event = {
      resultIndex: 0,
      results: results.map((result) => ({
        isFinal: result.isFinal,
        length: 1,
        0: { transcript: result.transcript }
      }))
    } as unknown as Event
    this.onresult?.(event)
  }
}

const originalWindow = globalThis.window

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
  } else {
    globalThis.window = originalWindow
  }
  vi.restoreAllMocks()
})

describe('appendSpeech', () => {
  it('joins transcript chunks without duplicating whitespace', () => {
    expect(appendSpeech('', 'hello')).toBe('hello')
    expect(appendSpeech('hello', ' world')).toBe('hello world')
    expect(appendSpeech('hello', 'world')).toBe('hello world')
  })
})

describe('WebSpeechSession', () => {
  it('configures continuous interim recognition and emits transcript updates', () => {
    const recognitions: FakeRecognition[] = []
    class Recognition extends FakeRecognition {
      constructor() {
        super()
        recognitions.push(this)
      }
    }
    globalThis.window = { SpeechRecognition: Recognition } as unknown as Window & typeof globalThis

    const onInterim = vi.fn()
    const onFinal = vi.fn()
    const onEnd = vi.fn()
    const session = new WebSpeechSession({
      language: 'zh-CN',
      onInterim,
      onFinal,
      onError: vi.fn(),
      onEnd
    })

    session.start()
    const recognition = recognitions[0]
    recognition.emitResult({ isFinal: false, transcript: '你好' })
    recognition.emitResult({ isFinal: true, transcript: '你好' })
    session.stop()

    expect(isWebSpeechAvailable()).toBe(true)
    expect(recognition.lang).toBe('zh-CN')
    expect(recognition.continuous).toBe(true)
    expect(recognition.interimResults).toBe(true)
    expect(onInterim).toHaveBeenCalledWith('你好')
    expect(onFinal).toHaveBeenCalledWith('你好')
    expect(onEnd).toHaveBeenCalledWith('你好')
  })

  it('commits the last interim transcript when stop never receives a final result', () => {
    const recognitions: FakeRecognition[] = []
    class Recognition extends FakeRecognition {
      constructor() {
        super()
        recognitions.push(this)
      }
    }
    globalThis.window = { SpeechRecognition: Recognition } as unknown as Window & typeof globalThis
    const onEnd = vi.fn()
    const session = new WebSpeechSession({
      language: 'zh-CN',
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd
    })

    session.start()
    recognitions[0].emitResult({ isFinal: false, transcript: '第一帮我看一下项目结构' })
    session.stop()

    expect(onEnd).toHaveBeenCalledWith('第一帮我看一下项目结构')
  })

  it('reports unsupported environments without constructing a session', () => {
    globalThis.window = {} as Window & typeof globalThis
    expect(isWebSpeechAvailable()).toBe(false)
    expect(() => new WebSpeechSession({
      language: 'zh-CN',
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn()
    })).toThrow('unavailable')
  })

  it('silently aborts during teardown without committing a transcript', () => {
    class Recognition extends FakeRecognition {}
    globalThis.window = { SpeechRecognition: Recognition } as unknown as Window & typeof globalThis
    const onEnd = vi.fn()
    const session = new WebSpeechSession({
      language: 'zh-CN',
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd
    })

    session.start()
    session.abort()

    expect(onEnd).not.toHaveBeenCalled()
  })

  it('reports a synchronous start failure and ends exactly once', () => {
    class Recognition extends FakeRecognition {
      constructor() {
        super()
        this.start = () => { throw new Error('start failed') }
      }
    }
    globalThis.window = { SpeechRecognition: Recognition } as unknown as Window & typeof globalThis
    const onError = vi.fn()
    const onEnd = vi.fn()
    const session = new WebSpeechSession({
      language: 'zh-CN',
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError,
      onEnd
    })

    session.start()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
