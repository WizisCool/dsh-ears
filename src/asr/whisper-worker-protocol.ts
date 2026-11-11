import type { LibVariant } from '@fugood/whisper.node'
import type { EarsErrorCode, EarsErrorParams } from '../errors.js'

/**
 * JSON-safe protocol between the Host process and the sacrificial Whisper
 * worker. The worker owns every native object; the Host only ever sees these
 * plain values. Audio travels as a temporary file path because the binding's
 * file-based entry point reads it directly.
 */
export type WhisperWorkerRequestPayload =
  | { readonly type: 'init'; readonly modelPath: string; readonly variant: LibVariant; readonly useGpu: boolean }
  | { readonly type: 'transcribe'; readonly audioPath: string; readonly language: string | null }
  | { readonly type: 'cancel' }
  | { readonly type: 'release' }
  | { readonly type: 'shutdown' }

export type WhisperWorkerRequest = WhisperWorkerRequestPayload & { readonly id: number }

export type WhisperWorkerValue =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'text'
      readonly text: string
      readonly isAborted: boolean
      readonly segments?: readonly { readonly text: string; readonly start: number; readonly end: number }[]
    }

export type WhisperWorkerError = {
  readonly message: string
  readonly code?: EarsErrorCode
  readonly params?: EarsErrorParams
}

export type WhisperWorkerResponse =
  | { readonly type: 'response'; readonly id: number; readonly ok: true; readonly value: WhisperWorkerValue }
  | { readonly type: 'response'; readonly id: number; readonly ok: false; readonly error: WhisperWorkerError }

export function isWhisperWorkerResponse(value: unknown): value is WhisperWorkerResponse {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.type !== 'response' || typeof record.id !== 'number') return false
  if (record.ok === true) {
    return isWhisperWorkerValue(record.value)
  }
  if (record.ok !== false) return false
  const error = record.error
  return error !== null && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
}

function isWhisperWorkerValue(value: unknown): value is WhisperWorkerValue {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (record.kind === 'none') return true
  return record.kind === 'text'
    && typeof record.text === 'string'
    && typeof record.isAborted === 'boolean'
    && (record.segments === undefined || (Array.isArray(record.segments) && record.segments.every((segment) => segment !== null
      && typeof segment === 'object'
      && typeof (segment as Record<string, unknown>).text === 'string'
      && typeof (segment as Record<string, unknown>).start === 'number'
      && typeof (segment as Record<string, unknown>).end === 'number')))
}
