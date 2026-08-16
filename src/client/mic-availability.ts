import type { AsrBackendId } from '../config.js'
import type { BackendState, WhisperModelView } from './settings-controller.js'

export type MicUnavailableReason =
  | { kind: 'backend'; backendId: AsrBackendId }
  | { kind: 'model-downloading'; percent: number | null }
  | { kind: 'model-not-downloaded' }

/**
 * Positive signals only: the microphone grays out when the configured
 * backend provably cannot transcribe — the Host reports the backend
 * unavailable, the selected Whisper model is still downloading, or the model
 * file (with its completion marker) is missing. Loading, failed, and unknown
 * states report null so the button never disables itself on missing
 * information.
 */
export function micUnavailableReason(
  backend: AsrBackendId,
  backendState: BackendState,
  whisperView: WhisperModelView
): MicUnavailableReason | null {
  if (backendState.status === 'ready') {
    const info = backendState.backends.find((candidate) => candidate.id === backend)
    if (info !== undefined && !info.available) return { kind: 'backend', backendId: info.id }
  }
  if (backend === 'local-whisper' && whisperView.status === 'ready') {
    const state = whisperView.state
    if (state.downloading) return { kind: 'model-downloading', percent: state.progress }
    if (!state.downloaded && state.error === null) return { kind: 'model-not-downloaded' }
  }
  return null
}
