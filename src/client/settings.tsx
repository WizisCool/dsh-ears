import { useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASR_BACKEND_IDS, WHISPER_MODEL_IDS, isCredentialReference, isHttpEndpoint, isValidRecordingLimit } from '../config.js'
import type { EarsSettings, PolishRoute, ReasoningEffortInfo } from '../config.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import type { AsrBackendInfo, EarsSettingsPatch, EarsSettingsView } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'
import styles from './SettingsSection.module.css'

export const LOCALE_NAMESPACE = 'settings.dshEars'

export const localeZh = {
  title: 'dsh-ear', nav: 'dsh-ear', description: '配置语音识别和可选的文本润色模型', tabs: '配置分组', groupRecognition: '识别', groupPolishing: '润色', backend: '识别后端', backendHintWebSpeech: '浏览器内置的实时识别；识别服务可能由浏览器厂商提供，并非本地识别。', backendHintLocalWhisper: '停止录音后由 dsh Host 的 whisper 命令转录；模型权重由本机安装管理。', backendHintCloudOpenai: '停止录音后通过你配置的 HTTP(S) 端点转录。', webSpeechBackend: 'Web Speech', localWhisperBackend: '本地 Whisper', cloudBackend: '云端 ASR', localModel: 'Whisper 模型', localModelHint: '由 dsh Host 上的 whisper 命令运行；首次使用可能需要下载模型。', cloudEndpoint: '转录端点', cloudEndpointHint: '完整的 HTTP(S) /audio/transcriptions 端点；不要把密钥写进 URL。', cloudModel: '云端模型', cloudModelHint: '端点接受的转录模型名称，例如 whisper-1。', cloudCredentialRef: 'dsh 凭据引用', cloudCredentialRefHint: '只填写环境变量形状的引用，例如 OPENAI_API_KEY；插件不保存密钥。', backendUnavailable: '当前后端不可用：', localUnavailable: '请在 dsh Host 安装 openai-whisper，并确保 whisper 位于 PATH 中。', cloudUnavailable: '请配置转录端点和可选的 dsh 凭据引用。', language: '识别语言', languageHint: '浏览器语音识别和 ASR 后端使用的语言。默认使用简体中文。', recordingLimit: '单次录音上限（秒）', recordingLimitHint: '达到上限后会自动停止，范围为 1–600 秒。', polishing: '文本润色', polishingHint: '将识别后的文本润色、整理。', polishingOn: '开启', polishingOff: '关闭', provider: '模型提供方', providerHint: '选择已接入的模型提供商', model: '模型', modelHint: '选择该 provider 下的模型', reasoningEffort: '推理强度', reasoningEffortHint: '选择该模型支持的推理强度；留空使用模型默认值。', reasoningOff: '关闭', defaultEffort: '使用模型默认', noModel: '不使用润色模型', loadingModels: '正在读取 dsh 模型列表…', noModels: '当前没有可用的 dsh 模型，请先在 dsh 中配置模型。', readOnly: '当前 dsh 设置提供方为只读，插件配置无法从此页面保存。请确认 dsh Host 使用可写的用户设置提供方。', loadFailed: '无法读取插件配置，请重启 dsh web 后刷新此页面。', saveFailed: '保存失败，修改已保留，再次修改即可重试。', invalid: '请检查设置有误的字段。'
} as const

