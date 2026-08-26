import { ASR_BACKEND_IDS, CLOUD_ASR_PROVIDER_IDS, MAX_CLOUD_API_KEY_LENGTH, MAX_POLISH_PROMPT_LENGTH, SETTINGS_DISPLAY_NAME_IDS, TENCENT_ASR_SERVICE_IDS, WHISPER_ACCELERATION_IDS, WHISPER_MODEL_IDS, isBailianAsrHost, isHttpEndpoint, isValidRecordingLimit } from '../config.js'
import type { EarsSettings } from '../config.js'
import { shortcutRejectReason } from '../shortcut.js'

export type FieldName = keyof EarsSettings

export function cloudAsrModelField(provider: string): 'cloudAsrGroqModel' | 'cloudAsrCustomModel' | 'cloudAsrBailianModel' | 'cloudAsrTencentEngineType' {
  if (provider === 'bailian') return 'cloudAsrBailianModel'
  if (provider === 'tencent') return 'cloudAsrTencentEngineType'
  if (provider === 'custom') return 'cloudAsrCustomModel'
  return 'cloudAsrGroqModel'
}

export function parseSettingsField(field: FieldName, text: string): unknown {
  if (field === 'maxRecordingSeconds') return Number(text)
  if (field === 'polishingEnabled' || field === 'voiceShortcutEnabled' || field === 'voiceSoundsEnabled') return text === 'on'
  return text
}

export function isSettingsFieldInvalid(field: FieldName, text: string): boolean {
  if (field === 'webSpeechLanguage' || field === 'localWhisperLanguage' || field === 'cloudAsrGroqLanguage' || field === 'cloudAsrCustomLanguage' || field === 'cloudAsrBailianLanguage') return false
  if (field === 'asrBackend') return !(ASR_BACKEND_IDS as readonly string[]).includes(text)
  if (field === 'localWhisperModel') return !(WHISPER_MODEL_IDS as readonly string[]).includes(text)
  if (field === 'localWhisperAcceleration') return !(WHISPER_ACCELERATION_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrProvider') return !(CLOUD_ASR_PROVIDER_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrGroqApiKey' || field === 'cloudAsrCustomApiKey' || field === 'cloudAsrBailianApiKey' || field === 'cloudAsrTencentSecretKey') return text.length > MAX_CLOUD_API_KEY_LENGTH
  if (field === 'cloudAsrCustomEndpoint') {
    if (text.trim() === '') return false
    return !isHttpEndpoint(text)
  }
  if (field === 'cloudAsrBailianHost') {
    if (text.trim() === '') return false
    return !isBailianAsrHost(text)
  }
  if (field === 'cloudAsrTencentService') return !(TENCENT_ASR_SERVICE_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrGroqModel' || field === 'cloudAsrCustomModel' || field === 'cloudAsrBailianModel' || field === 'cloudAsrTencentAppId' || field === 'cloudAsrTencentSecretId' || field === 'cloudAsrTencentEngineType') return false
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
