import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { EarsSettings, PolishRoute, ReasoningEffortInfo, WhisperAccelerationId } from '../config.js'
import { cloudAsrModelField, isSettingsFieldInvalid, parseSettingsField, type FieldName } from './settings-fields.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import { cloudAsrModelFor, supportsModelListing } from '../asr/providers.js'
import type { AboutInfo, AsrBackendInfo, CloudProviderModelsView, EarsSettingsPatch, EarsSettingsView, UpdateCheckResult, WhisperModelState } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'
import { EARS_ERROR_CODES, type EarsErrorCode } from '../errors.js'

export type { FieldName } from './settings-fields.js'

/** Debounce for text-like edits. Discrete controls still go through this timer unless flushed. */
export const SETTINGS_SAVE_DEBOUNCE_MS = 400

interface FieldState { text: string; overridden: boolean; invalid: boolean }

export interface EarsCardState {
  available: boolean
  writable: boolean
  loaded: boolean
  loadFailed: boolean
  saving: boolean
  failed: boolean
  dirty: boolean
  invalid: boolean
  asrBackend: FieldState
  webSpeechLanguage: FieldState
  localWhisperModel: FieldState
  localWhisperAcceleration: FieldState
  localWhisperLanguage: FieldState
  localWhisperAccelerations: readonly WhisperAccelerationId[]
  cloudAsrProvider: FieldState
  cloudAsrGroqApiKey: FieldState
  cloudAsrGroqApiKeyConfigured: boolean
  cloudAsrGroqApiKeyClearPending: boolean
  cloudAsrDeepgramApiKey: FieldState
  cloudAsrDeepgramApiKeyConfigured: boolean
  cloudAsrDeepgramApiKeyClearPending: boolean
  cloudAsrCustomApiKey: FieldState
  cloudAsrCustomApiKeyConfigured: boolean
  cloudAsrCustomApiKeyClearPending: boolean
  cloudAsrBailianApiKey: FieldState
  cloudAsrBailianApiKeyConfigured: boolean
  cloudAsrBailianApiKeyClearPending: boolean
  cloudAsrTencentSecretKey: FieldState
  cloudAsrTencentSecretKeyConfigured: boolean
  cloudAsrTencentSecretKeyClearPending: boolean
  cloudAsrCustomEndpoint: FieldState
  cloudAsrCustomModel: FieldState
  cloudAsrCustomLanguage: FieldState
  cloudAsrBailianHost: FieldState
  cloudAsrGroqModel: FieldState
  cloudAsrGroqLanguage: FieldState
  cloudAsrDeepgramModel: FieldState
  cloudAsrDeepgramLanguage: FieldState
  cloudAsrDeepgramService: FieldState
  cloudAsrBailianModel: FieldState
  cloudAsrBailianLanguage: FieldState
  cloudAsrTencentAppId: FieldState
  cloudAsrTencentSecretId: FieldState
  cloudAsrTencentEngineType: FieldState
  cloudAsrTencentService: FieldState
  maxRecordingSeconds: FieldState
  voiceShortcutEnabled: FieldState
  voiceShortcut: FieldState
  voiceSoundsEnabled: FieldState
  settingsDisplayName: FieldState
  polishingEnabled: FieldState
  polishProvider: FieldState
  polishModel: FieldState
  polishReasoningEffort: FieldState
  polishPrompt: FieldState
}
export interface RouteState { status: 'loading' | 'ready'; routes: readonly PolishRoute[] }
export interface BackendState { status: 'loading' | 'ready'; backends: readonly AsrBackendInfo[] }
export interface ReasoningEffortsState { status: 'loading' | 'ready'; efforts: readonly ReasoningEffortInfo[]; defaultEffort?: string }
export interface WhisperModelView { status: 'loading' | 'ready'; state: WhisperModelState }
export interface CloudModelsView { status: 'loading' | 'ready'; view: CloudProviderModelsView }
export type EarsSettingsHook = SnapshotSelectorHook<EarsSettings>
export type EarsCardHook = SnapshotSelectorHook<EarsCardState>
export type RouteHook = SnapshotSelectorHook<RouteState>
export type BackendHook = SnapshotSelectorHook<BackendState>
export type ReasoningEffortsHook = SnapshotSelectorHook<ReasoningEffortsState>
export type WhisperModelHook = SnapshotSelectorHook<WhisperModelView>
export type CloudModelsHook = SnapshotSelectorHook<CloudModelsView>

export const EMPTY_CLOUD_MODELS_VIEW: CloudModelsView = Object.freeze({
  status: 'ready',
  view: Object.freeze({ status: 'unsupported' })
})

