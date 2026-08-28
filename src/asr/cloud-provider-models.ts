import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import { deepgramCatalogCompatibility } from './deepgram-compatibility.js'
import type { CloudAsrProviderEntry } from './providers.js'
import type { CloudAsrModelCapabilities, CloudAsrModelCatalog } from './types.js'

const LIST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** Fetch model IDs and any provider-reported capabilities for a cloud provider. */
export async function fetchCloudProviderModels(entry: CloudAsrProviderEntry, apiKey: string, signal: AbortSignal): Promise<CloudAsrModelCatalog> {
  signal.throwIfAborted()
  if (entry.modelStrategy !== 'listing' || entry.baseUrl === undefined) {
    return {
      models: entry.staticModels === undefined ? [] : [...entry.staticModels],
      ...(entry.staticModelCapabilities === undefined ? {} : { modelCapabilities: entry.staticModelCapabilities })
    }
  }
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
  if (signal.aborted) timeout.abort(signal.reason)
  const forwardAbort = () => timeout.abort(signal.reason)
  signal.addEventListener('abort', forwardAbort, { once: true })
  try {
    try {
      const response = await fetch(endpoint, { method: 'GET', headers, redirect: 'manual', signal: timeout.signal })
      const body = await readBoundedText(response, timeout.signal)
      signal.throwIfAborted()
      if (!response.ok) throw new EarsError(EARS_ERROR_CODES.cloudModelsHttpFailed, `Cloud model listing failed with HTTP ${response.status}`, { status: response.status })

      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        throw new EarsError(EARS_ERROR_CODES.cloudModelsInvalidJson, 'Cloud model listing returned invalid JSON')
      }
      if (entry.protocol === 'deepgram') {
        if (!isRecord(parsed) || !Array.isArray(parsed.stt)) throw new EarsError(EARS_ERROR_CODES.cloudModelsNoModels, 'Deepgram model listing returned no models')
        const catalog = filterDeepgramModels(parsed.stt)
        if (catalog.models.length === 0) throw new EarsError(EARS_ERROR_CODES.cloudModelsNoModels, 'Deepgram model listing returned no models')
        return catalog
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
      return { models }
    } catch (error) {
      if (timedOut && !signal.aborted) throw new EarsError(EARS_ERROR_CODES.cloudModelsTimedOut, 'Cloud model listing timed out')
      throw error
    }

  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', forwardAbort)
  }
}

async function readBoundedText(response: Response, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    try {
      await response.body?.cancel()
    } catch {
      // Preserve the size-limit error when transport cleanup also fails.
    }
    throw new EarsError(EARS_ERROR_CODES.cloudModelsTooLarge, 'Cloud model listing is too large')
  }
  if (response.body === null) {
    const body = await response.text()
    signal?.throwIfAborted()
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) throw new EarsError(EARS_ERROR_CODES.cloudModelsTooLarge, 'Cloud model listing is too large')
    return body
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const cancelOnAbort = () => {
    try {
      void reader.cancel(signal?.reason).catch(() => undefined)
    } catch {
      // The abort itself remains authoritative even if a custom reader cannot cancel.
    }
  }
  signal?.addEventListener('abort', cancelOnAbort, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      const next = await reader.read()
      signal?.throwIfAborted()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // Preserve the size-limit error when transport cleanup also fails.
        }
        throw new EarsError(EARS_ERROR_CODES.cloudModelsTooLarge, 'Cloud model listing is too large')
      }
      chunks.push(next.value)
    }
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort)
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

export function filterDeepgramModels(stt: unknown[]): CloudAsrModelCatalog {
  const rawSet = new Set<string>()
  const capabilities = new Map<string, CloudAsrModelCapabilities>()
  for (const item of stt) {
    if (!isRecord(item)) continue
    let name = ''
    if (typeof item.canonical_name === 'string' && item.canonical_name.trim() !== '') {
      name = item.canonical_name.trim()
    } else if (typeof item.name === 'string') {
      name = item.name.trim()
    }
    // Filter out empty names, non-STT models (e.g. phoneme), and internal/test models (e.g. dQw4w9WgXcQ)
    if (name === '' || name === 'phoneme' || name.includes('dQw4w9WgXcQ')) continue
    rawSet.add(name)
    const modelCapabilities = readModelCapabilities(item)
    if (modelCapabilities !== undefined) mergeCapabilities(capabilities, name, modelCapabilities)
  }

  // These are provider aliases, not capability guesses: an alias inherits the
  // capability metadata of the exact model entry that caused it to be added.
  const aliases: readonly [string, string][] = [
    ['nova-3', 'nova-3-general'],
    ['nova-2', 'nova-2-general'],
    ['enhanced', 'enhanced-general'],
    ['base', 'general']
  ]
  for (const [alias, source] of aliases) {
    if (!rawSet.has(source) || rawSet.has(alias)) continue
    rawSet.add(alias)
    const sourceCapabilities = capabilities.get(source)
    if (sourceCapabilities !== undefined) capabilities.set(alias, { ...sourceCapabilities })
  }

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

  const models = Array.from(rawSet).sort((a, b) => {
    const rankDiff = modelRank(a) - modelRank(b)
    if (rankDiff !== 0) return rankDiff
    return a.localeCompare(b)
  })
  const modelCapabilities = Object.fromEntries(capabilities.entries())
  return {
    models,
    ...(Object.keys(modelCapabilities).length === 0 ? {} : { modelCapabilities })
  }
}

function readModelCapabilities(item: Record<string, unknown>): CloudAsrModelCapabilities | undefined {
  const capabilities: CloudAsrModelCapabilities = {
    ...(typeof item.batch === 'boolean' ? { batch: item.batch } : {}),
    ...(typeof item.streaming === 'boolean' ? { streaming: item.streaming } : {}),
    // Provider-reported capabilities are corrected below for models the
    // in-repo Listen V1 adapters cannot actually execute.
    ...(deepgramCatalogCompatibility(item))
  }
  return Object.keys(capabilities).length === 0 ? undefined : capabilities
}

function mergeCapabilities(map: Map<string, CloudAsrModelCapabilities>, model: string, incoming: CloudAsrModelCapabilities): void {
  const current = map.get(model)
  if (current === undefined) {
    map.set(model, { ...incoming })
    return
  }
  map.set(model, {
    ...resolveBooleanCapability('batch', current.batch, incoming.batch),
    ...resolveBooleanCapability('streaming', current.streaming, incoming.streaming),
    ...resolveTransportCapability(current.transport, incoming.transport)
  })
}

function resolveBooleanCapability(key: 'batch' | 'streaming', current: boolean | undefined, incoming: boolean | undefined): Partial<CloudAsrModelCapabilities> {
  if (current === true || incoming === true) return { [key]: true }
  if (current !== undefined || incoming !== undefined) return { [key]: false }
  return {}
}

function resolveTransportCapability(current: CloudAsrModelCapabilities['transport'], incoming: CloudAsrModelCapabilities['transport']): Partial<CloudAsrModelCapabilities> {
  // A model that any duplicate entry routes to Listen V2 is not executable
  // by the Listen V1 adapter, so that generation wins the merge.
  if (current === 'listen-v2' || incoming === 'listen-v2') return { transport: 'listen-v2' }
  if (incoming !== undefined) return { transport: incoming }
  if (current !== undefined) return { transport: current }
  return {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
