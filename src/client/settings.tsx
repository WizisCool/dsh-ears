import { useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASR_BACKEND_IDS, WHISPER_MODEL_IDS, isCredentialReference, isHttpEndpoint, isValidRecordingLimit } from '../config.js'
import type { EarsSettings, PolishRoute } from '../config.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import type { AsrBackendInfo, EarsSettingsPatch, EarsSettingsView } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'
import styles from './SettingsSection.module.css'

export const LOCALE_NAMESPACE = 'settings.dshEars'

export const localeZh = {
  title: 'dsh-ear', nav: 'dsh-ear', description: '配置语音识别和可选的文本润色模型', tabs: '配置分组', groupRecognition: '识别', groupPolishing: '润色', backend: '识别后端', backendHint: '实时 Web Speech 适合即时反馈；本地 Whisper 和云端后端会在停止录音后转录。', webSpeechBackend: 'Web Speech（实时）', localWhisperBackend: '本地 Whisper（隐私优先）', cloudBackend: 'OpenAI-compatible 云端 ASR', localModel: 'Whisper 模型', localModelHint: '由 dsh Host 上的 whisper 命令运行；首次使用可能需要下载模型。', cloudEndpoint: '转录端点', cloudEndpointHint: '完整的 HTTP(S) /audio/transcriptions 端点；不要把密钥写进 URL。', cloudModel: '云端模型', cloudModelHint: '端点接受的转录模型名称，例如 whisper-1。', cloudCredentialRef: 'dsh 凭据引用', cloudCredentialRefHint: '只填写环境变量形状的引用，例如 OPENAI_API_KEY；插件不保存密钥。', backendUnavailable: '当前后端不可用：', localUnavailable: '请在 dsh Host 安装 openai-whisper，并确保 whisper 位于 PATH 中。', cloudUnavailable: '请配置转录端点和可选的 dsh 凭据引用。', language: '识别语言', languageHint: '浏览器语音识别和 ASR 后端使用的语言。默认使用简体中文。', recordingLimit: '单次录音上限（秒）', recordingLimitHint: '达到上限后会自动停止，范围为 1–600 秒。', polishing: '文本润色', polishingHint: '停止录音后，用已配置的 dsh 模型整理转写内容。', polishingOn: '启用', polishingOff: '关闭', provider: '润色模型提供方', providerHint: '选择 dsh 当前已接入的 provider。', model: '润色模型', modelHint: '选择该 provider 下的模型；插件不会保存凭据。', noModel: '不使用润色模型', loadingModels: '正在读取 dsh 模型列表…', noModels: '当前没有可用的 dsh 模型，请先在 dsh 中配置模型。', readOnly: '当前 dsh 设置提供方为只读，插件配置无法从此页面保存。请确认 dsh Host 使用可写的用户设置提供方。', save: '保存', saving: '保存中…', discard: '放弃修改', saveFailed: '保存失败，请重试。', invalid: '请检查设置值。'
} as const

