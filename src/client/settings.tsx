import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASR_BACKEND_IDS, MAX_POLISH_PROMPT_LENGTH, WHISPER_MODEL_IDS, effectiveRecognitionLanguage } from '../config.js'
import type { EarsSettings, PolishRoute, ReasoningEffortInfo } from '../config.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import { POLISH_SYSTEM_PROMPT } from '../polish/prompts.js'
import { formatModifierChord, formatShortcut, isModifierKeyEvent, isReservedShortcut, modifiersFromEvent, shortcutFromEvent, shortcutRejectReason } from '../shortcut.js'
import type { ShortcutModifier } from '../shortcut.js'
import type { WhisperModelState } from '../remote-contract.js'
import type { CloudModelsHook, CloudModelsView, EarsCardHook, EarsCardState, EarsSettingsHook, FieldName, ReasoningEffortsHook, ReasoningEffortsState, RouteHook, RouteState, WhisperModelHook } from './settings-controller.js'
import styles from './SettingsSection.module.css'

export const LOCALE_NAMESPACE = 'settings.dshEars'

export const localeZh = {
  polishPrompt: '润色提示词', polishPromptHint: '留空使用内置默认。', promptPlaceholder: '输入自定义润色提示词…', promptViewDefault: '查看默认', promptHideDefault: '收起', promptReset: '恢复默认', promptTooLong: '自定义润色提示词不能超过 4000 个字符',
  voiceStart: '开始语音输入',
  voiceStop: '停止语音输入',
  voiceStarting: '正在启动…',
  voiceRecording: '正在识别',
  voiceBusy: '语音处理中',
  voiceTranscribing: '正在转写…',
  voicePolishing: '正在润色…',
  voicePolishFailed: '润色失败，已保留原文',
  voiceError: '请检查配置后重试',
  voiceUpstreamAsr: '语音识别上游错误： ',
  voiceUpstreamPolish: '润色上游错误： ',
  voiceUnavailable: '语音输入不可用',
  voiceUnavailableWebSpeech: '当前浏览器不支持语音输入',
  voiceUnavailableRecorder: '当前浏览器无法录制所选后端的音频',
  title: 'dsh-ear', nav: 'dsh-ear', description: '语音识别与文本润色', tabs: '配置分组', groupRecognition: '识别', groupPolishing: '润色', backend: '识别后端', backendHintWebSpeech: '浏览器实时识别。', backendHintLocalWhisper: '停止后由本机 whisper 转写。', backendHintGroq: 'Groq Whisper，需要 API key。', backendHintBailian: '百炼同步转写，录音最长 300 秒。', backendHintCustom: 'OpenAI 兼容转写端点。', webSpeechBackend: 'Web Speech', localWhisperBackend: '本地 Whisper', cloudBackend: '云端 ASR', groupLocal: '本地', groupCloud: '云提供商', groqProvider: 'Groq', bailianProvider: '阿里云百炼', customProvider: '自定义 OpenAI 兼容', bailianHost: 'API Host', bailianHostHint: 'HTTPS 源站，不要把密钥写进 URL。', bailianModelHint: '同步 Flash 模型名。', localModel: 'Whisper 模型', whisperDownloaded: '模型已下载', whisperNotDownloaded: '模型未下载', whisperDownloading: '下载中', whisperChecking: '检测中…', clickDownload: '点击下载', retryDownload: '重试下载', cancelDownload: '取消下载', deleteModel: '删除模型', confirmDeleteModel: '确认删除？', cloudEndpoint: '转录端点', cloudEndpointHint: '完整的 /audio/transcriptions 端点。', cloudModel: '云端模型', cloudModelHint: '端点接受的转写模型名。', cloudModelGroqHint: '从 Groq 获取的转写模型。', cloudModelFetchFailed: '获取模型列表失败。', cloudModelStale: '所选模型不在最新列表中，可能已下线。', retryModels: '重试', cloudKey: 'API key', cloudKeyHint: '只写入不回显。留空保持原值。', cloudKeyConfigured: '已配置', cloudKeyNotConfigured: '未配置', cloudKeyClearPending: '将清除', clearKey: '清除', undoClearKey: '撤销', backendUnavailable: '当前后端不可用：', localUnavailable: '请在 Host 安装 openai-whisper，并确保 whisper 在 PATH 中。', cloudUnavailable: '请选择云端模型并配置 API key。', language: '识别语言', languageHint: '留空则跟随界面语言。', languageFollowsUi: '跟随界面语言', recordingLimit: '单次录音上限（秒）', recordingLimitHint: '到达上限后自动停止，1–600 秒。', groupGeneral: '通用', shortcutEnabled: '语音快捷键', shortcutEnabledHint: '在 dsh 页面聚焦时开始或停止语音输入。', soundsEnabled: '语音音效', soundsEnabledHint: '开始和结束语音输入时播放提示音。', shortcut: '快捷键', shortcutHint: '开始或停止语音输入，仅当前页面生效。', shortcutCapture: '按下组合键…', shortcutCaptureHint: '按下新的组合键…（Esc 取消）', shortcutClear: '恢复默认', shortcutInvalidModifierOnly: '快捷键不能只包含修饰键。', shortcutInvalidTypingKey: '该组合会输入字符：请为字母/数字加上 Ctrl 或 Shift 等修饰键（Alt/Option 组合会输入特殊字符）。', shortcutInvalidFormat: '无效的快捷键组合。', shortcutReserved: '该组合可能与浏览器或系统保留快捷键冲突。', polishing: '文本润色', polishingHint: '将识别后的文本润色整理。', polishingOn: '开启', polishingOff: '关闭', provider: '模型提供方', providerHint: '选择已接入的模型提供商', model: '模型', modelHint: '选择该提供方下的模型', reasoningEffort: '推理强度', reasoningEffortHint: '与主界面一致；留空为 Default。', defaultEffort: 'Default', providerPlaceholder: '选择提供方', modelPlaceholder: '选择模型', loadingModels: '正在读取 dsh 模型列表…', noModels: '当前没有可用的 dsh 模型，请先在 dsh 中配置模型。', readOnly: '当前设置为只读，无法从此页保存。', loadFailed: '无法读取配置，请稍后重试。', saveFailed: '保存失败，修改已保留。'
} as const

