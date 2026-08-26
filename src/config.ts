import { isValidStoredShortcut } from './shortcut.js'
import {
  ASR_BACKEND_IDS,
  BAILIAN_MAX_RECORDING_SECONDS,
  CLOUD_ASR_PROVIDER_IDS,
  TENCENT_ASR_DEFAULT_SERVICE,
  TENCENT_ASR_SERVICE_IDS,
  TENCENT_DEFAULT_ENGINE,
  effectiveRecognitionLanguage,
  isValidRecordingLimit,
  WHISPER_ACCELERATION_IDS,
  WHISPER_MODEL_IDS
} from './settings/recognition.js'
import { isBailianAsrHost, isHttpEndpoint, MAX_CLOUD_API_KEY_LENGTH } from './settings/cloud-asr.js'
import { MAX_POLISH_PROMPT_LENGTH } from './settings/polishing.js'
import { SETTINGS_DISPLAY_NAME_IDS } from './settings/general.js'
import type {
  AsrBackendId,
  CloudAsrProviderId,
  TencentAsrServiceId,
  WhisperAccelerationId,
  WhisperModelId
} from './settings/recognition.js'
import type { SettingsDisplayNameId } from './settings/general.js'

export {
  ASR_BACKEND_IDS,
  BAILIAN_MAX_RECORDING_SECONDS,
  CLOUD_ASR_PROVIDER_IDS,
  TENCENT_ASR_DEFAULT_SERVICE,
  TENCENT_ASR_SERVICE_IDS,
  TENCENT_DEFAULT_ENGINE,
  effectiveRecognitionLanguage,
  isValidRecordingLimit,
  WHISPER_ACCELERATION_IDS,
  WHISPER_MODEL_IDS
} from './settings/recognition.js'
export { isBailianAsrHost, isHttpEndpoint, MAX_CLOUD_API_KEY_LENGTH } from './settings/cloud-asr.js'
export { MAX_POLISH_PROMPT_LENGTH } from './settings/polishing.js'
export { SETTINGS_DISPLAY_NAME_IDS, settingsPageLabel } from './settings/general.js'
export type {
  AsrBackendId,
  CloudAsrProviderId,
  TencentAsrServiceId,
  WhisperAccelerationId,
  WhisperModelId
} from './settings/recognition.js'
export type { SettingsDisplayNameId } from './settings/general.js'

export const SETTINGS_NAMESPACE = 'dsh-ears'
export const EARS_SETTINGS_SCHEMA_VERSION = 4 as const

/**
 * Flat settings are the compatibility view used by the existing Remote and
 * browser client. Host persistence is organized separately in settings-store.
 */
export interface EarsSettings {
  asrBackend: AsrBackendId | string
  webSpeechLanguage: string
  localWhisperModel: WhisperModelId | string
  localWhisperAcceleration: WhisperAccelerationId | string
  localWhisperLanguage: string
  cloudAsrProvider: CloudAsrProviderId | string
  cloudAsrGroqApiKey: string
  cloudAsrGroqModel: string
  cloudAsrGroqLanguage: string
  cloudAsrCustomApiKey: string
  cloudAsrCustomEndpoint: string
  cloudAsrCustomModel: string
  cloudAsrCustomLanguage: string
  cloudAsrBailianApiKey: string
  cloudAsrBailianHost: string
  cloudAsrBailianModel: string
  cloudAsrBailianLanguage: string
  cloudAsrTencentAppId: string
  cloudAsrTencentSecretId: string
  cloudAsrTencentSecretKey: string
  cloudAsrTencentEngineType: string
  cloudAsrTencentService: string
  maxRecordingSeconds: number
  voiceShortcutEnabled: boolean
  voiceShortcut: string
  voiceSoundsEnabled: boolean
  settingsDisplayName: SettingsDisplayNameId | string
  polishingEnabled: boolean
  polishProvider: string
  polishModel: string
  polishReasoningEffort: string
  polishPrompt: string
}