export const localeEn = {
  title: 'dsh-ear', nav: 'dsh-ear', description: 'Configure speech recognition and optional text polishing', tabs: 'Configuration groups', groupRecognition: 'Recognition', groupPolishing: 'Polishing', backend: 'Recognition backend', backendHint: 'Web Speech gives live feedback; local Whisper and cloud backends transcribe after recording stops.', webSpeechBackend: 'Web Speech (live)', localWhisperBackend: 'Local Whisper (privacy-first)', cloudBackend: 'OpenAI-compatible cloud ASR', localModel: 'Whisper model', localModelHint: 'Runs the whisper command on the dsh Host; the first use may download a model.', cloudEndpoint: 'Transcription endpoint', cloudEndpointHint: 'Full HTTP(S) /audio/transcriptions endpoint; never put a key in the URL.', cloudModel: 'Cloud model', cloudModelHint: 'The transcription model accepted by the endpoint, such as whisper-1.', cloudCredentialRef: 'dsh credential reference', cloudCredentialRefHint: 'Use an environment-shaped reference such as OPENAI_API_KEY; the plugin never stores the key.', backendUnavailable: 'The selected backend is unavailable: ', localUnavailable: 'Install openai-whisper on the dsh Host and ensure whisper is on PATH.', cloudUnavailable: 'Configure a transcription endpoint and an optional dsh credential reference.', language: 'Recognition language', languageHint: 'Language used by browser speech recognition and ASR backends. Simplified Chinese is the default.', recordingLimit: 'Recording limit (seconds)', recordingLimitHint: 'Recording stops automatically at the limit, from 1 to 600 seconds.', polishing: 'Text polishing', polishingHint: 'After recording stops, use a dsh-configured model to clean up the transcript.', polishingOn: 'Enabled', polishingOff: 'Disabled', provider: 'Polishing provider', providerHint: 'Choose a provider already connected to dsh.', model: 'Polishing model', modelHint: 'Choose a model under that provider; the plugin never stores credentials.', noModel: 'Do not polish', loadingModels: 'Loading dsh model list…', noModels: 'No dsh models are available. Configure a model in dsh first.', readOnly: 'The current dsh settings provider is read-only, so plugin configuration cannot be saved from this page. Make sure the dsh Host uses a writable user settings provider.', save: 'Save', saving: 'Saving…', discard: 'Discard', saveFailed: 'Save failed. Try again.', invalid: 'Check the setting values.'
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
  dirty: boolean
  invalid: boolean
  saving: boolean
  failed: boolean
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
}

export interface RouteState { status: 'loading' | 'ready'; routes: readonly PolishRoute[] }
export interface BackendState { status: 'loading' | 'ready'; backends: readonly AsrBackendInfo[] }
export type EarsSettingsHook = SnapshotSelectorHook<EarsSettings>
export type EarsCardHook = SnapshotSelectorHook<EarsCardState>
export type RouteHook = SnapshotSelectorHook<RouteState>
export type BackendHook = SnapshotSelectorHook<BackendState>

interface EarsSettingsSectionProps {
  readonly useEarsCard: EarsCardHook
  readonly useEarsRoutes: RouteHook
  readonly useEarsBackends: BackendHook
  readonly earsT: Translate
  readonly edit: (field: FieldName, text: string) => void
  readonly save: () => void
  readonly discard: () => void
}

export class EarsSettingsController {
  private readonly remote: EarsRemote
  private readonly settingsStore: SnapshotStore<EarsSettings>
  private readonly cardStore: SnapshotStore<EarsCardState>
  private readonly routeStore: SnapshotStore<RouteState>
  private readonly backendStore: SnapshotStore<BackendState>
  private readonly drafts = new Map<FieldName, string>()
  private settingsView: EarsSettingsView = { available: true, writable: false, settings: DEFAULT_EARS_SETTINGS, overridden: [] }
  private routeState: RouteState = { status: 'loading', routes: [] }
  private backendState: BackendState = { status: 'loading', backends: [] }
  private saving = false
  private failed = false

  constructor(remote: EarsRemote) {
    this.remote = remote
    this.settingsStore = createSnapshotStore(DEFAULT_EARS_SETTINGS)
    this.cardStore = createSnapshotStore(this.snapshot())
    this.routeStore = createSnapshotStore(this.routeState)
    this.backendStore = createSnapshotStore(this.backendState)
  }

  getSettingsStore(): SnapshotStore<EarsSettings> { return this.settingsStore }
  getCardStore(): SnapshotStore<EarsCardState> { return this.cardStore }
  getRouteStore(): SnapshotStore<RouteState> { return this.routeStore }
  getBackendStore(): SnapshotStore<BackendState> { return this.backendStore }

  actions() {
    return {
      edit: (field: FieldName, text: string) => this.edit(field, text),
      save: () => void this.save(),
      discard: () => this.discard()
    }
  }

