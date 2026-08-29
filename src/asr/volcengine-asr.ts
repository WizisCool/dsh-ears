import { randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import { readBoundedText } from './transport.js'
import { VOLCENGINE_API_HOST } from '../settings/recognition.js'

export const VOLCENGINE_REALTIME_PATH = '/api/v3/sauc/bigmodel_nostream'
export const VOLCENGINE_AUC_SUBMIT_PATH = '/api/v3/auc/bigmodel/submit'
export const VOLCENGINE_AUC_QUERY_PATH = '/api/v3/auc/bigmodel/query'
export const VOLCENGINE_RECORDING_TIMEOUT_MS = 120_000
export const VOLCENGINE_RECORDING_POLL_INTERVAL_MS = 500
/** Gateway status codes carried in the X-Api-Status-Code response header. */
export const VOLCENGINE_STATUS_OK = '20000000'
export const VOLCENGINE_STATUS_PROCESSING = '20000001'
export const VOLCENGINE_STATUS_NO_SPEECH = '20000003'
export const VOLCENGINE_REALTIME_OPEN_TIMEOUT_MS = 15_000
export const VOLCENGINE_REALTIME_FINISH_TIMEOUT_MS = 30_000
export const VOLCENGINE_REALTIME_MESSAGE_GRACE_MS = 120
const VOLCENGINE_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const VOLCENGINE_SAMPLE_RATE = 16000
/** End-of-stream marker: a short silence chunk carries the negative-sequence last flag. */
const VOLCENGINE_FINISH_SILENCE_MS = 100

/*
 * Binary WebSocket framing per the official sauc demo `protocol` module: a
 * 4-byte header (protocol version | header size, message type | flags,
 * serialization | compression, reserved) followed by an int32 sequence, a
 * uint32 payload size, and a gzip-compressed payload.
 */
const PROTOCOL_HEADER = 0x11
const MESSAGE_TYPE_FULL_CLIENT_REQUEST = 0b0001
const MESSAGE_TYPE_AUDIO_ONLY_REQUEST = 0b0010
const MESSAGE_TYPE_SERVER_FULL_RESPONSE = 0b1001
const MESSAGE_TYPE_SERVER_ERROR_RESPONSE = 0b1111
const FLAG_POS_SEQUENCE = 0b0001
const FLAG_NEG_WITH_SEQUENCE = 0b0011
const SERIALIZATION_JSON = 0b0001
const COMPRESSION_GZIP = 0b0001

/** Fixed recognition request shared by both Volcengine services (D-048). */
export function volcengineRecognitionRequest(): Record<string, unknown> {
  return {
    model_name: 'bigmodel',
    enable_itn: true,
    enable_punc: true,
    enable_ddc: false,
    result_type: 'full',
    show_utterances: true
  }
}

export function volcengineRecordingRequestBody(options: {
  audio: Uint8Array
  language?: string
}): Record<string, unknown> {
  const language = options.language?.trim() ?? ''
  return {
    user: { uid: 'dsh-ears' },
    audio: {
      data: Buffer.from(options.audio).toString('base64'),
      format: 'wav',
      codec: 'raw',
      rate: VOLCENGINE_SAMPLE_RATE,
      bits: 16,
      channel: 1,
      ...(language === '' ? {} : { language })
    },
    request: volcengineRecognitionRequest()
  }
}

export function volcengineFullRequestFrame(sequence: number, payload: Record<string, unknown>): Uint8Array {
  const header = Buffer.from([PROTOCOL_HEADER, (MESSAGE_TYPE_FULL_CLIENT_REQUEST << 4) | FLAG_POS_SEQUENCE, (SERIALIZATION_JSON << 4) | COMPRESSION_GZIP, 0x00])
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'))
  return frameBytes(header, sequence, compressed)
}

export function volcengineAudioRequestFrame(sequence: number, audio: Uint8Array, isLast: boolean): Uint8Array {
  const flags = isLast ? FLAG_NEG_WITH_SEQUENCE : FLAG_POS_SEQUENCE
  const header = Buffer.from([PROTOCOL_HEADER, (MESSAGE_TYPE_AUDIO_ONLY_REQUEST << 4) | flags, (SERIALIZATION_JSON << 4) | COMPRESSION_GZIP, 0x00])
  const compressed = gzipSync(Buffer.from(audio))
  return frameBytes(header, isLast ? -sequence : sequence, compressed)
}

function frameBytes(header: Buffer, sequence: number, compressed: Buffer): Uint8Array {
  const sequenceBuffer = Buffer.alloc(4)
  sequenceBuffer.writeInt32BE(sequence)
  const sizeBuffer = Buffer.alloc(4)
  sizeBuffer.writeUInt32BE(compressed.byteLength)
  return new Uint8Array(Buffer.concat([header, sequenceBuffer, sizeBuffer, compressed]))
}

export interface VolcengineResponseFrame {
  readonly messageType: number
  readonly isLastPackage: boolean
  readonly payloadSequence: number | null
  readonly errorCode: number | null
  readonly errorText: string
  readonly payloadMsg: Record<string, unknown> | undefined
}

export function parseVolcengineResponseFrame(bytes: Uint8Array): VolcengineResponseFrame {
  if (bytes.byteLength < 4) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned a truncated response frame')
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const protocolVersion = view[0]! >> 4
  const headerSize = view[0]! & 0x0f
  const messageType = view[1]! >> 4
  const flags = view[1]! & 0x0f
  const serialization = view[2]! >> 4
  const compression = view[2]! & 0x0f
  if (protocolVersion !== 0b0001 || headerSize < 1 || headerSize * 4 > bytes.byteLength) {
    throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned an invalid response frame')
  }
  let payload = view.subarray(headerSize * 4)
  const frame: { messageType: number; isLastPackage: boolean; payloadSequence: number | null; errorCode: number | null; errorText: string; payloadMsg: Record<string, unknown> | undefined } = {
    messageType,
    isLastPackage: (flags & 0x02) !== 0,
    payloadSequence: null,
    errorCode: null,
    errorText: '',
    payloadMsg: undefined
  }
  if ((flags & 0x01) !== 0) {
    if (payload.byteLength < 4) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned a truncated response frame')
    frame.payloadSequence = payload.readInt32BE(0)
    payload = payload.subarray(4)
  }
  if ((flags & 0x04) !== 0) {
    if (payload.byteLength < 4) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned a truncated response frame')
    payload = payload.subarray(4)
  }
  if (messageType === MESSAGE_TYPE_SERVER_ERROR_RESPONSE) {
    if (payload.byteLength < 8) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned a truncated response frame')
    frame.errorCode = payload.readInt32BE(0)
    const size = payload.readUInt32BE(4)
    if (size > payload.byteLength - 8) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned a truncated response frame')
    payload = payload.subarray(8, 8 + size)
  } else if (messageType === MESSAGE_TYPE_SERVER_FULL_RESPONSE) {
    if (payload.byteLength < 4) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned a truncated response frame')
    const size = payload.readUInt32BE(0)
    if (size > payload.byteLength - 4) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned a truncated response frame')
    payload = payload.subarray(4, 4 + size)
  } else {
    return frame
  }
  if (payload.byteLength > 0) {
    if (compression === COMPRESSION_GZIP) {
      try {
        payload = gunzipSync(payload, { maxOutputLength: VOLCENGINE_MAX_RESPONSE_BYTES })
      } catch (error) {
        const tooLarge = (error as { code?: string } | undefined)?.code === 'ERR_BUFFER_TOO_LARGE'
          || String((error as Error | undefined)?.message ?? '').includes('maxOutputLength')
        throw tooLarge
          ? new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Volcano Engine response is too large')
          : new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned an undecodable response frame')
      }
    }
    if (messageType === MESSAGE_TYPE_SERVER_ERROR_RESPONSE) {
      frame.errorText = payload.toString('utf8').trim().slice(0, 800)
      return frame
    }
    if (serialization === SERIALIZATION_JSON) {
      try {
        const parsed: unknown = JSON.parse(payload.toString('utf8'))
        if (isRecord(parsed)) frame.payloadMsg = parsed
      } catch {
        throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine returned an invalid JSON response frame')
      }
    }
  }
  return frame
}

export interface VolcengineRecordingAsrOptions {
  readonly audio: Uint8Array
  readonly apiKey: string
  readonly resourceId: string
  readonly language?: string
  readonly signal: AbortSignal
  readonly fetch?: typeof globalThis.fetch
  /** Injectable wall clock in milliseconds for deterministic tests. */
  readonly now?: () => number
}

export async function transcribeVolcengineRecording(options: VolcengineRecordingAsrOptions): Promise<string> {
  if (options.audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
  const apiKey = options.apiKey.trim()
  if (apiKey === '') throw new EarsError(EARS_ERROR_CODES.asrApiKeyNotConfigured, 'Volcano Engine API key is not configured')
  options.signal.throwIfAborted()

  const fetchImpl = options.fetch ?? globalThis.fetch
  const now = options.now ?? (() => Date.now())
  const deadline = now() + VOLCENGINE_RECORDING_TIMEOUT_MS
  const requestId = randomUUID()
  const body = volcengineRecordingRequestBody({ audio: options.audio, language: options.language })
  const submitted = await volcengineApiRequest({
    path: VOLCENGINE_AUC_SUBMIT_PATH,
    body,
    apiKey,
    resourceId: options.resourceId.trim(),
    requestId,
    signal: options.signal,
    fetchImpl,
    timeoutMs: Math.max(1, deadline - now())
  })
  if (submitted.statusCode !== VOLCENGINE_STATUS_OK) {
    throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, volcengineStatusMessage('Volcano Engine ASR submit failed', submitted))
  }

  while (true) {
    options.signal.throwIfAborted()
    if (now() >= deadline) throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Volcano Engine recording recognition timed out')
    const polled = await volcengineApiRequest({
      path: VOLCENGINE_AUC_QUERY_PATH,
      body: {},
      apiKey,
      resourceId: options.resourceId.trim(),
      requestId,
      signal: options.signal,
      fetchImpl,
      timeoutMs: Math.max(1, deadline - now())
    })
    options.signal.throwIfAborted()
    // The gateway reports an in-flight task as 20000001 (or as 20000000 with
    // an empty body) until a terminal result arrives.
    if (polled.statusCode === VOLCENGINE_STATUS_PROCESSING) {
      await wait(VOLCENGINE_RECORDING_POLL_INTERVAL_MS, options.signal)
      continue
    }
    if (polled.statusCode === VOLCENGINE_STATUS_NO_SPEECH) {
      throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, polled.message !== '' ? polled.message : 'Volcano Engine returned no transcript')
    }
    if (polled.statusCode !== VOLCENGINE_STATUS_OK) {
      throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, volcengineStatusMessage('Volcano Engine ASR query failed', polled))
    }
    if (isRecord(polled.body) && (Object.prototype.hasOwnProperty.call(polled.body, 'result') || Object.prototype.hasOwnProperty.call(polled.body, 'audio_info'))) {
      return extractVolcengineRecordingTranscript(polled.body)
    }
    if (polled.body === undefined) {
      // An empty body alongside 20000000 is treated as in-flight defensively.
      await wait(VOLCENGINE_RECORDING_POLL_INTERVAL_MS, options.signal)
      continue
    }
    throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine ASR returned an unexpected response shape')
  }
}

