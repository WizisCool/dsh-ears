import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import { joinSpacedSegments } from '../text-join.js'

export const DEEPGRAM_API_HOST = 'api.deepgram.com'
export const DEEPGRAM_DEFAULT_MODEL = 'nova-3'
export const DEEPGRAM_RECORDING_TIMEOUT_MS = 120_000
export const DEEPGRAM_REALTIME_OPEN_TIMEOUT_MS = 15_000
export const DEEPGRAM_REALTIME_FINISH_TIMEOUT_MS = 5_000
export const DEEPGRAM_REALTIME_MESSAGE_GRACE_MS = 5

export interface DeepgramRecordingAsrOptions {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly language?: string
  readonly endpoint?: string
  readonly model?: string
  readonly credential: string
  readonly signal?: AbortSignal
  readonly fetch?: typeof globalThis.fetch
}

export interface DeepgramRealtimeAsrOptions {
  readonly apiKey: string
  readonly model?: string
  readonly language?: string
  readonly endpoint?: string
  readonly signal?: AbortSignal
  readonly webSocketFactory?: (url: string, protocols?: string | string[]) => DeepgramWebSocket
}

export interface DeepgramRealtimeTranscript {
  readonly text: string
  readonly final: boolean
}

export interface DeepgramWebSocket {
  readonly readyState: number
  binaryType: string
  send(data: ArrayBuffer | ArrayBufferView | string): void
  close(code?: number, reason?: string): void
  addEventListener(type: string, listener: (event: DeepgramWebSocketEvent) => void): void
  removeEventListener(type: string, listener: (event: DeepgramWebSocketEvent) => void): void
}

export interface DeepgramWebSocketEvent {
  readonly data?: unknown
  readonly error?: unknown
  readonly code?: number
  readonly reason?: string
}

export function deepgramListenUrl(options: {
  endpoint?: string
  model?: string
  language?: string
  smartFormat?: boolean
  punctuate?: boolean
}): string {
  const base = (options.endpoint && options.endpoint.trim() !== '')
    ? options.endpoint.trim()
    : `https://${DEEPGRAM_API_HOST}/v1/listen`
  const url = new URL(base)
  const model = options.model?.trim() || DEEPGRAM_DEFAULT_MODEL
  url.searchParams.set('model', model)

  if (options.smartFormat !== false) {
    url.searchParams.set('smart_format', 'true')
  }
  if (options.punctuate !== false) {
    url.searchParams.set('punctuate', 'true')
  }

  const lang = options.language?.trim()
  if (lang !== undefined && lang !== '' && lang !== 'auto') {
    url.searchParams.set('language', lang)
  } else {
    url.searchParams.set('detect_language', 'true')
  }

  return url.toString()
}

export function deepgramRealtimeUrl(options: {
  endpoint?: string
  model?: string
  language?: string
  smartFormat?: boolean
  punctuate?: boolean
}): string {
  const base = (options.endpoint && options.endpoint.trim() !== '')
    ? options.endpoint.trim()
    : `wss://${DEEPGRAM_API_HOST}/v1/listen`
  const url = new URL(base)
  const model = options.model?.trim() || DEEPGRAM_DEFAULT_MODEL
  url.searchParams.set('model', model)
  url.searchParams.set('encoding', 'linear16')
  url.searchParams.set('sample_rate', '16000')
  url.searchParams.set('channels', '1')
  url.searchParams.set('interim_results', 'true')
  url.searchParams.set('endpointing', '300')
  url.searchParams.set('vad_events', 'true')

  if (options.smartFormat !== false) {
    url.searchParams.set('smart_format', 'true')
  }
  if (options.punctuate !== false) {
    url.searchParams.set('punctuate', 'true')
  }

  const lang = options.language?.trim()
  if (lang !== undefined && lang !== '' && lang !== 'auto') {
    url.searchParams.set('language', lang)
  }

  return url.toString()
}

export function extractDeepgramTranscript(response: unknown): string {
  if (!isRecord(response)) return ''
  const results = isRecord(response.results) ? response.results : undefined
  if (results === undefined) return ''
  const channels = Array.isArray(results.channels) ? results.channels : undefined
  if (channels === undefined || channels.length === 0) return ''
  const firstChannel = isRecord(channels[0]) ? channels[0] : undefined
  if (firstChannel === undefined) return ''
  const alternatives = Array.isArray(firstChannel.alternatives) ? firstChannel.alternatives : undefined
  if (alternatives === undefined || alternatives.length === 0) return ''
  const firstAlt = isRecord(alternatives[0]) ? alternatives[0] : undefined
  if (firstAlt === undefined || typeof firstAlt.transcript !== 'string') return ''
  return firstAlt.transcript.trim()
}