export const localeEn = {
  title: 'dsh-ear', nav: 'dsh-ear', description: 'Configure speech recognition and optional text polishing', tabs: 'Configuration groups', groupRecognition: 'Recognition', groupPolishing: 'Polishing', backend: 'Recognition backend', backendHintWebSpeech: 'Browser-provided live recognition; the recognition service may come from the browser vendor rather than running locally.', backendHintLocalWhisper: 'Transcribed by the whisper command on the dsh Host after recording stops; model weights are managed by the local installation.', backendHintCloudOpenai: 'Transcribed through your configured HTTP(S) endpoint after recording stops.', webSpeechBackend: 'Web Speech', localWhisperBackend: 'Local Whisper', cloudBackend: 'Cloud ASR', localModel: 'Whisper model', localModelHint: 'Runs the whisper command on the dsh Host; the first use may download a model.', cloudEndpoint: 'Transcription endpoint', cloudEndpointHint: 'Full HTTP(S) /audio/transcriptions endpoint; never put a key in the URL.', cloudModel: 'Cloud model', cloudModelHint: 'The transcription model accepted by the endpoint, such as whisper-1.', cloudCredentialRef: 'dsh credential reference', cloudCredentialRefHint: 'Use an environment-shaped reference such as OPENAI_API_KEY; the plugin never stores the key.', backendUnavailable: 'The selected backend is unavailable: ', localUnavailable: 'Install openai-whisper on the dsh Host and ensure whisper is on PATH.', cloudUnavailable: 'Configure a transcription endpoint and an optional dsh credential reference.', language: 'Recognition language', languageHint: 'Language used by browser speech recognition and ASR backends. Simplified Chinese is the default.', recordingLimit: 'Recording limit (seconds)', recordingLimitHint: 'Recording stops automatically at the limit, from 1 to 600 seconds.', polishing: 'Text polishing', polishingHint: 'Polish and tidy the recognized text.', polishingOn: 'On', polishingOff: 'Off', provider: 'Provider', providerHint: 'Choose a connected model provider', model: 'Model', modelHint: 'Choose a model under that provider', reasoningEffort: 'Reasoning effort', reasoningEffortHint: 'Choose a reasoning effort supported by this model; leave empty for the model default.', reasoningOff: 'Off', defaultEffort: 'Model default', noModel: 'Do not polish', loadingModels: 'Loading dsh model list…', noModels: 'No dsh models are available. Configure a model in dsh first.', readOnly: 'The current dsh settings provider is read-only, so plugin configuration cannot be saved from this page. Make sure the dsh Host uses a writable user settings provider.', loadFailed: 'Could not load the plugin configuration. Restart dsh web and refresh this page.', saveFailed: 'Save failed. Your changes are kept; edit again to retry.', invalid: 'Check the fields with invalid values.'
} as const

type LocaleKey = keyof typeof localeEn
type Translate = (key: LocaleKey) => string
type FieldName = keyof EarsSettings

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.dshEars': LocaleKey
  }
}

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
export type EarsSettingsHook = SnapshotSelectorHook<EarsSettings>
export type EarsCardHook = SnapshotSelectorHook<EarsCardState>
export type RouteHook = SnapshotSelectorHook<RouteState>
export type BackendHook = SnapshotSelectorHook<BackendState>
export type ReasoningEffortsHook = SnapshotSelectorHook<ReasoningEffortsState>

interface EarsSettingsSectionProps {
  readonly useEarsCard: EarsCardHook
  readonly useEarsRoutes: RouteHook
  readonly useEarsBackends: BackendHook
  readonly useEarsReasoning: ReasoningEffortsHook
  readonly earsT: Translate
  readonly edit: (field: FieldName, text: string) => void
}

const AUTO_SAVE_DELAY_MS = 400

export class EarsSettingsController {
  private readonly remote: EarsRemote
  private readonly settingsStore: SnapshotStore<EarsSettings>
  private readonly cardStore: SnapshotStore<EarsCardState>
  private readonly routeStore: SnapshotStore<RouteState>
  private readonly backendStore: SnapshotStore<BackendState>
  private readonly reasoningStore: SnapshotStore<ReasoningEffortsState>
  private readonly drafts = new Map<FieldName, string>()
  private settingsView: EarsSettingsView = { available: true, writable: false, settings: DEFAULT_EARS_SETTINGS, overridden: [] }
  private routeState: RouteState = { status: 'loading', routes: [] }
  private backendState: BackendState = { status: 'loading', backends: [] }
  private reasoningState: ReasoningEffortsState = { status: 'loading', efforts: [] }
  private saving = false
  private loaded = false
  private failed = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private saveTimer: ReturnType<typeof setTimeout> | undefined

