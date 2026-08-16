import type { CloudAsrProviderEntry } from './providers.js'

const LIST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/**
 * Fetch the transcription-capable model ids of a cloud provider by
 * replicating the dsh-llm-pi-ai catalog pattern: `GET {baseUrl}/models`,
 * bearer header, bounded body, parse `data[].id`, apply the registry filter.
 * Providers without a listing endpoint answer from their static models.
 */
export async function fetchCloudProviderModels(entry: CloudAsrProviderEntry, apiKey: string, signal: AbortSignal): Promise<string[]> {
  if (entry.baseUrl === undefined) return entry.staticModels === undefined ? [] : [...entry.staticModels]
  const endpoint = `${entry.baseUrl.replace(/\/+$/, '')}/models`
  const headers: Record<string, string> = { accept: 'application/json' }
  const key = apiKey.trim()
  if (key !== '') headers.authorization = `Bearer ${key}`
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new Error('Cloud model listing timed out')), LIST_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(signal.reason)
  signal.addEventListener('abort', forwardAbort, { once: true })
  try {
    const response = await fetch(endpoint, { method: 'GET', headers, signal: timeout.signal })
    const body = await readBoundedText(response)
    if (!response.ok) throw new Error(`Cloud model listing failed with HTTP ${response.status}`)

    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      throw new Error('Cloud model listing returned invalid JSON')
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.data)) throw new Error('Cloud model listing returned no models')

    const models: string[] = []
    for (const item of parsed.data) {
      if (!isRecord(item) || typeof item.id !== 'string') continue
      const id = item.id.trim()
      if (id === '') continue
      if (entry.modelFilter !== undefined && !entry.modelFilter.test(id)) continue
      models.push(id)
    }
    return models
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', forwardAbort)
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('Cloud model listing is too large')
  if (response.body === null) {
    const body = await response.text()
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) throw new Error('Cloud model listing is too large')
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
        throw new Error('Cloud model listing is too large')
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
