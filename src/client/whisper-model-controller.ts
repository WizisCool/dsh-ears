import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { EarsRemote } from '../remote.js'
import type { WhisperModelState } from '../remote-contract.js'
import { EARS_ERROR_CODES, type EarsErrorCode } from '../errors.js'

export interface WhisperModelView {
  status: 'loading' | 'ready'
  state: WhisperModelState
}

export const EMPTY_WHISPER_STATE: WhisperModelState = Object.freeze({
  runtimeAvailable: false,
  downloaded: false,
  downloading: false,
  progress: null,
  bytes: null,
  totalBytes: null,
  error: null
})

export interface WhisperModelControllerOptions {
  readonly currentModel: () => string
  readonly hasPendingAcceleration: () => boolean
}

function failureMessage(message: string, fallback: string): string {
  const text = message.trim()
  return text === '' ? fallback : text
}

function errorView(view: WhisperModelView, message: string, fallback: string, errorCode: EarsErrorCode, errorParams?: Readonly<Record<string, string | number>>): WhisperModelView {
  return {
    status: 'ready',
    state: {
      ...view.state,
      error: failureMessage(message, fallback),
      errorCode,
      ...(errorParams === undefined ? {} : { errorParams })
    }
  }
}

/** Owns Whisper polling/mutations and guards model/acceleration races. */
export class WhisperModelController {
  private readonly remote: EarsRemote
  private readonly options: WhisperModelControllerOptions
  private readonly store: SnapshotStore<WhisperModelView>
  private view: WhisperModelView = { status: 'loading', state: EMPTY_WHISPER_STATE }
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private request = 0
  private refreshInFlight = false
  private refreshQueued = false
  private mutationInFlight = false
  private accelerationRevision = 0

  constructor(remote: EarsRemote, options: WhisperModelControllerOptions) {
    this.remote = remote
    this.options = options
    this.store = createSnapshotStore(this.view)
  }

  getStore(): SnapshotStore<WhisperModelView> {
    return this.store
  }

  notifyAccelerationChanged(): void {
    this.accelerationRevision += 1
  }

  async refresh(): Promise<void> {
    if (this.disposed) return
    if (this.mutationInFlight) {
      this.refreshQueued = true
      if (this.options.hasPendingAcceleration()) this.showPendingAcceleration()
      return
    }
    this.request += 1
    if (this.options.hasPendingAcceleration()) {
      this.refreshQueued = false
      this.showPendingAcceleration()
      return
    }
    if (this.refreshInFlight) {
      this.refreshQueued = true
      return
    }

    this.refreshInFlight = true
    try {
      while (!this.disposed) {
        this.refreshQueued = false
        const request = this.request
        const model = this.options.currentModel()
        let nextView: WhisperModelView
        try {
          const result = await this.remote.getWhisperModelState(model)
          nextView = result.ok
            ? { status: 'ready', state: result.value }
            : errorView(this.view, result.error.message, 'Could not read the Whisper model state', EARS_ERROR_CODES.whisperStateQueryFailed, { detail: result.error.message })
        } catch {
          nextView = errorView(this.view, '', 'Whisper model state query failed', EARS_ERROR_CODES.whisperStateQueryFailed, { detail: 'Whisper model state query failed' })
        }
        if (!this.disposed && request === this.request) {
          this.view = nextView
          this.store.set(this.view)
          if (this.view.state.downloading) this.startPolling()
          else this.stopPolling()
        }
        if (!this.refreshQueued) break
      }
    } finally {
      this.refreshInFlight = false
    }
  }

