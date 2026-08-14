import { useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconChevronDownOutline14, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EarsSettings, PolishRoute } from '../config.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import type { EarsSettingsPatch, EarsSettingsView } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'
import styles from './SettingsCard.module.css'

export const LOCALE_NAMESPACE = 'settings.dshEars'

export const localeZh = {
  title: '语音输入', description: '配置语音识别和可选的文本润色模型', language: '识别语言', languageHint: '浏览器语音识别使用的语言。默认使用简体中文。', recordingLimit: '单次录音上限（秒）', recordingLimitHint: '达到上限后会自动停止，范围为 1–600 秒。', polishing: '文本润色', polishingHint: '停止录音后，用已配置的 dsh 模型整理转写内容。', polishingOn: '启用', polishingOff: '关闭', provider: '润色模型提供方', providerHint: '选择 dsh 当前已接入的 provider。', model: '润色模型', modelHint: '选择该 provider 下的模型；插件不会保存凭据。', noModel: '不使用润色模型', loadingModels: '正在读取 dsh 模型列表…', noModels: '当前没有可用的 dsh 模型，请先在 dsh 中配置模型。', readOnly: '当前 dsh 配置为只读。', unsaved: '未保存', save: '保存', saving: '保存中…', discard: '放弃修改', saveFailed: '保存失败，请重试。', invalid: '请检查设置值。', expand: '展开', collapse: '收起'
} as const

export const localeEn = {
  title: 'Voice input', description: 'Configure speech recognition and optional text polishing', language: 'Recognition language', languageHint: 'Language used by browser speech recognition. Simplified Chinese is the default.', recordingLimit: 'Recording limit (seconds)', recordingLimitHint: 'Recording stops automatically at the limit, from 1 to 600 seconds.', polishing: 'Text polishing', polishingHint: 'After recording stops, use a dsh-configured model to clean up the transcript.', polishingOn: 'Enabled', polishingOff: 'Disabled', provider: 'Polishing provider', providerHint: 'Choose a provider already connected to dsh.', model: 'Polishing model', modelHint: 'Choose a model under that provider; the plugin never stores credentials.', noModel: 'Do not polish', loadingModels: 'Loading dsh model list…', noModels: 'No dsh models are available. Configure a model in dsh first.', readOnly: 'This dsh configuration is read-only.', unsaved: 'Unsaved', save: 'Save', saving: 'Saving…', discard: 'Discard', saveFailed: 'Save failed. Try again.', invalid: 'Check the setting values.', expand: 'Expand', collapse: 'Collapse'
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
  language: FieldState
  maxRecordingSeconds: FieldState
  polishingEnabled: FieldState
  polishProvider: FieldState
  polishModel: FieldState
}

export interface RouteState { status: 'loading' | 'ready'; routes: readonly PolishRoute[] }
export type EarsSettingsHook = SnapshotSelectorHook<EarsSettings>
export type EarsCardHook = SnapshotSelectorHook<EarsCardState>
export type RouteHook = SnapshotSelectorHook<RouteState>

interface EarsSettingsCardProps {
  readonly useEarsCard: EarsCardHook
  readonly useEarsRoutes: RouteHook
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
  private readonly drafts = new Map<FieldName, string>()
  private settingsView: EarsSettingsView = { available: true, writable: false, settings: DEFAULT_EARS_SETTINGS, overridden: [] }
  private routeState: RouteState = { status: 'loading', routes: [] }
  private saving = false
  private failed = false

  constructor(remote: EarsRemote) {
    this.remote = remote
    this.settingsStore = createSnapshotStore(DEFAULT_EARS_SETTINGS)
    this.cardStore = createSnapshotStore(this.snapshot())
    this.routeStore = createSnapshotStore(this.routeState)
  }

