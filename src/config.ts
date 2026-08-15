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
  polishReasoningEffort: string
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
  polishModel: '',
  polishReasoningEffort: ''
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

const CREDENTIAL_REFERENCE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export function isCredentialReference(value: string): boolean {
  const reference = value.trim()
  return reference !== '' && reference.length <= 128 && CREDENTIAL_REFERENCE_PATTERN.test(reference)
}

export function isHttpEndpoint(value: string): boolean {
  if (value.trim() === '') return false
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

export function isValidRecordingLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 600
}

export function validateEarsSettings(settings: EarsSettings): void {
  if (!(ASR_BACKEND_IDS as readonly string[]).includes(settings.asrBackend)) throw new Error('Unknown dsh-ears ASR backend')
  if (!(WHISPER_MODEL_IDS as readonly string[]).includes(settings.localWhisperModel)) throw new Error('Unknown dsh-ears Whisper model')
  if (settings.language.trim() === '') throw new Error('dsh-ears recognition language is required')
  if (!isValidRecordingLimit(settings.maxRecordingSeconds)) throw new Error('dsh-ears recording limit must be between 1 and 600 seconds')
  if (settings.cloudAsrEndpoint.trim() !== '' && !isHttpEndpoint(settings.cloudAsrEndpoint)) throw new Error('Cloud ASR endpoint must use HTTP or HTTPS without credentials')
  if (settings.cloudAsrCredentialRef.trim() !== '' && !isCredentialReference(settings.cloudAsrCredentialRef)) throw new Error('Invalid dsh credential reference')
  if (settings.asrBackend === 'cloud-openai') {
    if (!isHttpEndpoint(settings.cloudAsrEndpoint)) throw new Error('Cloud ASR endpoint must use HTTP or HTTPS without credentials')
    if (settings.cloudAsrModel.trim() === '') throw new Error('Cloud ASR model is required')
  }
  if (settings.polishingEnabled && (settings.polishProvider.trim() === '') !== (settings.polishModel.trim() === '')) throw new Error('Polishing provider and model must be selected together')
}
