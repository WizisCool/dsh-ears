import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { ASR_BACKEND_IDS, WHISPER_MODEL_IDS, isCredentialReference, isHttpEndpoint, isValidRecordingLimit } from '../config.js'
import type { EarsSettings, PolishRoute, ReasoningEffortInfo } from '../config.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import type { AsrBackendInfo, EarsSettingsPatch, EarsSettingsView, WhisperModelState } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'

export type FieldName = keyof EarsSettings

interface FieldState { text: string; overridden: boolean; invalid: boolean }

export interface EarsCardState {
  available: boolean
  writable: boolean
  loaded: boolean
  saving: boolean
  failed: boolean
  invalid: boolean
  asrBackend: FieldState
  localWhisperModel: FieldState
  cloudAsrEndpoint: FieldState
  cloudAsrModel: FieldState
  cloudAsrCredentialRef: FieldState
  language: FieldState
  maxRecordingSeconds: FieldState
  polishingEnabled: FieldState
  polishProvider: FieldState
  polishModel: FieldState
  polishReasoningEffort: FieldState
}
export interface RouteState { status: 'loading' | 'ready'; routes: readonly PolishRoute[] }
export interface BackendState { status: 'loading' | 'ready'; backends: readonly AsrBackendInfo[] }
export interface ReasoningEffortsState { status: 'loading' | 'ready'; efforts: readonly ReasoningEffortInfo[]; defaultEffort?: string }
export interface WhisperModelView { status: 'loading' | 'ready'; state: WhisperModelState }
export type EarsSettingsHook = SnapshotSelectorHook<EarsSettings>
export type EarsCardHook = SnapshotSelectorHook<EarsCardState>
export type RouteHook = SnapshotSelectorHook<RouteState>
export type BackendHook = SnapshotSelectorHook<BackendState>
export type ReasoningEffortsHook = SnapshotSelectorHook<ReasoningEffortsState>
export type WhisperModelHook = SnapshotSelectorHook<WhisperModelView>

export const EMPTY_WHISPER_STATE: WhisperModelState = Object.freeze({
  cliAvailable: false,
  downloaded: false,
  downloading: false,
  progress: null,
  bytes: null,
  totalBytes: null,
  error: null
})

function whisperFailureMessage(message: string, fallback: string): string {
  const text = message.trim()
  return text === '' ? fallback : text
}

function whisperErrorView(view: WhisperModelView, message: string, fallback: string): WhisperModelView {
  return {
    status: 'ready',
    state: {
      ...view.state,
      error: whisperFailureMessage(message, fallback)
    }
  }
}

const AUTO_SAVE_DELAY_MS = 400

export class EarsSettingsController {
  private readonly remote: EarsRemote
  private readonly settingsStore: SnapshotStore<EarsSettings>
  private readonly cardStore: SnapshotStore<EarsCardState>
  private readonly routeStore: SnapshotStore<RouteState>
  private readonly backendStore: SnapshotStore<BackendState>
  private readonly reasoningStore: SnapshotStore<ReasoningEffortsState>
  private readonly whisperStore: SnapshotStore<WhisperModelView>
  private readonly drafts = new Map<FieldName, string>()
  private settingsView: EarsSettingsView = { available: true, writable: false, settings: DEFAULT_EARS_SETTINGS, overridden: [] }
  private routeState: RouteState = { status: 'loading', routes: [] }
  private backendState: BackendState = { status: 'loading', backends: [] }
  private reasoningState: ReasoningEffortsState = { status: 'loading', efforts: [] }
  private whisperView: WhisperModelView = { status: 'loading', state: EMPTY_WHISPER_STATE }
  private saving = false
  private loaded = false
  private failed = false
  private retryAttempted = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private whisperPollTimer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private settingsRequest = 0
  private routeRequest = 0
  private backendRequest = 0
  private reasoningRequest = 0
  private whisperRequest = 0
  private whisperRefreshInFlight = false
  private whisperRefreshQueued = false
  private whisperMutationInFlight = false

  constructor(remote: EarsRemote) {
    this.remote = remote
    this.settingsStore = createSnapshotStore(DEFAULT_EARS_SETTINGS)
    this.cardStore = createSnapshotStore(this.snapshot())
    this.routeStore = createSnapshotStore(this.routeState)
    this.backendStore = createSnapshotStore(this.backendState)
    this.reasoningStore = createSnapshotStore(this.reasoningState)
    this.whisperStore = createSnapshotStore(this.whisperView)
  }

