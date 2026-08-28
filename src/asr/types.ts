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

/** Capabilities reported by a provider's model catalog. Unknown fields stay absent. */
export interface CloudAsrModelCapabilities {
  readonly batch?: boolean
  readonly streaming?: boolean
}

/** Provider model catalog used between an adapter and the Host Remote façade. */
export interface CloudAsrModelCatalog {
  readonly models: string[]
  readonly modelCapabilities?: Readonly<Record<string, CloudAsrModelCapabilities>>
}
