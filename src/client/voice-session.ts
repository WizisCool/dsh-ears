import { useSyncExternalStore } from 'react'
import type { VoiceInputState } from './voice-flow.js'

export type VoiceStateDetailParams = Readonly<Record<string, string | number>>

export type VoiceInputSessionSnapshot = {
  readonly state: VoiceInputState
  readonly levels: readonly number[]
  readonly detail: string
  readonly detailCode?: string
  readonly detailParams?: VoiceStateDetailParams
}

type Listener = () => void

type StopListener = () => void

export const VOICE_WAVEFORM_SLOTS = 128
export const VOICE_ERROR_DISMISS_MS = 2600

const NOTICE_STATES = new Set<VoiceInputState>(['error', 'polish-error', 'upstream-error'])
const DISCARDABLE_STATES = new Set<VoiceInputState>(['transcribing', 'polishing'])

export type RecognitionBarAction = 'stop' | 'discard' | 'busy'

export type VoiceStateSetter = (state: VoiceInputState, detail?: string, detailCode?: string, detailParams?: VoiceStateDetailParams) => void

export function createVoiceStateSetter(session: VoiceInputSession): VoiceStateSetter {
  return (state, detail, detailCode, detailParams) => {
    session.setState(state, detail, detailCode, detailParams)
  }
}

/** Recording keeps the stop square; transcribe/polish swap it for discard. */
export function recognitionBarAction(state: VoiceInputState): RecognitionBarAction {
  if (state === 'recording') return 'stop'
  if (DISCARDABLE_STATES.has(state)) return 'discard'
  return 'busy'
}

export class VoiceInputSession {
  private snapshot: VoiceInputSessionSnapshot = { state: 'idle', levels: [], detail: '' }
  private readonly listeners = new Set<Listener>()
  private readonly stopListeners = new Set<StopListener>()
  private readonly cancelListeners = new Set<StopListener>()
  private epoch = 0
  private errorTimer: ReturnType<typeof setTimeout> | undefined

  captureEpoch(): number {
    return this.epoch
  }

  isCurrentEpoch(epoch: number): boolean {
    return this.epoch === epoch
  }

  readonly getSnapshot = (): VoiceInputSessionSnapshot => this.snapshot

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly onStopRequested = (listener: StopListener): (() => void) => {
    this.stopListeners.add(listener)
    return () => this.stopListeners.delete(listener)
  }

  readonly onCancelRequested = (listener: StopListener): (() => void) => {
    this.cancelListeners.add(listener)
    return () => this.cancelListeners.delete(listener)
  }

  setState(state: VoiceInputState, detail = '', detailCode?: string, detailParams?: VoiceStateDetailParams): void {
    const nextDetail = NOTICE_STATES.has(state) ? detail : ''
    const nextDetailCode = NOTICE_STATES.has(state) ? detailCode : undefined
    const nextDetailParams = NOTICE_STATES.has(state) ? detailParams : undefined
    if (this.snapshot.state === state && this.snapshot.detail === nextDetail && this.snapshot.detailCode === nextDetailCode && this.snapshot.detailParams === nextDetailParams) return
    this.clearErrorTimer()
    const resetLevels = state === 'starting' || state === 'idle' || NOTICE_STATES.has(state)
    this.snapshot = {
      state,
      levels: resetLevels ? [] : this.snapshot.levels,
      detail: nextDetail,
      ...(nextDetailCode === undefined ? {} : { detailCode: nextDetailCode }),
      ...(nextDetailParams === undefined ? {} : { detailParams: nextDetailParams })
    }
    this.emit()
    if (NOTICE_STATES.has(state)) {
      this.errorTimer = setTimeout(() => {
        this.errorTimer = undefined
        if (NOTICE_STATES.has(this.snapshot.state)) this.setState('idle')
      }, VOICE_ERROR_DISMISS_MS)
    }
  }

  pushAudioLevel(level: number): void {
    if (this.snapshot.state !== 'starting' && this.snapshot.state !== 'recording') return
    const next = [...this.snapshot.levels, Math.max(0, Math.min(1, level))]
    this.snapshot = { ...this.snapshot, levels: next.slice(-VOICE_WAVEFORM_SLOTS) }
    this.emit()
  }

  requestStop(): void {
    for (const listener of this.stopListeners) listener()
  }

  requestCancel(): void {
    if (!DISCARDABLE_STATES.has(this.snapshot.state)) return
    this.epoch += 1
    for (const listener of this.cancelListeners) listener()
    if (DISCARDABLE_STATES.has(this.snapshot.state)) this.setState('idle')
  }

  dispose(): void {
    this.clearErrorTimer()
    this.listeners.clear()
    this.stopListeners.clear()
    this.cancelListeners.clear()
  }

  private clearErrorTimer(): void {
    if (this.errorTimer === undefined) return
    clearTimeout(this.errorTimer)
    this.errorTimer = undefined
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export function useVoiceInputSession(session: VoiceInputSession): VoiceInputSessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
}
