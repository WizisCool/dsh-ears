import { isSenseVoiceModelId } from './sensevoice-models.js'

export type SenseVoiceWorkerRequestPayload =
  | { readonly type: 'init'; readonly model: string; readonly modelPath: string; readonly tokensPath: string }
  | { readonly type: 'transcribe'; readonly audioPath: string }
  | { readonly type: 'shutdown' }

export type SenseVoiceWorkerRequest = SenseVoiceWorkerRequestPayload & { readonly id: number }

export interface SenseVoiceWorkerError {
  readonly message: string
  readonly code?: string
}

export interface SenseVoiceWorkerResponse {
  readonly type: 'response'
  readonly id: number
  readonly ok: boolean
  readonly text?: string
  readonly segments?: readonly { readonly text: string; readonly start: number; readonly end: number }[]
  readonly error?: SenseVoiceWorkerError
}

export interface SenseVoiceWorkerTranscript {
  readonly text?: string
  readonly segments?: readonly { readonly text: string; readonly start: number; readonly end: number }[]
}

export function isSenseVoiceWorkerRequest(value: unknown): value is SenseVoiceWorkerRequest {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'number') return false
  if (record.type === 'init') {
    return typeof record.model === 'string'
      && isSenseVoiceModelId(record.model)
      && typeof record.modelPath === 'string'
      && typeof record.tokensPath === 'string'
  }
  if (record.type === 'transcribe') return typeof record.audioPath === 'string'
  return record.type === 'shutdown'
}

export function isSenseVoiceWorkerResponse(value: unknown): value is SenseVoiceWorkerResponse {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return record.type === 'response'
    && typeof record.id === 'number'
    && typeof record.ok === 'boolean'
    && (record.text === undefined || typeof record.text === 'string')
    && (record.segments === undefined || (Array.isArray(record.segments) && record.segments.every((segment) => segment !== null
      && typeof segment === 'object'
      && typeof (segment as Record<string, unknown>).text === 'string'
      && typeof (segment as Record<string, unknown>).start === 'number'
      && typeof (segment as Record<string, unknown>).end === 'number')))
    && (record.error === undefined || isSenseVoiceWorkerError(record.error))
}

function isSenseVoiceWorkerError(value: unknown): value is SenseVoiceWorkerError {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.message === 'string' && (record.code === undefined || typeof record.code === 'string')
}
