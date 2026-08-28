import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import type { CloudAsrModelCapabilities } from './types.js'

/** Deepgram Flux requires Listen V2, which the in-repo adapters do not issue. */
export const DEEPGRAM_FLUX_UNSUPPORTED_MESSAGE = 'Deepgram Flux models require Listen V2, which this adapter does not support'

/** Recognize a Deepgram Flux model when catalog metadata is unavailable. */
export function isDeepgramFluxModel(model: string): boolean {
  return /^flux(?:[-_.]|$)/i.test(model.trim())
}

/** Reject a model before a Listen V1 request or socket is created. */
export function assertDeepgramModelSupported(model: string): void {
  if (isDeepgramFluxModel(model)) throw new EarsError(EARS_ERROR_CODES.asrServiceUnavailable, DEEPGRAM_FLUX_UNSUPPORTED_MESSAGE)
}

/** Correct catalog facts that the in-repo Listen V1 adapters cannot honor. */
export function deepgramCatalogCompatibility(item: Record<string, unknown>): Partial<CloudAsrModelCapabilities> {
  const architecture = typeof item.architecture === 'string' ? item.architecture.trim().toLowerCase() : ''
  if (architecture === 'whisper') return { streaming: false }
  if (architecture === 'flux') return { transport: 'listen-v2' }
  return {}
}
