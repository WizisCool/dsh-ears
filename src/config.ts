import { isValidStoredShortcut } from './shortcut.js'

export const SETTINGS_NAMESPACE = 'dsh-ears'

export const ASR_BACKEND_IDS = ['web-speech', 'local-whisper', 'cloud-openai'] as const
export type AsrBackendId = typeof ASR_BACKEND_IDS[number]

export const CLOUD_ASR_PROVIDER_IDS = ['groq', 'bailian', 'custom'] as const
export type CloudAsrProviderId = typeof CLOUD_ASR_PROVIDER_IDS[number]
export const BAILIAN_MAX_RECORDING_SECONDS = 300

export const WHISPER_MODEL_IDS = ['tiny', 'base', 'small', 'medium', 'large', 'turbo'] as const
export type WhisperModelId = typeof WHISPER_MODEL_IDS[number]

export const MAX_CLOUD_API_KEY_LENGTH = 512
export const MAX_POLISH_PROMPT_LENGTH = 4000

export interface EarsSettings {
  asrBackend: AsrBackendId | string
  localWhisperModel: WhisperModelId | string
  cloudAsrProvider: CloudAsrProviderId | string
  cloudAsrGroqApiKey: string
  cloudAsrGroqModel: string
  cloudAsrCustomApiKey: string
  cloudAsrCustomEndpoint: string
  cloudAsrCustomModel: string
  cloudAsrBailianApiKey: string
  cloudAsrBailianHost: string
  cloudAsrBailianModel: string
  language: string
  maxRecordingSeconds: number
  voiceShortcutEnabled: boolean
  voiceShortcut: string
  polishingEnabled: boolean
  polishProvider: string
  polishModel: string
  polishReasoningEffort: string
  polishPrompt: string
}

export const DEFAULT_EARS_SETTINGS: EarsSettings = Object.freeze({
  asrBackend: 'web-speech',
  localWhisperModel: 'tiny',
  cloudAsrProvider: 'groq',
  cloudAsrGroqApiKey: '',
  cloudAsrGroqModel: '',
  cloudAsrCustomApiKey: '',
  cloudAsrCustomEndpoint: '',
  cloudAsrCustomModel: '',
  cloudAsrBailianApiKey: '',
  cloudAsrBailianHost: '',
  cloudAsrBailianModel: '',
  language: 'zh-CN',
  maxRecordingSeconds: 120,
  voiceShortcutEnabled: true,
  voiceShortcut: 'ctrl+shift+space',
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

/** Bailian public hosts must be HTTPS; loopback may use HTTP, matching custom endpoints. */
export function isBailianAsrHost(value: string): boolean {
  if (value.trim() === '') return false
  try {
    const url = new URL(value.trim())
    if (url.username !== '' || url.password !== '') return false
    const host = url.hostname.toLowerCase()
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    if (loopback) return url.protocol === 'https:' || url.protocol === 'http:'
    return url.protocol === 'https:'
  } catch {
    return false
  }
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
  if (!(CLOUD_ASR_PROVIDER_IDS as readonly string[]).includes(settings.cloudAsrProvider)) throw new Error('Unknown dsh-ears cloud ASR provider')
  if (settings.cloudAsrGroqApiKey.length > MAX_CLOUD_API_KEY_LENGTH) throw new Error('dsh-ears Groq ASR API key is too long')
  if (settings.cloudAsrCustomApiKey.length > MAX_CLOUD_API_KEY_LENGTH) throw new Error('dsh-ears custom OpenAI-compatible ASR API key is too long')
  if (settings.cloudAsrBailianApiKey.length > MAX_CLOUD_API_KEY_LENGTH) throw new Error('dsh-ears Bailian ASR API key is too long')
  if (settings.language.trim() === '') throw new Error('dsh-ears recognition language is required')
  if (!isValidRecordingLimit(settings.maxRecordingSeconds)) throw new Error('dsh-ears recording limit must be between 1 and 600 seconds')
  if (!isValidStoredShortcut(settings.voiceShortcut)) throw new Error('dsh-ears voice shortcut is invalid')
  if (settings.cloudAsrCustomEndpoint.trim() !== '' && !isHttpEndpoint(settings.cloudAsrCustomEndpoint)) throw new Error('Custom OpenAI-compatible ASR endpoint must use HTTP or HTTPS without credentials')
  if (settings.cloudAsrBailianHost.trim() !== '' && !isBailianAsrHost(settings.cloudAsrBailianHost)) throw new Error('Bailian ASR host must use HTTPS without credentials')
  if (settings.polishPrompt.trim().length > MAX_POLISH_PROMPT_LENGTH) throw new Error('dsh-ears polish prompt is too long')
}
