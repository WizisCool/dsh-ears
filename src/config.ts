import { isValidStoredShortcut } from './shortcut.js'
import {
  ASR_BACKEND_IDS,
  BAILIAN_MAX_RECORDING_SECONDS,
  DEFAULT_RECOGNITION_SETTINGS,
  CLOUD_ASR_PROVIDER_IDS,
  DEEPGRAM_ASR_DEFAULT_SERVICE,
  DEEPGRAM_ASR_SERVICE_IDS,
  DEEPGRAM_DEFAULT_MODEL,
  MIMO_ASR_CLUSTERS,
  MIMO_ASR_DEFAULT_CLUSTER,
  MIMO_ASR_DEFAULT_SERVICE,
  MIMO_ASR_SERVICE_IDS,
  MIMO_DEFAULT_MODEL,
  TENCENT_ASR_DEFAULT_SERVICE,
  TENCENT_ASR_SERVICE_IDS,
  TENCENT_DEFAULT_ENGINE,
  effectiveRecognitionLanguage,
  isValidRecordingLimit,
  WHISPER_ACCELERATION_IDS,
  WHISPER_MODEL_IDS
} from './settings/recognition.js'
import { isBailianAsrHost, isHttpEndpoint, MAX_CLOUD_API_KEY_LENGTH } from './settings/cloud-asr.js'
import { DEFAULT_POLISHING_SETTINGS, MAX_POLISH_PROMPT_LENGTH } from './settings/polishing.js'
import { SETTINGS_DISPLAY_NAME_IDS } from './settings/general.js'
import { CLOUD_ASR_PROVIDERS, cloudAsrFieldDefinition, cloudAsrFieldValue, validateCloudAsrFieldValue } from './asr/providers.js'
import type {
  AsrBackendId,
  CloudAsrProviderId,
  DeepgramAsrServiceId,
  MimoAsrClusterId,
  MimoAsrServiceId,
  TencentAsrServiceId,
  WhisperAccelerationId,
  WhisperModelId
} from './settings/recognition.js'
import type { SettingsDisplayNameId } from './settings/general.js'

export {
  ASR_BACKEND_IDS,
  BAILIAN_MAX_RECORDING_SECONDS,
  CLOUD_ASR_PROVIDER_IDS,
  DEEPGRAM_ASR_DEFAULT_SERVICE,
  DEEPGRAM_ASR_SERVICE_IDS,
  DEEPGRAM_DEFAULT_MODEL,
  MIMO_ASR_CLUSTERS,
  MIMO_ASR_DEFAULT_CLUSTER,
  MIMO_ASR_DEFAULT_SERVICE,
  MIMO_ASR_SERVICE_IDS,
  MIMO_DEFAULT_MODEL,
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
  DeepgramAsrServiceId,
  MimoAsrClusterId,
  MimoAsrServiceId,
  TencentAsrServiceId,
  WhisperAccelerationId,
  WhisperModelId
} from './settings/recognition.js'
export type { SettingsDisplayNameId } from './settings/general.js'

export const SETTINGS_NAMESPACE = 'dsh-ears'
export const EARS_SETTINGS_SCHEMA_VERSION = 4 as const

