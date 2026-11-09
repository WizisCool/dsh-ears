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
 * Await an operation with a deadline. A rejection that arrives before the
 * deadline still propagates; a rejection after it is consumed so the caller
 * is never trapped by a browser API that never settles.
 */
export function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<{ settled: true; value: T } | { settled: false }> {
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      resolve({ settled: false })
    }, Math.max(0, timeoutMs))
    promise.then(
      (value) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ settled: true, value })
      },
      (error: unknown) => {
        if (done) return
        done = true
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
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
