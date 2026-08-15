import s from '@deepseek-ai/schemastery'

export const SETTINGS_NAMESPACE = 'dsh-ears'

export const ASR_BACKEND_IDS = ['web-speech', 'local-whisper', 'cloud-openai'] as const
export type AsrBackendId = typeof ASR_BACKEND_IDS[number]

export const WHISPER_MODEL_IDS = ['tiny', 'base', 'small', 'medium', 'large', 'turbo'] as const
export type WhisperModelId = typeof WHISPER_MODEL_IDS[number]

export interface EarsSettings {
  asrBackend: AsrBackendId | string
  localWhisperModel: WhisperModelId | string
  cloudAsrEndpoint: string
  cloudAsrModel: string
  cloudAsrCredentialRef: string
  language: string
  maxRecordingSeconds: number
  polishingEnabled: boolean
  polishProvider: string
  polishModel: string
}

export const DEFAULT_EARS_SETTINGS: EarsSettings = Object.freeze({
  asrBackend: 'web-speech',
  localWhisperModel: 'tiny',
  cloudAsrEndpoint: '',
  cloudAsrModel: 'whisper-1',
  cloudAsrCredentialRef: '',
  language: 'zh-CN',
  maxRecordingSeconds: 120,
  polishingEnabled: true,
  polishProvider: '',
  polishModel: ''
})

export const EarsSettingsSchema = s.object({
  asrBackend: s.string().default(DEFAULT_EARS_SETTINGS.asrBackend),
  localWhisperModel: s.string().default(DEFAULT_EARS_SETTINGS.localWhisperModel),
  cloudAsrEndpoint: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrEndpoint),
  cloudAsrModel: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrModel),
  cloudAsrCredentialRef: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrCredentialRef),
  language: s.string().default(DEFAULT_EARS_SETTINGS.language),
  maxRecordingSeconds: s.number().default(DEFAULT_EARS_SETTINGS.maxRecordingSeconds),
  polishingEnabled: s.boolean().default(DEFAULT_EARS_SETTINGS.polishingEnabled),
  polishProvider: s.string().default(DEFAULT_EARS_SETTINGS.polishProvider),
  polishModel: s.string().default(DEFAULT_EARS_SETTINGS.polishModel)
})

export interface PolishRoute {
  provider: string
  providerName: string
  model: string
  modelName: string
}