  getSettingsStore(): SnapshotStore<EarsSettings> { return this.settingsStore }
  getCardStore(): SnapshotStore<EarsCardState> { return this.cardStore }
  getRouteStore(): SnapshotStore<RouteState> { return this.routeStore }
  getBackendStore(): SnapshotStore<BackendState> { return this.backendStore }
  getReasoningStore(): SnapshotStore<ReasoningEffortsState> { return this.reasoningStore }
  getWhisperStore(): SnapshotStore<WhisperModelView> { return this.whisperStore }

  actions() {
    return {
      edit: (field: FieldName, text: string) => this.edit(field, text),
      downloadModel: () => void this.downloadModel(),
      cancelModel: () => void this.cancelModel(),
      deleteModel: () => void this.deleteModel()
    }
  }

  dispose(): void {
    this.disposed = true
    this.settingsRequest += 1
    this.routeRequest += 1
    this.backendRequest += 1
    this.reasoningRequest += 1
    this.whisperRequest += 1
    this.whisperRefreshQueued = false
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    this.stopWhisperPolling()
  }

  async refreshSettings(): Promise<void> {
    if (this.disposed) return
    const request = ++this.settingsRequest
    try {
      const result = await this.remote.getSettings()
      if (this.disposed || request !== this.settingsRequest) return
      if (result.ok) {
        this.settingsView = result.value
        this.settingsStore.set(result.value.settings)
        this.loaded = true
        this.retryAttempted = false
        if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
        this.retryTimer = undefined
        this.publishCard()
        void this.refreshReasoningEfforts()
        void this.refreshWhisperState()
        return
      }
    } catch {
      // Fall through to the not-loaded retry path.
    }
    if (this.disposed || request !== this.settingsRequest) return
    this.publishCard()
    void this.refreshReasoningEfforts()
    if (!this.loaded && !this.retryAttempted && this.retryTimer === undefined) {
      this.retryAttempted = true
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined
        void this.refreshSettings()
      }, 1500)
    }
  }

  async refreshRoutes(): Promise<void> {
    if (this.disposed) return
    const request = ++this.routeRequest
    this.routeState = { status: 'loading', routes: [] }
    this.routeStore.set(this.routeState)
    try {
      const result = await this.remote.listRoutes()
      this.routeState = result.ok ? { status: 'ready', routes: result.value } : { status: 'ready', routes: [] }
    } catch {
      this.routeState = { status: 'ready', routes: [] }
    }
    if (this.disposed || request !== this.routeRequest) return
    this.routeStore.set(this.routeState)
  }

  async refreshBackends(): Promise<void> {
    if (this.disposed) return
    const request = ++this.backendRequest
    this.backendState = { status: 'loading', backends: [] }
    this.backendStore.set(this.backendState)
    try {
      const result = await this.remote.listAsrBackends()
      this.backendState = result.ok ? { status: 'ready', backends: result.value } : { status: 'ready', backends: [] }
    } catch {
      this.backendState = { status: 'ready', backends: [] }
    }
    if (this.disposed || request !== this.backendRequest) return
    this.backendStore.set(this.backendState)
  }

  async refreshReasoningEfforts(): Promise<void> {
    if (this.disposed) return
    const request = ++this.reasoningRequest
    this.reasoningState = { status: 'loading', efforts: [] }
    this.reasoningStore.set(this.reasoningState)
    const provider = (this.drafts.get('polishProvider') ?? this.settingsView.settings.polishProvider).trim()
    const model = (this.drafts.get('polishModel') ?? this.settingsView.settings.polishModel).trim()
    if (provider === '' || model === '') {
      if (this.disposed || request !== this.reasoningRequest) return
      this.reasoningState = { status: 'ready', efforts: [] }
      this.reasoningStore.set(this.reasoningState)
      return
    }
    try {
      const result = await this.remote.listReasoningEfforts(provider, model)
      this.reasoningState = result.ok ? { status: 'ready', efforts: result.value.efforts, ...(result.value.defaultEffort === undefined ? {} : { defaultEffort: result.value.defaultEffort }) } : { status: 'ready', efforts: [] }
    } catch {
      this.reasoningState = { status: 'ready', efforts: [] }
    }
    if (this.disposed || request !== this.reasoningRequest) return
    this.reasoningStore.set(this.reasoningState)
  }

  async refreshWhisperState(): Promise<void> {
    if (this.disposed) return
    if (this.whisperMutationInFlight) {
      this.whisperRefreshQueued = true
      return
    }
    this.whisperRequest += 1
    if (this.whisperRefreshInFlight) {
      this.whisperRefreshQueued = true
      return
    }

    this.whisperRefreshInFlight = true
    try {
      while (!this.disposed) {
        this.whisperRefreshQueued = false
        const request = this.whisperRequest
        const model = (this.drafts.get('localWhisperModel') ?? this.settingsView.settings.localWhisperModel).trim()
        let nextView: WhisperModelView
        try {
          const result = await this.remote.getWhisperModelState(model)
          nextView = result.ok
            ? { status: 'ready', state: result.value }
            : whisperErrorView(this.whisperView, result.error.message, 'Could not read the Whisper model state.')
        } catch {
          nextView = whisperErrorView(this.whisperView, '', 'Whisper model state query failed')
        }
        if (!this.disposed && request === this.whisperRequest) {
          this.whisperView = nextView
          this.whisperStore.set(this.whisperView)
          if (this.whisperView.state.downloading) {
            this.startWhisperPolling()
          } else {
            this.stopWhisperPolling()
          }
        }
        if (!this.whisperRefreshQueued) break
      }
    } finally {
      this.whisperRefreshInFlight = false
    }
  }

  private async downloadModel(): Promise<void> {
    if (this.disposed) return
    const model = this.currentWhisperModel()
    const request = this.beginWhisperMutation()
    try {
      const result = await this.remote.downloadWhisperModel(model)
      if (!this.isCurrentWhisperMutation(request, model)) return
      this.whisperView = result.ok
        ? { status: 'ready', state: result.value }
        : whisperErrorView(this.whisperView, result.error.message, 'Could not start the model download.')
      this.whisperStore.set(this.whisperView)
    } catch {
      if (!this.isCurrentWhisperMutation(request, model)) return
      this.whisperView = whisperErrorView(this.whisperView, '', 'Whisper model download failed')
      this.whisperStore.set(this.whisperView)
    } finally {
      this.finishWhisperMutation(request)
    }
  }

  private async cancelModel(): Promise<void> {
    if (this.disposed) return
    const model = this.currentWhisperModel()
    const request = this.beginWhisperMutation()
    try {
      const result = await this.remote.cancelWhisperModelDownload(model)
      if (!this.isCurrentWhisperMutation(request, model)) return
      this.whisperView = result.ok
        ? { status: 'ready', state: result.value }
        : whisperErrorView(this.whisperView, result.error.message, 'Could not cancel the download.')
      this.whisperStore.set(this.whisperView)
    } catch {
      if (!this.isCurrentWhisperMutation(request, model)) return
      this.whisperView = whisperErrorView(this.whisperView, '', 'Whisper model cancellation failed')
      this.whisperStore.set(this.whisperView)
    } finally {
      this.finishWhisperMutation(request)
    }
  }

  private async deleteModel(): Promise<void> {
    if (this.disposed) return
    const model = this.currentWhisperModel()
    const request = this.beginWhisperMutation()
    try {
      const result = await this.remote.deleteWhisperModel(model)
      if (!this.isCurrentWhisperMutation(request, model)) return
      this.whisperView = result.ok
        ? { status: 'ready', state: result.value }
        : whisperErrorView(this.whisperView, result.error.message, 'Could not delete the model.')
      this.whisperStore.set(this.whisperView)
    } catch {
      if (!this.isCurrentWhisperMutation(request, model)) return
      this.whisperView = whisperErrorView(this.whisperView, '', 'Whisper model deletion failed')
      this.whisperStore.set(this.whisperView)
    } finally {
      this.finishWhisperMutation(request)
    }
  }

  private currentWhisperModel(): string {
    return (this.drafts.get('localWhisperModel') ?? this.settingsView.settings.localWhisperModel).trim()
  }

  private beginWhisperMutation(): number {
    this.whisperRequest += 1
    this.whisperMutationInFlight = true
    this.stopWhisperPolling()
    return this.whisperRequest
  }

  private isCurrentWhisperMutation(request: number, model: string): boolean {
    return !this.disposed && request === this.whisperRequest && model === this.currentWhisperModel()
  }

  private finishWhisperMutation(request: number): void {
    if (request !== this.whisperRequest) return
    this.whisperMutationInFlight = false
    if (this.disposed) return
    if (this.whisperRefreshQueued) {
      this.whisperRefreshQueued = false
      void this.refreshWhisperState()
      return
    }
    if (this.whisperView.state.downloading) this.startWhisperPolling()
    else this.stopWhisperPolling()
  }

  private startWhisperPolling(): void {
    if (this.whisperPollTimer !== undefined) return
    this.whisperPollTimer = setInterval(() => {
      void this.refreshWhisperState()
    }, 800)
  }

  private stopWhisperPolling(): void {
    if (this.whisperPollTimer === undefined) return
    clearInterval(this.whisperPollTimer)
    this.whisperPollTimer = undefined
  }

  private edit(field: FieldName, text: string): void {
    if (this.disposed) return
    if (field === 'polishProvider') {
      this.drafts.set('polishModel', '')
      this.drafts.set('polishReasoningEffort', '')
    } else if (field === 'polishModel') {
      this.drafts.set('polishReasoningEffort', '')
    }
    this.drafts.set(field, text)
    this.failed = false
    this.publishCard()
    this.scheduleSave()
    if (field === 'polishProvider' || field === 'polishModel') void this.refreshReasoningEfforts()
    if (field === 'localWhisperModel' || (field === 'asrBackend' && text === 'local-whisper')) void this.refreshWhisperState()
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      void this.save()
    }, AUTO_SAVE_DELAY_MS)
  }

  private async save(): Promise<void> {
    if (this.disposed || this.saving || !this.settingsView.writable) return
    const providerText = this.drafts.get('polishProvider') ?? this.settingsView.settings.polishProvider
    const modelText = this.drafts.get('polishModel') ?? this.settingsView.settings.polishModel
    const polishingEnabledText = this.drafts.get('polishingEnabled') ?? (this.settingsView.settings.polishingEnabled ? 'on' : 'off')
    const routeInvalid = polishingEnabledText === 'on' && (providerText.trim() === '' || modelText.trim() === '')
    const asrBackendText = this.drafts.get('asrBackend') ?? this.settingsView.settings.asrBackend
    const cloudEndpointText = this.drafts.get('cloudAsrEndpoint') ?? this.settingsView.settings.cloudAsrEndpoint
    const cloudModelText = this.drafts.get('cloudAsrModel') ?? this.settingsView.settings.cloudAsrModel
    const cloudCredentialText = this.drafts.get('cloudAsrCredentialRef') ?? this.settingsView.settings.cloudAsrCredentialRef
    const cloudConfigInvalid = isCloudConfigurationInvalid(asrBackendText, cloudEndpointText, cloudModelText, cloudCredentialText)
    const patch: EarsSettingsPatch = {}
    const submittedDrafts = new Map<FieldName, string>()
    for (const [field, text] of this.drafts) {
      if (routeInvalid && (field === 'polishingEnabled' || field === 'polishProvider' || field === 'polishModel' || field === 'polishReasoningEffort')) {
        continue
      }
      if (field === 'asrBackend' && cloudConfigInvalid) continue
      if (isInvalidForSave(field, text, asrBackendText)) {
        continue
      }
      const value = parseField(field, text)
      if (value !== undefined) {
        (patch as Record<string, unknown>)[field] = value
        submittedDrafts.set(field, text)
      }
    }
    if (Object.keys(patch).length === 0) return
    this.saving = true
    this.failed = false
    this.publishCard()
    try {
      const result = await this.remote.updateSettings(patch)
      if (!result.ok) throw new Error('dsh-ears settings update failed')
      if (this.disposed) return
      this.settingsView = result.value
      this.settingsStore.set(result.value.settings)
      for (const [field, text] of submittedDrafts) {
        if (this.drafts.get(field) === text) this.drafts.delete(field)
      }
      void this.refreshBackends()
    } catch {
      if (!this.disposed) this.failed = true
    } finally {
      this.saving = false
      if (this.disposed) return
      this.publishCard()
      if (this.drafts.size > 0 && !this.failed) this.scheduleSave()
    }
  }

  private publishCard(): void { this.cardStore.set(this.snapshot()) }

  private snapshot(): EarsCardState {
    const current = this.settingsView.settings
    const field = (name: FieldName, text: string): FieldState => ({ text, overridden: this.settingsView.overridden.includes(name), invalid: isInvalid(name, text) })
    const asrBackend = field('asrBackend', this.drafts.get('asrBackend') ?? current.asrBackend)
    const localWhisperModel = field('localWhisperModel', this.drafts.get('localWhisperModel') ?? current.localWhisperModel)
    const cloudAsrEndpoint = field('cloudAsrEndpoint', this.drafts.get('cloudAsrEndpoint') ?? current.cloudAsrEndpoint)
    const cloudAsrModel = field('cloudAsrModel', this.drafts.get('cloudAsrModel') ?? current.cloudAsrModel)
    const cloudAsrCredentialRef = field('cloudAsrCredentialRef', this.drafts.get('cloudAsrCredentialRef') ?? current.cloudAsrCredentialRef)
    const language = field('language', this.drafts.get('language') ?? current.language)
    const maxRecordingSeconds = field('maxRecordingSeconds', this.drafts.get('maxRecordingSeconds') ?? String(current.maxRecordingSeconds))
    const polishingEnabled = field('polishingEnabled', this.drafts.get('polishingEnabled') ?? (current.polishingEnabled ? 'on' : 'off'))
    const polishProvider = field('polishProvider', this.drafts.get('polishProvider') ?? current.polishProvider)
    const polishModel = field('polishModel', this.drafts.get('polishModel') ?? current.polishModel)
    const polishReasoningEffort = field('polishReasoningEffort', this.drafts.get('polishReasoningEffort') ?? current.polishReasoningEffort)
    const routeInvalid = polishingEnabled.text === 'on' && (polishProvider.text.trim() === '' || polishModel.text.trim() === '')
    const cloudConfigInvalid = isCloudConfigurationInvalid(asrBackend.text, cloudAsrEndpoint.text, cloudAsrModel.text, cloudAsrCredentialRef.text)
    const cloudEndpointRequired = asrBackend.text === 'cloud-openai' && cloudAsrEndpoint.text.trim() === ''
    const cloudModelRequired = asrBackend.text === 'cloud-openai' && cloudAsrModel.text.trim() === ''
    return {
      available: this.settingsView.available,
      writable: this.settingsView.writable,
      loaded: this.loaded,
      saving: this.saving,
      failed: this.failed,
      invalid: asrBackend.invalid || localWhisperModel.invalid || cloudConfigInvalid || language.invalid || maxRecordingSeconds.invalid || polishingEnabled.invalid || polishProvider.invalid || polishModel.invalid || polishReasoningEffort.invalid || routeInvalid,
      asrBackend,
      localWhisperModel,
      cloudAsrEndpoint: { ...cloudAsrEndpoint, invalid: cloudAsrEndpoint.invalid || cloudEndpointRequired },
      cloudAsrModel: { ...cloudAsrModel, invalid: cloudAsrModel.invalid || cloudModelRequired },
      cloudAsrCredentialRef,
      language,
      maxRecordingSeconds,
      polishingEnabled,
      polishProvider: { ...polishProvider, invalid: polishProvider.invalid || routeInvalid },
      polishModel: { ...polishModel, invalid: polishModel.invalid || routeInvalid },
      polishReasoningEffort
    }
  }
}