export const localeEn = {
  polishPrompt: 'Polish prompt', polishPromptHint: 'Leave blank to use the built-in default.', promptPlaceholder: 'Type your custom polish prompt…', promptViewDefault: 'View default', promptHideDefault: 'Hide', promptReset: 'Reset to default', promptTooLong: 'The custom polish prompt cannot exceed 4000 characters',
  voiceStart: 'Start voice input',
  voiceStop: 'Stop voice input',
  voiceStarting: 'Starting…',
  voiceRecording: 'Listening',
  voiceBusy: 'Processing',
  voiceTranscribing: 'Transcribing…',
  voicePolishing: 'Polishing…',
  voicePolishFailed: 'Polishing failed; the original transcript is kept',
  voiceError: 'Check the configuration and try again',
  voiceUpstreamAsr: 'Recognition upstream error: ',
  voiceUpstreamPolish: 'Polish upstream error: ',
  voiceUnavailable: 'Voice input unavailable',
  voiceUnavailableWebSpeech: 'Voice input is unavailable in this browser',
  voiceUnavailableRecorder: 'This browser cannot record audio for the selected backend',
  title: 'dsh-ear', nav: 'dsh-ear', description: 'Speech recognition and text polishing', tabs: 'Configuration groups', groupRecognition: 'Recognition', groupPolishing: 'Polishing', backend: 'Recognition backend', backendHintWebSpeech: 'Live recognition in the browser.', backendHintLocalWhisper: 'Transcribed by local whisper after you stop.', backendHintGroq: 'Groq Whisper. Requires an API key.', backendHintBailian: 'Bailian sync transcription. Recordings cap at 300 seconds.', backendHintCustom: 'An OpenAI-compatible transcription endpoint.', webSpeechBackend: 'Web Speech', localWhisperBackend: 'Local Whisper', cloudBackend: 'Cloud ASR', groupLocal: 'Local', groupCloud: 'Cloud providers', groqProvider: 'Groq', bailianProvider: 'Alibaba Cloud Model Studio', customProvider: 'Custom OpenAI-compatible', bailianHost: 'API host', bailianHostHint: 'HTTPS origin. Do not put a key in the URL.', bailianModelHint: 'A sync Flash model name.', localModel: 'Whisper model', whisperDownloaded: 'Model downloaded', whisperNotDownloaded: 'Not downloaded', whisperDownloading: 'Downloading', whisperChecking: 'Checking…', clickDownload: 'Click to download', retryDownload: 'Retry download', cancelDownload: 'Cancel download', deleteModel: 'Delete model', confirmDeleteModel: 'Confirm delete?', cloudEndpoint: 'Transcription endpoint', cloudEndpointHint: 'Full /audio/transcriptions endpoint.', cloudModel: 'Cloud model', cloudModelHint: 'Transcription model accepted by the endpoint.', cloudModelGroqHint: 'Transcription models fetched from Groq.', cloudModelFetchFailed: 'Could not fetch the model list.', cloudModelStale: 'The selected model is not in the latest list; it may be retired.', retryModels: 'Retry', cloudKey: 'API key', cloudKeyHint: 'Write-only. Leave blank to keep the current key.', cloudKeyConfigured: 'Configured', cloudKeyNotConfigured: 'Not configured', cloudKeyClearPending: 'Will clear', clearKey: 'Clear', undoClearKey: 'Undo', backendUnavailable: 'The selected backend is unavailable: ', localUnavailable: 'Install openai-whisper on the Host and put whisper on PATH.', cloudUnavailable: 'Choose a cloud model and configure the API key.', language: 'Recognition language', languageHint: 'Leave blank to follow the interface language.', languageFollowsUi: 'Follow the interface language', recordingLimit: 'Recording limit (seconds)', recordingLimitHint: 'Stops automatically at the limit, from 1 to 600 seconds.', groupGeneral: 'General', shortcutEnabled: 'Voice shortcut', shortcutEnabledHint: 'Start or stop voice input while the dsh page is focused.', soundsEnabled: 'Voice sounds', soundsEnabledHint: 'Play a click and chime when voice input starts and stops.', shortcut: 'Keyboard shortcut', shortcutHint: 'Starts or stops voice input. In-page only.', shortcutCapture: 'Press keys…', shortcutCaptureHint: 'Press the new key combination… (Esc to cancel)', shortcutClear: 'Reset to default', shortcutInvalidModifierOnly: 'The shortcut cannot contain only modifier keys.', shortcutInvalidTypingKey: 'This combination produces text: add Ctrl or Shift to letters/digits (Alt/Option combinations type special characters).', shortcutInvalidFormat: 'Invalid shortcut combination.', shortcutReserved: 'This combination may conflict with a browser or system reserved shortcut.', polishing: 'Text polishing', polishingHint: 'Polish and tidy the recognized text.', polishingOn: 'On', polishingOff: 'Off', provider: 'Provider', providerHint: 'Choose a connected model provider', model: 'Model', modelHint: 'Choose a model under that provider', reasoningEffort: 'Reasoning effort', reasoningEffortHint: 'Same as the composer selector. Leave empty for Default.', defaultEffort: 'Default', providerPlaceholder: 'Choose provider', modelPlaceholder: 'Choose model', loadingModels: 'Loading dsh model list…', noModels: 'No dsh models are available. Configure a model in dsh first.', readOnly: 'Settings are read-only and cannot be saved from this page.', loadFailed: 'Could not load the plugin configuration. Try again later.', saveFailed: 'Save failed. Your changes were kept.'
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
  readonly useUiLocale?: () => string
  readonly earsT: Translate
  readonly edit: (field: FieldName, text: string) => void
  readonly setApiKey: (text: string) => void
  readonly clearApiKey: () => void
  readonly undoClearApiKey: () => void
  readonly setCustomApiKey: (text: string) => void
  readonly clearCustomApiKey: () => void
  readonly undoClearCustomApiKey: () => void
  readonly setBailianApiKey: (text: string) => void
  readonly clearBailianApiKey: () => void
  readonly undoClearBailianApiKey: () => void
  readonly flush: () => void
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
  const flushRef = useRef(props.flush)
  flushRef.current = props.flush
  const [activeTab, setActiveTab] = useState<'general' | 'recognition' | 'polishing'>('general')
  const t = props.earsT
  const uiLocale = props.useUiLocale?.() ?? 'zh'
  useEffect(() => () => {
    flushRef.current()
  }, [])
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
    { id: 'bailian', label: t('bailianProvider') },
    { id: 'custom', label: t('customProvider') }
  ]
  const tabs: Array<{ id: 'general' | 'recognition' | 'polishing'; label: string }> = [
    { id: 'general', label: t('groupGeneral') },
    { id: 'recognition', label: t('groupRecognition') },
    { id: 'polishing', label: t('groupPolishing') }
  ]
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.intro}>{t('description')}</p>
      {state.loadFailed ? <p className={styles.notice} role="alert">{t('loadFailed')}</p> : !state.loaded ? null : !state.writable ? <p className={styles.notice}>{t('readOnly')}</p> : state.failed ? <p className={`${styles.notice} ${styles.noticeError}`} role="alert">{t('saveFailed')}</p> : null}
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
      {activeTab === 'general' ? (
        <div id={`${tabsId}-panel-general`} role="tabpanel" aria-labelledby={`${tabsId}-tab-general`} className={styles.panel}>
          <SelectRow label={t('shortcutEnabled')} hint={t('shortcutEnabledHint')} value={state.voiceShortcutEnabled.text} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} disabled={!state.writable} invalid={state.voiceShortcutEnabled.invalid} onChange={(value) => props.edit('voiceShortcutEnabled', value)} />
          <ShortcutRecorderRow label={t('shortcut')} hint={t('shortcutHint')} value={state.voiceShortcut.text} disabled={!state.writable} invalid={state.voiceShortcut.invalid} onChange={(value) => props.edit('voiceShortcut', value)} onReset={() => props.edit('voiceShortcut', DEFAULT_EARS_SETTINGS.voiceShortcut)} t={t} />
          <SelectRow label={t('soundsEnabled')} hint={t('soundsEnabledHint')} value={state.voiceSoundsEnabled.text} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} disabled={!state.writable} invalid={state.voiceSoundsEnabled.invalid} onChange={(value) => props.edit('voiceSoundsEnabled', value)} />
          <TextRow label={t('language')} hint={t('languageHint')} value={state.language.text} placeholder={effectiveRecognitionLanguage('', uiLocale)} disabled={!state.writable} invalid={state.language.invalid} onChange={(event) => props.edit('language', event.target.value)} onBlur={props.flush} />
          <TextRow label={t('recordingLimit')} hint={t('recordingLimitHint')} value={state.maxRecordingSeconds.text} disabled={!state.writable} invalid={state.maxRecordingSeconds.invalid} numeric onChange={(event) => props.edit('maxRecordingSeconds', event.target.value)} onBlur={props.flush} />
        </div>
      ) : activeTab === 'recognition' ? (
        <div id={`${tabsId}-panel-recognition`} role="tabpanel" aria-labelledby={`${tabsId}-tab-recognition`} className={styles.panel}>
          <SelectRow label={t('backend')} hint={backendHint(state.asrBackend.text, state.cloudAsrProvider.text, t)} value={selectedEntryId} entries={backendMenu} disabled={!state.writable} invalid={state.asrBackend.invalid || state.cloudAsrProvider.invalid} onChange={(id) => {
            if (id === 'groq' || id === 'bailian' || id === 'custom') {
              props.edit('asrBackend', 'cloud-openai')
              props.edit('cloudAsrProvider', id)
              return
            }
            props.edit('asrBackend', id)
          }} />
          {state.asrBackend.text === 'local-whisper' ? <WhisperModelRow label={t('localModel')} value={state.localWhisperModel.text} options={WHISPER_MODEL_IDS.map((model) => [model, model] as [string, string])} disabled={!state.writable} invalid={state.localWhisperModel.invalid} status={whisper.status} modelState={whisper.state} writable={state.writable} onDownload={props.downloadModel} onCancelDownload={props.cancelModel} onDeleteModel={props.deleteModel} onChange={(value) => props.edit('localWhisperModel', value)} t={t} /> : null}
          {state.asrBackend.text === 'cloud-openai' ? state.cloudAsrProvider.text === 'groq' ? <>
            <KeyRow label={t('cloudKey')} hint={t('cloudKeyHint')} value={state.cloudAsrGroqApiKey.text} configured={state.cloudAsrGroqApiKeyConfigured} clearPending={state.cloudAsrGroqApiKeyClearPending} disabled={!state.writable} invalid={state.cloudAsrGroqApiKey.invalid} onEdit={props.setApiKey} onClear={props.clearApiKey} onUndoClear={props.undoClearApiKey} onBlur={props.flush} t={t} />
            <CloudModelRow label={t('cloudModel')} value={state.cloudAsrGroqModel.text} models={cloudModels} disabled={!state.writable} onChange={(value) => props.edit('cloudAsrGroqModel', value)} onRetry={props.retryCloudModels} t={t} />
          </> : state.cloudAsrProvider.text === 'bailian' ? <>
            <TextRow label={t('bailianHost')} hint={t('bailianHostHint')} value={state.cloudAsrBailianHost.text} disabled={!state.writable} invalid={state.cloudAsrBailianHost.invalid} onChange={(event) => props.edit('cloudAsrBailianHost', event.target.value)} onBlur={props.flush} />
            <KeyRow label={t('cloudKey')} hint={t('cloudKeyHint')} value={state.cloudAsrBailianApiKey.text} configured={state.cloudAsrBailianApiKeyConfigured} clearPending={state.cloudAsrBailianApiKeyClearPending} disabled={!state.writable} invalid={state.cloudAsrBailianApiKey.invalid} onEdit={props.setBailianApiKey} onClear={props.clearBailianApiKey} onUndoClear={props.undoClearBailianApiKey} onBlur={props.flush} t={t} />
            <TextRow label={t('cloudModel')} hint={t('bailianModelHint')} value={state.cloudAsrBailianModel.text} disabled={!state.writable} invalid={state.cloudAsrBailianModel.invalid} onChange={(event) => props.edit('cloudAsrBailianModel', event.target.value)} onBlur={props.flush} />
          </> : <>
            <TextRow label={t('cloudEndpoint')} hint={t('cloudEndpointHint')} value={state.cloudAsrCustomEndpoint.text} disabled={!state.writable} invalid={state.cloudAsrCustomEndpoint.invalid} onChange={(event) => props.edit('cloudAsrCustomEndpoint', event.target.value)} onBlur={props.flush} />
            <KeyRow label={t('cloudKey')} hint={t('cloudKeyHint')} value={state.cloudAsrCustomApiKey.text} configured={state.cloudAsrCustomApiKeyConfigured} clearPending={state.cloudAsrCustomApiKeyClearPending} disabled={!state.writable} invalid={state.cloudAsrCustomApiKey.invalid} onEdit={props.setCustomApiKey} onClear={props.clearCustomApiKey} onUndoClear={props.undoClearCustomApiKey} onBlur={props.flush} t={t} />
            <TextRow label={t('cloudModel')} hint={t('cloudModelHint')} value={state.cloudAsrCustomModel.text} disabled={!state.writable} invalid={state.cloudAsrCustomModel.invalid} onChange={(event) => props.edit('cloudAsrCustomModel', event.target.value)} onBlur={props.flush} />
          </> : null}
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
            <PromptRow label={t('polishPrompt')} hint={t('polishPromptHint')} value={state.polishPrompt.text} disabled={!state.writable} invalid={state.polishPrompt.invalid} defaultValue={POLISH_SYSTEM_PROMPT} t={t} onChange={(value) => props.edit('polishPrompt', value)} onReset={() => props.edit('polishPrompt', DEFAULT_EARS_SETTINGS.polishPrompt)} onBlur={props.flush} />
          </> : null}
        </div>
      )}
    </section>
  )
}