export function deepgramErrorDetail(body: unknown, status: number): string {
  if (isRecord(body)) {
    const errCode = typeof body.err_code === 'string' ? body.err_code : undefined
    const errMsg = typeof body.err_msg === 'string' ? body.err_msg : undefined
    if (errCode !== undefined && errMsg !== undefined) {
      return `${errCode}: ${errMsg}`
    }
    if (errMsg !== undefined) return errMsg
    if (errCode !== undefined) return errCode
    if (typeof body.error === 'string') return body.error
    if (isRecord(body.error) && typeof body.error.message === 'string') return body.error.message
  }
  return `HTTP ${status}`
}

export async function transcribeDeepgramAsr(options: DeepgramRecordingAsrOptions): Promise<string> {
  const key = options.credential.trim()
  if (key === '') throw new EarsError(EARS_ERROR_CODES.asrApiKeyNotConfigured, 'Deepgram API key is not configured')

  const fetchImpl = options.fetch ?? globalThis.fetch
  const url = deepgramListenUrl({
    endpoint: options.endpoint,
    model: options.model,
    language: options.language
  })

  const controller = new AbortController()
  if (options.signal?.aborted) controller.abort(options.signal.reason)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, DEEPGRAM_RECORDING_TIMEOUT_MS)

  const forwardAbort = () => controller.abort(options.signal?.reason)
  if (options.signal !== undefined) {
    options.signal.addEventListener('abort', forwardAbort, { once: true })
  }

  try {
    const contentType = (options.mimeType && options.mimeType.trim() !== '') ? options.mimeType.trim() : 'audio/wav'
    const headers: Record<string, string> = {
      Authorization: `Token ${key}`,
      'Content-Type': contentType
    }

    let response: Response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: options.audio as unknown as BodyInit,
        signal: controller.signal
      })
    } catch (error) {
      if (timedOut && !(options.signal?.aborted)) {
        throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Deepgram ASR request timed out')
      }
      throw error
    }

    const textBody = await response.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(textBody)
    } catch {
      // Non-JSON response
      parsed = undefined
    }

    if (!response.ok) {
      const detail = deepgramErrorDetail(parsed, response.status)
      throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, `Deepgram transcription failed: ${detail}`, { status: response.status })
    }

    return extractDeepgramTranscript(parsed)
  } finally {
    clearTimeout(timer)
    if (options.signal !== undefined) {
      options.signal.removeEventListener('abort', forwardAbort)
    }
  }
}

export class DeepgramRealtimeAsrSession {
  private readonly options: DeepgramRealtimeAsrOptions
  private socket: DeepgramWebSocket | undefined
  private opened = false
  private closed = false
  private ended = false
  private final = false
  private completedSentences: string[] = []
  private interimSentence = ''
  private transcript = ''
  private messageVersion = 0
  private lastError: unknown
  private readonly waiters = new Set<() => void>()

  constructor(options: DeepgramRealtimeAsrOptions) {
    this.options = options
  }

