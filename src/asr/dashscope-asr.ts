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
  if (!isRecord(parsed)) throw new Error('Cloud ASR returned invalid JSON')
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
  if (message !== '') throw new Error(message)
  throw new Error('Cloud ASR returned no transcript')
}

export async function transcribeDashScopeAsr(options: DashScopeAsrOptions): Promise<string> {
  if (options.audio.byteLength === 0) throw new Error('The recorded audio is empty')
  options.signal.throwIfAborted()
  const model = options.model.trim()
  if (model === '') throw new Error('The cloud ASR model is not configured')
  const credential = options.credential.trim()
  if (credential === '') throw new Error('The cloud ASR API key is not configured')
  const endpoint = validateEndpoint(options.endpoint)
  const mime = (options.mimeType.split(';', 1)[0] ?? 'audio/webm').trim() || 'audio/webm'
  const dataUri = `data:${mime};base64,${Buffer.from(options.audio).toString('base64')}`
  if (Buffer.byteLength(dataUri) > MAX_ENCODED_BYTES) throw new Error('The recorded audio is too large for Bailian ASR')

  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new Error('Cloud ASR request timed out')), REQUEST_TIMEOUT_MS)
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
      signal: timeout.signal
    })
    const body = await readBoundedText(response)
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new Error('Cloud ASR returned invalid JSON')
    }
    if (!response.ok) {
      const message = isRecord(parsed) && typeof parsed.message === 'string' && parsed.message.trim() !== ''
        ? parsed.message.trim()
        : `Cloud ASR request failed with HTTP ${response.status}`
      throw new Error(message)
    }
    return extractDashScopeTranscript(parsed)
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', forwardAbort)
  }
}

function validateEndpoint(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Cloud ASR endpoint must use HTTP or HTTPS')
  if (url.username !== '' || url.password !== '') throw new Error('Cloud ASR endpoint must not contain credentials')
  return url.toString()
}

function firstText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text === '' ? undefined : text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
