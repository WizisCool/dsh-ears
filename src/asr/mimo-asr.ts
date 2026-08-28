import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import { mimoEndpoint as sharedMimoEndpoint } from '../settings/recognition.js'
import { isRecord, readBoundedText } from './transport.js'

const MAX_ENCODED_BYTES = 24 * 1024 * 1024
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000

export interface MimoAsrOptions {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly language: string
  readonly endpoint: string
  readonly model: string
  readonly credential: string
  readonly signal: AbortSignal
}

export function mimoEndpoint(service: string, cluster: string): string {
  return sharedMimoEndpoint(service, cluster)
}

export function audioFormatFromMime(mimeType: string): 'mp3' | 'wav' {
  const normalized = mimeType.toLowerCase().split(';', 1)[0] ?? ''
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'mp3'
  return 'wav'
}

export function mimoLanguage(language: string): string {
  const normalized = language.trim().toLowerCase().split('-', 1)[0] ?? ''
  if (normalized === 'zh') return 'zh'
  if (normalized === 'en') return 'en'
  return 'auto'
}

export function mimoRequestBody(
  model: string,
  dataUri: string,
  mimeType: string,
  language: string
): Record<string, unknown> {
  return {
    model: model.trim(),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: dataUri,
              format: audioFormatFromMime(mimeType)
            }
          }
        ]
      }
    ],
    asr_options: {
      language: mimoLanguage(language)
    }
  }
}

export function extractMimoTranscript(parsed: unknown): string {
  if (!isRecord(parsed)) throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Cloud ASR returned invalid JSON')
  if (Array.isArray(parsed.choices) && isRecord(parsed.choices[0]) && isRecord(parsed.choices[0].message)) {
    const content = parsed.choices[0].message.content
    if (typeof content === 'string') return content.trim()
    // Some OpenAI-like deployments return content as an array of parts.
    if (Array.isArray(content)) {
      const joined = content
        .flatMap((part) => {
          if (!isRecord(part)) return []
          const text = typeof part.text === 'string'
            ? part.text
            : typeof (part as Record<string, unknown>).content === 'string'
              ? String((part as Record<string, unknown>).content)
              : ''
          const trimmed = text.trim()
          return trimmed === '' ? [] : [trimmed]
        })
        .join('')
      if (joined !== '') return joined
    }
  }
  const errorObj = parsed.error
  if (isRecord(errorObj) && typeof errorObj.message === 'string' && errorObj.message.trim() !== '') {
    throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, errorObj.message.trim())
  }
  throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'Cloud ASR returned no transcript')
}

export function mimoErrorDetail(parsed: unknown, status: number): string {
  if (isRecord(parsed)) {
    const errorObj = parsed.error
    if (isRecord(errorObj) && typeof errorObj.message === 'string' && errorObj.message.trim() !== '') {
      return errorObj.message.trim()
    }
    if (typeof parsed.message === 'string' && parsed.message.trim() !== '') {
      return parsed.message.trim()
    }
  }
  return `Cloud ASR request failed with HTTP ${status}`
}

export async function transcribeMimoAsr(options: MimoAsrOptions): Promise<string> {
  if (options.audio.byteLength === 0) return ''
  options.signal.throwIfAborted()
  const model = options.model.trim()
  if (model === '') throw new EarsError(EARS_ERROR_CODES.asrModelNotConfigured, 'The cloud ASR model is not configured')
  const credential = options.credential.trim()
  if (credential === '') throw new EarsError(EARS_ERROR_CODES.asrApiKeyNotConfigured, 'The cloud ASR API key is not configured')
  const endpoint = validateEndpoint(options.endpoint) // carries Authorization: Bearer, so must be HTTPS
  const format = audioFormatFromMime(options.mimeType)
  // Host-side payload is always normalized to mono 16 kHz PCM16 WAV before this call
  // (prepareRecordedAudioForBackend in the client). Reject any MIME that declares
  // 'wav' without being a real WAV, so misuse surfaces as an explicit error instead
  // of a confusing server-side decode failure.
  const mime = format === 'mp3' ? 'audio/mp3' : 'audio/wav'
  if (format === 'wav' && !/^audio\/wav/i.test(options.mimeType)) {
    throw new EarsError(EARS_ERROR_CODES.asrMimeTypeMismatch, 'MiMo ASR requires WAV or MP3 audio, but the recorded payload is not WAV')
  }
  const dataUri = `data:${mime};base64,${Buffer.from(options.audio).toString('base64')}`
  if (Buffer.byteLength(dataUri) > MAX_ENCODED_BYTES) {
    throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large for MiMo ASR')
  }

  const payload = mimoRequestBody(model, dataUri, mime, options.language)

  const timeout = new AbortController()
  const timer = setTimeout(() => {
    timeout.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Cloud ASR request timed out'))
  }, REQUEST_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(options.signal.reason)
  options.signal.addEventListener('abort', forwardAbort, { once: true })

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      redirect: 'manual',
      signal: timeout.signal
    })

    const body = await readBoundedText(response, MAX_RESPONSE_BYTES, timeout.signal)
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      if (!response.ok) {
        throw new EarsError(
          EARS_ERROR_CODES.asrHttpFailed,
          `Cloud ASR request failed with HTTP ${response.status}`,
          { status: response.status }
        )
      }
      throw new EarsError(EARS_ERROR_CODES.asrInvalidResponse, 'Cloud ASR returned invalid JSON')
    }

    if (!response.ok) {
      throw new EarsError(
        EARS_ERROR_CODES.asrHttpFailed,
        mimoErrorDetail(parsed, response.status),
        { status: response.status }
      )
    }

    return extractMimoTranscript(parsed)
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
    throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'Cloud ASR endpoint must use HTTP or HTTPS')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'Cloud ASR endpoint must use HTTP or HTTPS')
  // MiMo always sends Authorization: Bearer, so the endpoint must be HTTPS.
  if (url.protocol !== 'https:') throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'Cloud ASR endpoint must use HTTPS')
  if (url.username !== '' || url.password !== '') throw new EarsError(EARS_ERROR_CODES.asrEndpointHasCredentials, 'Cloud ASR endpoint must not contain credentials')
  return url.toString()
}