  constructor(remote: EarsRemote) {
    this.remote = remote
    this.settingsStore = createSnapshotStore(DEFAULT_EARS_SETTINGS)
    this.cardStore = createSnapshotStore(this.snapshot())
    this.routeStore = createSnapshotStore(this.routeState)
    this.backendStore = createSnapshotStore(this.backendState)
    this.reasoningStore = createSnapshotStore(this.reasoningState)
  }

  getSettingsStore(): SnapshotStore<EarsSettings> { return this.settingsStore }
  getCardStore(): SnapshotStore<EarsCardState> { return this.cardStore }
  getRouteStore(): SnapshotStore<RouteState> { return this.routeStore }
  getBackendStore(): SnapshotStore<BackendState> { return this.backendStore }
  getReasoningStore(): SnapshotStore<ReasoningEffortsState> { return this.reasoningStore }

  actions() {
    return {
      edit: (field: FieldName, text: string) => this.edit(field, text)
    }
  }

  dispose(): void {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = undefined
    if (this.retryTimer !== undefined) clearTimeout(this.retryTimer)
    this.retryTimer = undefined
  }

  async refreshSettings(): Promise<void> {
    try {
      const result = await this.remote.getSettings()
      if (result.ok) {
        this.settingsView = result.value
        this.settingsStore.set(result.value.settings)
        this.loaded = true
        this.publishCard()
        void this.refreshReasoningEfforts()
        return
      }
    } catch {
      // Fall through to the not-loaded retry path.
    }
    this.publishCard()
    void this.refreshReasoningEfforts()
    if (!this.loaded && this.retryTimer === undefined) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = undefined
        void this.refreshSettings()
      }, 1500)
    }
  }

  async refreshRoutes(): Promise<void> {
    this.routeState = { status: 'loading', routes: [] }
    this.routeStore.set(this.routeState)
    try {
      const result = await this.remote.listRoutes()
      this.routeState = result.ok ? { status: 'ready', routes: result.value } : { status: 'ready', routes: [] }
    } catch {
      this.routeState = { status: 'ready', routes: [] }
    }
    this.routeStore.set(this.routeState)
  }

  async refreshBackends(): Promise<void> {
    this.backendState = { status: 'loading', backends: [] }
    this.backendStore.set(this.backendState)
    try {
      const result = await this.remote.listAsrBackends()
      this.backendState = result.ok ? { status: 'ready', backends: result.value } : { status: 'ready', backends: [] }
    } catch {
      this.backendState = { status: 'ready', backends: [] }
    }
    this.backendStore.set(this.backendState)
  }

  async refreshReasoningEfforts(): Promise<void> {
    this.reasoningState = { status: 'loading', efforts: [] }
    this.reasoningStore.set(this.reasoningState)
    const provider = (this.drafts.get('polishProvider') ?? this.settingsView.settings.polishProvider).trim()
    const model = (this.drafts.get('polishModel') ?? this.settingsView.settings.polishModel).trim()
    if (provider === '' || model === '') {
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
    this.reasoningStore.set(this.reasoningState)
  }

  private edit(field: FieldName, text: string): void {
    if (field === 'polishProvider') {
      this.drafts.set('polishModel', '')
      this.drafts.set('polishReasoningEffort', '')
    }
    this.drafts.set(field, text)
    this.failed = false
    this.publishCard()
    this.scheduleSave()
    if (field === 'polishProvider' || field === 'polishModel') void this.refreshReasoningEfforts()
  }

  private scheduleSave(): void {
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined
      void this.save()
    }, AUTO_SAVE_DELAY_MS)
  }

  private async save(): Promise<void> {
    if (this.saving || !this.settingsView.writable) return
    const providerText = this.drafts.get('polishProvider') ?? this.settingsView.settings.polishProvider
    const modelText = this.drafts.get('polishModel') ?? this.settingsView.settings.polishModel
    const polishingEnabledText = this.drafts.get('polishingEnabled') ?? (this.settingsView.settings.polishingEnabled ? 'on' : 'off')
    const routeInvalid = polishingEnabledText === 'on' && (providerText === '') !== (modelText === '')
    const patch: EarsSettingsPatch = {}
    for (const [field, text] of this.drafts) {
      if (field === 'polishProvider' || field === 'polishModel') {
        if (routeInvalid) continue
      } else if (isInvalid(field, text)) {
        continue
      }
      const value = parseField(field, text)
      if (value !== undefined) (patch as Record<string, unknown>)[field] = value
    }
    if (Object.keys(patch).length === 0) return
    this.saving = true
    this.failed = false
    this.publishCard()
    try {
      const result = await this.remote.updateSettings(patch)
      if (!result.ok) throw new Error('dsh-ears settings update failed')
      this.settingsView = result.value
      this.settingsStore.set(result.value.settings)
      for (const field of Object.keys(patch)) this.drafts.delete(field as FieldName)
      void this.refreshBackends()
    } catch {
      this.failed = true
    } finally {
      this.saving = false
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
    const routeInvalid = polishingEnabled.text === 'on' && (polishProvider.text === '') !== (polishModel.text === '')
    const cloudConfigInvalid = asrBackend.text === 'cloud-openai' && (cloudAsrEndpoint.text.trim() === '' || cloudAsrEndpoint.invalid || cloudAsrModel.text.trim() === '' || cloudAsrCredentialRef.invalid)
    return {
      available: this.settingsView.available,
      writable: this.settingsView.writable,
      loaded: this.loaded,
      saving: this.saving,
      failed: this.failed,
      invalid: asrBackend.invalid || localWhisperModel.invalid || cloudConfigInvalid || language.invalid || maxRecordingSeconds.invalid || polishingEnabled.invalid || polishProvider.invalid || polishModel.invalid || polishReasoningEffort.invalid || routeInvalid,
      asrBackend,
      localWhisperModel,
      cloudAsrEndpoint: { ...cloudAsrEndpoint, invalid: cloudAsrEndpoint.invalid || cloudConfigInvalid },
      cloudAsrModel: { ...cloudAsrModel, invalid: cloudAsrModel.invalid || cloudConfigInvalid },
      cloudAsrCredentialRef: { ...cloudAsrCredentialRef, invalid: cloudAsrCredentialRef.invalid || cloudConfigInvalid },
      language,
      maxRecordingSeconds,
      polishingEnabled,
      polishProvider: { ...polishProvider, invalid: polishProvider.invalid || routeInvalid },
      polishModel: { ...polishModel, invalid: polishModel.invalid || routeInvalid },
      polishReasoningEffort
    }
  }
}

