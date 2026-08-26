import { createHash, createHmac, randomInt } from 'node:crypto'
import { EARS_ERROR_CODES, EarsError } from '../errors.js'

export const TENCENT_API_HOST = 'asr.tencentcloudapi.com'
export const TENCENT_API_VERSION = '2019-06-14'
export const TENCENT_API_SERVICE = 'asr'
export const TENCENT_RECORDING_MAX_AUDIO_BYTES = 5 * 1024 * 1024
export const TENCENT_REALTIME_HOST = 'asr.cloud.tencent.com'
export const TENCENT_REALTIME_PATH = '/asr/v2'

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const RECORDING_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 500
const REALTIME_OPEN_TIMEOUT_MS = 15_000
const REALTIME_FINISH_TIMEOUT_MS = 30_000
const REALTIME_MESSAGE_GRACE_MS = 120
const TENCENT_VOICE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export interface TencentRecordingAsrOptions {
  readonly audio: Uint8Array
  readonly appId: string
  readonly secretId: string
  readonly secretKey: string
  readonly engineType: string
  readonly signal: AbortSignal
  readonly fetch?: typeof globalThis.fetch
  /** Injectable wall clock in milliseconds for deterministic tests. */
  readonly now?: () => number
}

export interface TencentRealtimeAsrOptions {
  readonly appId: string
  readonly secretId: string
  readonly secretKey: string
  readonly engineType: string
  readonly signal?: AbortSignal
  readonly now?: () => number
  readonly webSocketFactory?: (url: string) => TencentWebSocket
}

export interface TencentRealtimeTranscript {
  readonly text: string
  readonly final: boolean
}

export interface TencentWebSocket {
  readonly readyState: number
  binaryType: string
  send(data: ArrayBuffer | ArrayBufferView | string): void
  close(code?: number, reason?: string): void
  addEventListener(type: string, listener: (event: TencentWebSocketEvent) => void): void
  removeEventListener(type: string, listener: (event: TencentWebSocketEvent) => void): void
}

interface TencentWebSocketEvent {
  readonly data?: unknown
  readonly error?: unknown
  readonly code?: number
  readonly reason?: string
}

interface TencentApiResponse {
  Response?: {
    RequestId?: string
    Error?: { Code?: string; Message?: string }
    Data?: Record<string, unknown>
  }
}

export function tencentRecordingRequestBody(options: {
  audio: Uint8Array
  engineType: string
}): Record<string, unknown> {
  return {
    EngineModelType: options.engineType.trim(),
    ChannelNum: 1,
    ResTextFormat: 3,
    SourceType: 1,
    Data: Buffer.from(options.audio).toString('base64'),
    DataLen: options.audio.byteLength,
    ConvertNumMode: 1,
    FilterDirty: 0,
    FilterPunc: 0,
    FilterModal: 0
  }
}

export function tencentApi3Signature(options: {
  action: string
  body: string
  secretId: string
  secretKey: string
  timestamp: number
  host?: string
  service?: string
}): string {
  const host = options.host ?? TENCENT_API_HOST
  const service = options.service ?? TENCENT_API_SERVICE
  const date = new Date(options.timestamp * 1000).toISOString().slice(0, 10)
  const hashedPayload = sha256(options.body)
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\ncontent-type;host\n${hashedPayload}`
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${options.timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`
  const secretDate = hmacSha256(`TC3${options.secretKey}`, date)
  const secretService = hmacSha256(secretDate, service)
  const secretSigning = hmacSha256(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')
  return `TC3-HMAC-SHA256 Credential=${options.secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`
}

export function tencentRealtimeQuery(options: {
  appId: string
  secretId: string
  secretKey: string
  engineType: string
  timestamp: number
  voiceId?: string
  nonce?: number
}): Record<string, string> {
  const timestamp = Math.floor(options.timestamp)
  return {
    engine_model_type: options.engineType.trim(),
    expired: String(timestamp + 300),
    nonce: String(options.nonce ?? randomInt(1, 2_147_483_647)),
    secretid: options.secretId.trim(),
    timestamp: String(timestamp),
    voice_format: '1',
    voice_id: options.voiceId ?? randomTencentVoiceId()
  }
}

function randomTencentVoiceId(): string {
  return Array.from({ length: 16 }, () => TENCENT_VOICE_ID_ALPHABET[randomInt(TENCENT_VOICE_ID_ALPHABET.length)]!).join('')
}

export function tencentRealtimeUrl(options: {
  appId: string
  secretId: string
  secretKey: string
  engineType: string
  timestamp: number
  voiceId?: string
  nonce?: number
}): string {
  const query = tencentRealtimeQuery(options)
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(query[key] ?? '')}`)
    .join('&')
  const source = `${TENCENT_REALTIME_HOST}${TENCENT_REALTIME_PATH}/${encodeURIComponent(options.appId.trim())}?${canonicalQuery}`
  const signature = createHmac('sha1', options.secretKey).update(source).digest('base64')
  return `wss://${source}&signature=${encodeURIComponent(signature)}`
}