/** Browser-facing flat settings model. */
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
  cloudAsrDeepgramApiKey: string
  cloudAsrDeepgramModel: string
  cloudAsrDeepgramLanguage: string
  cloudAsrDeepgramService: string
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
  cloudAsrMimoApiKey: string
  cloudAsrMimoService: string
  cloudAsrMimoCluster: string
  cloudAsrMimoModel: string
  cloudAsrMimoLanguage: string
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
  asrBackend: DEFAULT_RECOGNITION_SETTINGS.backend,
  webSpeechLanguage: DEFAULT_RECOGNITION_SETTINGS.webSpeech.language,
  localWhisperModel: DEFAULT_RECOGNITION_SETTINGS.localWhisper.model,
  localWhisperAcceleration: DEFAULT_RECOGNITION_SETTINGS.localWhisper.acceleration,
  localWhisperLanguage: DEFAULT_RECOGNITION_SETTINGS.localWhisper.language,
  cloudAsrProvider: DEFAULT_RECOGNITION_SETTINGS.cloudProvider,
  cloudAsrGroqApiKey: '',
  cloudAsrGroqModel: '',
  cloudAsrGroqLanguage: '',
  cloudAsrDeepgramApiKey: '',
  cloudAsrDeepgramModel: DEEPGRAM_DEFAULT_MODEL,
  cloudAsrDeepgramLanguage: '',
  cloudAsrDeepgramService: DEEPGRAM_ASR_DEFAULT_SERVICE,
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
  cloudAsrMimoApiKey: '',
  cloudAsrMimoService: MIMO_ASR_DEFAULT_SERVICE,
  cloudAsrMimoCluster: MIMO_ASR_DEFAULT_CLUSTER,
  cloudAsrMimoModel: MIMO_DEFAULT_MODEL,
  cloudAsrMimoLanguage: '',
  maxRecordingSeconds: DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds,
  voiceShortcutEnabled: true,
  voiceShortcut: 'ctrl+shift+space',
  voiceSoundsEnabled: true,
  settingsDisplayName: 'dsh-ears',
  polishingEnabled: DEFAULT_POLISHING_SETTINGS.enabled,
  polishProvider: DEFAULT_POLISHING_SETTINGS.provider,
  polishModel: DEFAULT_POLISHING_SETTINGS.model,
  polishReasoningEffort: DEFAULT_POLISHING_SETTINGS.reasoningEffort,
  polishPrompt: DEFAULT_POLISHING_SETTINGS.prompt
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
  for (const provider of CLOUD_ASR_PROVIDERS) {
    for (const definition of provider.fields) {
      const value = cloudAsrFieldValue(settings, definition.field)
      if ((definition.kind === 'endpoint' || definition.kind === 'host') && value.trim() === '') continue
      if (!validateCloudAsrFieldValue(definition, value)) throw new Error(cloudAsrFieldValidationMessage(definition.field))
    }
  }
  if (!isValidRecordingLimit(settings.maxRecordingSeconds)) throw new Error('dsh-ears recording limit must be between 1 and 600 seconds')
  if (!isValidStoredShortcut(settings.voiceShortcut)) throw new Error('dsh-ears voice shortcut is invalid')
  if (settings.polishPrompt.trim().length > MAX_POLISH_PROMPT_LENGTH) throw new Error('dsh-ears polish prompt is too long')
  if (!(SETTINGS_DISPLAY_NAME_IDS as readonly string[]).includes(settings.settingsDisplayName)) throw new Error('Unknown dsh-ears settings display name')
}

export interface EarsSettingsRepairResult {
  readonly settings: EarsSettings
  readonly repairedFields: readonly string[]
}

/** Replace invalid persisted values with safe defaults without exposing their contents. */
export function repairInvalidEarsSettings(settings: EarsSettings): EarsSettingsRepairResult {
  const repaired = { ...settings }
  const repairedFields: string[] = []
  const replaceWithDefault = (field: keyof EarsSettings): void => {
    ;(repaired as unknown as Record<string, unknown>)[field] = DEFAULT_EARS_SETTINGS[field]
    repairedFields.push(field)
  }

  if (!(ASR_BACKEND_IDS as readonly string[]).includes(repaired.asrBackend)) replaceWithDefault('asrBackend')
  if (!(WHISPER_MODEL_IDS as readonly string[]).includes(repaired.localWhisperModel)) replaceWithDefault('localWhisperModel')
  if (!(WHISPER_ACCELERATION_IDS as readonly string[]).includes(repaired.localWhisperAcceleration)) replaceWithDefault('localWhisperAcceleration')
  if (!(CLOUD_ASR_PROVIDER_IDS as readonly string[]).includes(repaired.cloudAsrProvider)) replaceWithDefault('cloudAsrProvider')

  for (const provider of CLOUD_ASR_PROVIDERS) {
    for (const definition of provider.fields) {
      const value = cloudAsrFieldValue(repaired, definition.field)
      if (!validateCloudAsrFieldValue(definition, value)) replaceWithDefault(definition.field)
    }
  }

  if (!isValidRecordingLimit(repaired.maxRecordingSeconds)) replaceWithDefault('maxRecordingSeconds')
  if (typeof repaired.voiceShortcut !== 'string' || !isValidStoredShortcut(repaired.voiceShortcut)) replaceWithDefault('voiceShortcut')
  if (typeof repaired.polishPrompt !== 'string' || repaired.polishPrompt.trim().length > MAX_POLISH_PROMPT_LENGTH) replaceWithDefault('polishPrompt')
  if (!(SETTINGS_DISPLAY_NAME_IDS as readonly string[]).includes(repaired.settingsDisplayName)) replaceWithDefault('settingsDisplayName')

  validateEarsSettings(repaired)
  return { settings: repaired, repairedFields }
}

function cloudAsrFieldValidationMessage(field: string): string {
  return cloudAsrFieldDefinition(field)?.invalidMessage ?? `Invalid dsh-ears cloud ASR setting: ${field}`
}