function parseField(field: FieldName, text: string): unknown {
  if (field === 'maxRecordingSeconds') return Number(text)
  if (field === 'polishingEnabled') return text === 'on'
  return text
}

function isInvalid(field: FieldName, text: string): boolean {
  if (field === 'language') return text.trim() === ''
  if (field === 'asrBackend') return !(ASR_BACKEND_IDS as readonly string[]).includes(text)
  if (field === 'localWhisperModel') return !(WHISPER_MODEL_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrEndpoint') {
    if (text.trim() === '') return false
    return !isHttpEndpoint(text)
  }
  if (field === 'cloudAsrModel') return false
  if (field === 'cloudAsrCredentialRef') return text.trim() !== '' && !isCredentialReference(text)
  if (field === 'polishProvider' || field === 'polishModel' || field === 'polishReasoningEffort') return false
  if (field === 'polishingEnabled') return text !== 'on' && text !== 'off'
  const value = Number(text)
  return !isValidRecordingLimit(value)
}

function isInvalidForSave(field: FieldName, text: string, asrBackend: string): boolean {
  if (isInvalid(field, text)) return true
  if (asrBackend !== 'cloud-openai') return false
  return (field === 'cloudAsrEndpoint' || field === 'cloudAsrModel') && text.trim() === ''
}

function isCloudConfigurationInvalid(asrBackend: string, endpoint: string, model: string, credentialRef: string): boolean {
  if (asrBackend !== 'cloud-openai') return false
  return !isHttpEndpoint(endpoint) || model.trim() === '' || (credentialRef.trim() !== '' && !isCredentialReference(credentialRef))
}
