import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import { readBoundedText } from './transport.js'

const MAX_ENCODED_BYTES = 10 * 1024 * 1024
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000

export interface DashScopeAsrOptions {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly language: string
  readonly endpoint: string
  readonly model: string
  readonly credential: string
  readonly signal: AbortSignal
}

export function isQwen3AsrFlashModel(model: string): boolean {
  return /^qwen3-asr-flash/i.test(model.trim())
}

export function audioFormatFromMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';', 1)[0] ?? ''
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') return 'wav'
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'mp3'
  if (normalized === 'audio/mp4' || normalized === 'audio/m4a') return 'mp4'
  if (normalized === 'audio/ogg') return 'ogg'
  if (normalized === 'audio/webm') return 'webm'
  if (normalized.includes('opus')) return 'opus'
  return 'webm'
}

export function languageCode(language: string): string {
  const code = language.trim().split('-', 1)[0]
  return code === '' ? 'auto' : code
}

export function dashscopeRequestBody(model: string, dataUri: string, mimeType: string, language: string): Record<string, unknown> {
  const name = model.trim()
  const code = languageCode(language)
  if (isQwen3AsrFlashModel(name)) {
    return {
      model: name,
      input: { messages: [{ role: 'user', content: [{ audio: dataUri }] }] },
      ...(code === 'auto' ? {} : { parameters: { asr_options: { language: code } } })
    }
  }
  return {
    model: name,
    input: {
      messages: [{
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data: dataUri } }]
      }]
    },
    parameters: {
      format: audioFormatFromMime(mimeType),
      ...(code === 'auto' ? {} : { language_hints: [code] })
    }
  }
}

export function extractDashScopeTranscript(parsed: unknown): string {
  if (!isRecord(parsed)) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Cloud ASR returned invalid JSON')
  const output = parsed.output
  if (isRecord(output)) {
    const direct = firstText(output.text)
    if (direct !== undefined) return direct
    if (isRecord(output.sentence)) {
      const sentence = firstText(output.sentence.text)
      if (sentence !== undefined) return sentence
    }
    if (isRecord(output.output)) {
      const nested = firstText(output.output.text)
      if (nested !== undefined) return nested
      if (isRecord(output.output.sentence)) {
        const nestedSentence = firstText(output.output.sentence.text)
        if (nestedSentence !== undefined) return nestedSentence
      }
    }
    if (Array.isArray(output.choices) && isRecord(output.choices[0]) && isRecord(output.choices[0].message)) {
      const content = output.choices[0].message.content
      if (typeof content === 'string') {
        const text = content.trim()
        if (text !== '') return text
      }
      if (Array.isArray(content)) {
        const texts = content.flatMap((item) => isRecord(item) && typeof item.text === 'string' ? [item.text.trim()] : [])
        const joined = texts.filter((item) => item !== '').join('')
        if (joined !== '') return joined
      }
    }
  }
  const message = typeof parsed.message === 'string' ? parsed.message.trim() : ''
  if (message !== '') throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, message)
  return ''
}

export async function transcribeDashScopeAsr(options: DashScopeAsrOptions): Promise<string> {
  if (options.audio.byteLength === 0) return ''
  options.signal.throwIfAborted()
  const model = options.model.trim()
  if (model === '') throw new EarsError(EARS_ERROR_CODES.asrModelNotConfigured, 'The cloud ASR model is not configured')
  const credential = options.credential.trim()
  if (credential === '') throw new EarsError(EARS_ERROR_CODES.asrApiKeyNotConfigured, 'The cloud ASR API key is not configured')
  const endpoint = validateEndpoint(options.endpoint)
  const mime = (options.mimeType.split(';', 1)[0] ?? 'audio/webm').trim() || 'audio/webm'
  const dataUri = `data:${mime};base64,${Buffer.from(options.audio).toString('base64')}`
  if (Buffer.byteLength(dataUri) > MAX_ENCODED_BYTES) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large for Bailian ASR')

  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Cloud ASR request timed out')), REQUEST_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(options.signal.reason)
  options.signal.addEventListener('abort', forwardAbort, { once: true })
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'disable'
      },
      body: JSON.stringify(dashscopeRequestBody(model, dataUri, mime, options.language)),
      redirect: 'manual',
      signal: timeout.signal
    })
    const body = await readBoundedText(response, MAX_RESPONSE_BYTES, timeout.signal)
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      if (!response.ok) {
        throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, dashScopeErrorDetail(undefined, response.status), { status: response.status })
      }
      throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Cloud ASR returned invalid JSON')
    }
    if (!response.ok) {
      if (isDashScopeEmptyAudioError(parsed, response.status)) return ''
      throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, dashScopeErrorDetail(parsed, response.status), { status: response.status })
    }
    return extractDashScopeTranscript(parsed)
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', forwardAbort)
  }
}

function validateEndpoint(value: string): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'Bailian ASR endpoint must be a valid HTTPS URL')
  }
  if (url.protocol !== 'https:') {
    throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'Bailian ASR endpoints with credentials must use HTTPS')
  }
  if (url.username !== '' || url.password !== '') throw new EarsError(EARS_ERROR_CODES.asrEndpointHasCredentials, 'Cloud ASR endpoint must not contain credentials')
  return url.toString()
}

export function dashScopeErrorFields(parsed: unknown): { code: string; message: string } {
  const record = isRecord(parsed) ? parsed : {}
  const nested = isRecord(record.error) ? record.error : record
  const codeValue = nested.code ?? record.code
  const code = typeof codeValue === 'string' ? codeValue.trim() : typeof codeValue === 'number' ? String(codeValue) : ''
  const messageValue = nested.message ?? nested.msg ?? nested.error_msg ?? record.message ?? record.msg
  const message = typeof messageValue === 'string' ? messageValue.trim() : ''
  return { code, message }
}

export function dashScopeErrorDetail(parsed: unknown, status: number): string {
  const { code, message } = dashScopeErrorFields(parsed)
  if (code !== '' && message !== '' && message !== code) return `${code}: ${message}`
  if (code !== '') return code
  if (message !== '') return message
  return `Cloud ASR request failed with HTTP ${status}`
}

const EMPTY_AUDIO_MARKERS = [
  'no speech',
  'no valid speech',
  'no voice',
  'empty audio',
  'audio is empty',
  'too short',
  'audio too short',
  'silent',
  'silence',
  'invalid audio',
  'cannot decode',
  'decode audio',
  'audio data is invalid',
  '未检测',
  '没有语音',
  '音频为空',
  '时长过短',
  '无效音频',
  '无法解析'
]

const CONFIG_ERROR_CODES = [
  'invalidapikey',
  'invalidapi-key',
  'arrearage',
  'throttling',
  'accessdenied',
  'forbidden',
  'unauthorized'
]

export function isDashScopeEmptyAudioError(parsed: unknown, status: number): boolean {
  if (status !== 400 && status !== 422) return false
  const { code, message } = dashScopeErrorFields(parsed)
  const detail = `${code} ${message}`.toLowerCase()
  if (CONFIG_ERROR_CODES.some((marker) => detail.includes(marker))) return false
  if (EMPTY_AUDIO_MARKERS.some((marker) => detail.includes(marker))) return true
  return false
}

function firstText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text === '' ? undefined : text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
