import { ASR_BACKEND_IDS, CLOUD_ASR_PROVIDER_IDS, DEEPGRAM_ASR_SERVICE_IDS, MAX_CLOUD_API_KEY_LENGTH, MAX_POLISH_PROMPT_LENGTH, MIMO_ASR_CLUSTERS, MIMO_ASR_SERVICE_IDS, SETTINGS_DISPLAY_NAME_IDS, TENCENT_ASR_SERVICE_IDS, WHISPER_ACCELERATION_IDS, WHISPER_MODEL_IDS, isBailianAsrHost, isHttpEndpoint, isValidRecordingLimit } from '../config.js'
import type { EarsSettings } from '../config.js'
import { shortcutRejectReason } from '../shortcut.js'

export type FieldName = keyof EarsSettings

export function cloudAsrModelField(provider: string): 'cloudAsrGroqModel' | 'cloudAsrDeepgramModel' | 'cloudAsrCustomModel' | 'cloudAsrBailianModel' | 'cloudAsrTencentEngineType' | 'cloudAsrMimoModel' {
  if (provider === 'deepgram') return 'cloudAsrDeepgramModel'
  if (provider === 'bailian') return 'cloudAsrBailianModel'
  if (provider === 'tencent') return 'cloudAsrTencentEngineType'
  if (provider === 'mimo') return 'cloudAsrMimoModel'
  if (provider === 'custom') return 'cloudAsrCustomModel'
  return 'cloudAsrGroqModel'
}

export function parseSettingsField(field: FieldName, text: string): unknown {
  if (field === 'maxRecordingSeconds') return Number(text)
  if (field === 'polishingEnabled' || field === 'voiceShortcutEnabled' || field === 'voiceSoundsEnabled') return text === 'on'
  return text
}

export function isSettingsFieldInvalid(field: FieldName, text: string): boolean {
  if (field === 'webSpeechLanguage' || field === 'localWhisperLanguage' || field === 'cloudAsrGroqLanguage' || field === 'cloudAsrDeepgramLanguage' || field === 'cloudAsrCustomLanguage' || field === 'cloudAsrBailianLanguage' || field === 'cloudAsrMimoLanguage') return false
  if (field === 'asrBackend') return !(ASR_BACKEND_IDS as readonly string[]).includes(text)
  if (field === 'localWhisperModel') return !(WHISPER_MODEL_IDS as readonly string[]).includes(text)
  if (field === 'localWhisperAcceleration') return !(WHISPER_ACCELERATION_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrProvider') return !(CLOUD_ASR_PROVIDER_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrGroqApiKey' || field === 'cloudAsrDeepgramApiKey' || field === 'cloudAsrCustomApiKey' || field === 'cloudAsrBailianApiKey' || field === 'cloudAsrTencentSecretKey' || field === 'cloudAsrMimoApiKey') return text.length > MAX_CLOUD_API_KEY_LENGTH
  if (field === 'cloudAsrCustomEndpoint') {
    if (text.trim() === '') return false
    return !isHttpEndpoint(text)
  }
  if (field === 'cloudAsrBailianHost') {
    if (text.trim() === '') return false
    return !isBailianAsrHost(text)
  }
  if (field === 'cloudAsrTencentService') return !(TENCENT_ASR_SERVICE_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrDeepgramService') return !(DEEPGRAM_ASR_SERVICE_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrMimoService') return !(MIMO_ASR_SERVICE_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrMimoCluster') return !(MIMO_ASR_CLUSTERS as readonly string[]).includes(text)
  if (field === 'cloudAsrGroqModel' || field === 'cloudAsrDeepgramModel' || field === 'cloudAsrCustomModel' || field === 'cloudAsrBailianModel' || field === 'cloudAsrTencentAppId' || field === 'cloudAsrTencentSecretId' || field === 'cloudAsrTencentEngineType' || field === 'cloudAsrMimoModel') return false
  if (field === 'polishProvider' || field === 'polishModel' || field === 'polishReasoningEffort' || field === 'polishPrompt') {
    if (field === 'polishPrompt') return text.trim().length > MAX_POLISH_PROMPT_LENGTH
    return false
  }
  if (field === 'settingsDisplayName') return !(SETTINGS_DISPLAY_NAME_IDS as readonly string[]).includes(text)
  if (field === 'polishingEnabled' || field === 'voiceShortcutEnabled' || field === 'voiceSoundsEnabled') return text !== 'on' && text !== 'off'
  if (field === 'voiceShortcut') return shortcutRejectReason(text) !== null
  if (text.trim() === '') return false
  const value = Number(text)
  return !isValidRecordingLimit(value)
}
