import { describe, expect, it } from 'vitest'
import { micUnavailableReason } from '../src/client/mic-availability.js'
import type { BackendState, WhisperModelView } from '../src/client/settings-controller.js'

const whisperView = (state: WhisperModelView['state']): WhisperModelView => ({ status: 'ready', state })
const whisperLoading: WhisperModelView = { status: 'loading', state: { cliAvailable: false, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null } }

const backendInfo = (id: string, available: boolean): { id: string; name: string; available: boolean; detail: string } => ({
  id,
  name: id,
  available,
  detail: available ? 'ok' : 'broken'
})

describe('micUnavailableReason', () => {
  it('reports an unavailable backend as the gray reason', () => {
    const backends: BackendState = { status: 'ready', backends: [backendInfo('local-whisper', false)] }
    expect(micUnavailableReason('local-whisper', backends, whisperLoading)).toEqual({ kind: 'backend', backendId: 'local-whisper' })
    const cloud: BackendState = { status: 'ready', backends: [backendInfo('cloud-openai', false)] }
    expect(micUnavailableReason('cloud-openai', cloud, whisperLoading)).toEqual({ kind: 'backend', backendId: 'cloud-openai' })
  })

  it('returns null when the backend list is still loading or the backend is available', () => {
    expect(micUnavailableReason('local-whisper', { status: 'loading', backends: [] }, whisperLoading)).toBeNull()
    const ready: BackendState = { status: 'ready', backends: [backendInfo('local-whisper', true)] }
    expect(micUnavailableReason('local-whisper', ready, whisperLoading)).toBeNull()
  })

  it('reports a downloading whisper model with its progress', () => {
    const ready: BackendState = { status: 'ready', backends: [backendInfo('local-whisper', true)] }
    expect(micUnavailableReason('local-whisper', ready, whisperView({ cliAvailable: true, downloaded: false, downloading: true, progress: 0.42, bytes: 1, totalBytes: 2, error: null })))
      .toEqual({ kind: 'model-downloading', percent: 0.42 })
  })

  it('reports a missing whisper model as the gray reason', () => {
    const ready: BackendState = { status: 'ready', backends: [backendInfo('local-whisper', true)] }
    expect(micUnavailableReason('local-whisper', ready, whisperView({ cliAvailable: true, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null })))
      .toEqual({ kind: 'model-not-downloaded' })
  })

  it('returns null when the whisper state query failed instead of graying on missing information', () => {
    const ready: BackendState = { status: 'ready', backends: [backendInfo('local-whisper', true)] }
    expect(micUnavailableReason('local-whisper', ready, whisperView({ cliAvailable: true, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: 'query failed' })))
      .toBeNull()
  })

  it('returns null for a downloaded whisper model', () => {
    const ready: BackendState = { status: 'ready', backends: [backendInfo('local-whisper', true)] }
    expect(micUnavailableReason('local-whisper', ready, whisperView({ cliAvailable: true, downloaded: true, downloading: false, progress: null, bytes: null, totalBytes: 100, error: null })))
      .toBeNull()
  })

  it('ignores whisper model state for non-whisper backends', () => {
    const ready: BackendState = { status: 'ready', backends: [backendInfo('web-speech', true)] }
    expect(micUnavailableReason('web-speech', ready, whisperView({ cliAvailable: true, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null })))
      .toBeNull()
  })
})
