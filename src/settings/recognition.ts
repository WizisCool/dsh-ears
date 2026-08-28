export const ASR_BACKEND_IDS = ['web-speech', 'local-whisper', 'cloud-openai'] as const
export type AsrBackendId = typeof ASR_BACKEND_IDS[number]

export const CLOUD_ASR_PROVIDER_IDS = ['groq', 'deepgram', 'bailian', 'tencent', 'mimo', 'custom'] as const
export type CloudAsrProviderId = typeof CLOUD_ASR_PROVIDER_IDS[number]

export const MIMO_DEFAULT_MODEL = 'mimo-v2.5-asr'
export const MIMO_ASR_SERVICE_IDS = ['api', 'token-plan'] as const
export type MimoAsrServiceId = typeof MIMO_ASR_SERVICE_IDS[number]
export const MIMO_ASR_DEFAULT_SERVICE: MimoAsrServiceId = 'api'

export const MIMO_ASR_CLUSTERS = ['cn', 'sgp', 'ams'] as const
export type MimoAsrClusterId = typeof MIMO_ASR_CLUSTERS[number]
export const MIMO_ASR_DEFAULT_CLUSTER: MimoAsrClusterId = 'cn'

/** Derive the transcription endpoint for a MiMo access method + cluster (client-safe, no Node globals). */
export function mimoEndpoint(service: string, cluster: string): string {
  if (service === 'token-plan') {
    if (cluster === 'sgp') return 'https://token-plan-sgp.xiaomimimo.com/v1/chat/completions'
    if (cluster === 'ams') return 'https://token-plan-ams.xiaomimimo.com/v1/chat/completions'
    return 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions'
  }
  return 'https://api.xiaomimimo.com/v1/chat/completions'
}

export const DEEPGRAM_DEFAULT_MODEL = 'nova-3'
export const DEEPGRAM_ASR_SERVICE_IDS = ['recording-file', 'realtime'] as const
export type DeepgramAsrServiceId = typeof DEEPGRAM_ASR_SERVICE_IDS[number]
export const DEEPGRAM_ASR_DEFAULT_SERVICE: DeepgramAsrServiceId = 'recording-file'

export const BAILIAN_MAX_RECORDING_SECONDS = 300
export const TENCENT_DEFAULT_ENGINE = '16k_zh'
export const TENCENT_ASR_SERVICE_IDS = ['recording-file', 'realtime'] as const
export type TencentAsrServiceId = typeof TENCENT_ASR_SERVICE_IDS[number]
export const TENCENT_ASR_DEFAULT_SERVICE: TencentAsrServiceId = 'recording-file'

export const WHISPER_MODEL_IDS = ['tiny', 'base', 'small', 'medium', 'large', 'turbo'] as const
export type WhisperModelId = typeof WHISPER_MODEL_IDS[number]

export const WHISPER_ACCELERATION_IDS = ['default', 'vulkan', 'cuda'] as const
export type WhisperAccelerationId = typeof WHISPER_ACCELERATION_IDS[number]

export interface RecognitionSettings {
  backend: AsrBackendId | string
  webSpeech: {
    language: string
  }
  localWhisper: {
    model: WhisperModelId | string
    /** `default` is the Host-selected automatic native variant. */
    acceleration: WhisperAccelerationId | string
    language: string
  }
  cloudProvider: CloudAsrProviderId | string
  maxRecordingSeconds: number
}

export const DEFAULT_RECOGNITION_SETTINGS: RecognitionSettings = Object.freeze({
  backend: 'web-speech',
  webSpeech: Object.freeze({
    language: ''
  }),
  localWhisper: Object.freeze({
    model: 'tiny',
    // The Host resolves this automatic value against platform/native capabilities.
    acceleration: 'default',
    language: ''
  }),
  cloudProvider: 'groq',
  maxRecordingSeconds: 120
})

export function isValidRecordingLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 600
}

/** Empty Web Speech recognition language follows the dsh English/中文 locale. A typed value wins. */
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