  async download(): Promise<void> {
    if (this.disposed || this.mutationInFlight) return
    const model = this.options.currentModel()
    const accelerationRevision = this.accelerationRevision
    const request = this.beginMutation()
    try {
      const result = await this.remote.downloadWhisperModel(model)
      if (!this.isCurrentMutation(request, model, accelerationRevision)) return
      this.view = result.ok
        ? { status: 'ready', state: result.value }
        : errorView(this.view, result.error.message, 'Could not start the model download', EARS_ERROR_CODES.whisperDownloadFailed, { detail: result.error.message })
      this.store.set(this.view)
    } catch {
      if (!this.isCurrentMutation(request, model, accelerationRevision)) return
      this.view = errorView(this.view, '', 'Whisper model download failed', EARS_ERROR_CODES.whisperDownloadFailed, { detail: 'Whisper model download failed' })
      this.store.set(this.view)
    } finally {
      this.finishMutation(request)
    }
  }

  async cancel(): Promise<void> {
    if (this.disposed || this.mutationInFlight) return
    const model = this.options.currentModel()
    const accelerationRevision = this.accelerationRevision
    const request = this.beginMutation()
    try {
      const result = await this.remote.cancelWhisperModelDownload(model)
      if (!this.isCurrentMutation(request, model, accelerationRevision)) return
      this.view = result.ok
        ? { status: 'ready', state: result.value }
        : errorView(this.view, result.error.message, 'Could not cancel the download', EARS_ERROR_CODES.whisperCancelCleanupFailed, { detail: result.error.message })
      this.store.set(this.view)
    } catch {
      if (!this.isCurrentMutation(request, model, accelerationRevision)) return
      this.view = errorView(this.view, '', 'Whisper model cancellation failed', EARS_ERROR_CODES.whisperCancelCleanupFailed, { detail: 'Whisper model cancellation failed' })
      this.store.set(this.view)
    } finally {
      this.finishMutation(request)
    }
  }

  async delete(): Promise<void> {
    if (this.disposed || this.mutationInFlight) return
    const model = this.options.currentModel()
    const accelerationRevision = this.accelerationRevision
    const request = this.beginMutation()
    try {
      const result = await this.remote.deleteWhisperModel(model)
      if (!this.isCurrentMutation(request, model, accelerationRevision)) return
      this.view = result.ok
        ? { status: 'ready', state: result.value }
        : errorView(this.view, result.error.message, 'Could not delete the model', EARS_ERROR_CODES.whisperDeleteFailed, { detail: result.error.message })
      this.store.set(this.view)
    } catch {
      if (!this.isCurrentMutation(request, model, accelerationRevision)) return
      this.view = errorView(this.view, '', 'Whisper model deletion failed', EARS_ERROR_CODES.whisperDeleteFailed, { detail: 'Whisper model deletion failed' })
      this.store.set(this.view)
    } finally {
      this.finishMutation(request)
    }
  }

  dispose(): void {
    this.disposed = true
    this.request += 1
    this.refreshQueued = false
    this.stopPolling()
  }

  private showPendingAcceleration(): void {
    this.view = { status: 'loading', state: this.view.state }
    this.store.set(this.view)
    this.stopPolling()
  }

  private beginMutation(): number {
    this.request += 1
    this.mutationInFlight = true
    this.stopPolling()
    return this.request
  }

  private isCurrentMutation(request: number, model: string, accelerationRevision: number): boolean {
    return !this.disposed
      && request === this.request
      && model === this.options.currentModel()
      && accelerationRevision === this.accelerationRevision
      && !this.options.hasPendingAcceleration()
  }

  private finishMutation(request: number): void {
    if (request !== this.request) return
    this.mutationInFlight = false
    if (this.disposed) return
    if (this.refreshQueued) {
      this.refreshQueued = false
      void this.refresh()
      return
    }
    if (this.view.state.downloading) this.startPolling()
    else this.stopPolling()
  }

  private startPolling(): void {
    if (this.pollTimer !== undefined) return
    this.pollTimer = setInterval(() => {
      void this.refresh()
    }, 800)
  }

  private stopPolling(): void {
    if (this.pollTimer === undefined) return
    clearInterval(this.pollTimer)
    this.pollTimer = undefined
  }
}
