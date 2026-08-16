import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASR_BACKEND_IDS, WHISPER_MODEL_IDS } from '../config.js'
import type { EarsSettings, PolishRoute, ReasoningEffortInfo } from '../config.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import type { WhisperModelState } from '../remote-contract.js'
import type { CloudModelsHook, CloudModelsView, EarsCardHook, EarsCardState, EarsSettingsHook, FieldName, ReasoningEffortsHook, ReasoningEffortsState, RouteHook, RouteState, WhisperModelHook } from './settings-controller.js'
import styles from './SettingsSection.module.css'

export const LOCALE_NAMESPACE = 'settings.dshEars'

export const localeZh = {
  voiceStart: '开始语音输入',
  voiceStop: '停止语音输入',
  voiceTranscribing: '正在转写…',
  voicePolishing: '正在润色…',
  voiceError: '语音输入失败，点击重试',
  voiceUnavailable: '语音输入不可用',
  voiceUnavailableWebSpeech: '当前浏览器不支持语音输入',
  voiceUnavailableRecorder: '当前浏览器无法录制所选 ASR 后端所需的音频',
  title: 'dsh-ear', nav: 'dsh-ear', description: '配置语音识别和可选的文本润色模型', tabs: '配置分组', groupRecognition: '识别', groupPolishing: '润色', backend: '识别后端', backendHintWebSpeech: '浏览器内置的实时识别；识别服务可能由浏览器厂商提供，并非本地识别。', backendHintLocalWhisper: '停止录音后由 dsh Host 的 whisper 命令转录；模型权重由本机安装管理。medium 及更大模型需要 GPU 或更快的本地运行时，否则可能超出转录时限。', backendHintGroq: 'Groq 云端 Whisper 转写，需配置 API key。', backendHintCustom: '任意 OpenAI 兼容的 /audio/transcriptions 端点。', webSpeechBackend: 'Web Speech', localWhisperBackend: '本地 Whisper', cloudBackend: '云端 ASR', groupLocal: '本地', groupCloud: '云提供商', groqProvider: 'Groq', customProvider: '自定义 OpenAI 兼容', localModel: 'Whisper 模型', whisperDownloaded: '模型已下载', whisperNotDownloaded: '模型未下载，请先下载后再录音使用', whisperDownloading: '下载中', whisperChecking: '检测中…', clickDownload: '点击下载', retryDownload: '重试下载', cancelDownload: '取消下载', deleteModel: '删除模型', confirmDeleteModel: '确认删除？', cloudEndpoint: '转录端点', cloudEndpointHint: '完整的 HTTP(S) /audio/transcriptions 端点；不要把密钥写进 URL。', cloudModel: '云端模型', cloudModelHint: '端点接受的转录模型名称，例如 whisper-1。', cloudModelGroqHint: '从 Groq 实时获取的转写模型。', cloudModelFetchFailed: '获取模型列表失败。', cloudModelStale: '所选模型不在最新列表中，可能已下线。', retryModels: '重试', cloudKey: 'API key', cloudKeyHint: '只写入不回显；留空保持原值，点击清除可移除。', cloudKeyConfigured: '已配置', cloudKeyNotConfigured: '未配置', clearKey: '清除', save: '保存', saving: '保存中…', discard: '放弃修改', unsaved: '未保存', backendUnavailable: '当前后端不可用：', localUnavailable: '请在 dsh Host 安装 openai-whisper，并确保 whisper 位于 PATH 中。', cloudUnavailable: '请选择云端模型并配置 API key。', language: '识别语言', languageHint: '浏览器语音识别和 ASR 后端使用的语言。默认使用简体中文。', recordingLimit: '单次录音上限（秒）', recordingLimitHint: '达到上限后会自动停止，范围为 1–600 秒。', polishing: '文本润色', polishingHint: '将识别后的文本润色、整理。', polishingOn: '开启', polishingOff: '关闭', provider: '模型提供方', providerHint: '选择已接入的模型提供商', model: '模型', modelHint: '选择该 provider 下的模型', reasoningEffort: '推理强度', reasoningEffortHint: '与主界面模型选择器的推理强度一致；留空使用 Default。', defaultEffort: 'Default', providerPlaceholder: '选择提供方', modelPlaceholder: '选择模型', loadingModels: '正在读取 dsh 模型列表…', noModels: '当前没有可用的 dsh 模型，请先在 dsh 中配置模型。', readOnly: '当前 dsh 设置提供方为只读，插件配置无法从此页面保存。请确认 dsh Host 使用可写的用户设置提供方。', loadFailed: '无法读取插件配置，请稍后重试。', saveFailed: '保存失败，修改已保留，再次修改即可重试。'
} as const