export const DEFAULT_EARS_SETTINGS: EarsSettings = Object.freeze({
  asrBackend: 'web-speech',
  webSpeechLanguage: '',
  localWhisperModel: 'tiny',
  localWhisperAcceleration: 'default',
  localWhisperLanguage: '',
  cloudAsrProvider: 'groq',
  cloudAsrGroqApiKey: '',
  cloudAsrGroqModel: '',
  cloudAsrGroqLanguage: '',
  cloudAsrCustomApiKey: '',
  cloudAsrCustomEndpoint: '',
  cloudAsrCustomModel: '',
  cloudAsrCustomLanguage: '',
  cloudAsrBailianApiKey: '',
  cloudAsrBailianHost: '',
  cloudAsrBailianModel: '',
  cloudAsrBailianLanguage: '',
  cloudAsrTencentAppId: '',
  cloudAsrTencentSecretId: '',
  cloudAsrTencentSecretKey: '',
  cloudAsrTencentEngineType: TENCENT_DEFAULT_ENGINE,
  cloudAsrTencentService: TENCENT_ASR_DEFAULT_SERVICE,
  maxRecordingSeconds: 120,
  voiceShortcutEnabled: true,
  voiceShortcut: 'ctrl+shift+space',
  voiceSoundsEnabled: true,
  settingsDisplayName: 'dsh-ears',
  polishingEnabled: false,
  polishProvider: '',
  polishModel: '',
  polishReasoningEffort: '',
  polishPrompt: ''
})

export interface PolishRoute {
  provider: string
  providerName: string
  model: string
  modelName: string
}

export interface ReasoningEffortInfo {
  id: string
  name: string
  description?: string
}

export interface ReasoningEffortsView {
  efforts: ReasoningEffortInfo[]
  defaultEffort?: string
}

export function effectiveRecordingSeconds(settings: Pick<EarsSettings, 'asrBackend' | 'cloudAsrProvider' | 'maxRecordingSeconds'>): number {
  const limit = settings.maxRecordingSeconds
  if (settings.asrBackend === 'cloud-openai' && settings.cloudAsrProvider === 'bailian') {
    return Math.min(limit, BAILIAN_MAX_RECORDING_SECONDS)
  }
  return limit
}

export function validateEarsSettings(settings: EarsSettings): void {
  if (!(ASR_BACKEND_IDS as readonly string[]).includes(settings.asrBackend)) throw new Error('Unknown dsh-ears ASR backend')
  if (!(WHISPER_MODEL_IDS as readonly string[]).includes(settings.localWhisperModel)) throw new Error('Unknown dsh-ears Whisper model')
  if (!(WHISPER_ACCELERATION_IDS as readonly string[]).includes(settings.localWhisperAcceleration)) throw new Error('Unknown dsh-ears Whisper acceleration')
  if (!(CLOUD_ASR_PROVIDER_IDS as readonly string[]).includes(settings.cloudAsrProvider)) throw new Error('Unknown dsh-ears cloud ASR provider')
  if (settings.cloudAsrGroqApiKey.length > MAX_CLOUD_API_KEY_LENGTH) throw new Error('dsh-ears Groq ASR API key is too long')
  if (settings.cloudAsrCustomApiKey.length > MAX_CLOUD_API_KEY_LENGTH) throw new Error('dsh-ears custom OpenAI-compatible ASR API key is too long')
  if (settings.cloudAsrBailianApiKey.length > MAX_CLOUD_API_KEY_LENGTH) throw new Error('dsh-ears Bailian ASR API key is too long')
  if (settings.cloudAsrTencentSecretKey.length > MAX_CLOUD_API_KEY_LENGTH) throw new Error('dsh-ears Tencent Cloud SecretKey is too long')
  if (!(TENCENT_ASR_SERVICE_IDS as readonly string[]).includes(settings.cloudAsrTencentService)) throw new Error('Unknown dsh-ears Tencent Cloud ASR service')
  if (!isValidRecordingLimit(settings.maxRecordingSeconds)) throw new Error('dsh-ears recording limit must be between 1 and 600 seconds')
  if (!isValidStoredShortcut(settings.voiceShortcut)) throw new Error('dsh-ears voice shortcut is invalid')
  if (settings.cloudAsrCustomEndpoint.trim() !== '' && !isHttpEndpoint(settings.cloudAsrCustomEndpoint)) throw new Error('Custom OpenAI-compatible ASR endpoint must use HTTP or HTTPS without credentials')
  if (settings.cloudAsrBailianHost.trim() !== '' && !isBailianAsrHost(settings.cloudAsrBailianHost)) throw new Error('Bailian ASR host must use HTTPS without credentials')
  if (settings.polishPrompt.trim().length > MAX_POLISH_PROMPT_LENGTH) throw new Error('dsh-ears polish prompt is too long')
  if (!(SETTINGS_DISPLAY_NAME_IDS as readonly string[]).includes(settings.settingsDisplayName)) throw new Error('Unknown dsh-ears settings display name')
}