function RowField({ label, hint, invalid, alert, warn, wide = false, children }: { label: string; hint: string; invalid: boolean; alert?: boolean; warn?: boolean; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`${styles.row} ${wide ? styles.rowWide : ''}`}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{label}</div>
        <div className={`${styles.rowDesc} ${invalid ? styles.invalid : ''} ${warn ? styles.warning : ''}`} {...(alert === true || invalid ? { role: 'alert' } : {})}>{hint}</div>
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

const SHORTCUT_PLATFORM: 'mac' | 'win' | 'linux' = (() => {
  const raw = typeof navigator === 'undefined' ? '' : ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '')
  const platform = raw.toLowerCase()
  if (platform.includes('mac')) return 'mac'
  if (platform.includes('win')) return 'win'
  return 'linux'
})()

function ShortcutRecorderRow({ label, hint, value, disabled, invalid, onChange, onReset, t }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; onChange: (value: string) => void; onReset: () => void; t: Translate }) {
  const [capturing, setCapturing] = useState(false)
  const [pressedModifiers, setPressedModifiers] = useState<readonly ShortcutModifier[]>([])
  const [modifierOnly, setModifierOnly] = useState(false)
  const reason = shortcutRejectReason(value)
  const invalidText = reason === 'modifier-only' ? t('shortcutInvalidModifierOnly') : reason === 'typing-key' ? t('shortcutInvalidTypingKey') : reason === 'invalid' ? t('shortcutInvalidFormat') : null
  const reserved = !invalid && isReservedShortcut(value)
  useEffect(() => {
    if (!capturing) return
    const reset = () => {
      setPressedModifiers([])
      setModifierOnly(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setCapturing(false)
        reset()
        return
      }
      if (event.repeat) return
      if (isModifierKeyEvent(event)) {
        setPressedModifiers(modifiersFromEvent(event))
        return
      }
      const chord = shortcutFromEvent(event)
      if (chord === null) return
      event.preventDefault()
      event.stopPropagation()
      onChange(chord)
      setCapturing(false)
      reset()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (!isModifierKeyEvent(event)) return
      const next = modifiersFromEvent(event)
      setPressedModifiers(next)
      if (next.length === 0) setModifierOnly(true)
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [capturing, onChange])
  const capturingHint = modifierOnly ? t('shortcutInvalidModifierOnly') : t('shortcutCaptureHint')
  const displayedHint = capturing ? capturingHint : invalidText !== null ? invalidText : reserved ? t('shortcutReserved') : hint
  const captureLabel = pressedModifiers.length > 0 ? `${formatModifierChord(pressedModifiers, SHORTCUT_PLATFORM)}${SHORTCUT_PLATFORM === 'mac' ? '' : '+'}…` : t('shortcutCapture')
  return (
    <RowField label={label} hint={displayedHint} invalid={capturing ? modifierOnly : invalid} alert={capturing ? modifierOnly : invalidText !== null} warn={!invalid && reserved && !capturing}>
      <div className={styles.shortcutControl}>
        <button
          type="button"
          className={styles.selector}
          aria-label={label}
          aria-invalid={capturing ? modifierOnly : invalid}
          disabled={disabled}
          onClick={() => setCapturing((current) => !current)}
        >
          <span className={styles.selectorLabel}>{capturing ? captureLabel : formatShortcut(value, SHORTCUT_PLATFORM)}</span>
        </button>
        {!capturing && value !== DEFAULT_EARS_SETTINGS.voiceShortcut ? (
          <button type="button" className={styles.shortcutAction} disabled={disabled} onClick={onReset}>{t('shortcutClear')}</button>
        ) : null}
      </div>
    </RowField>
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
            <span className={styles.selectorLabel}>{labelText}</span>
            <IconChevronDownOutline14 className={styles.chevron} />
          </button>
        }
      />
    </RowField>
  )
}

function TextRow({ label, hint, value, disabled, invalid, numeric, placeholder, onChange, onBlur }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; numeric?: boolean; placeholder?: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onBlur?: () => void }) {
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <Input className={styles.textInput} type={numeric ? 'number' : 'text'} value={value} placeholder={placeholder} disabled={disabled} aria-label={label} aria-invalid={invalid} onChange={onChange} onBlur={onBlur} />
    </RowField>
  )
}