export async function transcribeTencentCloudRecording(options: TencentRecordingAsrOptions): Promise<string> {
  if (options.audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
  if (options.audio.byteLength > TENCENT_RECORDING_MAX_AUDIO_BYTES) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio exceeds Tencent Cloud limits')
  options.signal.throwIfAborted()

  const fetchImpl = options.fetch ?? globalThis.fetch
  const now = options.now ?? (() => Date.now())
  const deadline = now() + RECORDING_TIMEOUT_MS
  const body = tencentRecordingRequestBody(options)
  const created = await tencentApiRequest({
    action: 'CreateRecTask',
    body,
    appId: options.appId,
    secretId: options.secretId,
    secretKey: options.secretKey,
    signal: options.signal,
    fetchImpl,
    now,
    timeoutMs: Math.max(1, deadline - now())
  })
  const taskId = numericValue(created.Response?.Data?.TaskId)
  if (taskId === null) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud did not return a recording task id')

  while (true) {
    options.signal.throwIfAborted()
    if (now() >= deadline) throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Tencent Cloud recording recognition timed out')
    const response = await tencentApiRequest({
      action: 'DescribeTaskStatus',
      body: { TaskId: taskId },
      appId: options.appId,
      secretId: options.secretId,
      secretKey: options.secretKey,
      signal: options.signal,
      fetchImpl,
      now,
      timeoutMs: Math.max(1, deadline - now())
    })
    const data = response.Response?.Data
    const status = numericValue(data?.Status)
    if (status === 2) return extractTencentRecordingTranscript(data)
    if (status === 3) {
      const message = stringValue(data?.ErrorMsg) || 'Tencent Cloud recording recognition failed'
      throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, message)
    }
    await wait(POLL_INTERVAL_MS, options.signal)
  }
}

export class TencentRealtimeAsrSession {
  private readonly options: TencentRealtimeAsrOptions
  private socket: TencentWebSocket | undefined
  private opened = false
  private closed = false
  private ended = false
  private final = false
  private transcript = ''
  private interim: { id: number; text: string } | undefined
  private readonly stableSentences = new Map<number, string>()
  private messageVersion = 0
  private lastError: EarsError | undefined
  private readonly messageWaiters = new Set<() => void>()

  constructor(options: TencentRealtimeAsrOptions) {
    this.options = options
  }

  async open(): Promise<void> {
    if (this.socket !== undefined) throw new Error('Tencent realtime session is already open')
    const factory = this.options.webSocketFactory ?? defaultWebSocketFactory
    const voiceId = randomTencentVoiceId()
    const url = tencentRealtimeUrl({
      appId: this.options.appId,
      secretId: this.options.secretId,
      secretKey: this.options.secretKey,
      engineType: this.options.engineType,
      timestamp: Math.floor((this.options.now ?? (() => Date.now()))() / 1000),
      voiceId
    })
    const socket = factory(url)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    socket.addEventListener('open', this.onOpen)
    socket.addEventListener('message', this.onMessage)
    socket.addEventListener('error', this.onError)
    socket.addEventListener('close', this.onClose)
    try {
      await this.waitFor(() => this.opened || this.lastError !== undefined || this.closed, REALTIME_OPEN_TIMEOUT_MS, this.options.signal)
      this.options.signal?.throwIfAborted()
      if (this.lastError !== undefined) throw this.lastError
      if (!this.opened) throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Tencent Cloud realtime recognition did not open')
    } catch (error) {
      this.close()
      throw error
    }
  }

