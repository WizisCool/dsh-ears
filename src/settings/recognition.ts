export const ASR_BACKEND_IDS = ['web-speech', 'local-whisper', 'cloud-openai'] as const
export type AsrBackendId = typeof ASR_BACKEND_IDS[number]

export const CLOUD_ASR_PROVIDER_IDS = ['groq', 'bailian', 'tencent', 'custom'] as const
export type CloudAsrProviderId = typeof CLOUD_ASR_PROVIDER_IDS[number]

export const BAILIAN_MAX_RECORDING_SECONDS = 300
export const TENCENT_FLASH_DEFAULT_ENGINE = '16k_zh'
export const TENCENT_ASR_SERVICE_IDS = ['flash', 'big-model', 'realtime'] as const
export type TencentAsrServiceId = typeof TENCENT_ASR_SERVICE_IDS[number]
export const TENCENT_ASR_DEFAULT_SERVICE: TencentAsrServiceId = 'flash'

export const WHISPER_MODEL_IDS = ['tiny', 'base', 'small', 'medium', 'large', 'turbo'] as const
export type WhisperModelId = typeof WHISPER_MODEL_IDS[number]

export const WHISPER_ACCELERATION_IDS = ['default', 'vulkan', 'cuda'] as const
export type WhisperAccelerationId = typeof WHISPER_ACCELERATION_IDS[number]

export interface RecognitionSettings {
  backend: AsrBackendId | string
  localWhisper: {
    model: WhisperModelId | string
    acceleration: WhisperAccelerationId | string
  }
  cloudProvider: CloudAsrProviderId | string
  language: string
  maxRecordingSeconds: number
}

export const DEFAULT_RECOGNITION_SETTINGS: RecognitionSettings = Object.freeze({
  backend: 'web-speech',
  localWhisper: Object.freeze({
    model: 'tiny',
    acceleration: 'default'
  }),
  cloudProvider: 'groq',
  language: '',
  maxRecordingSeconds: 120
})

export function isValidRecordingLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 600
}

/** Empty stored language follows the dsh English/中文 locale. A typed value wins. */
export function languageFromUiLocale(locale: string): string {
  return locale.trim().toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

export function effectiveRecognitionLanguage(stored: string, uiLocale: string): string {
  const value = stored.trim()
  return value === '' ? languageFromUiLocale(uiLocale) : value
}

export function effectiveRecordingSeconds(settings: Pick<RecognitionSettings, 'backend' | 'cloudProvider' | 'maxRecordingSeconds'>): number {
  const limit = settings.maxRecordingSeconds
  if (settings.backend === 'cloud-openai' && settings.cloudProvider === 'bailian') {
    return Math.min(limit, BAILIAN_MAX_RECORDING_SECONDS)
  }
  return limit
}