  getSettingsStore(): SnapshotStore<EarsSettings> { return this.settingsStore }
  getCardStore(): SnapshotStore<EarsCardState> { return this.cardStore }
  getRouteStore(): SnapshotStore<RouteState> { return this.routeStore }

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
    const language = field('language', this.drafts.get('language') ?? current.language)
    const maxRecordingSeconds = field('maxRecordingSeconds', this.drafts.get('maxRecordingSeconds') ?? String(current.maxRecordingSeconds))
    const polishingEnabled = field('polishingEnabled', this.drafts.get('polishingEnabled') ?? (current.polishingEnabled ? 'on' : 'off'))
    const polishProvider = field('polishProvider', this.drafts.get('polishProvider') ?? current.polishProvider)
    const polishModel = field('polishModel', this.drafts.get('polishModel') ?? current.polishModel)
    const routeInvalid = (polishProvider.text === '') !== (polishModel.text === '')
    return {
      available: this.settingsView.available,
      writable: this.settingsView.writable,
      dirty: this.drafts.size > 0,
      invalid: language.invalid || maxRecordingSeconds.invalid || polishingEnabled.invalid || polishProvider.invalid || polishModel.invalid || routeInvalid,
      saving: this.saving,
      failed: this.failed,
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

export function EarsSettingsCard(props: EarsSettingsCardProps): ReactNode {
  const state = props.useEarsCard((snapshot) => snapshot)
  const routes = props.useEarsRoutes((snapshot) => snapshot)
  const [open, setOpen] = useState(false)
  const t = props.earsT
  if (!state.available) return null
  const providerOptions = uniqueProviders(routes.routes)
  const modelOptions = routes.routes.filter((route) => route.provider === state.polishProvider.text)
  const modelValueIsKnown = modelOptions.some((route) => route.model === state.polishModel.text)
  return (
    <li className={`${styles.card} ${open ? styles.cardOpen : ''}`}>
      <button type="button" className={styles.header} aria-expanded={open} aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`} onClick={() => setOpen((value) => !value)}>
        <span className={styles.headerText}><span className={styles.title}>{t('title')}</span><span className={styles.description}>{t('description')}</span></span>
        {state.dirty ? <span className={styles.pending}>{t('unsaved')}</span> : null}
        <IconChevronDownOutline14 className={open ? styles.chevronOpen : styles.chevron} />
      </button>
      {open ? <div className={styles.body}>
        {!state.writable ? <p className={styles.readOnly}>{t('readOnly')}</p> : null}
        <TextField label={t('language')} hint={t('languageHint')} state={state.language} disabled={!state.writable} onChange={(event) => props.edit('language', event.target.value)} />
        <TextField label={t('recordingLimit')} hint={t('recordingLimitHint')} state={state.maxRecordingSeconds} disabled={!state.writable} numeric onChange={(event) => props.edit('maxRecordingSeconds', event.target.value)} />
        <SelectField label={t('polishing')} hint={t('polishingHint')} state={state.polishingEnabled} disabled={!state.writable} value={state.polishingEnabled.text} onChange={(event) => props.edit('polishingEnabled', event.target.value)} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} />
        <SelectField label={t('provider')} hint={t('providerHint')} state={state.polishProvider} disabled={!state.writable || routes.status === 'loading'} value={state.polishProvider.text} onChange={(event) => props.edit('polishProvider', event.target.value)} options={[['', t('noModel')], ...providerOptions.map((provider) => [provider.provider, `${provider.providerName} (${provider.provider})`] as [string, string])]} />
        <SelectField label={t('model')} hint={routes.status === 'loading' ? t('loadingModels') : modelOptions.length === 0 ? t('noModels') : t('modelHint')} state={state.polishModel} disabled={!state.writable || state.polishProvider.text === '' || routes.status === 'loading'} value={modelValueIsKnown ? state.polishModel.text : ''} onChange={(event) => props.edit('polishModel', event.target.value)} options={[['', t('noModel')], ...(modelValueIsKnown ? [] : state.polishModel.text === '' ? [] : [['', state.polishModel.text] as [string, string]]), ...modelOptions.map((model) => [model.model, `${model.modelName} (${model.model})`] as [string, string])]} />
        {state.invalid ? <p className={`${styles.status} ${styles.invalid}`}>{t('invalid')}</p> : null}
        <div className={styles.footer}>{state.failed ? <p className={styles.footerMessage}>{t('saveFailed')}</p> : null}<Button className={styles.footerButton} variant="outline" size="sm" disabled={!state.dirty || state.saving} onClick={props.discard}>{t('discard')}</Button><Button className={styles.footerButton} variant="primary" size="sm" disabled={!state.dirty || state.invalid || state.saving || !state.writable} onClick={props.save}>{t(state.saving ? 'saving' : 'save')}</Button></div>
      </div> : null}
    </li>
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

function parseField(field: FieldName, text: string): unknown {
  if (field === 'maxRecordingSeconds') return Number(text)
  if (field === 'polishingEnabled') return text === 'on'
  return text
}

function isInvalid(field: FieldName, text: string): boolean {
  if (field === 'language') return text.trim() === ''
  if (field === 'polishProvider' || field === 'polishModel') return false
  if (field === 'polishingEnabled') return text !== 'on' && text !== 'off'
  const value = Number(text)
  return !Number.isSafeInteger(value) || value < 1 || value > 600
}
