import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { EarsSettings, WhisperAccelerationId } from '../config.js'
import { isSettingsFieldInvalid, type FieldName } from './settings-fields.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import { CLOUD_ASR_PROVIDERS, type CloudAsrCredentialField } from '../asr/providers.js'
import type { AboutInfo, AsrBackendInfo, EarsSettingsView, UpdateCheckResult } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'
import { CloudProviderController, type CloudModelsView } from './cloud-provider-controller.js'
import { PolishStateController, type ReasoningEffortsState, type RouteState } from './polish-state-controller.js'
import { SettingsDraftController } from './settings-draft-controller.js'
import { WhisperModelController, type WhisperModelView } from './whisper-model-controller.js'

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
  cloudAsrMimoApiKey: FieldState
  cloudAsrMimoApiKeyConfigured: boolean
  cloudAsrMimoApiKeyClearPending: boolean
  cloudAsrMimoService: FieldState
  cloudAsrMimoCluster: FieldState
  cloudAsrMimoModel: FieldState
  cloudAsrMimoLanguage: FieldState
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
export interface BackendState { status: 'loading' | 'ready'; backends: readonly AsrBackendInfo[] }
export type { ReasoningEffortsState, RouteState } from './polish-state-controller.js'
export type { CloudModelsView } from './cloud-provider-controller.js'
export type { WhisperModelView } from './whisper-model-controller.js'
export type EarsSettingsHook = SnapshotSelectorHook<EarsSettings>
export type EarsCardHook = SnapshotSelectorHook<EarsCardState>
export type RouteHook = SnapshotSelectorHook<RouteState>
export type BackendHook = SnapshotSelectorHook<BackendState>
export type ReasoningEffortsHook = SnapshotSelectorHook<ReasoningEffortsState>
export type WhisperModelHook = SnapshotSelectorHook<WhisperModelView>
export type CloudModelsHook = SnapshotSelectorHook<CloudModelsView>

export { EMPTY_CLOUD_MODELS_VIEW } from './cloud-provider-controller.js'
export { EMPTY_WHISPER_STATE } from './whisper-model-controller.js'

export class EarsSettingsController {
  private readonly remote: EarsRemote
  private readonly settingsStore: SnapshotStore<EarsSettings>
  private readonly cardStore: SnapshotStore<EarsCardState>
  private readonly backendStore: SnapshotStore<BackendState>
  private readonly draftsController = new SettingsDraftController()
  private readonly cloudProviderController: CloudProviderController
  private readonly polishStateController: PolishStateController
  private readonly whisperModelController: WhisperModelController
  private readonly drafts = this.draftsController
  private settingsView: EarsSettingsView = { available: true, writable: false, settings: DEFAULT_EARS_SETTINGS, cloudAsrGroqApiKeyConfigured: false, cloudAsrDeepgramApiKeyConfigured: false, cloudAsrCustomApiKeyConfigured: false, cloudAsrBailianApiKeyConfigured: false, cloudAsrTencentSecretKeyConfigured: false, cloudAsrMimoApiKeyConfigured: false, overridden: [] }
  private backendState: BackendState = { status: 'loading', backends: [] }
  private saving = false
  private saveQueued = false
  private loaded = false
  private loadFailed = false
  private failed = false
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private retryAttempted = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private settingsRequest = 0
  private backendRequest = 0

  constructor(remote: EarsRemote) {
    this.remote = remote
    this.cloudProviderController = new CloudProviderController()
    this.polishStateController = new PolishStateController()
    this.whisperModelController = new WhisperModelController(remote, {
      currentModel: () => this.currentWhisperModel(),
      hasPendingAcceleration: () => this.hasPendingWhisperAcceleration()
    })
    this.settingsStore = createSnapshotStore(DEFAULT_EARS_SETTINGS)
    this.cardStore = createSnapshotStore(this.snapshot())
    this.backendStore = createSnapshotStore(this.backendState)
    this.cloudProviderController.rememberSettings(DEFAULT_EARS_SETTINGS)
  }

