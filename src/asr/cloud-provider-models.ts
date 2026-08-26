import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import type { CloudAsrProviderEntry } from './providers.js'

const LIST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** Fetch transcription-capable model IDs for a cloud provider. */
export async function fetchCloudProviderModels(entry: CloudAsrProviderEntry, apiKey: string, signal: AbortSignal): Promise<string[]> {
  if (entry.baseUrl === undefined) return entry.staticModels === undefined ? [] : [...entry.staticModels]
  const endpoint = `${entry.baseUrl.replace(/\/+$/, '')}/models`
  const headers: Record<string, string> = { accept: 'application/json' }
  const key = apiKey.trim()
  if (key !== '') {
    headers.authorization = entry.protocol === 'deepgram' ? `Token ${key}` : `Bearer ${key}`
  }
  const timeout = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    timeout.abort()
  }, LIST_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(signal.reason)
  signal.addEventListener('abort', forwardAbort, { once: true })
  try {
    try {
      const response = await fetch(endpoint, { method: 'GET', headers, signal: timeout.signal })
      const body = await readBoundedText(response)
      if (!response.ok) throw new EarsError(EARS_ERROR_CODES.cloudModelsHttpFailed, `Cloud model listing failed with HTTP ${response.status}`, { status: response.status })

      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        throw new EarsError(EARS_ERROR_CODES.cloudModelsInvalidJson, 'Cloud model listing returned invalid JSON')
      }
      if (entry.protocol === 'deepgram') {
        if (!isRecord(parsed) || !Array.isArray(parsed.stt)) throw new EarsError(EARS_ERROR_CODES.cloudModelsNoModels, 'Deepgram model listing returned no models')
        const models = filterDeepgramModels(parsed.stt)
        if (models.length === 0) throw new EarsError(EARS_ERROR_CODES.cloudModelsNoModels, 'Deepgram model listing returned no models')
        return models
      }

      if (!isRecord(parsed) || !Array.isArray(parsed.data)) throw new EarsError(EARS_ERROR_CODES.cloudModelsNoModels, 'Cloud model listing returned no models')

      const models: string[] = []
      for (const item of parsed.data) {
        if (!isRecord(item) || typeof item.id !== 'string') continue
        const id = item.id.trim()
        if (id === '') continue
        if (entry.modelFilter !== undefined && !entry.modelFilter.test(id)) continue
        models.push(id)
      }
      return models
    } catch (error) {
      if (timedOut && !signal.aborted) throw new EarsError(EARS_ERROR_CODES.cloudModelsTimedOut, 'Cloud model listing timed out')
      throw error
    }

  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', forwardAbort)
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new EarsError(EARS_ERROR_CODES.cloudModelsTooLarge, 'Cloud model listing is too large')
  if (response.body === null) {
    const body = await response.text()
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) throw new EarsError(EARS_ERROR_CODES.cloudModelsTooLarge, 'Cloud model listing is too large')
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
        throw new EarsError(EARS_ERROR_CODES.cloudModelsTooLarge, 'Cloud model listing is too large')
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

export function filterDeepgramModels(stt: unknown[]): string[] {
  const rawSet = new Set<string>()
  for (const item of stt) {
    if (!isRecord(item)) continue
    const name = typeof item.canonical_name === 'string' && item.canonical_name.trim() !== ''
      ? item.canonical_name.trim()
      : typeof item.name === 'string' ? item.name.trim() : ''
    if (name === '' || name === 'phoneme' || name.includes('dQw4w9WgXcQ')) continue
    rawSet.add(name)
  }

  // Ensure top-level family aliases exist when general variants are present
  if (rawSet.has('nova-3-general')) rawSet.add('nova-3')
  if (rawSet.has('nova-2-general')) rawSet.add('nova-2')
  if (rawSet.has('enhanced-general')) rawSet.add('enhanced')
  if (rawSet.has('general')) rawSet.add('base')

  function modelRank(id: string): number {
    if (id === 'nova-3') return 10
    if (id === 'nova-3-general') return 11
    if (id.startsWith('nova-3-')) return 12
    if (id === 'nova-2') return 20
    if (id === 'nova-2-general') return 21
    if (id.startsWith('nova-2-')) return 22
    if (id === 'enhanced') return 30
    if (id.startsWith('enhanced-')) return 31
    if (id === 'base') return 40
    if (id.startsWith('whisper-')) return 50
    return 60
  }

  return Array.from(rawSet).sort((a, b) => {
    const rankDiff = modelRank(a) - modelRank(b)
    if (rankDiff !== 0) return rankDiff
    return a.localeCompare(b)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
