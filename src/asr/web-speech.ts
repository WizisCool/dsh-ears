import { joinSpacedSegments } from '../text-join.js'

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
  /** Watchdog for shells that accept stop() but never deliver an end event. */
  stopFallbackMs?: number
  onStart?: () => void
  onInterim: (text: string) => void
  onFinal: (text: string) => void
  onError: (error: Error) => void
  onEnd: (text: string) => void
}

const DEFAULT_STOP_FALLBACK_MS = 1_200

export function isWebSpeechAvailable(): boolean {
  return getSpeechRecognitionConstructor() !== undefined
}

export class WebSpeechSession {
  private readonly recognition: SpeechRecognitionLike
  private readonly options: WebSpeechSessionOptions
  private active = false
  private stopping = false
  private finalText = ''
  private lastHeard = ''
  private ended = false
  private silent = false
  private stopTimer: ReturnType<typeof setTimeout> | undefined

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
    if (this.active || this.ended || this.silent) return
    this.active = true
    this.stopping = false

    try {
      this.recognition.start()
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  stop(): void {
    if (!this.active || this.ended || this.silent) return
    this.stopping = true
    this.active = false
    this.armStopFallback()
    try {
      this.recognition.stop()
    } catch {
      this.endOnce()
    }
  }

  abort(): void {
    if (this.ended || this.silent) return
    this.silent = true
    this.stopping = true
    this.active = false
    this.clearStopFallback()
    this.recognition.onstart = null
    this.recognition.onresult = null
    this.recognition.onerror = null
    this.recognition.onend = null
    try {
      this.recognition.abort()
    } catch {
      // The browser may report an invalid state when the recognition already ended.
    }
    this.ended = true
  }

  private handleResult(event: SpeechRecognitionEventLike): void {
    if (this.silent || this.ended) return
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
      this.lastHeard = this.finalText
      this.options.onFinal(this.finalText)
    }

    const heard = appendSpeech(this.finalText, interimChunk)
    if (heard !== '') this.lastHeard = heard
    this.options.onInterim(heard)
  }

  private handleError(event: SpeechRecognitionErrorEventLike): void {
    if (this.stopping || this.silent || this.ended) return

    const code = event.error ?? 'unknown'
    const detail = event.message === undefined ? '' : `: ${event.message}`
    this.fail(new Error(`Speech recognition failed (${code})${detail}`))
  }

  private handleEnd(): void {
    if (this.silent || this.ended) return
    if (this.active && !this.stopping) {
      try {
        this.recognition.start()
        return
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)))
        return
      }
    }

    this.endOnce()
  }

  private fail(error: Error): void {
    if (this.stopping || this.silent || this.ended) return
    this.active = false
    this.stopping = true
    this.options.onError(error)
    try {
      this.recognition.abort()
    } catch {
      // The error has already been surfaced; finish the session below.
    }
    this.endOnce()
  }

  private endOnce(): void {
    if (this.ended || this.silent) return
    this.ended = true
    this.clearStopFallback()
    this.options.onEnd(this.finalText !== '' ? this.finalText : this.lastHeard)
  }

  /**
   * Some Chromium shells accept start() and stop() but never deliver an end
   * event, which left the recognition bar in "recording" forever and made
   * every later stop click a no-op. End the session at the deadline so the
   * caller can leave the recording state with whatever was heard.
   */
  private armStopFallback(): void {
    this.clearStopFallback()
    this.stopTimer = setTimeout(() => {
      this.stopTimer = undefined
      if (this.ended || this.silent) return
      try {
        this.recognition.abort()
      } catch {
        // The session ends below even when the browser rejects abort().
      }
      this.endOnce()
    }, this.options.stopFallbackMs ?? DEFAULT_STOP_FALLBACK_MS)
  }

  private clearStopFallback(): void {
    if (this.stopTimer === undefined) return
    clearTimeout(this.stopTimer)
    this.stopTimer = undefined
  }
}

export function appendSpeech(current: string, next: string): string {
  return joinSpacedSegments(current, next)
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined
  const speechWindow = window as SpeechRecognitionWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}
