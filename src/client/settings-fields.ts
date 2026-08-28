import { ASR_BACKEND_IDS, CLOUD_ASR_PROVIDER_IDS, MAX_POLISH_PROMPT_LENGTH, SETTINGS_DISPLAY_NAME_IDS, WHISPER_ACCELERATION_IDS, WHISPER_MODEL_IDS, isValidRecordingLimit } from '../config.js'
import type { EarsSettings } from '../config.js'
import { cloudAsrFieldDefinition, cloudAsrModelField as registryCloudAsrModelField, validateCloudAsrFieldValue, type CloudAsrModelField } from '../asr/providers.js'
import { shortcutRejectReason } from '../shortcut.js'

export type FieldName = keyof EarsSettings

export function cloudAsrModelField(provider: string): CloudAsrModelField {
  return registryCloudAsrModelField(provider) ?? 'cloudAsrGroqModel'
}

export function parseSettingsField(field: FieldName, text: string): unknown {
  if (field === 'maxRecordingSeconds') return Number(text)
  if (field === 'polishingEnabled' || field === 'voiceShortcutEnabled' || field === 'voiceSoundsEnabled') return text === 'on'
  return text
}

export function isSettingsFieldInvalid(field: FieldName, text: string): boolean {
  const cloudField = cloudAsrFieldDefinition(field)
  if (cloudField !== undefined) return !validateCloudAsrFieldValue(cloudField, text)
  if (field === 'webSpeechLanguage' || field === 'localWhisperLanguage') return false
  if (field === 'asrBackend') return !(ASR_BACKEND_IDS as readonly string[]).includes(text)
  if (field === 'localWhisperModel') return !(WHISPER_MODEL_IDS as readonly string[]).includes(text)
  if (field === 'localWhisperAcceleration') return !(WHISPER_ACCELERATION_IDS as readonly string[]).includes(text)
  if (field === 'cloudAsrProvider') return !(CLOUD_ASR_PROVIDER_IDS as readonly string[]).includes(text)
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