  async refreshSettings(): Promise<void> {
    try {
      const result = await this.remote.getSettings()
      if (result.ok) {
        this.settingsView = result.value
        this.settingsStore.set(result.value.settings)
      }
    } catch {
      // Keep the read-only default until the Host config RPC is available.
    }
    this.publishCard()
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

  private edit(field: FieldName, text: string): void {
    this.drafts.set(field, text)
    this.failed = false
    this.publishCard()
  }

  private discard(): void {
    this.drafts.clear()
    this.failed = false
    this.publishCard()
  }

  private async save(): Promise<void> {
    const state = this.snapshot()
    if (!state.dirty || state.invalid || !state.writable || this.saving) return
    const patch: EarsSettingsPatch = {}
    for (const [field, text] of this.drafts) {
      const value = parseField(field, text)
      if (value !== undefined) (patch as Record<string, unknown>)[field] = value
    }
    this.saving = true
    this.failed = false
    this.publishCard()
    try {
      const result = await this.remote.updateSettings(patch)
      if (!result.ok) throw new Error('dsh-ears settings update failed')
      this.settingsView = result.value
      this.settingsStore.set(result.value.settings)
      this.drafts.clear()
      void this.refreshBackends()
    } catch {
      this.failed = true
    } finally {
      this.saving = false
      this.publishCard()
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
    const routeInvalid = (polishProvider.text === '') !== (polishModel.text === '')
    const cloudConfigInvalid = asrBackend.text === 'cloud-openai' && (cloudAsrEndpoint.text.trim() === '' || cloudAsrEndpoint.invalid || cloudAsrModel.text.trim() === '' || cloudAsrCredentialRef.invalid)
    return {
      available: this.settingsView.available,
      writable: this.settingsView.writable,
      dirty: this.drafts.size > 0,
      invalid: asrBackend.invalid || localWhisperModel.invalid || cloudConfigInvalid || language.invalid || maxRecordingSeconds.invalid || polishingEnabled.invalid || polishProvider.invalid || polishModel.invalid || routeInvalid,
      saving: this.saving,
      failed: this.failed,
      asrBackend,
      localWhisperModel,
      cloudAsrEndpoint: { ...cloudAsrEndpoint, invalid: cloudAsrEndpoint.invalid || cloudConfigInvalid },
      cloudAsrModel: { ...cloudAsrModel, invalid: cloudAsrModel.invalid || cloudConfigInvalid },
      cloudAsrCredentialRef: { ...cloudAsrCredentialRef, invalid: cloudAsrCredentialRef.invalid || cloudConfigInvalid },
      language,
      maxRecordingSeconds,
      polishingEnabled,
      polishProvider: { ...polishProvider, invalid: polishProvider.invalid || routeInvalid },
      polishModel: { ...polishModel, invalid: polishModel.invalid || routeInvalid }
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
      {!state.writable ? <p className={styles.notice}>{t('readOnly')}</p> : null}
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
          <div className={styles.group}>
            <SelectField label={t('backend')} hint={t('backendHint')} state={state.asrBackend} disabled={!state.writable} value={state.asrBackend.text} onChange={(event) => props.edit('asrBackend', event.target.value)} options={backendOptions} />
            {selectedBackend && !selectedBackend.available ? <p className={styles.statusError}>{t('backendUnavailable')}{backendUnavailableDetail(selectedBackend, t)}</p> : null}
            {state.asrBackend.text === 'local-whisper' ? <SelectField label={t('localModel')} hint={t('localModelHint')} state={state.localWhisperModel} disabled={!state.writable} value={state.localWhisperModel.text} onChange={(event) => props.edit('localWhisperModel', event.target.value)} options={WHISPER_MODEL_IDS.map((model) => [model, model] as [string, string])} /> : null}
            {state.asrBackend.text === 'cloud-openai' ? <>
              <TextField label={t('cloudEndpoint')} hint={t('cloudEndpointHint')} state={state.cloudAsrEndpoint} disabled={!state.writable} onChange={(event) => props.edit('cloudAsrEndpoint', event.target.value)} />
              <TextField label={t('cloudModel')} hint={t('cloudModelHint')} state={state.cloudAsrModel} disabled={!state.writable} onChange={(event) => props.edit('cloudAsrModel', event.target.value)} />
              <TextField label={t('cloudCredentialRef')} hint={t('cloudCredentialRefHint')} state={state.cloudAsrCredentialRef} disabled={!state.writable} onChange={(event) => props.edit('cloudAsrCredentialRef', event.target.value)} />
            </> : null}
            <TextField label={t('language')} hint={t('languageHint')} state={state.language} disabled={!state.writable} onChange={(event) => props.edit('language', event.target.value)} />
            <TextField label={t('recordingLimit')} hint={t('recordingLimitHint')} state={state.maxRecordingSeconds} disabled={!state.writable} numeric onChange={(event) => props.edit('maxRecordingSeconds', event.target.value)} />
          </div>
        </div>
      ) : (
        <div id={`${tabsId}-panel-polishing`} role="tabpanel" aria-labelledby={`${tabsId}-tab-polishing`} className={styles.panel}>
          <div className={styles.group}>
            <SelectField label={t('polishing')} hint={t('polishingHint')} state={state.polishingEnabled} disabled={!state.writable} value={state.polishingEnabled.text} onChange={(event) => props.edit('polishingEnabled', event.target.value)} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} />
            <SelectField label={t('provider')} hint={t('providerHint')} state={state.polishProvider} disabled={!state.writable || routes.status === 'loading'} value={state.polishProvider.text} onChange={(event) => props.edit('polishProvider', event.target.value)} options={[['', t('noModel')], ...providerOptions.map((provider) => [provider.provider, `${provider.providerName} (${provider.provider})`] as [string, string])]} />
            <SelectField label={t('model')} hint={routes.status === 'loading' ? t('loadingModels') : modelOptions.length === 0 ? t('noModels') : t('modelHint')} state={state.polishModel} disabled={!state.writable || state.polishProvider.text === '' || routes.status === 'loading'} value={modelValueIsKnown ? state.polishModel.text : ''} onChange={(event) => props.edit('polishModel', event.target.value)} options={[['', t('noModel')], ...(modelValueIsKnown ? [] : state.polishModel.text === '' ? [] : [['', state.polishModel.text] as [string, string]]), ...modelOptions.map((model) => [model.model, `${model.modelName} (${model.model})`] as [string, string])]} />
          </div>
        </div>
      )}
      {state.invalid ? <p className={styles.statusError}>{t('invalid')}</p> : null}
      <div className={styles.footer}>{state.failed ? <p className={styles.footerMessage}>{t('saveFailed')}</p> : null}<Button className={styles.footerButton} variant="outline" size="sm" disabled={!state.dirty || state.saving} onClick={props.discard}>{t('discard')}</Button><Button className={styles.footerButton} variant="primary" size="sm" disabled={!state.dirty || state.invalid || state.saving || !state.writable} onClick={props.save}>{t(state.saving ? 'saving' : 'save')}</Button></div>
    </section>
  )
}