function extractVolcengineRecordingTranscript(body: Record<string, unknown>): string {
  const result = isRecord(body.result) ? body.result : undefined
  const text = typeof result?.text === 'string' ? result.text.trim() : ''
  if (text !== '') return text
  throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'Volcano Engine returned no transcript')
}

async function volcengineApiRequest(options: {
  path: string
  body: Record<string, unknown>
  apiKey: string
  resourceId: string
  requestId: string
  signal: AbortSignal
  fetchImpl: typeof globalThis.fetch
  timeoutMs: number
}): Promise<{ status: number; statusCode: string; message: string; body: unknown }> {
  options.signal.throwIfAborted()
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Volcano Engine request timed out')), options.timeoutMs)
  const forwardAbort = () => timeout.abort(options.signal.reason)
  options.signal.addEventListener('abort', forwardAbort, { once: true })
  try {
    const response = await options.fetchImpl(`https://${VOLCENGINE_API_HOST}${options.path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...volcengineAuthHeaders(options.apiKey, options.resourceId, options.requestId)
      },
      body: JSON.stringify(options.body),
      redirect: 'manual',
      signal: timeout.signal
    })
    const text = await readBoundedText(response, VOLCENGINE_MAX_RESPONSE_BYTES, timeout.signal, 'Volcano Engine response is too large')
    const statusCode = response.headers.get('X-Api-Status-Code') ?? ''
    const message = response.headers.get('X-Api-Message') ?? ''
    if (!response.ok) {
      throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, `Volcano Engine ASR returned HTTP ${response.status}${message === '' ? '' : `: ${message}`}`, { status: response.status })
    }
    let parsed: unknown
    try {
      parsed = text.trim() === '' ? undefined : JSON.parse(text)
    } catch {
      throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine ASR returned an invalid response', { status: response.status })
    }
    return { status: response.status, statusCode, message, body: parsed }
  } catch (error) {
    if (options.signal.aborted) throw options.signal.reason ?? error
    if (timeout.signal.aborted) {
      const reason = timeout.signal.reason
      if (reason instanceof EarsError) throw reason
      throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Volcano Engine request timed out')
    }
    throw error
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', forwardAbort)
  }
}

function volcengineStatusMessage(prefix: string, response: { statusCode: string; message: string }): string {
  const detail = response.message.trim() !== '' ? response.message.trim() : `status ${response.statusCode === '' ? 'unknown' : response.statusCode}`
  return `${prefix}: ${detail}`
}

export function volcengineAuthHeaders(apiKey: string, resourceId: string, requestId: string): Record<string, string> {
  return {
    'X-Api-Key': apiKey.trim(),
    'X-Api-Resource-Id': resourceId.trim(),
    'X-Api-Request-Id': requestId,
    'X-Api-Sequence': '-1'
  }
}

export interface VolcengineRealtimeAsrOptions {
  readonly apiKey: string
  readonly resourceId: string
  readonly language?: string
  readonly signal?: AbortSignal
  readonly webSocketFactory?: (url: string, headers: Record<string, string>) => VolcengineWebSocket
}

export interface VolcengineRealtimeTranscript {
  readonly text: string
  readonly final: boolean
}

export interface VolcengineWebSocket {
  readonly readyState: number
  binaryType: string
  send(data: ArrayBuffer | ArrayBufferView | string): void
  close(code?: number, reason?: string): void
  addEventListener(type: string, listener: (event: VolcengineWebSocketEvent) => void): void
  removeEventListener(type: string, listener: (event: VolcengineWebSocketEvent) => void): void
}

export interface VolcengineWebSocketEvent {
  readonly data?: unknown
  readonly error?: unknown
  readonly code?: number
  readonly reason?: string
}

export function volcengineRealtimeUrl(): string {
  return `wss://${VOLCENGINE_API_HOST}${VOLCENGINE_REALTIME_PATH}`
}

export function volcengineRealtimePayload(language?: string): Record<string, unknown> {
  const trimmed = language?.trim() ?? ''
  return {
    user: { uid: 'dsh-ears' },
    audio: {
      format: 'pcm',
      codec: 'raw',
      rate: VOLCENGINE_SAMPLE_RATE,
      bits: 16,
      channel: 1,
      ...(trimmed === '' ? {} : { language: trimmed })
    },
    request: volcengineRecognitionRequest()
  }
}

/**
 * Host-owned one-way streaming session. The full client request is sent once
 * when the socket opens; every audio chunk draws a cumulative response, and a
 * short silence chunk with the negative-sequence last flag ends the stream.
 * A server close after `is_last_package` (close code 1000) is a normal finish.
 */
export class VolcengineRealtimeAsrSession {
  private readonly options: VolcengineRealtimeAsrOptions
  private socket: VolcengineWebSocket | undefined
  private opened = false
  private closed = false
  private ended = false
  private final = false
  private transcript = ''
  private sequence = 1
  private messageVersion = 0
  private lastError: EarsError | undefined
  private readonly messageWaiters = new Set<() => void>()

  constructor(options: VolcengineRealtimeAsrOptions) {
    this.options = options
  }

  async open(signal?: AbortSignal): Promise<void> {
    const effectiveSignal = signal ?? this.options.signal
    effectiveSignal?.throwIfAborted()
    const apiKey = this.options.apiKey.trim()
    if (apiKey === '') throw new EarsError(EARS_ERROR_CODES.asrApiKeyNotConfigured, 'Volcano Engine API key is not configured')
    const factory = this.options.webSocketFactory ?? defaultWebSocketFactory
    const requestId = randomUUID()
    const headers = volcengineAuthHeaders(apiKey, this.options.resourceId, requestId)
    const socket = factory(volcengineRealtimeUrl(), headers)
    socket.binaryType = 'arraybuffer'
    this.socket = socket
    socket.addEventListener('open', this.onOpen)
    socket.addEventListener('message', this.onMessage)
    socket.addEventListener('error', this.onError)
    socket.addEventListener('close', this.onClose)
    try {
      await this.waitFor(() => this.opened || this.lastError !== undefined || this.closed, VOLCENGINE_REALTIME_OPEN_TIMEOUT_MS, effectiveSignal)
      effectiveSignal?.throwIfAborted()
      if (this.lastError !== undefined) throw this.lastError
      if (!this.opened) throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Volcano Engine realtime recognition did not open')
    } catch (error) {
      this.close()
      throw error
    }
  }

  async sendAudio(audio: Uint8Array, signal: AbortSignal = this.options.signal ?? new AbortController().signal): Promise<VolcengineRealtimeTranscript> {
    if (audio.byteLength === 0) return this.snapshot()
    signal.throwIfAborted()
    const socket = this.requireSocket()
    if (!this.opened || this.ended || this.closed) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Volcano Engine realtime recognition is not active')
    const version = this.messageVersion
    socket.send(volcengineAudioRequestFrame(this.sequence, audio, false))
    this.sequence += 1
    await this.waitFor(() => this.messageVersion > version || this.lastError !== undefined || this.closed, VOLCENGINE_REALTIME_MESSAGE_GRACE_MS, signal)
    if (this.lastError !== undefined) throw this.lastError
    if (this.closed && this.messageVersion === version) throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, 'Volcano Engine realtime recognition connection closed')
    return this.snapshot()
  }

  async finish(signal: AbortSignal = this.options.signal ?? new AbortController().signal): Promise<string> {
    try {
      signal.throwIfAborted()
      if (this.final) return this.transcript.trim()
      const socket = this.requireSocket()
      if (!this.ended) {
        this.ended = true
        // The negative-sequence last audio flag is the only end-of-stream
        // marker, so a short silence chunk carries it without adding words.
        const silenceBytes = (VOLCENGINE_SAMPLE_RATE * 2 * VOLCENGINE_FINISH_SILENCE_MS) / 1000
        socket.send(volcengineAudioRequestFrame(this.sequence, new Uint8Array(silenceBytes), true))
      }
      await this.waitFor(() => this.final || this.lastError !== undefined || this.closed, VOLCENGINE_REALTIME_FINISH_TIMEOUT_MS, signal)
      signal.throwIfAborted()
      if (this.lastError !== undefined) throw this.lastError
      if (!this.final) throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Volcano Engine realtime recognition did not finish')
      return this.transcript.trim()
    } finally {
      this.close()
    }
  }

  snapshot(): VolcengineRealtimeTranscript {
    return { text: this.transcript, final: this.final }
  }

  close(): void {
    const wasClosed = this.closed
    this.closed = true
    const socket = this.socket
    if (socket !== undefined) {
      socket.removeEventListener('open', this.onOpen)
      socket.removeEventListener('message', this.onMessage)
      socket.removeEventListener('error', this.onError)
      socket.removeEventListener('close', this.onClose)
      if (!wasClosed) {
        try {
          socket.close(1000, 'client closed')
        } catch {
          // The transport is already closing; local state is sufficient.
        }
      }
    }
    if (!wasClosed) this.notifyWaiters()
  }

  private readonly onOpen = (): void => {
    this.opened = true
    const socket = this.socket
    if (socket !== undefined) {
      try {
        socket.send(volcengineFullRequestFrame(this.sequence, volcengineRealtimePayload(this.options.language)))
        this.sequence += 1
      } catch (error) {
        const detail = error instanceof Error && error.message.trim() !== '' ? error.message.trim() : 'the handshake frame could not be sent'
        this.setError(new EarsError(EARS_ERROR_CODES.asrHttpFailed, `Volcano Engine realtime recognition failed to send the handshake: ${detail}`))
        return
      }
    }
    this.notifyWaiters()
  }

  private readonly onMessage = (event: VolcengineWebSocketEvent): void => {
    const data = event.data
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      this.setError(new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine realtime recognition returned a non-binary frame'))
      return
    }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    if (bytes.byteLength > VOLCENGINE_MAX_RESPONSE_BYTES) {
      this.setError(new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Volcano Engine response is too large'))
      return
    }
    let frame: VolcengineResponseFrame
    try {
      frame = parseVolcengineResponseFrame(bytes)
    } catch (error) {
      this.setError(error instanceof EarsError ? error : new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Volcano Engine realtime recognition returned an invalid response'))
      return
    }
    if (frame.messageType === MESSAGE_TYPE_SERVER_ERROR_RESPONSE || frame.errorCode !== null) {
      const detail = frame.errorText !== '' ? frame.errorText : `code ${String(frame.errorCode)}`
      this.setError(new EarsError(EARS_ERROR_CODES.asrHttpFailed, `Volcano Engine realtime recognition failed: ${detail}`))
      return
    }
    if (frame.payloadMsg !== undefined) this.applyResult(frame.payloadMsg)
    if (frame.isLastPackage) this.final = true
    this.messageVersion += 1
    this.notifyWaiters()
  }

  private applyResult(payloadMsg: Record<string, unknown>): void {
    const result = isRecord(payloadMsg.result) ? payloadMsg.result : undefined
    if (result === undefined) return
    const text = typeof result.text === 'string' ? result.text.trim() : ''
    if (text !== '') {
      // result_type=full returns the accumulated whole-sentence text.
      this.transcript = text
      return
    }
    const utterances = Array.isArray(result.utterances) ? result.utterances : []
    const definite = utterances
      .filter(isRecord)
      .filter((utterance) => utterance.definite === true)
      .map((utterance) => (typeof utterance.text === 'string' ? utterance.text.trim() : ''))
      .filter(Boolean)
    if (definite.length > 0) this.transcript = definite.join('')
  }

  private readonly onError = (): void => {
    this.setError(new EarsError(EARS_ERROR_CODES.asrHttpFailed, 'Volcano Engine realtime recognition connection failed'))
  }

  private readonly onClose = (event: VolcengineWebSocketEvent): void => {
    this.closed = true
    const normalClose = event.code === undefined || event.code === 1000 || event.code === 1005
    if (!normalClose && this.lastError === undefined) {
      const reason = typeof event.reason === 'string' && event.reason !== '' ? event.reason : `code ${String(event.code)}`
      this.lastError = new EarsError(EARS_ERROR_CODES.asrHttpFailed, `Volcano Engine realtime recognition closed unexpectedly: ${reason}`)
    }
    if (!this.final && this.lastError === undefined) {
      this.lastError = new EarsError(EARS_ERROR_CODES.asrHttpFailed, 'Volcano Engine realtime recognition closed before a final result')
    }
    this.close()
    this.notifyWaiters()
  }

  private setError(error: EarsError): void {
    this.lastError = error
    this.notifyWaiters()
    this.close()
  }

  private requireSocket(): VolcengineWebSocket {
    if (this.socket === undefined) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Volcano Engine realtime recognition is not connected')
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

function defaultWebSocketFactory(url: string, headers: Record<string, string>): VolcengineWebSocket {
  // Node's global WebSocket is undici's, whose WebSocketInit extension accepts
  // handshake headers on every supported runtime (Node >= 22.19 and 24;
  // verified live against the gateway on Node 24.16). The Node API docs only
  // document the standard constructor surface, so if a future runtime ever
  // drops the extension the gateway rejects the unauthenticated handshake and
  // open() fails loudly instead of silently sending an unauthenticated stream.
  const scope = globalThis as typeof globalThis & {
    WebSocket: new (url: string, options?: { headers?: Record<string, string> }) => unknown
  }
  if (typeof scope.WebSocket !== 'function') {
    throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'WebSocket is unavailable in this environment')
  }
  return new scope.WebSocket(url, { headers }) as unknown as VolcengineWebSocket
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
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}
