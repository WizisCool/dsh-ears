import { ASR_BACKEND_IDS } from '../config.js'
import type { AsrBackendId } from '../config.js'
import type { VoiceInputState } from './voice-flow.js'

export type VoiceToggleAction = 'start' | 'stop' | 'ignore'

export type MicrophoneClickDecision =
  | { action: 'ignore' }
  | { action: 'stop' }
  | { action: 'unavailable' }
  | { action: 'start'; backend: AsrBackendId }

/** Map a stored backend ID to a recognized capture backend, or null if unknown. */
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

/** Reuse an asynchronous operation while the same keyed operation is in flight. */
export function reuseInFlightPromise<TKey, TResult>(
  inFlight: { current: { key: TKey; promise: Promise<TResult> } | null },
  key: TKey,
  operation: () => Promise<TResult>
): Promise<TResult> {
  const current = inFlight.current
  if (current !== null && Object.is(current.key, key)) return current.promise
  const promise = operation()
  inFlight.current = { key, promise }
  const clear = () => {
    if (inFlight.current?.promise === promise) inFlight.current = null
  }
  void promise.then(clear, clear)
  return promise
}

/** Check whether a media capture was superseded by a newer start generation. */
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