  async sendAudio(audio: Uint8Array, signal: AbortSignal = this.options.signal ?? new AbortController().signal): Promise<TencentRealtimeTranscript> {
    if (audio.byteLength === 0) return this.snapshot()
    signal.throwIfAborted()
    const socket = this.requireSocket()
    if (!this.opened || this.ended || this.closed) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Tencent Cloud realtime recognition is not active')
    const version = this.messageVersion
    socket.send(audio)
    await this.waitFor(() => this.messageVersion > version || this.lastError !== undefined || this.closed, REALTIME_MESSAGE_GRACE_MS, signal)
    if (this.lastError !== undefined) throw this.lastError
    if (this.closed && this.messageVersion === version) throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, 'Tencent Cloud realtime recognition connection closed')
    return this.snapshot()
  }

  async finish(signal: AbortSignal = this.options.signal ?? new AbortController().signal): Promise<string> {
    try {
      signal.throwIfAborted()
      if (this.final) return this.transcript.trim()
      const socket = this.requireSocket()
      if (!this.ended) {
        this.ended = true
        socket.send(JSON.stringify({ type: 'end' }))
      }
      await this.waitFor(() => this.final || this.lastError !== undefined || this.closed, REALTIME_FINISH_TIMEOUT_MS, signal)
      if (this.lastError !== undefined) throw this.lastError
      if (!this.final) throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Tencent Cloud realtime recognition did not finish')
      return this.transcript.trim()
    } finally {
      this.close()
    }
  }

  snapshot(): TencentRealtimeTranscript {
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
        // The transport is already closing; local state is sufficient.
      }
    }
    this.notifyWaiters()
  }

  private readonly onOpen = (): void => {
    this.notifyWaiters()
  }

  private readonly onMessage = (event: TencentWebSocketEvent): void => {
    if (typeof event.data !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(event.data)
    } catch {
      this.setError(new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud realtime recognition returned invalid JSON'))
      return
    }
    if (!isRecord(parsed)) {
      this.setError(new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud realtime recognition returned an invalid response'))
      return
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'code')) {
      this.setError(new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud realtime recognition returned an invalid response code'))
      return
    }
    const code = numericValue(parsed.code)
    if (code === null) {
      this.setError(new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud realtime recognition returned an invalid response code'))
      return
    }
    if (code !== 0) {
      this.setError(new EarsError(EARS_ERROR_CODES.asrHttpFailed, stringValue(parsed.message) || `Tencent Cloud realtime recognition failed with code ${String(code)}`))
      return
    }
    const hasResult = Object.prototype.hasOwnProperty.call(parsed, 'result')
    if (hasResult && !isRecord(parsed.result)) {
      this.setError(new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud realtime recognition returned an invalid result'))
      return
    }
    const result = isRecord(parsed.result) ? parsed.result : undefined
    if (result !== undefined) {
      const textValue = result.voice_text_str
      const text = stringValue(textValue)
      const id = numericValue(result.index)
      const type = numericValue(result.slice_type)
      if (typeof textValue !== 'string' || id === null || type === null || ![0, 1, 2].includes(type)) {
        this.setError(new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud realtime recognition returned an invalid result'))
        return
      }
      if (type === 2) {
        this.stableSentences.set(id, text)
        if (this.interim?.id === id) this.interim = undefined
      } else {
        this.interim = { id, text }
      }
      this.rebuildTranscript()
    }
    if (numericValue(parsed.final) === 1) this.final = true
    this.opened = true
    this.messageVersion += 1
    this.notifyWaiters()
  }

  private readonly onError = (): void => {
    this.setError(new EarsError(EARS_ERROR_CODES.asrHttpFailed, 'Tencent Cloud realtime recognition connection failed'))
  }

  private readonly onClose = (): void => {
    this.closed = true
    if (!this.final && this.lastError === undefined) this.lastError = new EarsError(EARS_ERROR_CODES.asrHttpFailed, 'Tencent Cloud realtime recognition connection closed')
    this.notifyWaiters()
  }

  private setError(error: EarsError): void {
    this.lastError = error
    this.notifyWaiters()
    this.close()
  }

  private rebuildTranscript(): void {
    const stable = [...this.stableSentences.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, text]) => text.trim())
      .filter(Boolean)
    const interim = this.interim !== undefined && !this.stableSentences.has(this.interim.id) ? [this.interim.text.trim()] : []
    this.transcript = [...stable, ...interim].filter(Boolean).join('')
  }

  private requireSocket(): TencentWebSocket {
    if (this.socket === undefined) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Tencent Cloud realtime recognition is not connected')
    return this.socket
  }

  private async waitFor(predicate: () => boolean, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (predicate()) return
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const waiter = () => {
        if (predicate()) finish()
      }
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer)
        this.messageWaiters.delete(waiter)
        signal?.removeEventListener('abort', onAbort)
      }
      const finish = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const onAbort = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'))
      }
      timer = setTimeout(finish, timeoutMs)
      this.messageWaiters.add(waiter)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
    })
  }

  private notifyWaiters(): void {
    for (const waiter of [...this.messageWaiters]) waiter()
  }
}

