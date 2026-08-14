export type WebSpeechState = 'starting' | 'recording' | 'stopped' | 'error'

type SpeechRecognitionAlternativeLike = {
  readonly transcript: string
}

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

type SpeechRecognitionResultListLike = {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}

type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}

type SpeechRecognitionErrorEventLike = Event & {
  readonly error?: string
  readonly message?: string
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export type WebSpeechSessionOptions = {
  language: string
  onStart?: () => void
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError: (error: Error) => void
  onEnd: (text: string) => void
}

export function isWebSpeechAvailable(): boolean {
  return getSpeechRecognitionConstructor() !== undefined
}

export class WebSpeechSession {
  private readonly recognition: SpeechRecognitionLike
  private readonly options: WebSpeechSessionOptions
  private active = false
  private stopping = false
  private finalText = ''

  constructor(options: WebSpeechSessionOptions) {
    const Recognition = getSpeechRecognitionConstructor()
    if (Recognition === undefined) {
      throw new Error('Speech recognition is unavailable in this browser')
    }

    this.options = options
    this.recognition = new Recognition()
    this.recognition.lang = options.language
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.maxAlternatives = 1
    this.recognition.onstart = () => options.onStart?.()
    this.recognition.onresult = (event) => this.handleResult(event)
    this.recognition.onerror = (event) => this.handleError(event)
    this.recognition.onend = () => this.handleEnd()
  }

  start(): void {
    if (this.active) return
    this.active = true
    this.stopping = false

    try {
      this.recognition.start()
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  stop(): void {
    if (!this.active) return
    this.stopping = true
    this.active = false
    this.recognition.stop()
  }

  abort(): void {
    this.stopping = true
    this.active = false
    this.recognition.abort()
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    let finalChunk = ''
    let interimChunk = ''

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = result?.[0]?.transcript ?? ''
      if (result?.isFinal === true) {
        finalChunk = appendSpeech(finalChunk, transcript)
      } else {
        interimChunk = appendSpeech(interimChunk, transcript)
      }
    }

    if (finalChunk !== '') {
      this.finalText = appendSpeech(this.finalText, finalChunk)
      this.options.onFinal(this.finalText)
    }

    this.options.onInterim(appendSpeech(this.finalText, interimChunk))
  }

  private handleError(event: SpeechRecognitionErrorEventLike): void {
    if (this.stopping) return

    const code = event.error ?? 'unknown'
    const detail = event.message === undefined ? '' : `: ${event.message}`
    this.fail(new Error(`Speech recognition failed (${code})${detail}`))
  }

  private handleEnd(): void {
    if (this.active && !this.stopping) {
      try {
        this.recognition.start()
        return
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)))
        return
      }
    }

    this.options.onEnd(this.finalText)
  }

  private fail(error: Error): void {
    if (this.stopping) return
    this.active = false
    this.stopping = true
    this.options.onError(error)
    this.recognition.abort()
    this.options.onEnd(this.finalText)
  }
}

export function appendSpeech(current: string, next: string): string {
  if (next === '') return current
  if (current === '') return next
  if (/\s$/.test(current) || /^\s/.test(next)) return current + next
  return `${current} ${next}`
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as SpeechRecognitionWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}