export const localeEn = {
  voiceStart: 'Start voice input',
  voiceStop: 'Stop voice input',
  voiceTranscribing: 'Transcribing voice input',
  voicePolishing: 'Polishing voice input',
  voiceError: 'Voice input failed; click to record again',
  voiceUnavailable: 'Voice input unavailable',
  voiceUnavailableWebSpeech: 'Voice input is unavailable in this browser',
  voiceUnavailableRecorder: 'This browser cannot record audio for the selected ASR backend',
  title: 'dsh-ear', nav: 'dsh-ear', description: 'Configure speech recognition and optional text polishing', tabs: 'Configuration groups', groupRecognition: 'Recognition', groupPolishing: 'Polishing', backend: 'Recognition backend', backendHintWebSpeech: 'Browser-provided live recognition; the recognition service may come from the browser vendor rather than running locally.', backendHintLocalWhisper: 'Transcribed by the whisper command on the dsh Host after recording stops; model weights are managed by the local installation. medium and larger models need a GPU or a faster local runtime, or transcription may exceed its limit.', backendHintGroq: 'Groq-hosted Whisper transcription; requires an API key.', backendHintCustom: 'Any OpenAI-compatible /audio/transcriptions endpoint.', webSpeechBackend: 'Web Speech', localWhisperBackend: 'Local Whisper', cloudBackend: 'Cloud ASR', groupLocal: 'Local', groupCloud: 'Cloud providers', groqProvider: 'Groq', customProvider: 'Custom OpenAI-compatible', localModel: 'Whisper model', whisperDownloaded: 'Model downloaded', whisperNotDownloaded: 'Not downloaded; download it before recording', whisperDownloading: 'Downloading', whisperChecking: 'Checking…', clickDownload: 'Click to download', retryDownload: 'Retry download', cancelDownload: 'Cancel download', deleteModel: 'Delete model', confirmDeleteModel: 'Confirm delete?', cloudEndpoint: 'Transcription endpoint', cloudEndpointHint: 'Full HTTP(S) /audio/transcriptions endpoint; never put a key in the URL.', cloudModel: 'Cloud model', cloudModelHint: 'The transcription model accepted by the endpoint, such as whisper-1.', cloudModelGroqHint: 'Transcription models fetched from Groq.', cloudModelFetchFailed: 'Could not fetch the model list.', cloudModelStale: 'The selected model is not in the latest list; it may be retired.', retryModels: 'Retry', cloudKey: 'API key', cloudKeyHint: 'Write-only; leave blank to keep the stored key, or clear to remove it.', cloudKeyConfigured: 'Configured', cloudKeyNotConfigured: 'Not configured', clearKey: 'Clear', save: 'Save', saving: 'Saving…', discard: 'Discard', unsaved: 'Unsaved', backendUnavailable: 'The selected backend is unavailable: ', localUnavailable: 'Install openai-whisper on the dsh Host and ensure whisper is on PATH.', cloudUnavailable: 'Choose a cloud model and configure the API key.', language: 'Recognition language', languageHint: 'Language used by browser speech recognition and ASR backends. Simplified Chinese is the default.', recordingLimit: 'Recording limit (seconds)', recordingLimitHint: 'Recording stops automatically at the limit, from 1 to 600 seconds.', polishing: 'Text polishing', polishingHint: 'Polish and tidy the recognized text.', polishingOn: 'On', polishingOff: 'Off', provider: 'Provider', providerHint: 'Choose a connected model provider', model: 'Model', modelHint: 'Choose a model under that provider', reasoningEffort: 'Reasoning effort', reasoningEffortHint: 'Same reasoning efforts as the composer model selector; leave empty for Default.', defaultEffort: 'Default', providerPlaceholder: 'Choose provider', modelPlaceholder: 'Choose model', loadingModels: 'Loading dsh model list…', noModels: 'No dsh models are available. Configure a model in dsh first.', readOnly: 'The current dsh settings provider is read-only, so plugin configuration cannot be saved from this page. Make sure the dsh Host uses a writable user settings provider.', loadFailed: 'Could not load the plugin configuration. Please try again later.', saveFailed: 'Save failed. Your changes are kept; edit again to retry.'
} as const