function TextField({ label, hint, state, disabled, numeric, onChange }: { label: string; hint: string; state: FieldState; disabled: boolean; numeric?: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className={styles.field}><span className={styles.fieldLabel}>{label}</span><Input className={styles.control} type={numeric ? 'number' : 'text'} value={state.text} disabled={disabled} aria-invalid={state.invalid} onChange={onChange} /><span className={`${styles.hint} ${state.invalid ? styles.invalid : ''}`}>{hint}</span></label>
}

function SelectField({ label, hint, state, disabled, value, options, onChange }: { label: string; hint: string; state: FieldState; disabled: boolean; value: string; options: [string, string][]; onChange: (event: ChangeEvent<HTMLSelectElement>) => void }) {
  return <label className={styles.field}><span className={styles.fieldLabel}>{label}</span><select className={styles.control} value={value} disabled={disabled} aria-invalid={state.invalid} onChange={onChange}>{options.map(([optionValue, optionLabel]) => <option key={`${optionValue}:${optionLabel}`} value={optionValue}>{optionLabel}</option>)}</select><span className={`${styles.hint} ${state.invalid ? styles.invalid : ''}`}>{hint}</span></label>
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
  if (field === 'polishProvider' || field === 'polishModel') return false
  if (field === 'polishingEnabled') return text !== 'on' && text !== 'off'
  const value = Number(text)
  return !isValidRecordingLimit(value)
}
