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
  title: 'dsh-ears', nav: 'dsh-ears', displayName: '显示名称', displayNameHint: '设置页导航上的名称。', displayNamePlugin: 'dsh-ears', displayNameVoice: '语音', description: '语音识别与文本润色', tabs: '配置分组', groupRecognition: '识别', groupPolishing: '润色', backend: '识别后端', backendHintWebSpeech: '浏览器实时识别。', backendHintLocalWhisper: '停止后由本机 whisper 转写。', backendHintGroq: 'Groq Whisper，需要 API key。', backendHintBailian: '百炼同步转写，录音最长 300 秒。', backendHintCustom: 'OpenAI 兼容转写端点。', webSpeechBackend: 'Web Speech', localWhisperBackend: '本地 Whisper', cloudBackend: '云端 ASR', groupLocal: '本地', groupCloud: '云提供商', groqProvider: 'Groq', bailianProvider: '阿里云百炼', customProvider: '自定义 OpenAI 兼容', bailianHost: 'API Host', bailianHostHint: 'HTTPS 源站，不要把密钥写进 URL。', bailianModelHint: '同步 Flash 模型名。', localModel: 'Whisper 模型', whisperDownloaded: '模型已下载', whisperNotDownloaded: '模型未下载', whisperDownloading: '下载中', whisperChecking: '检测中…', clickDownload: '点击下载', retryDownload: '重试下载', cancelDownload: '取消下载', deleteModel: '删除模型', confirmDeleteModel: '确认删除？', cloudEndpoint: '转录端点', cloudEndpointHint: '完整的 /audio/transcriptions 端点。', cloudModel: '云端模型', cloudModelHint: '端点接受的转写模型名。', cloudModelGroqHint: '从 Groq 获取的转写模型。', cloudModelFetchFailed: '获取模型列表失败。', cloudModelStale: '所选模型不在最新列表中，可能已下线。', retryModels: '重试', cloudKey: 'API key', cloudKeyHint: '只写入不回显。留空保持原值。', cloudKeyConfigured: '已配置', cloudKeyNotConfigured: '未配置', cloudKeyClearPending: '将清除', clearKey: '清除', undoClearKey: '撤销', backendUnavailable: '当前后端不可用：', localUnavailable: '请在 Host 安装 openai-whisper，并确保 whisper 在 PATH 中。', cloudUnavailable: '请选择云端模型并配置 API key。', language: '识别语言', languageHint: '留空则跟随界面语言。', languageFollowsUi: '跟随界面语言', recordingLimit: '单次录音上限（秒）', recordingLimitHint: '到达上限后自动停止，1–600 秒。', groupGeneral: '通用', shortcutEnabled: '语音快捷键', shortcutEnabledHint: '在 dsh 页面聚焦时开始或停止语音输入。', soundsEnabled: '语音音效', soundsEnabledHint: '开始和结束语音输入时播放按键音。', shortcut: '快捷键', shortcutHint: '开始或停止语音输入，仅当前页面生效。', shortcutCapture: '按下组合键…', shortcutCaptureHint: '按下新的组合键…（Esc 取消）', shortcutClear: '恢复默认', shortcutInvalidModifierOnly: '快捷键不能只包含修饰键。', shortcutInvalidTypingKey: '该组合会输入字符：请为字母/数字加上 Ctrl 或 Shift 等修饰键（Alt/Option 组合会输入特殊字符）。', shortcutInvalidFormat: '无效的快捷键组合。', shortcutReserved: '该组合可能与浏览器或系统保留快捷键冲突。', polishing: '文本润色', polishingHint: '将识别后的文本润色整理。', polishingOn: '开启', polishingOff: '关闭', provider: '模型提供方', providerHint: '选择已接入的模型提供商', model: '模型', modelHint: '选择该提供方下的模型', reasoningEffort: '推理强度', reasoningEffortHint: '与主界面一致；留空为 Default。', defaultEffort: 'Default', providerPlaceholder: '选择提供方', modelPlaceholder: '选择模型', loadingModels: '正在读取 dsh 模型列表…', noModels: '当前没有可用的 dsh 模型，请先在 dsh 中配置模型。', readOnly: '当前设置为只读，无法从此页保存。', loadFailed: '无法读取配置，请稍后重试。', saveFailed: '保存失败，修改已保留。'
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
  title: 'dsh-ears', nav: 'dsh-ears', displayName: 'Display name', displayNameHint: 'Name shown in the settings sidebar.', displayNamePlugin: 'dsh-ears', displayNameVoice: 'Voice', description: 'Speech recognition and text polishing', tabs: 'Configuration groups', groupRecognition: 'Recognition', groupPolishing: 'Polishing', backend: 'Recognition backend', backendHintWebSpeech: 'Live recognition in the browser.', backendHintLocalWhisper: 'Transcribed by local whisper after you stop.', backendHintGroq: 'Groq Whisper. Requires an API key.', backendHintBailian: 'Bailian sync transcription. Recordings cap at 300 seconds.', backendHintCustom: 'An OpenAI-compatible transcription endpoint.', webSpeechBackend: 'Web Speech', localWhisperBackend: 'Local Whisper', cloudBackend: 'Cloud ASR', groupLocal: 'Local', groupCloud: 'Cloud providers', groqProvider: 'Groq', bailianProvider: 'Alibaba Cloud Model Studio', customProvider: 'Custom OpenAI-compatible', bailianHost: 'API host', bailianHostHint: 'HTTPS origin. Do not put a key in the URL.', bailianModelHint: 'A sync Flash model name.', localModel: 'Whisper model', whisperDownloaded: 'Model downloaded', whisperNotDownloaded: 'Not downloaded', whisperDownloading: 'Downloading', whisperChecking: 'Checking…', clickDownload: 'Click to download', retryDownload: 'Retry download', cancelDownload: 'Cancel download', deleteModel: 'Delete model', confirmDeleteModel: 'Confirm delete?', cloudEndpoint: 'Transcription endpoint', cloudEndpointHint: 'Full /audio/transcriptions endpoint.', cloudModel: 'Cloud model', cloudModelHint: 'Transcription model accepted by the endpoint.', cloudModelGroqHint: 'Transcription models fetched from Groq.', cloudModelFetchFailed: 'Could not fetch the model list.', cloudModelStale: 'The selected model is not in the latest list; it may be retired.', retryModels: 'Retry', cloudKey: 'API key', cloudKeyHint: 'Write-only. Leave blank to keep the current key.', cloudKeyConfigured: 'Configured', cloudKeyNotConfigured: 'Not configured', cloudKeyClearPending: 'Will clear', clearKey: 'Clear', undoClearKey: 'Undo', backendUnavailable: 'The selected backend is unavailable: ', localUnavailable: 'Install openai-whisper on the Host and put whisper on PATH.', cloudUnavailable: 'Choose a cloud model and configure the API key.', language: 'Recognition language', languageHint: 'Leave blank to follow the interface language.', languageFollowsUi: 'Follow the interface language', recordingLimit: 'Recording limit (seconds)', recordingLimitHint: 'Stops automatically at the limit, from 1 to 600 seconds.', groupGeneral: 'General', shortcutEnabled: 'Voice shortcut', shortcutEnabledHint: 'Start or stop voice input while the dsh page is focused.', soundsEnabled: 'Voice sounds', soundsEnabledHint: 'Play a click when voice input starts and stops.', shortcut: 'Keyboard shortcut', shortcutHint: 'Starts or stops voice input. In-page only.', shortcutCapture: 'Press keys…', shortcutCaptureHint: 'Press the new key combination… (Esc to cancel)', shortcutClear: 'Reset to default', shortcutInvalidModifierOnly: 'The shortcut cannot contain only modifier keys.', shortcutInvalidTypingKey: 'This combination produces text: add Ctrl or Shift to letters/digits (Alt/Option combinations type special characters).', shortcutInvalidFormat: 'Invalid shortcut combination.', shortcutReserved: 'This combination may conflict with a browser or system reserved shortcut.', polishing: 'Text polishing', polishingHint: 'Polish and tidy the recognized text.', polishingOn: 'On', polishingOff: 'Off', provider: 'Provider', providerHint: 'Choose a connected model provider', model: 'Model', modelHint: 'Choose a model under that provider', reasoningEffort: 'Reasoning effort', reasoningEffortHint: 'Same as the composer selector. Leave empty for Default.', defaultEffort: 'Default', providerPlaceholder: 'Choose provider', modelPlaceholder: 'Choose model', loadingModels: 'Loading dsh model list…', noModels: 'No dsh models are available. Configure a model in dsh first.', readOnly: 'Settings are read-only and cannot be saved from this page.', loadFailed: 'Could not load the plugin configuration. Try again later.', saveFailed: 'Save failed. Your changes were kept.'
} as const

export type LocaleKey = keyof typeof localeEn
export type Translate = (key: LocaleKey) => string

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.dshEars': LocaleKey
  }
}