function PromptRow({ label, hint, value, disabled, invalid, defaultValue, t, onChange, onReset, onBlur }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; defaultValue: string; t: Translate; onChange: (value: string) => void; onReset: () => void; onBlur?: () => void }) {
  const [showDefault, setShowDefault] = useState(false)
  const length = value.trim().length
  const over = length > MAX_POLISH_PROMPT_LENGTH
  return (
    <RowField label={label} hint={over ? t('promptTooLong') : hint} invalid={invalid} alert={over} wide>
      <div className={styles.promptControl}>
        <textarea
          className={`${styles.textInput} ${styles.promptInput}`}
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-invalid={invalid}
          placeholder={t('promptPlaceholder')}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        <div className={styles.promptMeta}>
          <p className={`${styles.promptCount} ${over ? styles.promptCountOver : ''}`}>{`${length} / ${MAX_POLISH_PROMPT_LENGTH}`}</p>
          <button type="button" className={styles.shortcutAction} disabled={disabled} onClick={() => setShowDefault((current) => !current)}>{t(showDefault ? 'promptHideDefault' : 'promptViewDefault')}</button>
          <button type="button" className={styles.shortcutAction} disabled={disabled || value.trim() === ''} onClick={onReset}>{t('promptReset')}</button>
        </div>
        {showDefault ? <pre className={styles.promptDefault}>{defaultValue}</pre> : null}
      </div>
    </RowField>
  )
}