export function createSettingsHook(store: SnapshotStore<EarsSettings>): EarsSettingsHook {
  return function useEarsSettings<S>(selector: (settings: EarsSettings) => S): S {
    return useSyncExternalStore((listener) => store.subscribe(listener), () => selector(store.getSnapshot()), () => selector(DEFAULT_EARS_SETTINGS))
  }
}

export function EarsSettingsSection(props: EarsSettingsSectionProps): ReactNode {
  const state = props.useEarsCard((snapshot) => snapshot)
  const routes = props.useEarsRoutes((snapshot) => snapshot)
  const backends = props.useEarsBackends((snapshot) => snapshot)
  const reasoning = props.useEarsReasoning((snapshot) => snapshot)
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeTab, setActiveTab] = useState<'recognition' | 'polishing'>('recognition')
  const t = props.earsT
  if (!state.available) return null
  const providerOptions = uniqueProviders(routes.routes)
  const modelOptions = routes.routes.filter((route) => route.provider === state.polishProvider.text)
  const modelValueIsKnown = modelOptions.some((route) => route.model === state.polishModel.text)
  const selectedBackend = backends.backends.find((backend) => backend.id === state.asrBackend.text)
  const backendOptions: [string, string][] = [
    ['web-speech', t('webSpeechBackend')],
    ['local-whisper', t('localWhisperBackend')],
    ['cloud-openai', t('cloudBackend')]
  ]
  const tabs: Array<{ id: 'recognition' | 'polishing'; label: string }> = [
    { id: 'recognition', label: t('groupRecognition') },
    { id: 'polishing', label: t('groupPolishing') }
  ]
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.intro}>{t('description')}</p>
      {!state.loaded ? <p className={styles.notice} role="alert">{t('loadFailed')}</p> : !state.writable ? <p className={styles.notice}>{t('readOnly')}</p> : null}
      <div className={styles.tabs} role="tablist" aria-label={t('tabs')}>
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab
          return (
            <button key={tab.id} ref={(element) => { tabRefs.current[index] = element }} id={`${tabsId}-tab-${tab.id}`} type="button" role="tab" className={styles.tab} aria-selected={selected} aria-controls={`${tabsId}-panel-${tab.id}`} data-active={selected ? 'true' : undefined} tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                let nextIndex: number
                switch (event.key) {
                  case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break
                  case 'ArrowLeft': nextIndex = (index - 1 + tabs.length) % tabs.length; break
                  case 'Home': nextIndex = 0; break
                  case 'End': nextIndex = tabs.length - 1; break
                  default: return
                }
                event.preventDefault()
                const nextTab = tabs[nextIndex]
                setActiveTab(nextTab.id)
                tabRefs.current[nextIndex]?.focus()
              }}>
              {tab.label}
            </button>
          )
        })}
      </div>
      {activeTab === 'recognition' ? (
        <div id={`${tabsId}-panel-recognition`} role="tabpanel" aria-labelledby={`${tabsId}-tab-recognition`} className={styles.panel}>
          <SelectRow label={t('backend')} hint={backendHint(state.asrBackend.text, t)} value={state.asrBackend.text} options={backendOptions} disabled={!state.writable} invalid={state.asrBackend.invalid} onChange={(value) => props.edit('asrBackend', value)} />
          {selectedBackend && !selectedBackend.available ? <p className={styles.statusError}>{t('backendUnavailable')}{backendUnavailableDetail(selectedBackend, t)}</p> : null}
          {state.asrBackend.text === 'local-whisper' ? <SelectRow label={t('localModel')} hint={t('localModelHint')} value={state.localWhisperModel.text} options={WHISPER_MODEL_IDS.map((model) => [model, model] as [string, string])} disabled={!state.writable} invalid={state.localWhisperModel.invalid} onChange={(value) => props.edit('localWhisperModel', value)} /> : null}
          {state.asrBackend.text === 'cloud-openai' ? <>
            <TextRow label={t('cloudEndpoint')} hint={t('cloudEndpointHint')} value={state.cloudAsrEndpoint.text} disabled={!state.writable} invalid={state.cloudAsrEndpoint.invalid} onChange={(event) => props.edit('cloudAsrEndpoint', event.target.value)} />
            <TextRow label={t('cloudModel')} hint={t('cloudModelHint')} value={state.cloudAsrModel.text} disabled={!state.writable} invalid={state.cloudAsrModel.invalid} onChange={(event) => props.edit('cloudAsrModel', event.target.value)} />
            <TextRow label={t('cloudCredentialRef')} hint={t('cloudCredentialRefHint')} value={state.cloudAsrCredentialRef.text} disabled={!state.writable} invalid={state.cloudAsrCredentialRef.invalid} onChange={(event) => props.edit('cloudAsrCredentialRef', event.target.value)} />
          </> : null}
          <TextRow label={t('language')} hint={t('languageHint')} value={state.language.text} disabled={!state.writable} invalid={state.language.invalid} onChange={(event) => props.edit('language', event.target.value)} />
          <TextRow label={t('recordingLimit')} hint={t('recordingLimitHint')} value={state.maxRecordingSeconds.text} disabled={!state.writable} invalid={state.maxRecordingSeconds.invalid} numeric onChange={(event) => props.edit('maxRecordingSeconds', event.target.value)} />
        </div>
      ) : (
        <div id={`${tabsId}-panel-polishing`} role="tabpanel" aria-labelledby={`${tabsId}-tab-polishing`} className={styles.panel}>
          <SelectRow label={t('polishing')} hint={t('polishingHint')} value={state.polishingEnabled.text} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} disabled={!state.writable} invalid={state.polishingEnabled.invalid} onChange={(value) => props.edit('polishingEnabled', value)} />
          <SelectRow label={t('provider')} hint={t('providerHint')} value={state.polishProvider.text} options={[['', t('noModel')], ...providerOptions.map((provider) => [provider.provider, provider.providerName] as [string, string])]} disabled={!state.writable || routes.status === 'loading'} invalid={state.polishProvider.invalid} onChange={(value) => props.edit('polishProvider', value)} />
          <SelectRow label={t('model')} hint={routes.status === 'loading' ? t('loadingModels') : modelOptions.length === 0 ? t('noModels') : t('modelHint')} value={modelValueIsKnown ? state.polishModel.text : ''} options={[['', t('noModel')], ...modelOptions.map((model) => [model.model, model.modelName] as [string, string])]} disabled={!state.writable || state.polishProvider.text === '' || routes.status === 'loading'} invalid={state.polishModel.invalid} onChange={(value) => props.edit('polishModel', value)} />
          {state.polishingEnabled.text === 'on' && state.polishProvider.text !== '' && state.polishModel.text !== '' && (reasoning.status === 'loading' || reasoning.efforts.length > 0) ? (
            <SelectRow label={t('reasoningEffort')} hint={t('reasoningEffortHint')} value={reasoning.efforts.some((effort) => effort.id === state.polishReasoningEffort.text) ? state.polishReasoningEffort.text : ''} options={[['', t('defaultEffort')], ...reasoning.efforts.map((effort) => [effort.id, effort.id === 'off' ? t('reasoningOff') : effort.name] as [string, string])]} disabled={!state.writable || reasoning.status === 'loading'} invalid={state.polishReasoningEffort.invalid} onChange={(value) => props.edit('polishReasoningEffort', value)} />
          ) : null}
        </div>
      )}
      <div className={styles.footer}>
        {state.failed ? <p className={styles.footerStatus} data-kind="error" role="alert">{t('saveFailed')}</p> : null}
        {!state.failed && state.invalid ? <p className={styles.footerStatus} data-kind="error">{t('invalid')}</p> : null}
      </div>
    </section>
  )
}