  async open(): Promise<void> {
    const apiKey = this.options.apiKey.trim()
    if (apiKey === '') throw new EarsError(EARS_ERROR_CODES.asrApiKeyNotConfigured, 'Deepgram API key is not configured')
    const url = deepgramRealtimeUrl({
      endpoint: this.options.endpoint,
      model: this.options.model,
      language: this.options.language
    })

    const factory = this.options.webSocketFactory ?? defaultWebSocketFactory
    this.socket = factory(url, ['token', apiKey])
    this.socket.binaryType = 'arraybuffer'
    this.socket.addEventListener('open', this.onOpen)
    this.socket.addEventListener('message', this.onMessage)
    this.socket.addEventListener('error', this.onError)
    this.socket.addEventListener('close', this.onClose)

    try {
      await this.waitFor(() => this.opened || this.lastError !== undefined || this.closed, DEEPGRAM_REALTIME_OPEN_TIMEOUT_MS)
      if (this.lastError !== undefined) throw this.lastError
      if (!this.opened) throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, 'Deepgram realtime recognition failed to connect')
    } catch (error) {
      this.close()
      throw error
    }
  }

  async sendAudio(audio: Uint8Array, signal: AbortSignal = this.options.signal ?? new AbortController().signal): Promise<DeepgramRealtimeTranscript> {
    if (audio.byteLength === 0) return this.snapshot()
    signal.throwIfAborted()
    const socket = this.requireSocket()
    if (!this.opened || this.ended || this.closed) {
      throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Deepgram realtime recognition is not active')
    }
    const version = this.messageVersion
    const payload = audio.byteOffset === 0 && audio.byteLength === audio.buffer.byteLength
      ? audio
      : audio.slice()
    socket.send(payload)
    await this.waitFor(() => this.messageVersion > version || this.lastError !== undefined || this.closed, DEEPGRAM_REALTIME_MESSAGE_GRACE_MS, signal)
    if (this.lastError !== undefined) throw this.lastError
    if (this.closed && this.messageVersion === version) {
      throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, 'Deepgram realtime recognition connection closed')
    }
    return this.snapshot()
  }

  async finish(signal: AbortSignal = this.options.signal ?? new AbortController().signal): Promise<string> {
    try {
      signal.throwIfAborted()
      if (this.final) return this.transcript.trim()
      const socket = this.requireSocket()
      if (!this.ended) {
        this.ended = true
        socket.send(JSON.stringify({ type: 'CloseStream' }))
      }
      await this.waitFor(() => this.final || this.closed || this.lastError !== undefined, DEEPGRAM_REALTIME_FINISH_TIMEOUT_MS, signal)
      if (this.lastError !== undefined) throw this.lastError
      return this.transcript.trim()
    } finally {
      this.close()
    }
  }

  snapshot(): DeepgramRealtimeTranscript {
    return { text: this.transcript, final: this.final }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    const socket = this.socket
    if (socket !== undefined) {
      socket.removeEventListener('open', this.onOpen)
      socket.removeEventListener('message', this.onMessage)
      socket.removeEventListener('error', this.onError)
      socket.removeEventListener('close', this.onClose)
      try {
        socket.close(1000, 'client closed')
      } catch {
        // Transport already closing.
      }
    }
    this.notifyWaiters()
  }

  private readonly onOpen = (): void => {
    this.opened = true
    this.notifyWaiters()
  }

  private readonly onMessage = (event: DeepgramWebSocketEvent): void => {
    if (typeof event.data !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(event.data)
    } catch {
      return
    }
    if (!isRecord(parsed)) return

    // Deepgram error response over WebSocket
    if (typeof parsed.err_code === 'string' || typeof parsed.err_msg === 'string') {
      const detail = deepgramErrorDetail(parsed, 400)
      this.setError(new EarsError(EARS_ERROR_CODES.asrHttpFailed, `Deepgram realtime recognition failed: ${detail}`))
      return
    }

    if (parsed.type === 'Metadata') {
      this.final = true
      this.notifyWaiters()
      return
    }

    if (parsed.type === 'Results') {
      const isFinal = parsed.is_final === true
      const channel = isRecord(parsed.channel) ? parsed.channel : undefined
      const alternatives = channel && Array.isArray(channel.alternatives) ? channel.alternatives : []
      const firstAlt = alternatives.length > 0 && isRecord(alternatives[0]) ? alternatives[0] : undefined
      const altText = firstAlt && typeof firstAlt.transcript === 'string' ? firstAlt.transcript.trim() : ''

      if (isFinal) {
        if (altText !== '') {
          this.completedSentences.push(altText)
        }
        this.interimSentence = ''
      } else {
        this.interimSentence = altText
      }
      this.rebuildTranscript()
      this.messageVersion += 1
      this.notifyWaiters()
    }
  }

  private readonly onError = (event: DeepgramWebSocketEvent): void => {
    const message = event.error instanceof Error ? event.error.message : 'Deepgram realtime recognition connection failed'
    this.setError(new EarsError(EARS_ERROR_CODES.asrHttpFailed, message))
  }

  private readonly onClose = (event: DeepgramWebSocketEvent): void => {
    this.closed = true
    this.final = true
    if (event.code !== undefined && event.code !== 1000 && event.code !== 1005 && this.lastError === undefined) {
      const reason = typeof event.reason === 'string' && event.reason !== '' ? event.reason : `code ${String(event.code)}`
      this.setError(new EarsError(EARS_ERROR_CODES.asrHttpFailed, `Deepgram realtime recognition closed unexpectedly: ${reason}`))
    }
    this.notifyWaiters()
  }

  private rebuildTranscript(): void {
    let result = ''
    for (const sentence of this.completedSentences) {
      result = joinSpacedSegments(result, sentence)
    }
    if (this.interimSentence !== '') {
      result = joinSpacedSegments(result, this.interimSentence)
    }
    this.transcript = result.trim()
  }

  private requireSocket(): DeepgramWebSocket {
    if (this.socket === undefined) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Deepgram realtime socket was not created')
    return this.socket
  }

  private setError(error: unknown): void {
    if (this.lastError === undefined) this.lastError = error
    this.close()
  }

  private notifyWaiters(): void {
    for (const waiter of this.waiters) waiter()
  }

  private async waitFor(predicate: () => boolean, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (predicate()) return
    signal?.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const onAbort = () => {
        cleanup()
        reject(signal?.reason ?? new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Aborted'))
      }
      const check = () => {
        if (!predicate()) return
        cleanup()
        resolve()
      }
      const onTimeout = () => {
        cleanup()
        resolve()
      }
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer)
        this.waiters.delete(check)
        signal?.removeEventListener('abort', onAbort)
      }
      timer = setTimeout(onTimeout, timeoutMs)
      this.waiters.add(check)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}

function defaultWebSocketFactory(url: string, protocols?: string | string[]): DeepgramWebSocket {
  const scope = globalThis as typeof globalThis & {
    WebSocket: new (url: string, protocols?: string | string[]) => unknown
  }
  if (typeof scope.WebSocket !== 'function') {
    throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'WebSocket is unavailable in this environment')
  }
  return new scope.WebSocket(url, protocols) as unknown as DeepgramWebSocket
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
