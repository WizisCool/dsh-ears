import { createHmac } from 'node:crypto'
import { EARS_ERROR_CODES, EarsError } from '../errors.js'

const MAX_AUDIO_BYTES = 24 * 1024 * 1024
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000
const TENCENT_HOST = 'asr.cloud.tencent.com'

export interface TencentFlashAsrOptions {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly appId: string
  readonly secretId: string
  readonly secretKey: string
  readonly engineType: string
  readonly signal: AbortSignal
}

export function tencentFlashVoiceFormat(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';', 1)[0]?.trim() ?? ''
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') return 'wav'
  if (normalized === 'audio/pcm' || normalized === 'audio/l16') return 'pcm'
  if (normalized === 'audio/ogg' || normalized === 'audio/ogg-opus') return 'ogg-opus'
  if (normalized === 'audio/speex' || normalized === 'audio/x-speex') return 'speex'
  if (normalized === 'audio/silk' || normalized === 'audio/x-silk') return 'silk'
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'mp3'
  if (normalized === 'audio/mp4' || normalized === 'audio/m4a') return 'm4a'
  if (normalized === 'audio/aac') return 'aac'
  if (normalized === 'audio/amr' || normalized === 'audio/amr-wb' || normalized === 'audio/x-amr') return 'amr'
  throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'Tencent Cloud Recording File Recognition Flash Edition requires WAV, PCM, OGG-OPUS, SPEEX, SILK, MP3, M4A, AAC, or AMR audio')
}

export function tencentFlashQuery(options: {
  secretId: string
  engineType: string
  voiceFormat: string
  timestamp: number
}): Record<string, string> {
  return {
    engine_type: options.engineType.trim(),
    first_channel_only: '1',
    filter_dirty: '0',
    filter_modal: '0',
    filter_punc: '0',
    secretid: options.secretId.trim(),
    timestamp: String(options.timestamp),
    voice_format: options.voiceFormat,
    word_info: '0'
  }
}

export function tencentFlashCanonicalQuery(query: Record<string, string>): string {
  return Object.keys(query).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key] ?? '')}`).join('&')
}

export function tencentFlashSignature(options: {
  appId: string
  secretId: string
  engineType: string
  voiceFormat: string
  timestamp: number
  secretKey: string
}): string {
  const query = tencentFlashQuery(options)
  const canonicalQuery = tencentFlashCanonicalQuery(query)
  const source = `POST${TENCENT_HOST}/asr/flash/v1/${encodeURIComponent(options.appId.trim())}?${canonicalQuery}`
  return createHmac('sha1', options.secretKey).update(source).digest('base64')
}

export async function transcribeTencentFlashAsr(options: TencentFlashAsrOptions): Promise<string> {
  if (options.audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
  if (options.audio.byteLength > MAX_AUDIO_BYTES) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large')
  options.signal.throwIfAborted()

  const appId = options.appId.trim()
  const secretId = options.secretId.trim()
  const secretKey = options.secretKey.trim()
  const engineType = options.engineType.trim()
  if (appId === '' || secretId === '' || secretKey === '') throw new EarsError(EARS_ERROR_CODES.asrApiKeyNotConfigured, 'Tencent Cloud AppID, SecretID, and SecretKey are required')
  if (engineType === '') throw new EarsError(EARS_ERROR_CODES.asrModelNotConfigured, 'The Tencent Cloud Recording File Recognition Flash Edition engine_type is not configured')

  const voiceFormat = tencentFlashVoiceFormat(options.mimeType)
  const timestamp = Math.floor(Date.now() / 1000)
  const query = tencentFlashQuery({ secretId, engineType, voiceFormat, timestamp })
  const canonicalQuery = tencentFlashCanonicalQuery(query)
  const signature = tencentFlashSignature({ appId, secretId, engineType, voiceFormat, timestamp, secretKey })
  const endpoint = `https://${TENCENT_HOST}/asr/flash/v1/${encodeURIComponent(appId)}?${canonicalQuery}`

  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Cloud ASR request timed out')), REQUEST_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(options.signal.reason)
  options.signal.addEventListener('abort', forwardAbort, { once: true })
  try {
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: signature,
          'Content-Type': 'application/octet-stream'
        },
        body: new Uint8Array(options.audio),
        redirect: 'manual',
        signal: timeout.signal
      })
    } catch (error) {
      if (options.signal.aborted) throw error
      if (timeout.signal.aborted) throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Cloud ASR request timed out')
      throw error
    }
    const body = await readTencentResponseBody(response, options.signal, timeout.signal)
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud Flash ASR returned invalid JSON')
    }
    if (!response.ok) throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, tencentFlashErrorDetail(parsed, response.status), { status: response.status })
    if (!isRecord(parsed)) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Tencent Cloud Flash ASR returned an invalid response')
    const code = typeof parsed.code === 'number' ? parsed.code : Number(parsed.code)
    if (!Number.isFinite(code) || code !== 0) throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, tencentFlashErrorDetail(parsed, response.status), { status: response.status })
    const results = parsed.flash_result
    if (!Array.isArray(results)) throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'Tencent Cloud Flash ASR returned no transcript')
    const text = results
      .filter(isRecord)
      .map((result) => typeof result.text === 'string' ? result.text.trim() : '')
      .filter((value) => value !== '')
      .join(' ')
    return text
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', forwardAbort)
  }
}

async function readTencentResponseBody(response: Response, signal: AbortSignal, timeoutSignal: AbortSignal): Promise<string> {
  try {
    return await readBoundedText(response)
  } catch (error) {
    if (signal.aborted) throw error
    if (timeoutSignal.aborted) throw new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Cloud ASR request timed out')
    throw error
  }
}

function tencentFlashErrorDetail(parsed: unknown, status: number): string {
  if (isRecord(parsed)) {
    const code = typeof parsed.code === 'number' || typeof parsed.code === 'string' ? String(parsed.code).trim() : ''
    const message = typeof parsed.message === 'string' ? parsed.message.trim() : ''
    if (code !== '' && message !== '') return `Tencent Cloud ASR ${code}: ${message}`
    if (message !== '') return message
    if (code !== '') return `Tencent Cloud ASR ${code}`
  }
  return `Tencent Cloud ASR request failed with HTTP ${status}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readBoundedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Cloud ASR response is too large')
  if (response.body === null) {
    const body = await response.text()
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Cloud ASR response is too large')
    return body
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Cloud ASR response is too large')
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