function RowField({ label, hint, invalid, children }: { label: string; hint: string; invalid: boolean; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{label}</div>
        <div className={`${styles.rowDesc} ${invalid ? styles.invalid : ''}`}>{hint}</div>
      </div>
      {children}
    </div>
  )
}

function SelectRow({ label, hint, value, options, disabled, invalid, onChange }: { label: string; hint: string; value: string; options: [string, string][]; disabled: boolean; invalid: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(([optionValue]) => optionValue === value)
  const labelText = selected === undefined ? value : selected[1]
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={options.map(([id, optionLabel]) => ({ id, label: optionLabel }))}
        selectedId={value}
        onSelect={(id) => {
          setOpen(false)
          if (id === value) return
          onChange(id)
        }}
        align="end"
        portal
        anchor={
          <button type="button" className={styles.selector} aria-haspopup="menu" aria-expanded={open} aria-invalid={invalid} disabled={disabled} onClick={() => setOpen((current) => !current)}>
            {labelText}
            <IconChevronDownOutline14 className={styles.chevron} />
          </button>
        }
      />
    </RowField>
  )
}

function TextRow({ label, hint, value, disabled, invalid, numeric, onChange }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; numeric?: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <Input className={styles.textInput} type={numeric ? 'number' : 'text'} value={value} disabled={disabled} aria-invalid={invalid} onChange={onChange} />
    </RowField>
  )
}

function uniqueProviders(routes: readonly PolishRoute[]): PolishRoute[] {
  const seen = new Set<string>()
  return routes.filter((route) => {
    if (seen.has(route.provider)) return false
    seen.add(route.provider)
    return true
  })
}

function backendUnavailableDetail(backend: AsrBackendInfo, t: Translate): string {
  if (backend.id === 'local-whisper') return t('localUnavailable')
  if (backend.id === 'cloud-openai') return t('cloudUnavailable')
  return backend.detail
}

function backendHint(backend: string, t: Translate): string {
  if (backend === 'local-whisper') return t('backendHintLocalWhisper')
  if (backend === 'cloud-openai') return t('backendHintCloudOpenai')
  return t('backendHintWebSpeech')
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
