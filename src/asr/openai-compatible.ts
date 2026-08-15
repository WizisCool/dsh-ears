const MAX_AUDIO_BYTES = 24 * 1024 * 1024
const MAX_RESPONSE_BYTES = 1 * 1024 * 1024

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
  if (options.audio.byteLength === 0) throw new Error('The recorded audio is empty')
  if (options.audio.byteLength > MAX_AUDIO_BYTES) throw new Error('The recorded audio is too large')
  const endpoint = validateEndpoint(options.endpoint)
  const model = options.model.trim()
  if (model === '') throw new Error('The cloud ASR model is not configured')

  const form = new FormData()
  form.set('file', new Blob([new Uint8Array(options.audio)], { type: options.mimeType || 'application/octet-stream' }), fileName(options.mimeType))
  form.set('model', model)
  const language = languageCode(options.language)
  if (language !== 'auto') form.set('language', language)

  const headers: Record<string, string> = {}
  const credential = options.credential?.trim()
  if (credential) headers.Authorization = `Bearer ${credential}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: form,
    signal: options.signal
  })
  const body = await readBoundedText(response)
  if (!response.ok) throw new Error(`Cloud ASR request failed with HTTP ${response.status}`)

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('Cloud ASR returned invalid JSON')
  }
  if (!isRecord(parsed) || typeof parsed.text !== 'string') throw new Error('Cloud ASR returned no transcript')
  return parsed.text.trim()
}

function validateEndpoint(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Cloud ASR endpoint must use HTTP or HTTPS')
  if (url.username !== '' || url.password !== '') throw new Error('Cloud ASR endpoint must not contain credentials')
  return url.toString()
}

async function readBoundedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('Cloud ASR response is too large')
  if (response.body === null) {
    const body = await response.text()
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) throw new Error('Cloud ASR response is too large')
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
        throw new Error('Cloud ASR response is too large')
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