export type LocaleKey = keyof typeof localeEn
export type Translate = (key: LocaleKey) => string
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.dshEars': LocaleKey
  }
}



interface EarsSettingsSectionProps {
  readonly useEarsCard: EarsCardHook
  readonly useEarsRoutes: RouteHook
  readonly useEarsReasoning: ReasoningEffortsHook
  readonly useEarsWhisper: WhisperModelHook
  readonly useEarsCloudModels: CloudModelsHook
  readonly earsT: Translate
  readonly edit: (field: FieldName, text: string) => void
  readonly setApiKey: (text: string) => void
  readonly clearApiKey: () => void
  readonly save: () => void
  readonly discard: () => void
  readonly retryCloudModels: () => void
  readonly downloadModel: () => void
  readonly cancelModel: () => void
  readonly deleteModel: () => void
}



export function createSnapshotHook<T>(store: SnapshotStore<T>, fallback: T): SnapshotSelectorHook<T> {
  return function useSnapshotStore<S>(selector: (value: T) => S): S {
    return useSyncExternalStore((listener) => store.subscribe(listener), () => selector(store.getSnapshot()), () => selector(fallback))
  }
}

export function createSettingsHook(store: SnapshotStore<EarsSettings>): EarsSettingsHook {
  return createSnapshotHook(store, DEFAULT_EARS_SETTINGS)
}

