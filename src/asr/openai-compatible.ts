import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import { readBoundedText } from './transport.js'

const MAX_AUDIO_BYTES = 24 * 1024 * 1024
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000

export interface OpenAICompatibleTranscriptionOptions {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly language: string
  readonly endpoint: string
  readonly model: string
  readonly credential?: string
  readonly signal: AbortSignal
}

export async function transcribeOpenAICompatible(options: OpenAICompatibleTranscriptionOptions): Promise<string> {
  if (options.audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
  if (options.audio.byteLength > MAX_AUDIO_BYTES) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large')
  options.signal.throwIfAborted()
  const credential = options.credential?.trim()
  const endpoint = validateEndpoint(options.endpoint, Boolean(credential))
  const model = options.model.trim()
  if (model === '') throw new EarsError(EARS_ERROR_CODES.asrModelNotConfigured, 'The cloud ASR model is not configured')

  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(options.audio)], { type: options.mimeType || 'application/octet-stream' }), fileName(options.mimeType))
  form.set('model', model)
  const language = languageCode(options.language)
  if (language !== 'auto') form.set('language', language)

  const headers: Record<string, string> = {}
  if (credential) headers.Authorization = `Bearer ${credential}`
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Cloud ASR request timed out')), REQUEST_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(options.signal.reason)
  options.signal.addEventListener('abort', forwardAbort, { once: true })
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: form,
      redirect: 'manual',
      signal: timeout.signal
    })
    const body = await readBoundedText(response, MAX_RESPONSE_BYTES, timeout.signal)
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      if (!response.ok) throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, `Cloud ASR request failed with HTTP ${response.status}`, { status: response.status })
      throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Cloud ASR returned invalid JSON')
    }
    if (!response.ok) throw new EarsError(EARS_ERROR_CODES.asrHttpFailed, openAiCompatibleErrorDetail(parsed, response.status), { status: response.status })
    if (!isRecord(parsed) || typeof parsed.text !== 'string') throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'Cloud ASR returned no transcript')
    return parsed.text.trim()
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', forwardAbort)
  }
}

function validateEndpoint(value: string, credentialConfigured: boolean): string {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'Cloud ASR endpoint must use HTTP or HTTPS')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'Cloud ASR endpoint must use HTTP or HTTPS')
  if (credentialConfigured && url.protocol !== 'https:') throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'Cloud ASR endpoints with credentials must use HTTPS')
  if (url.username !== '' || url.password !== '') throw new EarsError(EARS_ERROR_CODES.asrEndpointHasCredentials, 'Cloud ASR endpoint must not contain credentials')
  return url.toString()
}

function fileName(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';', 1)[0]
  if (normalized === 'audio/webm') return 'recording.webm'
  if (normalized === 'audio/ogg') return 'recording.ogg'
  if (normalized === 'audio/mp4' || normalized === 'audio/m4a') return 'recording.m4a'
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') return 'recording.wav'
  return 'recording.audio'
}

function languageCode(language: string): string {
  const code = language.trim().split('-', 1)[0]
  return code === '' ? 'auto' : code
}

export function openAiCompatibleErrorDetail(parsed: unknown, status: number): string {
  if (!isRecord(parsed)) return `Cloud ASR request failed with HTTP ${status}`
  const nested = isRecord(parsed.error) ? parsed.error : parsed
  const code = typeof nested.code === 'string' ? nested.code.trim() : typeof nested.type === 'string' ? nested.type.trim() : ''
  const message = typeof nested.message === 'string' ? nested.message.trim() : ''
  if (code !== '' && message !== '' && message !== code) return `${code}: ${message}`
  if (code !== '') return code
  if (message !== '') return message
  return `Cloud ASR request failed with HTTP ${status}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
