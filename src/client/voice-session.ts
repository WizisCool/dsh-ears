import { useSyncExternalStore } from 'react'
import type { VoiceInputState } from './voice-flow.js'

export type VoiceInputSessionSnapshot = {
  readonly state: VoiceInputState
  readonly levels: readonly number[]
}

type Listener = () => void

type StopListener = () => void

export const VOICE_WAVEFORM_SLOTS = 128

export class VoiceInputSession {
  private snapshot: VoiceInputSessionSnapshot = { state: 'idle', levels: [] }
  private readonly listeners = new Set<Listener>()
  private readonly stopListeners = new Set<StopListener>()

  readonly getSnapshot = (): VoiceInputSessionSnapshot => this.snapshot

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly onStopRequested = (listener: StopListener): (() => void) => {
    this.stopListeners.add(listener)
    return () => this.stopListeners.delete(listener)
  }

  setState(state: VoiceInputState): void {
    if (this.snapshot.state === state) return
    const resetLevels = state === 'starting' || state === 'idle' || state === 'error' || state === 'polish-error'
    this.snapshot = { ...this.snapshot, state, levels: resetLevels ? [] : this.snapshot.levels }
    this.emit()
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

  dispose(): void {
    this.listeners.clear()
    this.stopListeners.clear()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export function useVoiceInputSession(session: VoiceInputSession): VoiceInputSessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
}
