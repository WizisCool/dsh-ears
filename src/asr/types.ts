import type { AsrBackendId } from '../config.js'

export interface AsrBackendInfo {
  id: AsrBackendId
  name: string
  available: boolean
  detail: string
  detailCode?: string
  detailParams?: Readonly<Record<string, string | number>>
}

export interface AudioPayload {
  base64: string
  mimeType: string
}

/**
 * Capabilities reported by a provider's model catalog. Unknown fields stay
 * absent. `transport` declares the request transport a model requires on the
 * wire; a model may report `streaming: true` yet require a newer API generation
 * (e.g. Deepgram Listen V2) that the in-repo adapter cannot issue.
 */
export interface CloudAsrModelCapabilities {
  readonly batch?: boolean
  readonly streaming?: boolean
  readonly transport?: CloudAsrModelTransport
}

/** Request transport a model requires on the wire, resolved from provider metadata. */
export type CloudAsrModelTransport = 'listen-v1' | 'listen-v2'

/** Provider model catalog used between an adapter and the Host Remote façade. */
export interface CloudAsrModelCatalog {
  readonly models: string[]
  readonly modelCapabilities?: Readonly<Record<string, CloudAsrModelCapabilities>>
}