export function EarsSettingsSection(props: EarsSettingsSectionProps): ReactNode {
  const state = props.useEarsCard((snapshot) => snapshot)
  const routes = props.useEarsRoutes((snapshot) => snapshot)
  const reasoning = props.useEarsReasoning((snapshot) => snapshot)
  const whisper = props.useEarsWhisper((snapshot) => snapshot)
  const cloudModels = props.useEarsCloudModels((snapshot) => snapshot)
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [activeTab, setActiveTab] = useState<'recognition' | 'polishing'>('recognition')
  const t = props.earsT
  if (!state.available) return null
  const providerOptions = uniqueProviders(routes.routes)
  const modelOptions = routes.routes.filter((route) => route.provider === state.polishProvider.text)
  const modelValueIsKnown = modelOptions.some((route) => route.model === state.polishModel.text)
  const selectedEntryId = state.asrBackend.text === 'cloud-openai' ? state.cloudAsrProvider.text : state.asrBackend.text
  const backendMenu: MenuEntry[] = [
    { type: 'label', id: 'group-local', text: t('groupLocal') },
    { id: 'web-speech', label: t('webSpeechBackend') },
    { id: 'local-whisper', label: t('localWhisperBackend') },
    { type: 'separator', id: 'separator-cloud' },
    { type: 'label', id: 'group-cloud', text: t('groupCloud') },
    { id: 'groq', label: t('groqProvider') },
    { id: 'custom', label: t('customProvider') }
  ]
  const tabs: Array<{ id: 'recognition' | 'polishing'; label: string }> = [
    { id: 'recognition', label: t('groupRecognition') },
    { id: 'polishing', label: t('groupPolishing') }
  ]
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.intro}>{t('description')}</p>
      {state.loadFailed ? <p className={styles.notice} role="alert">{t('loadFailed')}</p> : !state.loaded ? null : !state.writable ? <p className={styles.notice}>{t('readOnly')}</p> : null}
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
          <SelectRow label={t('backend')} hint={backendHint(state.asrBackend.text, state.cloudAsrProvider.text, t)} value={selectedEntryId} entries={backendMenu} disabled={!state.writable} invalid={state.asrBackend.invalid || state.cloudAsrProvider.invalid} onChange={(id) => {
            if (id === 'groq' || id === 'custom') {
              props.edit('asrBackend', 'cloud-openai')
              props.edit('cloudAsrProvider', id)
              return
            }
            props.edit('asrBackend', id)
          }} />
          {state.asrBackend.text === 'local-whisper' ? <WhisperModelRow label={t('localModel')} value={state.localWhisperModel.text} options={WHISPER_MODEL_IDS.map((model) => [model, model] as [string, string])} disabled={!state.writable} invalid={state.localWhisperModel.invalid} status={whisper.status} modelState={whisper.state} writable={state.writable} onDownload={props.downloadModel} onCancelDownload={props.cancelModel} onDeleteModel={props.deleteModel} onChange={(value) => props.edit('localWhisperModel', value)} t={t} /> : null}
          {state.asrBackend.text === 'cloud-openai' ? state.cloudAsrProvider.text === 'groq' ? <>
            <KeyRow label={t('cloudKey')} hint={t('cloudKeyHint')} value={state.cloudAsrApiKey.text} configured={state.cloudAsrApiKeyConfigured} disabled={!state.writable} invalid={state.cloudAsrApiKey.invalid} onEdit={props.setApiKey} onClear={props.clearApiKey} t={t} />
            <CloudModelRow label={t('cloudModel')} value={state.cloudAsrModel.text} models={cloudModels} disabled={!state.writable} onChange={(value) => props.edit('cloudAsrModel', value)} onRetry={props.retryCloudModels} t={t} />
          </> : <>
            <TextRow label={t('cloudEndpoint')} hint={t('cloudEndpointHint')} value={state.cloudAsrEndpoint.text} disabled={!state.writable} invalid={state.cloudAsrEndpoint.invalid} onChange={(event) => props.edit('cloudAsrEndpoint', event.target.value)} />
            <KeyRow label={t('cloudKey')} hint={t('cloudKeyHint')} value={state.cloudAsrApiKey.text} configured={state.cloudAsrApiKeyConfigured} disabled={!state.writable} invalid={state.cloudAsrApiKey.invalid} onEdit={props.setApiKey} onClear={props.clearApiKey} t={t} />
            <TextRow label={t('cloudModel')} hint={t('cloudModelHint')} value={state.cloudAsrModel.text} disabled={!state.writable} invalid={state.cloudAsrModel.invalid} onChange={(event) => props.edit('cloudAsrModel', event.target.value)} />
          </> : null}
          <TextRow label={t('language')} hint={t('languageHint')} value={state.language.text} disabled={!state.writable} invalid={state.language.invalid} onChange={(event) => props.edit('language', event.target.value)} />
          <TextRow label={t('recordingLimit')} hint={t('recordingLimitHint')} value={state.maxRecordingSeconds.text} disabled={!state.writable} invalid={state.maxRecordingSeconds.invalid} numeric onChange={(event) => props.edit('maxRecordingSeconds', event.target.value)} />
        </div>
      ) : (
        <div id={`${tabsId}-panel-polishing`} role="tabpanel" aria-labelledby={`${tabsId}-tab-polishing`} className={styles.panel}>
          <SelectRow label={t('polishing')} hint={t('polishingHint')} value={state.polishingEnabled.text} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} disabled={!state.writable} invalid={state.polishingEnabled.invalid} onChange={(value) => props.edit('polishingEnabled', value)} />
          {state.polishingEnabled.text === 'on' ? <>
            <SelectRow label={t('provider')} hint={t('providerHint')} value={state.polishProvider.text} options={providerOptions.map((provider) => [provider.provider, provider.providerName] as [string, string])} placeholder={t('providerPlaceholder')} disabled={!state.writable || routes.status === 'loading'} invalid={state.polishProvider.invalid} onChange={(value) => props.edit('polishProvider', value)} />
            <SelectRow label={t('model')} hint={routes.status === 'loading' ? t('loadingModels') : modelOptions.length === 0 ? t('noModels') : t('modelHint')} value={modelValueIsKnown ? state.polishModel.text : ''} options={modelOptions.map((model) => [model.model, model.modelName] as [string, string])} placeholder={t('modelPlaceholder')} disabled={!state.writable || state.polishProvider.text === '' || routes.status === 'loading'} invalid={state.polishModel.invalid} onChange={(value) => props.edit('polishModel', value)} />
            {state.polishProvider.text !== '' && state.polishModel.text !== '' && (reasoning.status === 'loading' || reasoning.efforts.length > 0) ? (
              <SelectRow label={t('reasoningEffort')} hint={t('reasoningEffortHint')} value={reasoning.efforts.some((effort) => effort.id === state.polishReasoningEffort.text) ? state.polishReasoningEffort.text : ''} options={[['', t('defaultEffort')], ...reasoning.efforts.map((effort) => [effort.id, effort.name] as [string, string])]} disabled={!state.writable || reasoning.status === 'loading'} invalid={state.polishReasoningEffort.invalid} onChange={(value) => props.edit('polishReasoningEffort', value)} />
            ) : null}
          </> : null}
        </div>
      )}
      <div className={styles.footer}>
        <div className={styles.footerStatus}>
          {state.failed ? <p className={styles.footerStatus} data-kind="error" role="alert">{t('saveFailed')}</p> : null}
          {!state.failed && state.dirty ? <span className={styles.unsaved}>{t('unsaved')}</span> : null}
        </div>
        <div className={styles.footerActions}>
          <button type="button" className={styles.discardButton} disabled={!state.dirty || state.saving} onClick={props.discard}>{t('discard')}</button>
          <button type="button" className={styles.saveButton} disabled={!state.dirty || state.invalid || state.saving} onClick={props.save}>{t(state.saving ? 'saving' : 'save')}</button>
        </div>
      </div>
    </section>
  )
}

