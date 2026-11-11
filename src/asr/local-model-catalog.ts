import { EARS_ERROR_CODES, EarsError, sanitizeEarsErrorText } from '../errors.js'
import { isValidLocalModelBaseUrl, modelFileUrl, SENSEVOICE_MODEL_MANIFEST } from './sensevoice-models.js'
import { WHISPER_MODEL_MANIFEST } from './whisper-models.js'
import type { LocalModelSourceId } from '../settings/recognition.js'
import type { LocalModelCatalog } from '../remote-contract.js'

const CATALOG_REQUEST_TIMEOUT_MS = 12_000

export interface LocalModelCatalogOptions {
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

/** Discover the supported model files present at the selected source URL. */
export async function listLocalModelOptions(
  backend: string,
  source: string,
  baseUrl: string,
  signal?: AbortSignal,
  options: LocalModelCatalogOptions = {}
): Promise<LocalModelCatalog> {
  if (backend !== 'local-whisper' && backend !== 'local-sensevoice') {
    throw new EarsError(EARS_ERROR_CODES.localModelCatalogFailed, 'A local model backend must be selected')
  }
  if (source !== 'official' && source !== 'mirror' && source !== 'custom') {
    throw new EarsError(EARS_ERROR_CODES.localModelCatalogFailed, 'The local model source is not supported')
  }
  if (!isValidLocalModelBaseUrl(baseUrl)) {
    throw new EarsError(EARS_ERROR_CODES.asrEndpointInvalid, 'The local model base URL is invalid')
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (fetchImpl === undefined) throw new EarsError(EARS_ERROR_CODES.localModelCatalogFailed, 'The Node fetch API is unavailable')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? CATALOG_REQUEST_TIMEOUT_MS)
  const forwardAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', forwardAbort, { once: true })
  try {
    signal?.throwIfAborted()
    const models = backend === 'local-whisper'
      ? await listWhisperModelOptions(baseUrl, fetchImpl, controller.signal)
      : await listSenseVoiceModelOptions(baseUrl, fetchImpl, controller.signal)
    signal?.throwIfAborted()
    return { backend, source: source as LocalModelSourceId, models }
  } catch (error) {
    if (signal?.aborted) signal.throwIfAborted()
    if (error instanceof EarsError) throw error
    const detail = sanitizeEarsErrorText(error instanceof Error ? error.message : String(error))
    const timedOut = controller.signal.aborted
    throw new EarsError(
      EARS_ERROR_CODES.localModelCatalogFailed,
      timedOut ? 'Reading the local model list timed out' : 'Could not read the local model list',
      { detail }
    )
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

async function listWhisperModelOptions(baseUrl: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<string[]> {
  const models = await Promise.all(Object.entries(WHISPER_MODEL_MANIFEST).map(async ([id, model]) => {
    const available = await isFileAvailable(modelFileUrl(baseUrl, model.fileName), model.bytes, fetchImpl, signal)
    return available ? id : null
  }))
  return models.filter((model): model is string => model !== null)
}

async function listSenseVoiceModelOptions(baseUrl: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<string[]> {
  const tokens = SENSEVOICE_MODEL_MANIFEST['small-int8'].tokens
  if (!await isFileAvailable(modelFileUrl(baseUrl, tokens.fileName), tokens.bytes, fetchImpl, signal)) return []
  const models = await Promise.all(Object.entries(SENSEVOICE_MODEL_MANIFEST).map(async ([id, definition]) => {
    const available = await isFileAvailable(modelFileUrl(baseUrl, definition.model.fileName), definition.model.bytes, fetchImpl, signal)
    return available ? id : null
  }))
  return models.filter((model): model is string => model !== null)
}

async function isFileAvailable(url: string, expectedBytes: number, fetchImpl: typeof fetch, signal: AbortSignal): Promise<boolean> {
  const response = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal })
  if (!response.ok) return false
  const size = Number(response.headers.get('content-length'))
  return !Number.isFinite(size) || size === 0 || size === expectedBytes
}