function KeyRow({ label, hint, value, configured, clearPending, disabled, invalid, onEdit, onClear, onUndoClear, onBlur, t }: { label: string; hint: string; value: string; configured: boolean; clearPending: boolean; disabled: boolean; invalid: boolean; onEdit: (text: string) => void; onClear: () => void; onUndoClear: () => void; onBlur?: () => void; t: Translate }) {
  const hasAction = configured || clearPending
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <div className={styles.keyControl}>
        <input
          className={`${styles.textInput} ${styles.keyInput} ${hasAction ? styles.keyInputHasAction : ''}`}
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
          placeholder={clearPending ? t('cloudKeyClearPending') : configured ? t('cloudKeyConfigured') : t('cloudKeyNotConfigured')}
          onChange={(event) => onEdit(event.target.value)}
          onBlur={onBlur}
        />
        {hasAction ? <button type="button" className={styles.keyAction} disabled={disabled} onClick={clearPending ? onUndoClear : onClear}>{t(clearPending ? 'undoClearKey' : 'clearKey')}</button> : null}
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
        <div className={`${styles.rowDesc} ${styles.rowDescInline} ${modelState.error !== null || invalid ? styles.invalid : ''}`} {...(modelState.error !== null || invalid ? { role: 'alert' } : {})}>
          {statusContent}
        </div>
      </div>
      <div className={styles.rowControl}>
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
              <span className={styles.selectorLabel}>{labelText}</span>
              <IconChevronDownOutline14 className={styles.chevron} />
            </button>
          }
        />
      </div>
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
  if (backend === 'cloud-openai') {
    if (provider === 'groq') return t('backendHintGroq')
    if (provider === 'bailian') return t('backendHintBailian')
    return t('backendHintCustom')
  }
  return t('backendHintWebSpeech')
}
