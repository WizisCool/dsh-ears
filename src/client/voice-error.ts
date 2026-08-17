export type VoiceFailureKind = 'empty' | 'config' | 'upstream'

export type RemoteFailureLike = {
  readonly code?: string
  readonly message?: string
}

const EMPTY_MARKERS = [
  'returned no transcript',
  'recorded audio is empty',
  'no-speech',
  'no speech',
  'no valid speech',
  'audio too short',
  'empty audio',
  'aborted',
  'cloud asr request failed with http 400'
]

const CONFIG_MARKERS = [
  'is not configured',
  'must use http',
  'must not contain credentials',
  'unknown dsh-ears',
  'unavailable in this browser',
  'not-allowed',
  'service-not-allowed'
]

export function classifyVoiceFailure(message: string): VoiceFailureKind {
  const text = message.trim().toLowerCase()
  if (text === '') return 'config'
  if (EMPTY_MARKERS.some((marker) => text.includes(marker))) return 'empty'
  if (CONFIG_MARKERS.some((marker) => text.includes(marker))) return 'config'
  return 'upstream'
}

export function remoteFailureDetail(error: RemoteFailureLike): string {
  const code = error.code?.trim() ?? ''
  const message = error.message?.trim() ?? ''
  if (code !== '' && code !== 'HOST_FAILURE' && code !== 'UNKNOWN' && !looksGenericCode(code)) {
    if (message !== '' && message !== code) return `${code}: ${message}`
    return code
  }
  return message || code || 'unknown'
}

export function failureMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return ''
}

export const MIN_RECORDING_MS = 400
export const MIN_AUDIO_BYTES = 512

export function isTrivialRecording(byteLength: number, durationMs: number): boolean {
  return durationMs < MIN_RECORDING_MS || byteLength < MIN_AUDIO_BYTES
}

export function base64ByteLength(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding)
}

function looksGenericCode(code: string): boolean {
  return /^(error|failed|exception|internal)$/i.test(code)
}