function RowField({ label, hint, invalid, alert, children }: { label: string; hint: string; invalid: boolean; alert?: boolean; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{label}</div>
        <div className={`${styles.rowDesc} ${invalid ? styles.invalid : ''}`} {...(alert === true ? { role: 'alert' } : {})}>{hint}</div>
      </div>
      {children}
    </div>
  )
}

function SelectRow({ label, hint, value, options, entries, placeholder, disabled, invalid, onChange }: { label: string; hint: string; value: string; options?: [string, string][]; entries?: readonly MenuEntry[]; placeholder?: string; disabled: boolean; invalid: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const menuItems: readonly MenuEntry[] = entries ?? (options ?? []).map(([id, optionLabel]) => ({ id, label: optionLabel }))
  const selected = menuItems.find((item): item is Extract<MenuEntry, { id: string; label: ReactNode }> => !('type' in item) && item.id === value)
  const labelText = selected === undefined ? (value === '' && placeholder !== undefined ? placeholder : value) : selected.label
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={menuItems}
        selectedId={value}
        onSelect={(id) => {
          setOpen(false)
          if (id === value) return
          onChange(id)
        }}
        align="end"
        portal
        anchor={
          <button type="button" className={styles.selector} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-invalid={invalid} disabled={disabled} onClick={() => setOpen((current) => !current)}>
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
      <Input className={styles.textInput} type={numeric ? 'number' : 'text'} value={value} disabled={disabled} aria-label={label} aria-invalid={invalid} onChange={onChange} />
    </RowField>
  )
}

function KeyRow({ label, hint, value, configured, disabled, invalid, onEdit, onClear, t }: { label: string; hint: string; value: string; configured: boolean; disabled: boolean; invalid: boolean; onEdit: (text: string) => void; onClear: () => void; t: Translate }) {
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <div className={styles.keyControl}>
        <input
          className={styles.textInput}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-bwignore="true"
          data-1p-ignore="true"
          data-lpignore="true"
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-invalid={invalid}
          placeholder={configured ? t('cloudKeyConfigured') : t('cloudKeyNotConfigured')}
          onChange={(event) => onEdit(event.target.value)}
        />
        {configured ? <button type="button" className={styles.linkButton} disabled={disabled} onClick={onClear}>{t('clearKey')}</button> : null}
      </div>
    </RowField>
  )
}

function CloudModelRow({ label, value, models, disabled, onChange, onRetry, t }: { label: string; value: string; models: CloudModelsView; disabled: boolean; onChange: (value: string) => void; onRetry: () => void; t: Translate }) {
  if (models.status === 'loading') {
    return <RowField label={label} hint={t('loadingModels')} invalid={false}><div className={styles.rowDescInline}><span className={styles.spinner} aria-hidden="true" /><span>{t('loadingModels')}</span></div></RowField>
  }
  const view = models.view
  if (view.status === 'error') {
    return (
      <RowField label={label} hint={view.error ?? t('cloudModelFetchFailed')} invalid alert>
        <div className={styles.rowDescInline}>
          <span>{t('cloudModelFetchFailed')}</span>
          <button type="button" className={styles.linkButton} disabled={disabled} onClick={onRetry}>{t('retryModels')}</button>
        </div>
      </RowField>
    )
  }
  const options = (view.models ?? []).map((model) => [model, model] as [string, string])
  const stale = view.status === 'ok' && value.trim() !== '' && !(view.models ?? []).includes(value)
  const noModels = view.status !== 'ok' || options.length === 0
  return (
    <>
      <SelectRow label={label} hint={t('cloudModelGroqHint')} value={value} options={options} placeholder={t('modelPlaceholder')} disabled={disabled || noModels} invalid={false} onChange={onChange} />
      {stale ? <p className={styles.statusError}>{t('cloudModelStale')}</p> : null}
    </>
  )
}

