import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASR_BACKEND_IDS, WHISPER_MODEL_IDS } from '../config.js'
import type { EarsSettings, PolishRoute, ReasoningEffortInfo } from '../config.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import type { AsrBackendInfo, WhisperModelState } from '../remote-contract.js'
import type { BackendHook, EarsCardHook, EarsCardState, EarsSettingsHook, FieldName, ReasoningEffortsHook, ReasoningEffortsState, RouteHook, RouteState, WhisperModelHook } from './settings-controller.js'
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
  title: 'dsh-ear', nav: 'dsh-ear', description: '配置语音识别和可选的文本润色模型', tabs: '配置分组', groupRecognition: '识别', groupPolishing: '润色', backend: '识别后端', backendHintWebSpeech: '浏览器内置的实时识别；识别服务可能由浏览器厂商提供，并非本地识别。', backendHintLocalWhisper: '停止录音后由 dsh Host 的 whisper 命令转录；模型权重由本机安装管理。medium 及更大模型需要 GPU 或更快的本地运行时，否则可能超出转录时限。', backendHintCloudOpenai: '停止录音后通过你配置的 HTTP(S) 端点转录。', webSpeechBackend: 'Web Speech', localWhisperBackend: '本地 Whisper', cloudBackend: '云端 ASR', localModel: 'Whisper 模型', whisperDownloaded: '模型已下载', whisperNotDownloaded: '模型未下载，请先下载后再录音使用', whisperDownloading: '下载中', whisperChecking: '检测中…', clickDownload: '点击下载', retryDownload: '重试下载', cancelDownload: '取消下载', deleteModel: '删除模型', confirmDeleteModel: '确认删除？', cloudEndpoint: '转录端点', cloudEndpointHint: '完整的 HTTP(S) /audio/transcriptions 端点；不要把密钥写进 URL。', cloudModel: '云端模型', cloudModelHint: '端点接受的转录模型名称，例如 whisper-1。', cloudCredentialRef: 'dsh 凭据引用', cloudCredentialRefHint: '只填写环境变量形状的引用，例如 OPENAI_API_KEY；插件不保存密钥。', backendUnavailable: '当前后端不可用：', localUnavailable: '请在 dsh Host 安装 openai-whisper，并确保 whisper 位于 PATH 中。', cloudUnavailable: '请配置转录端点、模型和可选的 dsh 凭据引用。', language: '识别语言', languageHint: '浏览器语音识别和 ASR 后端使用的语言。默认使用简体中文。', recordingLimit: '单次录音上限（秒）', recordingLimitHint: '达到上限后会自动停止，范围为 1–600 秒。', polishing: '文本润色', polishingHint: '将识别后的文本润色、整理。', polishingOn: '开启', polishingOff: '关闭', provider: '模型提供方', providerHint: '选择已接入的模型提供商', model: '模型', modelHint: '选择该 provider 下的模型', reasoningEffort: '推理强度', reasoningEffortHint: '与主界面模型选择器的推理强度一致；留空使用 Default。', defaultEffort: 'Default', providerPlaceholder: '选择提供方', modelPlaceholder: '选择模型', loadingModels: '正在读取 dsh 模型列表…', noModels: '当前没有可用的 dsh 模型，请先在 dsh 中配置模型。', readOnly: '当前 dsh 设置提供方为只读，插件配置无法从此页面保存。请确认 dsh Host 使用可写的用户设置提供方。', loadFailed: '无法读取插件配置，请重启 dsh web 后刷新此页面。', saveFailed: '保存失败，修改已保留，再次修改即可重试。', invalid: '请检查设置有误的字段。'
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
  title: 'dsh-ear', nav: 'dsh-ear', description: 'Configure speech recognition and optional text polishing', tabs: 'Configuration groups', groupRecognition: 'Recognition', groupPolishing: 'Polishing', backend: 'Recognition backend', backendHintWebSpeech: 'Browser-provided live recognition; the recognition service may come from the browser vendor rather than running locally.', backendHintLocalWhisper: 'Transcribed by the whisper command on the dsh Host after recording stops; model weights are managed by the local installation. medium and larger models need a GPU or a faster local runtime, or transcription may exceed its limit.', backendHintCloudOpenai: 'Transcribed through your configured HTTP(S) endpoint after recording stops.', webSpeechBackend: 'Web Speech', localWhisperBackend: 'Local Whisper', cloudBackend: 'Cloud ASR', localModel: 'Whisper model', whisperDownloaded: 'Model downloaded', whisperNotDownloaded: 'Not downloaded; download it before recording', whisperDownloading: 'Downloading', whisperChecking: 'Checking…', clickDownload: 'Click to download', retryDownload: 'Retry download', cancelDownload: 'Cancel download', deleteModel: 'Delete model', confirmDeleteModel: 'Confirm delete?', cloudEndpoint: 'Transcription endpoint', cloudEndpointHint: 'Full HTTP(S) /audio/transcriptions endpoint; never put a key in the URL.', cloudModel: 'Cloud model', cloudModelHint: 'The transcription model accepted by the endpoint, such as whisper-1.', cloudCredentialRef: 'dsh credential reference', cloudCredentialRefHint: 'Use an environment-shaped reference such as OPENAI_API_KEY; the plugin never stores the key.', backendUnavailable: 'The selected backend is unavailable: ', localUnavailable: 'Install openai-whisper on the dsh Host and ensure whisper is on PATH.', cloudUnavailable: 'Configure a transcription endpoint, model, and optional dsh credential reference.', language: 'Recognition language', languageHint: 'Language used by browser speech recognition and ASR backends. Simplified Chinese is the default.', recordingLimit: 'Recording limit (seconds)', recordingLimitHint: 'Recording stops automatically at the limit, from 1 to 600 seconds.', polishing: 'Text polishing', polishingHint: 'Polish and tidy the recognized text.', polishingOn: 'On', polishingOff: 'Off', provider: 'Provider', providerHint: 'Choose a connected model provider', model: 'Model', modelHint: 'Choose a model under that provider', reasoningEffort: 'Reasoning effort', reasoningEffortHint: 'Same reasoning efforts as the composer model selector; leave empty for Default.', defaultEffort: 'Default', providerPlaceholder: 'Choose provider', modelPlaceholder: 'Choose model', loadingModels: 'Loading dsh model list…', noModels: 'No dsh models are available. Configure a model in dsh first.', readOnly: 'The current dsh settings provider is read-only, so plugin configuration cannot be saved from this page. Make sure the dsh Host uses a writable user settings provider.', loadFailed: 'Could not load the plugin configuration. Restart dsh web and refresh this page.', saveFailed: 'Save failed. Your changes are kept; edit again to retry.', invalid: 'Check the fields with invalid values.'
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
  readonly useEarsBackends: BackendHook
  readonly useEarsReasoning: ReasoningEffortsHook
  readonly useEarsWhisper: WhisperModelHook
  readonly earsT: Translate
  readonly edit: (field: FieldName, text: string) => void
  readonly downloadModel: () => void
  readonly cancelModel: () => void
  readonly deleteModel: () => void
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
  const whisper = props.useEarsWhisper((snapshot) => snapshot)
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
          {state.asrBackend.text === 'local-whisper' ? <WhisperModelRow label={t('localModel')} value={state.localWhisperModel.text} options={WHISPER_MODEL_IDS.map((model) => [model, model] as [string, string])} disabled={!state.writable} invalid={state.localWhisperModel.invalid} status={whisper.status} modelState={whisper.state} writable={state.writable} onDownload={props.downloadModel} onCancelDownload={props.cancelModel} onDeleteModel={props.deleteModel} onChange={(value) => props.edit('localWhisperModel', value)} t={t} /> : null}
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

function SelectRow({ label, hint, value, options, placeholder, disabled, invalid, onChange }: { label: string; hint: string; value: string; options: [string, string][]; placeholder?: string; disabled: boolean; invalid: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(([optionValue]) => optionValue === value)
  const labelText = selected === undefined ? (value === '' && placeholder !== undefined ? placeholder : value) : selected[1]
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
