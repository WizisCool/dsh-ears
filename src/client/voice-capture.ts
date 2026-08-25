import { ASR_BACKEND_IDS } from '../config.js'
import type { AsrBackendId } from '../config.js'
import type { VoiceInputState } from './voice-flow.js'

export type VoiceToggleAction = 'start' | 'stop' | 'ignore'

export type MicrophoneClickDecision =
  | { action: 'ignore' }
  | { action: 'stop' }
  | { action: 'unavailable' }
  | { action: 'start'; backend: AsrBackendId }

/**
 * Map a stored backend id to a capture backend. Unknown values stay unknown
 * so the composer cannot silently start Web Speech for a different backend.
 */
export function resolveCaptureBackend(value: string): AsrBackendId | null {
  return (ASR_BACKEND_IDS as readonly string[]).includes(value) ? value as AsrBackendId : null
}

export function voiceToggleAction(state: VoiceInputState): VoiceToggleAction {
  if (state === 'starting' || state === 'recording') return 'stop'
  if (state === 'transcribing' || state === 'polishing') return 'ignore'
  return 'start'
}

export function decideMicrophoneClick(options: {
  state: VoiceInputState
  asrBackend: string
  browserAvailable: { webSpeech: boolean; mediaRecorder: boolean }
}): MicrophoneClickDecision {
  const toggle = voiceToggleAction(options.state)
  if (toggle === 'ignore') return { action: 'ignore' }
  if (toggle === 'stop') return { action: 'stop' }
  const backend = resolveCaptureBackend(options.asrBackend)
  if (backend === null) return { action: 'unavailable' }
  const available = backend === 'web-speech' ? options.browserAvailable.webSpeech : options.browserAvailable.mediaRecorder
  if (!available) return { action: 'unavailable' }
  return { action: 'start', backend }
}

/** Drop a MediaRecorder create() that finished after unmount or an explicit cancel. */
export function shouldAbandonPendingCapture(mounted: boolean, cancelled: boolean): boolean {
  return !mounted || cancelled
}

/**
 * Every media-capture initiation claims the next generation number. A newer
 * start resets the shared cancel flag, so a still-pending create() that
 * resolves afterwards would pass the flag check and steal the live session
 * slot; a capture whose generation is no longer current must abort instead.
 */
export function isSupersededMediaCapture(latestGeneration: number, generation: number): boolean {
  return latestGeneration !== generation
}

/**
 * Prefer the recognition session's own text. When the browser emits no final
 * result, recover the live draft slice written by interim updates.
 */
export function webSpeechCommittedTranscript(options: {
  sessionText: string
  sessionDraft: string
  baseDraft: string
}): string {
  const text = options.sessionText.trim()
  if (text !== '') return text
  if (options.sessionDraft === options.baseDraft) return ''
  if (options.sessionDraft.startsWith(options.baseDraft)) return options.sessionDraft.slice(options.baseDraft.length).trim()
  return options.sessionDraft.trim()
}
