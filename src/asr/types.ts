import type { AsrBackendId } from '../config.js'

export interface AsrBackendInfo {
  id: AsrBackendId
  name: string
  available: boolean
  detail: string
}

export interface AudioPayload {
  base64: string
  mimeType: string
}
