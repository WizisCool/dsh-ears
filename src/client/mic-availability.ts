import type { AsrBackendId } from '../config.js'
import type { BackendState, WhisperModelView } from './settings-controller.js'

export type MicUnavailableReason =
  | { kind: 'backend'; backendId: AsrBackendId }
  | { kind: 'model-downloading'; backendId: 'local-whisper' | 'local-sensevoice'; percent: number | null }
  | { kind: 'model-not-downloaded'; backendId: 'local-whisper' | 'local-sensevoice' }

/** Returns why the microphone is unavailable, or null if ready. */
export function micUnavailableReason(
  backend: AsrBackendId,
  backendState: BackendState,
  whisperView: WhisperModelView
): MicUnavailableReason | null {
  if ((backend === 'local-whisper' || backend === 'local-sensevoice') && whisperView.status === 'ready') {
    const state = whisperView.state
    if (state.downloading) return { kind: 'model-downloading', backendId: backend, percent: state.progress }
    if (state.runtimeAvailable && state.error === null && !state.downloaded) return { kind: 'model-not-downloaded', backendId: backend }
  }
  if (backendState.status === 'ready') {
    const info = backendState.backends.find((candidate) => candidate.id === backend)
    if (info !== undefined && !info.available) return { kind: 'backend', backendId: info.id }
  }
  return null
}
