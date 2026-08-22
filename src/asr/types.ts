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