  getSettingsStore(): SnapshotStore<EarsSettings> { return this.settingsStore }
  getCardStore(): SnapshotStore<EarsCardState> { return this.cardStore }
  getRouteStore(): SnapshotStore<RouteState> { return this.polishStateController.getRouteStore() }
  getBackendStore(): SnapshotStore<BackendState> { return this.backendStore }
  getReasoningStore(): SnapshotStore<ReasoningEffortsState> { return this.polishStateController.getReasoningStore() }
  getWhisperStore(): SnapshotStore<WhisperModelView> { return this.whisperModelController.getStore() }
  getCloudModelsStore(): SnapshotStore<CloudModelsView> { return this.cloudProviderController.getStore() }

  actions() {
    return {
      edit: (field: FieldName, text: string) => this.edit(field, text),
      setCredential: (field: CloudAsrCredentialField, text: string) => this.edit(field, text),
      clearCredential: (field: CloudAsrCredentialField) => this.clearCredential(field),
      undoCredentialClear: (field: CloudAsrCredentialField) => this.undoCredentialClear(field),
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
      setMimoApiKey: (text: string) => this.edit('cloudAsrMimoApiKey', text),
      clearMimoApiKey: () => this.clearNamedApiKey('mimo'),
      undoClearMimoApiKey: () => this.undoClearNamedApiKey('mimo'),
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
    this.cloudProviderController.dispose()
    this.polishStateController.dispose()
    this.whisperModelController.dispose()
    this.settingsRequest += 1
    this.backendRequest += 1
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    this.saveQueued = false
  }

  async refreshSettings(): Promise<void> {
    if (this.disposed) return
    const request = ++this.settingsRequest
    try {
      const result = await this.remote.getSettings()
      if (this.disposed || request !== this.settingsRequest) return
      if (result.ok) {
        this.settingsView = result.value
        this.cloudProviderController.rememberSettings(result.value.settings)
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

  async refreshRoutes(silent?: boolean): Promise<void> {
    await this.polishStateController.refreshRoutes(this.remote, silent)
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
    await this.cloudProviderController.refresh(this.remote, this.currentCloudAsrProvider())
  }

  async refreshReasoningEfforts(): Promise<void> {
    await this.polishStateController.refreshReasoningEfforts(
      this.remote,
      this.currentPolishProvider(),
      this.currentPolishModel()
    )
  }

  async refreshWhisperState(): Promise<void> {
    await this.whisperModelController.refresh()
  }

  private async downloadModel(): Promise<void> {
    await this.whisperModelController.download()
  }

  private async cancelModel(): Promise<void> {
    await this.whisperModelController.cancel()
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
    await this.whisperModelController.delete()
  }

  private currentCloudAsrProvider(): string {
    return (this.drafts.get('cloudAsrProvider') ?? this.settingsView.settings.cloudAsrProvider).trim()
  }

  private currentCloudAsrModel(): string {
    return this.cloudProviderController.modelFor(this.currentCloudAsrProvider(), this.settingsView.settings, this.drafts.entries())
  }

  private resetCloudAsrModels(): void {
    this.cloudProviderController.reset(this.settingsView.settings)
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

  private rememberPolishSelection(provider: string, model: string, reasoningEffort: string): void {
    this.polishStateController.rememberSelection(provider, model, reasoningEffort)
  }

  private polishModelForProvider(provider: string): string {
    return this.polishStateController.modelFor(provider)
  }

  private polishReasoningEffortFor(provider: string, model: string): string {
    return this.polishStateController.reasoningEffortFor(provider, model)
  }

  private resetPolishSelections(): void {
    this.polishStateController.resetSelections(this.settingsView.settings.polishProvider, this.settingsView.settings.polishModel, this.settingsView.settings.polishReasoningEffort)
  }

  private currentWhisperModel(): string {
    return (this.drafts.get('localWhisperModel') ?? this.settingsView.settings.localWhisperModel).trim()
  }

  private hasPendingWhisperAcceleration(): boolean {
    return this.drafts.has('localWhisperAcceleration')
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
      this.cloudProviderController.remember(this.currentCloudAsrProvider(), this.currentCloudAsrModel())
    } else if (CLOUD_ASR_PROVIDERS.some((provider) => provider.modelField === field)) {
      const provider = CLOUD_ASR_PROVIDERS.find((candidate) => candidate.modelField === field)
      if (provider !== undefined) this.cloudProviderController.remember(provider.id, text)
    } else if (this.draftsController.isCredentialField(field)) {
      if (text.trim() === '') {
        this.draftsController.edit(field, text)
        this.failed = false
        this.publishCard()
        if (this.hasPersistableDrafts()) this.scheduleSave(SETTINGS_SAVE_DEBOUNCE_MS)
        else this.cancelScheduledSave()
        return
      }
    }
    this.draftsController.edit(field, text)
    this.failed = false
    this.publishCard()
    if (field === 'polishProvider' || field === 'polishModel') void this.refreshReasoningEfforts()
    if (field === 'localWhisperModel' || field === 'localWhisperAcceleration' || (field === 'asrBackend' && text === 'local-whisper')) void this.refreshWhisperState()
    if (field === 'cloudAsrProvider' || (field === 'asrBackend' && text === 'cloud-openai')) void this.refreshCloudModels()
    this.scheduleSave(SETTINGS_SAVE_DEBOUNCE_MS)
  }

  /** Stage the write-only key for clearing; auto-save commits it. */
  private clearApiKey(): void {
    this.clearNamedApiKey('groq')
  }

  private clearCredential(field: CloudAsrCredentialField): void {
    if (this.disposed) return
    this.draftsController.clearCredential(field)
    this.failed = false
    this.publishCard()
    this.scheduleSave(0)
  }

  private undoCredentialClear(field: CloudAsrCredentialField): void {
    if (this.disposed || this.saving) return
    this.draftsController.undoCredentialClear(field)
    this.failed = false
    if (!this.draftsController.isDirty()) this.cancelScheduledSave()
    this.publishCard()
  }

  /** Undo a staged clear that has not been submitted yet. */
  private undoClearApiKey(): void {
    this.undoClearNamedApiKey('groq')
  }

  private clearNamedApiKey(which: 'groq' | 'deepgram' | 'custom' | 'bailian' | 'tencent' | 'mimo'): void {
    if (this.disposed) return
    const provider = CLOUD_ASR_PROVIDERS.find((candidate) => candidate.id === which)
    if (provider === undefined) return
    this.clearCredential(provider.credentialField)
  }

  private undoClearNamedApiKey(which: 'groq' | 'deepgram' | 'custom' | 'bailian' | 'tencent' | 'mimo'): void {
    if (this.disposed || this.saving) return
    const provider = CLOUD_ASR_PROVIDERS.find((candidate) => candidate.id === which)
    if (provider === undefined) return
    this.undoCredentialClear(provider.credentialField)
  }

  /** Drop every staged draft and pending clear, back to the last saved state. */
  private discard(): void {
    if (this.disposed) return
    const refreshWhisper = this.hasPendingWhisperAcceleration()
    this.cancelScheduledSave()
    this.saveQueued = false
    this.draftsController.reset()
    this.resetCloudAsrModels()
    this.resetPolishSelections()
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
    const submission = this.draftsController.buildSubmission()
    const { patch } = submission
    if (Object.keys(patch).length === 0) return
    this.saving = true
    this.saveQueued = false
    this.failed = false
    this.publishCard()
    try {
      const result = await this.remote.updateSettings(patch)
      if (!result.ok) throw new Error('dsh-ears settings update failed')
      if (this.disposed) return
      const cloudRelevant = CLOUD_ASR_PROVIDERS.some((provider) => submission.credentialClears.has(provider.credentialField) || submission.drafts.has(provider.credentialField))
      const whisperAccelerationChanged = submission.drafts.has('localWhisperAcceleration')
      if (whisperAccelerationChanged) this.whisperModelController.notifyAccelerationChanged()
      this.rememberPolishSelection(result.value.settings.polishProvider, result.value.settings.polishModel, result.value.settings.polishReasoningEffort)
      this.settingsView = result.value
      this.cloudProviderController.rememberSettings(result.value.settings)
      this.settingsStore.set(result.value.settings)
      this.draftsController.reconcile(submission)
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
    return this.draftsController.hasPersistableDrafts()
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
    const cloudAsrMimoApiKey = field('cloudAsrMimoApiKey', this.drafts.get('cloudAsrMimoApiKey') ?? '')
    const cloudAsrMimoService = field('cloudAsrMimoService', this.drafts.get('cloudAsrMimoService') ?? current.cloudAsrMimoService)
    const cloudAsrMimoCluster = field('cloudAsrMimoCluster', this.drafts.get('cloudAsrMimoCluster') ?? current.cloudAsrMimoCluster)
    const cloudAsrMimoModel = field('cloudAsrMimoModel', this.drafts.get('cloudAsrMimoModel') ?? current.cloudAsrMimoModel)
    const cloudAsrMimoLanguage = field('cloudAsrMimoLanguage', this.drafts.get('cloudAsrMimoLanguage') ?? current.cloudAsrMimoLanguage)
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
    const stagedFields = [asrBackend, webSpeechLanguage, localWhisperModel, localWhisperAcceleration, localWhisperLanguage, cloudAsrProvider, cloudAsrGroqApiKey, cloudAsrDeepgramApiKey, cloudAsrCustomApiKey, cloudAsrBailianApiKey, cloudAsrTencentSecretKey, cloudAsrMimoApiKey, cloudAsrMimoService, cloudAsrMimoCluster, cloudAsrMimoModel, cloudAsrMimoLanguage, cloudAsrCustomEndpoint, cloudAsrCustomModel, cloudAsrCustomLanguage, cloudAsrBailianHost, cloudAsrGroqModel, cloudAsrGroqLanguage, cloudAsrDeepgramModel, cloudAsrDeepgramLanguage, cloudAsrDeepgramService, cloudAsrBailianModel, cloudAsrBailianLanguage, cloudAsrTencentAppId, cloudAsrTencentSecretId, cloudAsrTencentEngineType, cloudAsrTencentService, maxRecordingSeconds, voiceShortcutEnabled, voiceShortcut, voiceSoundsEnabled, settingsDisplayName, polishingEnabled, polishProvider, polishModel, polishReasoningEffort, polishPrompt]
    return {
      available: this.settingsView.available,
      writable: this.settingsView.writable,
      loaded: this.loaded,
      loadFailed: this.loadFailed,
      saving: this.saving,
      failed: this.failed,
      dirty: this.draftsController.isDirty(),
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
      cloudAsrGroqApiKeyClearPending: this.draftsController.isCredentialClearPending('cloudAsrGroqApiKey'),
      cloudAsrDeepgramApiKey,
      cloudAsrDeepgramApiKeyConfigured: this.settingsView.cloudAsrDeepgramApiKeyConfigured,
      cloudAsrDeepgramApiKeyClearPending: this.draftsController.isCredentialClearPending('cloudAsrDeepgramApiKey'),
      cloudAsrCustomApiKey,
      cloudAsrCustomApiKeyConfigured: this.settingsView.cloudAsrCustomApiKeyConfigured,
      cloudAsrCustomApiKeyClearPending: this.draftsController.isCredentialClearPending('cloudAsrCustomApiKey'),
      cloudAsrBailianApiKey,
      cloudAsrBailianApiKeyConfigured: this.settingsView.cloudAsrBailianApiKeyConfigured,
      cloudAsrBailianApiKeyClearPending: this.draftsController.isCredentialClearPending('cloudAsrBailianApiKey'),
      cloudAsrTencentSecretKey,
      cloudAsrTencentSecretKeyConfigured: this.settingsView.cloudAsrTencentSecretKeyConfigured,
      cloudAsrTencentSecretKeyClearPending: this.draftsController.isCredentialClearPending('cloudAsrTencentSecretKey'),
      cloudAsrMimoApiKey,
      cloudAsrMimoApiKeyConfigured: this.settingsView.cloudAsrMimoApiKeyConfigured,
      cloudAsrMimoApiKeyClearPending: this.draftsController.isCredentialClearPending('cloudAsrMimoApiKey'),
      cloudAsrMimoService,
      cloudAsrMimoCluster,
      cloudAsrMimoModel,
      cloudAsrMimoLanguage,
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