function WhisperModelRow({ label, value, options, disabled, invalid, status, modelState, writable, onDownload, onCancelDownload, onDeleteModel, onChange, t }: { label: string; value: string; options: [string, string][]; disabled: boolean; invalid: boolean; status: 'loading' | 'ready'; modelState: WhisperModelState; writable: boolean; onDownload: () => void; onCancelDownload: () => void; onDeleteModel: () => void; onChange: (value: string) => void; t: Translate }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(([optionValue]) => optionValue === value)
  const labelText = selected === undefined ? value : selected[1]
  const statusContent = status === 'loading' ? whisperCheckingContent(t) : whisperStatusContent(modelState, t, writable, onDownload, onCancelDownload, onDeleteModel)
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{label}</div>
        <div className={`${styles.rowDesc} ${styles.rowDescInline} ${modelState.error !== null || invalid ? styles.invalid : ''}`} {...(modelState.error !== null ? { role: 'alert' } : {})}>
          {statusContent}
        </div>
      </div>
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
            <button type="button" className={styles.selector} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-invalid={invalid} disabled={disabled} onClick={() => setOpen((current) => !current)}>
            {labelText}
            <IconChevronDownOutline14 className={styles.chevron} />
          </button>
        }
      />
    </div>
  )
}

function whisperCheckingContent(t: Translate): ReactNode {
  return <><span className={styles.spinner} aria-hidden="true" /><span>{t('whisperChecking')}</span></>
}

function whisperStatusContent(modelState: WhisperModelState, t: Translate, writable: boolean, onDownload: () => void, onCancelDownload: () => void, onDeleteModel: () => void): ReactNode {
  if (modelState.error !== null) {
    return <>
      <span>{modelState.error}</span>
      {modelState.downloading
        ? <button type="button" className={styles.linkButton} onClick={onCancelDownload}>{t('cancelDownload')}</button>
        : modelState.downloaded
          ? <WhisperDownloadedActions modelState={modelState} t={t} writable={writable} onDeleteModel={onDeleteModel} />
          : <button type="button" className={styles.linkButton} disabled={!writable || !modelState.cliAvailable} onClick={onDownload}>{t('retryDownload')}</button>}
    </>
  }
  if (modelState.downloading) {
    const percent = modelState.progress === null ? null : Math.max(0, Math.min(100, Math.round(modelState.progress * 100)))
    return <><span>{t('whisperDownloading')}{percent === null ? '' : ` ${String(percent)}%`}</span><button type="button" className={styles.linkButton} onClick={onCancelDownload}>{t('cancelDownload')}</button></>
  }
  if (modelState.downloaded) {
    return <WhisperDownloadedActions modelState={modelState} t={t} writable={writable} onDeleteModel={onDeleteModel} />
  }
  return (
    <>
      <span>{t('whisperNotDownloaded')}</span>
      <button type="button" className={styles.linkButton} disabled={!writable || !modelState.cliAvailable} onClick={onDownload}>{t('clickDownload')}</button>
    </>
  )
}

function WhisperDownloadedActions({ modelState, t, writable, onDeleteModel }: { modelState: WhisperModelState; t: Translate; writable: boolean; onDeleteModel: () => void }) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])
  return (
    <>
      <span>{t('whisperDownloaded')}</span>
      {confirming
        ? <button type="button" className={`${styles.linkButton} ${styles.linkButtonDanger}`} disabled={!writable} onClick={onDeleteModel}>{t('confirmDeleteModel')}</button>
        : <button type="button" className={`${styles.linkButton} ${styles.linkButtonDanger}`} disabled={!writable} onClick={() => setConfirming(true)}>{t('deleteModel')}</button>}
    </>
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

function backendHint(backend: string, provider: string, t: Translate): string {
  if (backend === 'local-whisper') return t('backendHintLocalWhisper')
  if (backend === 'cloud-openai') return provider === 'groq' ? t('backendHintGroq') : t('backendHintCustom')
  return t('backendHintWebSpeech')
}