export const EMPTY_WHISPER_STATE: WhisperModelState = Object.freeze({
  runtimeAvailable: false,
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

function whisperErrorView(view: WhisperModelView, message: string, fallback: string, errorCode: EarsErrorCode, errorParams?: Readonly<Record<string, string | number>>): WhisperModelView {
  return {
    status: 'ready',
    state: {
      ...view.state,
      error: whisperFailureMessage(message, fallback),
      errorCode,
      ...(errorParams === undefined ? {} : { errorParams })
    }
  }
}

export class EarsSettingsController {
  private readonly remote: EarsRemote
  private readonly settingsStore: SnapshotStore<EarsSettings>
  private readonly cardStore: SnapshotStore<EarsCardState>
  private readonly routeStore: SnapshotStore<RouteState>
  private readonly backendStore: SnapshotStore<BackendState>
  private readonly reasoningStore: SnapshotStore<ReasoningEffortsState>
  private readonly whisperStore: SnapshotStore<WhisperModelView>
  private readonly cloudModelsStore: SnapshotStore<CloudModelsView>
  private readonly drafts = new Map<FieldName, string>()
  // The wire stores one active model; these session caches keep provider switches reversible in the editor.
  private readonly cloudAsrModels = new Map<string, string>()
  private readonly polishModels = new Map<string, string>()
  private readonly polishReasoningEfforts = new Map<string, string>()
  private settingsView: EarsSettingsView = { available: true, writable: false, settings: DEFAULT_EARS_SETTINGS, cloudAsrGroqApiKeyConfigured: false, cloudAsrDeepgramApiKeyConfigured: false, cloudAsrCustomApiKeyConfigured: false, cloudAsrBailianApiKeyConfigured: false, cloudAsrTencentSecretKeyConfigured: false, overridden: [] }
  private routeState: RouteState = { status: 'loading', routes: [] }
  private backendState: BackendState = { status: 'loading', backends: [] }
  private reasoningState: ReasoningEffortsState = { status: 'loading', efforts: [] }
  private whisperView: WhisperModelView = { status: 'loading', state: EMPTY_WHISPER_STATE }
  private cloudModelsView: CloudModelsView = { status: 'loading', view: { status: 'unsupported' } }
  private saving = false
  private saveQueued = false
  private loaded = false
  private loadFailed = false
  private failed = false
  private clearKeyPending = false
  private clearDeepgramKeyPending = false
  private clearCustomKeyPending = false
  private clearBailianKeyPending = false
  private clearTencentKeyPending = false
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private retryAttempted = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private whisperPollTimer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private settingsRequest = 0
  private routeRequest = 0
  private backendRequest = 0
  private reasoningRequest = 0
  private whisperRequest = 0
  private cloudModelsRequest = 0
  private whisperRefreshInFlight = false
  private whisperRefreshQueued = false
  private whisperMutationInFlight = false
  private whisperAccelerationRevision = 0

  constructor(remote: EarsRemote) {
    this.remote = remote
    this.settingsStore = createSnapshotStore(DEFAULT_EARS_SETTINGS)
    this.cardStore = createSnapshotStore(this.snapshot())
    this.routeStore = createSnapshotStore(this.routeState)
    this.backendStore = createSnapshotStore(this.backendState)
    this.reasoningStore = createSnapshotStore(this.reasoningState)
    this.whisperStore = createSnapshotStore(this.whisperView)
    this.cloudModelsStore = createSnapshotStore(this.cloudModelsView)
    this.rememberCloudAsrModel(DEFAULT_EARS_SETTINGS.cloudAsrProvider, DEFAULT_EARS_SETTINGS.cloudAsrGroqModel)
  }

  getSettingsStore(): SnapshotStore<EarsSettings> { return this.settingsStore }
  getCardStore(): SnapshotStore<EarsCardState> { return this.cardStore }
  getRouteStore(): SnapshotStore<RouteState> { return this.routeStore }
  getBackendStore(): SnapshotStore<BackendState> { return this.backendStore }
  getReasoningStore(): SnapshotStore<ReasoningEffortsState> { return this.reasoningStore }
  getWhisperStore(): SnapshotStore<WhisperModelView> { return this.whisperStore }
  getCloudModelsStore(): SnapshotStore<CloudModelsView> { return this.cloudModelsStore }

  actions() {
    return {
      edit: (field: FieldName, text: string) => this.edit(field, text),
      setApiKey: (text: string) => this.edit('cloudAsrGroqApiKey', text),
      clearApiKey: () => this.clearApiKey(),
      undoClearApiKey: () => this.undoClearApiKey(),
      setDeepgramApiKey: (text: string) => this.edit('cloudAsrDeepgramApiKey', text),
      clearDeepgramApiKey: () => this.clearNamedApiKey('deepgram'),
      undoClearDeepgramApiKey: () => this.undoClearNamedApiKey('deepgram'),
      setCustomApiKey: (text: string) => this.edit('cloudAsrCustomApiKey', text),
      clearCustomApiKey: () => this.clearNamedApiKey('custom'),
      undoClearCustomApiKey: () => this.undoClearNamedApiKey('custom'),
      setBailianApiKey: (text: string) => this.edit('cloudAsrBailianApiKey', text),
      clearBailianApiKey: () => this.clearNamedApiKey('bailian'),
      undoClearBailianApiKey: () => this.undoClearNamedApiKey('bailian'),
      setTencentSecretKey: (text: string) => this.edit('cloudAsrTencentSecretKey', text),
      clearTencentSecretKey: () => this.clearNamedApiKey('tencent'),
      undoClearTencentSecretKey: () => this.undoClearNamedApiKey('tencent'),
      save: () => void this.save(),
      flush: () => void this.save(),
      discard: () => this.discard(),
      refreshRoutes: () => void this.refreshRoutes(),
      retryCloudModels: () => void this.refreshCloudModels(),
      downloadModel: () => void this.downloadModel(),
      cancelModel: () => void this.cancelModel(),
      deleteModel: () => void this.deleteModel(),
      loadAbout: () => this.loadAbout(),
      checkForUpdate: () => this.checkForUpdate()
    }
  }

  dispose(): void {
    this.disposed = true
    this.settingsRequest += 1
    this.routeRequest += 1
    this.backendRequest += 1
    this.reasoningRequest += 1
    this.whisperRequest += 1
    this.cloudModelsRequest += 1
    this.whisperRefreshQueued = false
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    this.saveQueued = false
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
        this.rememberCloudAsrModel(result.value.settings.cloudAsrProvider, cloudAsrModelFor(result.value.settings))
        this.rememberPolishSelection(result.value.settings.polishProvider, result.value.settings.polishModel, result.value.settings.polishReasoningEffort)
        this.settingsStore.set(result.value.settings)
        this.loaded = true
        this.loadFailed = false
        this.retryAttempted = false
        if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
        this.retryTimer = undefined
        this.publishCard()
        void this.refreshRoutes()
        void this.refreshReasoningEfforts()
        void this.refreshWhisperState()
        void this.refreshCloudModels()
        return
      }
    } catch {
      // Fall through to the not-loaded retry path.
    }
    if (this.disposed || request !== this.settingsRequest) return
    if (!this.loaded && this.retryAttempted) this.loadFailed = true
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

  async refreshRoutes(silent = this.routeState.routes.length > 0): Promise<void> {
    if (this.disposed) return
    const request = ++this.routeRequest
    if (!silent) {
      this.routeState = { status: 'loading', routes: this.routeState.routes }
      this.routeStore.set(this.routeState)
    }
    try {
      const result = await this.remote.listRoutes()
      const routes = result.ok ? result.value : this.routeState.routes
      this.routeState = { status: 'ready', routes }
    } catch {
      this.routeState = { status: 'ready', routes: this.routeState.routes }
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

  async refreshCloudModels(): Promise<void> {
    if (this.disposed) return
    const request = ++this.cloudModelsRequest
    const provider = this.currentCloudAsrProvider()
    if (!supportsModelListing(provider)) {
      this.cloudModelsView = { status: 'ready', view: { status: 'unsupported' } }
      this.cloudModelsStore.set(this.cloudModelsView)
      return
    }
    this.cloudModelsView = { status: 'loading', view: { status: 'unsupported' } }
    this.cloudModelsStore.set(this.cloudModelsView)
    try {
      const result = await this.remote.listCloudProviderModels()
      const view: CloudProviderModelsView = result.ok
        ? result.value
        : { status: 'error', models: [], error: result.error.message, errorCode: EARS_ERROR_CODES.cloudModelsListFailed, errorParams: { detail: result.error.message } }
      if (this.disposed || request !== this.cloudModelsRequest) return
      this.cloudModelsView = { status: 'ready', view }
    } catch {
      if (this.disposed || request !== this.cloudModelsRequest) return
      this.cloudModelsView = { status: 'ready', view: { status: 'error', models: [], error: 'Could not fetch the model list', errorCode: EARS_ERROR_CODES.cloudModelsListFailed, errorParams: { detail: 'Could not fetch the model list' } } }
    }
    this.cloudModelsStore.set(this.cloudModelsView)
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
      if (this.hasPendingWhisperAcceleration()) this.showPendingWhisperAcceleration()
      return
    }
    this.whisperRequest += 1
    if (this.hasPendingWhisperAcceleration()) {
      this.whisperRefreshQueued = false
      this.showPendingWhisperAcceleration()
      return
    }
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
            : whisperErrorView(this.whisperView, result.error.message, 'Could not read the Whisper model state', EARS_ERROR_CODES.whisperStateQueryFailed, { detail: result.error.message })
        } catch {
          nextView = whisperErrorView(this.whisperView, '', 'Whisper model state query failed', EARS_ERROR_CODES.whisperStateQueryFailed, { detail: 'Whisper model state query failed' })
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
    const accelerationRevision = this.whisperAccelerationRevision
    const request = this.beginWhisperMutation()
    try {
      const result = await this.remote.downloadWhisperModel(model)
      if (!this.isCurrentWhisperMutation(request, model, accelerationRevision)) return
      this.whisperView = result.ok
        ? { status: 'ready', state: result.value }
        : whisperErrorView(this.whisperView, result.error.message, 'Could not start the model download', EARS_ERROR_CODES.whisperDownloadFailed, { detail: result.error.message })
      this.whisperStore.set(this.whisperView)
    } catch {
      if (!this.isCurrentWhisperMutation(request, model, accelerationRevision)) return
      this.whisperView = whisperErrorView(this.whisperView, '', 'Whisper model download failed', EARS_ERROR_CODES.whisperDownloadFailed, { detail: 'Whisper model download failed' })
      this.whisperStore.set(this.whisperView)
    } finally {
      this.finishWhisperMutation(request)
    }
  }

  private async cancelModel(): Promise<void> {
    if (this.disposed) return
    const model = this.currentWhisperModel()
    const accelerationRevision = this.whisperAccelerationRevision
    const request = this.beginWhisperMutation()
    try {
      const result = await this.remote.cancelWhisperModelDownload(model)
      if (!this.isCurrentWhisperMutation(request, model, accelerationRevision)) return
      this.whisperView = result.ok
        ? { status: 'ready', state: result.value }
        : whisperErrorView(this.whisperView, result.error.message, 'Could not cancel the download', EARS_ERROR_CODES.whisperCancelCleanupFailed, { detail: result.error.message })
      this.whisperStore.set(this.whisperView)
    } catch {
      if (!this.isCurrentWhisperMutation(request, model, accelerationRevision)) return
      this.whisperView = whisperErrorView(this.whisperView, '', 'Whisper model cancellation failed', EARS_ERROR_CODES.whisperCancelCleanupFailed, { detail: 'Whisper model cancellation failed' })
      this.whisperStore.set(this.whisperView)
    } finally {
      this.finishWhisperMutation(request)
    }
  }

  async loadAbout(): Promise<AboutInfo | null> {
    if (this.disposed) return null
    const result = await this.remote.getAbout()
    return result.ok ? result.value : null
  }

  async checkForUpdate(): Promise<UpdateCheckResult> {
    const fallback: UpdateCheckResult = {
      status: 'error',
      installed: '',
      latest: null,
      updateCommand: 'dsh plugin --profile web update dsh-ears'
    }
    if (this.disposed) return fallback
    const result = await this.remote.checkForUpdate()
    return result.ok ? result.value : fallback
  }

  private async deleteModel(): Promise<void> {
    if (this.disposed) return
    const model = this.currentWhisperModel()
    const accelerationRevision = this.whisperAccelerationRevision
    const request = this.beginWhisperMutation()
    try {
      const result = await this.remote.deleteWhisperModel(model)
      if (!this.isCurrentWhisperMutation(request, model, accelerationRevision)) return
      this.whisperView = result.ok
        ? { status: 'ready', state: result.value }
        : whisperErrorView(this.whisperView, result.error.message, 'Could not delete the model', EARS_ERROR_CODES.whisperDeleteFailed, { detail: result.error.message })
      this.whisperStore.set(this.whisperView)
    } catch {
      if (!this.isCurrentWhisperMutation(request, model, accelerationRevision)) return
      this.whisperView = whisperErrorView(this.whisperView, '', 'Whisper model deletion failed', EARS_ERROR_CODES.whisperDeleteFailed, { detail: 'Whisper model deletion failed' })
      this.whisperStore.set(this.whisperView)
    } finally {
      this.finishWhisperMutation(request)
    }
  }

  private currentCloudAsrProvider(): string {
    return (this.drafts.get('cloudAsrProvider') ?? this.settingsView.settings.cloudAsrProvider).trim()
  }

  private currentCloudAsrModel(): string {
    const field = cloudAsrModelField(this.currentCloudAsrProvider())
    return (this.drafts.get(field) ?? this.settingsView.settings[field]).trim()
  }

  private rememberCloudAsrModel(provider: string, model: string): void {
    const normalizedProvider = provider.trim()
    if (normalizedProvider === '') return
    this.cloudAsrModels.set(normalizedProvider, model.trim())
  }

  private resetCloudAsrModels(): void {
    this.cloudAsrModels.clear()
    const settings = this.settingsView.settings
    this.rememberCloudAsrModel('groq', settings.cloudAsrGroqModel)
    this.rememberCloudAsrModel('deepgram', settings.cloudAsrDeepgramModel)
    this.rememberCloudAsrModel('custom', settings.cloudAsrCustomModel)
    this.rememberCloudAsrModel('bailian', settings.cloudAsrBailianModel)
    this.rememberCloudAsrModel('tencent', settings.cloudAsrTencentEngineType)
  }

  private currentPolishProvider(): string {
    return (this.drafts.get('polishProvider') ?? this.settingsView.settings.polishProvider).trim()
  }

  private currentPolishModel(): string {
    return (this.drafts.get('polishModel') ?? this.settingsView.settings.polishModel).trim()
  }

  private currentPolishReasoningEffort(): string {
    return (this.drafts.get('polishReasoningEffort') ?? this.settingsView.settings.polishReasoningEffort).trim()
  }

  private polishReasoningKey(provider: string, model: string): string {
    return `${provider}\u0000${model}`
  }

  private rememberPolishSelection(provider: string, model: string, reasoningEffort: string): void {
    const normalizedProvider = provider.trim()
    const normalizedModel = model.trim()
    if (normalizedProvider === '') return
    this.polishModels.set(normalizedProvider, normalizedModel)
    this.polishReasoningEfforts.set(this.polishReasoningKey(normalizedProvider, normalizedModel), reasoningEffort.trim())
  }

  private polishModelForProvider(provider: string): string {
    return this.polishModels.get(provider) ?? ''
  }

  private polishReasoningEffortFor(provider: string, model: string): string {
    return this.polishReasoningEfforts.get(this.polishReasoningKey(provider, model)) ?? ''
  }

  private resetPolishSelections(): void {
    this.polishModels.clear()
    this.polishReasoningEfforts.clear()
    this.rememberPolishSelection(this.settingsView.settings.polishProvider, this.settingsView.settings.polishModel, this.settingsView.settings.polishReasoningEffort)
  }

  private currentWhisperModel(): string {
    return (this.drafts.get('localWhisperModel') ?? this.settingsView.settings.localWhisperModel).trim()
  }

  private hasPendingWhisperAcceleration(): boolean {
    return this.drafts.has('localWhisperAcceleration')
  }

  private showPendingWhisperAcceleration(): void {
    this.whisperView = { status: 'loading', state: this.whisperView.state }
    this.whisperStore.set(this.whisperView)
    this.stopWhisperPolling()
  }

  private beginWhisperMutation(): number {
    this.whisperRequest += 1
    this.whisperMutationInFlight = true
    this.stopWhisperPolling()
    return this.whisperRequest
  }

  private isCurrentWhisperMutation(request: number, model: string, accelerationRevision: number): boolean {
    return !this.disposed
      && request === this.whisperRequest
      && model === this.currentWhisperModel()
      && accelerationRevision === this.whisperAccelerationRevision
      && !this.hasPendingWhisperAcceleration()
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
      this.rememberPolishSelection(this.currentPolishProvider(), this.currentPolishModel(), this.currentPolishReasoningEffort())
      const model = this.polishModelForProvider(text.trim())
      this.drafts.set('polishModel', model)
      this.drafts.set('polishReasoningEffort', this.polishReasoningEffortFor(text.trim(), model))
    } else if (field === 'polishModel') {
      this.rememberPolishSelection(this.currentPolishProvider(), text, '')
      this.drafts.set('polishReasoningEffort', '')
    } else if (field === 'polishReasoningEffort') {
      this.rememberPolishSelection(this.currentPolishProvider(), this.currentPolishModel(), text)
    } else if (field === 'cloudAsrProvider') {
      this.rememberCloudAsrModel(this.currentCloudAsrProvider(), this.currentCloudAsrModel())
    } else if (field === 'cloudAsrGroqModel' || field === 'cloudAsrDeepgramModel' || field === 'cloudAsrCustomModel' || field === 'cloudAsrBailianModel' || field === 'cloudAsrTencentEngineType') {
      this.rememberCloudAsrModel(
        field === 'cloudAsrDeepgramModel' ? 'deepgram' : field === 'cloudAsrBailianModel' ? 'bailian' : field === 'cloudAsrCustomModel' ? 'custom' : field === 'cloudAsrTencentEngineType' ? 'tencent' : 'groq',
        text
      )
    } else if (field === 'cloudAsrGroqApiKey' || field === 'cloudAsrDeepgramApiKey' || field === 'cloudAsrCustomApiKey' || field === 'cloudAsrBailianApiKey' || field === 'cloudAsrTencentSecretKey') {
      if (text.trim() === '') {
        this.drafts.delete(field)
        this.failed = false
        this.publishCard()
        if (this.hasPersistableDrafts()) this.scheduleSave(SETTINGS_SAVE_DEBOUNCE_MS)
        else this.cancelScheduledSave()
        return
      }
      if (field === 'cloudAsrGroqApiKey') this.clearKeyPending = false
      if (field === 'cloudAsrDeepgramApiKey') this.clearDeepgramKeyPending = false
      if (field === 'cloudAsrCustomApiKey') this.clearCustomKeyPending = false
      if (field === 'cloudAsrBailianApiKey') this.clearBailianKeyPending = false
      if (field === 'cloudAsrTencentSecretKey') this.clearTencentKeyPending = false
    }
    this.drafts.set(field, text)
    this.failed = false
    this.publishCard()
    if (field === 'polishProvider' || field === 'polishModel') void this.refreshReasoningEfforts()
    if (field === 'localWhisperModel' || field === 'localWhisperAcceleration' || (field === 'asrBackend' && text === 'local-whisper')) void this.refreshWhisperState()
    if (field === 'cloudAsrProvider' || (field === 'asrBackend' && text === 'cloud-openai')) void this.refreshCloudModels()
    this.scheduleSave(SETTINGS_SAVE_DEBOUNCE_MS)
  }

  /** Stage the write-only key for clearing; auto-save commits it. */
  private clearApiKey(): void {
    if (this.disposed) return
    this.clearKeyPending = true
    this.drafts.delete('cloudAsrGroqApiKey')
    this.failed = false
    this.publishCard()
    this.scheduleSave(0)
  }

  /** Undo a staged clear that has not been submitted yet. */
  private undoClearApiKey(): void {
    this.undoClearNamedApiKey('groq')
  }

  private clearNamedApiKey(which: 'groq' | 'deepgram' | 'custom' | 'bailian' | 'tencent'): void {
    if (this.disposed) return
    if (which === 'groq') {
      this.clearKeyPending = true
      this.drafts.delete('cloudAsrGroqApiKey')
    } else if (which === 'deepgram') {
      this.clearDeepgramKeyPending = true
      this.drafts.delete('cloudAsrDeepgramApiKey')
    } else if (which === 'custom') {
      this.clearCustomKeyPending = true
      this.drafts.delete('cloudAsrCustomApiKey')
    } else if (which === 'bailian') {
      this.clearBailianKeyPending = true
      this.drafts.delete('cloudAsrBailianApiKey')
    } else {
      this.clearTencentKeyPending = true
      this.drafts.delete('cloudAsrTencentSecretKey')
    }
    this.failed = false
    this.publishCard()
    this.scheduleSave(0)
  }

  private undoClearNamedApiKey(which: 'groq' | 'deepgram' | 'custom' | 'bailian' | 'tencent'): void {
    if (this.disposed || this.saving) return
    if (which === 'groq') this.clearKeyPending = false
    else if (which === 'deepgram') this.clearDeepgramKeyPending = false
    else if (which === 'custom') this.clearCustomKeyPending = false
    else if (which === 'bailian') this.clearBailianKeyPending = false
    else this.clearTencentKeyPending = false
    this.failed = false
    if (this.drafts.size === 0) this.cancelScheduledSave()
    this.publishCard()
  }

  /** Drop every staged draft and pending clear, back to the last saved state. */
  private discard(): void {
    if (this.disposed) return
    const refreshWhisper = this.hasPendingWhisperAcceleration()
    this.cancelScheduledSave()
    this.saveQueued = false
    this.drafts.clear()
    this.resetCloudAsrModels()
    this.resetPolishSelections()
    this.clearKeyPending = false
    this.clearDeepgramKeyPending = false
    this.clearCustomKeyPending = false
    this.clearBailianKeyPending = false
    this.clearTencentKeyPending = false
    this.failed = false
    this.publishCard()
    if (refreshWhisper) void this.refreshWhisperState()
  }

  private scheduleSave(delay: number): void {
    if (this.disposed || !this.settingsView.writable) return
    this.cancelScheduledSave()
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      void this.save()
    }, delay)
  }

  private cancelScheduledSave(): void {
    if (this.saveTimer === undefined) return
    clearTimeout(this.saveTimer)
    this.saveTimer = undefined
  }

  private async save(): Promise<void> {
    this.cancelScheduledSave()
    if (this.disposed || !this.settingsView.writable) return
    if (this.saving) {
      this.saveQueued = true
      return
    }
    const patch: EarsSettingsPatch = {}
    const submittedDrafts = new Map<FieldName, string>()
    for (const [field, text] of this.drafts.entries()) {
      if (isSettingsFieldInvalid(field, text)) continue
      const value = field === 'maxRecordingSeconds' && text.trim() === ''
        ? DEFAULT_EARS_SETTINGS.maxRecordingSeconds
        : parseSettingsField(field, text)
      if (value !== undefined) {
        (patch as Record<string, unknown>)[field] = value
        submittedDrafts.set(field, text)
      }
    }
    const submittedClear = this.clearKeyPending
    const submittedDeepgramClear = this.clearDeepgramKeyPending
    const submittedCustomClear = this.clearCustomKeyPending
    const submittedBailianClear = this.clearBailianKeyPending
    const submittedTencentClear = this.clearTencentKeyPending
    if (submittedClear) (patch as Record<string, unknown>).cloudAsrGroqApiKey = ''
    if (submittedDeepgramClear) (patch as Record<string, unknown>).cloudAsrDeepgramApiKey = ''
    if (submittedCustomClear) (patch as Record<string, unknown>).cloudAsrCustomApiKey = ''
    if (submittedBailianClear) (patch as Record<string, unknown>).cloudAsrBailianApiKey = ''
    if (submittedTencentClear) (patch as Record<string, unknown>).cloudAsrTencentSecretKey = ''
    if (submittedDrafts.size === 0 && !submittedClear && !submittedDeepgramClear && !submittedCustomClear && !submittedBailianClear && !submittedTencentClear) return
    this.saving = true
    this.saveQueued = false
    this.failed = false
    this.publishCard()
    try {
      const result = await this.remote.updateSettings(patch)
      if (!result.ok) throw new Error('dsh-ears settings update failed')
      if (this.disposed) return
      const cloudRelevant = submittedClear || submittedDeepgramClear || submittedCustomClear || submittedBailianClear || submittedTencentClear
        || submittedDrafts.has('cloudAsrGroqApiKey')
        || submittedDrafts.has('cloudAsrDeepgramApiKey')
        || submittedDrafts.has('cloudAsrCustomApiKey')
        || submittedDrafts.has('cloudAsrBailianApiKey')
        || submittedDrafts.has('cloudAsrTencentSecretKey')
      const whisperAccelerationChanged = submittedDrafts.has('localWhisperAcceleration')
      if (whisperAccelerationChanged) this.whisperAccelerationRevision += 1
      this.rememberPolishSelection(result.value.settings.polishProvider, result.value.settings.polishModel, result.value.settings.polishReasoningEffort)
      this.settingsView = result.value
      this.rememberCloudAsrModel(result.value.settings.cloudAsrProvider, cloudAsrModelFor(result.value.settings))
      this.rememberCloudAsrModel('groq', result.value.settings.cloudAsrGroqModel)
      this.rememberCloudAsrModel('deepgram', result.value.settings.cloudAsrDeepgramModel)
      this.rememberCloudAsrModel('custom', result.value.settings.cloudAsrCustomModel)
      this.rememberCloudAsrModel('bailian', result.value.settings.cloudAsrBailianModel)
      this.rememberCloudAsrModel('tencent', result.value.settings.cloudAsrTencentEngineType)
      this.settingsStore.set(result.value.settings)
      for (const [field, text] of submittedDrafts) {
        if (this.drafts.get(field) === text) this.drafts.delete(field)
      }
      if (submittedClear && this.clearKeyPending) this.clearKeyPending = false
      if (submittedDeepgramClear && this.clearDeepgramKeyPending) this.clearDeepgramKeyPending = false
      if (submittedCustomClear && this.clearCustomKeyPending) this.clearCustomKeyPending = false
      if (submittedBailianClear && this.clearBailianKeyPending) this.clearBailianKeyPending = false
      if (submittedTencentClear && this.clearTencentKeyPending) this.clearTencentKeyPending = false
      void this.refreshBackends()
      if (cloudRelevant) void this.refreshCloudModels()
      if (whisperAccelerationChanged) void this.refreshWhisperState()
    } catch {
      if (!this.disposed) this.failed = true
    } finally {
      this.saving = false
      if (this.disposed) return
      this.publishCard()
      if (!this.failed && (this.saveQueued || this.hasPersistableDrafts())) {
        this.saveQueued = false
        void this.save()
      }
    }
  }

  private hasPersistableDrafts(): boolean {
    if (this.clearKeyPending || this.clearDeepgramKeyPending || this.clearCustomKeyPending || this.clearBailianKeyPending || this.clearTencentKeyPending) return true
    for (const [field, text] of this.drafts.entries()) {
      if (!isSettingsFieldInvalid(field, text)) return true
    }
    return false
  }

  private publishCard(): void { this.cardStore.set(this.snapshot()) }

  private snapshot(): EarsCardState {
    const current = this.settingsView.settings
    const field = (name: FieldName, text: string): FieldState => ({ text, overridden: this.settingsView.overridden.includes(name), invalid: this.drafts.has(name) && isSettingsFieldInvalid(name, text) })
    const asrBackend = field('asrBackend', this.drafts.get('asrBackend') ?? current.asrBackend)
    const webSpeechLanguage = field('webSpeechLanguage', this.drafts.get('webSpeechLanguage') ?? current.webSpeechLanguage)
    const localWhisperModel = field('localWhisperModel', this.drafts.get('localWhisperModel') ?? current.localWhisperModel)
    const localWhisperAcceleration = field('localWhisperAcceleration', this.drafts.get('localWhisperAcceleration') ?? current.localWhisperAcceleration ?? DEFAULT_EARS_SETTINGS.localWhisperAcceleration)
    const localWhisperLanguage = field('localWhisperLanguage', this.drafts.get('localWhisperLanguage') ?? current.localWhisperLanguage)
    const cloudAsrProvider = field('cloudAsrProvider', this.drafts.get('cloudAsrProvider') ?? current.cloudAsrProvider)
    const cloudAsrGroqApiKey = field('cloudAsrGroqApiKey', this.drafts.get('cloudAsrGroqApiKey') ?? '')
    const cloudAsrDeepgramApiKey = field('cloudAsrDeepgramApiKey', this.drafts.get('cloudAsrDeepgramApiKey') ?? '')
    const cloudAsrCustomApiKey = field('cloudAsrCustomApiKey', this.drafts.get('cloudAsrCustomApiKey') ?? '')
    const cloudAsrBailianApiKey = field('cloudAsrBailianApiKey', this.drafts.get('cloudAsrBailianApiKey') ?? '')
    const cloudAsrTencentSecretKey = field('cloudAsrTencentSecretKey', this.drafts.get('cloudAsrTencentSecretKey') ?? '')
    const cloudAsrCustomEndpoint = field('cloudAsrCustomEndpoint', this.drafts.get('cloudAsrCustomEndpoint') ?? current.cloudAsrCustomEndpoint)
    const cloudAsrCustomModel = field('cloudAsrCustomModel', this.drafts.get('cloudAsrCustomModel') ?? current.cloudAsrCustomModel)
    const cloudAsrCustomLanguage = field('cloudAsrCustomLanguage', this.drafts.get('cloudAsrCustomLanguage') ?? current.cloudAsrCustomLanguage)
    const cloudAsrBailianHost = field('cloudAsrBailianHost', this.drafts.get('cloudAsrBailianHost') ?? current.cloudAsrBailianHost)
    const cloudAsrGroqModel = field('cloudAsrGroqModel', this.drafts.get('cloudAsrGroqModel') ?? current.cloudAsrGroqModel)
    const cloudAsrGroqLanguage = field('cloudAsrGroqLanguage', this.drafts.get('cloudAsrGroqLanguage') ?? current.cloudAsrGroqLanguage)
    const cloudAsrDeepgramModel = field('cloudAsrDeepgramModel', this.drafts.get('cloudAsrDeepgramModel') ?? current.cloudAsrDeepgramModel)
    const cloudAsrDeepgramLanguage = field('cloudAsrDeepgramLanguage', this.drafts.get('cloudAsrDeepgramLanguage') ?? current.cloudAsrDeepgramLanguage)
    const cloudAsrDeepgramService = field('cloudAsrDeepgramService', this.drafts.get('cloudAsrDeepgramService') ?? current.cloudAsrDeepgramService)
    const cloudAsrBailianModel = field('cloudAsrBailianModel', this.drafts.get('cloudAsrBailianModel') ?? current.cloudAsrBailianModel)
    const cloudAsrBailianLanguage = field('cloudAsrBailianLanguage', this.drafts.get('cloudAsrBailianLanguage') ?? current.cloudAsrBailianLanguage)
    const cloudAsrTencentAppId = field('cloudAsrTencentAppId', this.drafts.get('cloudAsrTencentAppId') ?? current.cloudAsrTencentAppId)
    const cloudAsrTencentSecretId = field('cloudAsrTencentSecretId', this.drafts.get('cloudAsrTencentSecretId') ?? current.cloudAsrTencentSecretId)
    const cloudAsrTencentEngineType = field('cloudAsrTencentEngineType', this.drafts.get('cloudAsrTencentEngineType') ?? current.cloudAsrTencentEngineType)
    const cloudAsrTencentService = field('cloudAsrTencentService', this.drafts.get('cloudAsrTencentService') ?? current.cloudAsrTencentService)
    const maxRecordingSeconds = field('maxRecordingSeconds', this.drafts.get('maxRecordingSeconds') ?? String(current.maxRecordingSeconds))
    const voiceShortcutEnabled = field('voiceShortcutEnabled', this.drafts.get('voiceShortcutEnabled') ?? (current.voiceShortcutEnabled === false ? 'off' : 'on'))
    const voiceShortcut = field('voiceShortcut', this.drafts.get('voiceShortcut') ?? (current.voiceShortcut ?? DEFAULT_EARS_SETTINGS.voiceShortcut))
    const voiceSoundsEnabled = field('voiceSoundsEnabled', this.drafts.get('voiceSoundsEnabled') ?? (current.voiceSoundsEnabled === false ? 'off' : 'on'))
    const settingsDisplayName = field('settingsDisplayName', this.drafts.get('settingsDisplayName') ?? current.settingsDisplayName)
    const polishingEnabled = field('polishingEnabled', this.drafts.get('polishingEnabled') ?? (current.polishingEnabled ? 'on' : 'off'))
    const polishProvider = field('polishProvider', this.drafts.get('polishProvider') ?? current.polishProvider)
    const polishModel = field('polishModel', this.drafts.get('polishModel') ?? current.polishModel)
    const polishReasoningEffort = field('polishReasoningEffort', this.drafts.get('polishReasoningEffort') ?? current.polishReasoningEffort)
    const polishPrompt = field('polishPrompt', this.drafts.get('polishPrompt') ?? current.polishPrompt)
    const stagedFields = [asrBackend, webSpeechLanguage, localWhisperModel, localWhisperAcceleration, localWhisperLanguage, cloudAsrProvider, cloudAsrGroqApiKey, cloudAsrDeepgramApiKey, cloudAsrCustomApiKey, cloudAsrBailianApiKey, cloudAsrTencentSecretKey, cloudAsrCustomEndpoint, cloudAsrCustomModel, cloudAsrCustomLanguage, cloudAsrBailianHost, cloudAsrGroqModel, cloudAsrGroqLanguage, cloudAsrDeepgramModel, cloudAsrDeepgramLanguage, cloudAsrDeepgramService, cloudAsrBailianModel, cloudAsrBailianLanguage, cloudAsrTencentAppId, cloudAsrTencentSecretId, cloudAsrTencentEngineType, cloudAsrTencentService, maxRecordingSeconds, voiceShortcutEnabled, voiceShortcut, voiceSoundsEnabled, settingsDisplayName, polishingEnabled, polishProvider, polishModel, polishReasoningEffort, polishPrompt]
    return {
      available: this.settingsView.available,
      writable: this.settingsView.writable,
      loaded: this.loaded,
      loadFailed: this.loadFailed,
      saving: this.saving,
      failed: this.failed,
      dirty: this.drafts.size > 0 || this.clearKeyPending || this.clearDeepgramKeyPending || this.clearCustomKeyPending || this.clearBailianKeyPending || this.clearTencentKeyPending,
      invalid: stagedFields.some((candidate) => candidate.invalid),
      asrBackend,
      webSpeechLanguage,
      localWhisperModel,
      localWhisperAcceleration,
      localWhisperLanguage,
      localWhisperAccelerations: this.settingsView.localWhisperAccelerations ?? ['default'],
      cloudAsrProvider,
      cloudAsrGroqApiKey,
      cloudAsrGroqApiKeyConfigured: this.settingsView.cloudAsrGroqApiKeyConfigured,
      cloudAsrGroqApiKeyClearPending: this.clearKeyPending,
      cloudAsrDeepgramApiKey,
      cloudAsrDeepgramApiKeyConfigured: this.settingsView.cloudAsrDeepgramApiKeyConfigured,
      cloudAsrDeepgramApiKeyClearPending: this.clearDeepgramKeyPending,
      cloudAsrCustomApiKey,
      cloudAsrCustomApiKeyConfigured: this.settingsView.cloudAsrCustomApiKeyConfigured,
      cloudAsrCustomApiKeyClearPending: this.clearCustomKeyPending,
      cloudAsrBailianApiKey,
      cloudAsrBailianApiKeyConfigured: this.settingsView.cloudAsrBailianApiKeyConfigured,
      cloudAsrBailianApiKeyClearPending: this.clearBailianKeyPending,
      cloudAsrTencentSecretKey,
      cloudAsrTencentSecretKeyConfigured: this.settingsView.cloudAsrTencentSecretKeyConfigured,
      cloudAsrTencentSecretKeyClearPending: this.clearTencentKeyPending,
      cloudAsrCustomEndpoint,
      cloudAsrCustomModel,
      cloudAsrCustomLanguage,
      cloudAsrBailianHost,
      cloudAsrGroqModel,
      cloudAsrGroqLanguage,
      cloudAsrDeepgramModel,
      cloudAsrDeepgramLanguage,
      cloudAsrDeepgramService,
      cloudAsrBailianModel,
      cloudAsrBailianLanguage,
      cloudAsrTencentAppId,
      cloudAsrTencentSecretId,
      cloudAsrTencentEngineType,
      cloudAsrTencentService,
      maxRecordingSeconds,
      voiceShortcutEnabled,
      voiceShortcut,
      voiceSoundsEnabled,
      settingsDisplayName,
      polishingEnabled,
      polishProvider,
      polishModel,
      polishReasoningEffort,
      polishPrompt
    }
  }
}