async function tencentApiRequest(options: {
  action: string
  body: Record<string, unknown>
  appId: string
  secretId: string
  secretKey: string
  signal: AbortSignal
  fetchImpl: typeof globalThis.fetch
  now: () => number
  timeoutMs: number
}): Promise<TencentApiResponse> {
  const body = JSON.stringify(options.body)
  const timestamp = Math.floor(options.now() / 1000)
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Tencent Cloud request timed out')), options.timeoutMs)
  const forwardAbort = () => timeout.abort(options.signal.reason)
  options.signal.addEventListener('abort', forwardAbort, { once: true })
  try {
    const response = await options.fetchImpl(`https://${TENCENT_API_HOST}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Host: TENCENT_API_HOST,
        'X-TC-Action': options.action,
        'X-TC-Version': TENCENT_API_VERSION,
        'X-TC-Timestamp': String(timestamp),
        Authorization: tencentApi3Signature({ action: options.action, body, secretId: options.secretId.trim(), secretKey: options.secretKey, timestamp })
      },
      body,
      signal: timeout.signal
    })
    const text = await readBoundedText(response, timeout.signal)
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new EarsError(response.ok ? EARS_ERROR_CODES.asrInvalidResponse : EARS_ERROR_CODES.asrHttpFailed, `Tencent Cloud ASR returned HTTP ${response.status}`, { status: response.status })
    }
    if (!isRecord(parsed)) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud ASR returned an invalid response')
    const result = parsed as TencentApiResponse
    const apiError = result.Response?.Error
    if (!response.ok || apiError !== undefined) {
      const code = stringValue(apiError?.Code)
      const message = stringValue(apiError?.Message)
      throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, code && message ? `Tencent Cloud ASR ${code}: ${message}` : message || `Tencent Cloud ASR returned HTTP ${response.status}`, { status: response.status })
    }
    return result
  } catch (error) {
    if (options.signal.aborted) throw options.signal.reason ?? error
    if (timeout.signal.aborted) {
      const reason = timeout.signal.reason
      if (reason instanceof EarsError) throw reason
      throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Tencent Cloud request timed out')
    }
    throw error
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', forwardAbort)
  }
}

function defaultWebSocketFactory(url: string): TencentWebSocket {
  return new WebSocket(url) as unknown as TencentWebSocket
}

function extractTencentRecordingTranscript(data: Record<string, unknown> | undefined): string {
  if (data === undefined) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud returned no recording result')
  const details = data.ResultDetail
  if (Array.isArray(details)) {
    const sentences = details
      .filter(isRecord)
      .map((item) => stringValue(item.FinalSentence).trim())
      .filter(Boolean)
    if (sentences.length > 0) return sentences.join('')
  }
  const result = stringValue(data.Result)
    .replace(/\[[^\]]*\]\s*/g, '')
    .trim()
  if (result !== '') return result
  throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'Tencent Cloud returned no transcript')
}

async function readBoundedText(response: Response, signal: AbortSignal): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    try {
      await response.body?.cancel()
    } catch {
      // The size limit remains the primary failure even if transport cleanup fails.
    }
    throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Tencent Cloud response is too large')
  }
  if (response.body === null) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Tencent Cloud response is too large')
    return text
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Tencent Cloud response is too large')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hmacSha256(key: string | Uint8Array, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function numericValue(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(number) ? number : null
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => signal.removeEventListener('abort', abort)
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const abort = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }
    timer = setTimeout(finish, ms)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}
