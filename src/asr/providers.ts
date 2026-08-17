import { isBailianAsrHost, isHttpEndpoint } from '../config.js'
import type { CloudAsrProviderId, EarsSettings } from '../config.js'

/**
 * Static registry of cloud ASR providers. A preset whose wire protocol is
 * OpenAI-compatible is pure data over the existing adapter; a provider with a
 * different protocol additionally ships an adapter and declares it here.
 */
export type CloudAsrProtocol = 'openai-compatible' | 'dashscope-asr'

export interface CloudAsrProviderEntry {
  readonly id: CloudAsrProviderId
  readonly name: { readonly en: string; readonly zh: string }
  readonly protocol: CloudAsrProtocol
  /** Base URL used to derive the transcription and model-listing endpoints. */
  readonly baseUrl?: string
  /** Filters the live `/models` reply to transcription-capable models. */
  readonly modelFilter?: RegExp
  /** Static fallback model list for providers without a listing endpoint. */
  readonly staticModels?: readonly string[]
  /** Model used when the settings value is empty (custom keeps whisper-1). */
  readonly defaultModel?: string
  /** Whether the user edits the transcription endpoint instead of a preset. */
  readonly endpointEditable: boolean
  /** Whether transcription refuses to run without a configured API key. */
  readonly apiKeyRequired: boolean
}

export const CLOUD_ASR_PROVIDERS: readonly CloudAsrProviderEntry[] = [
  {
    id: 'groq',
    name: { en: 'Groq', zh: 'Groq' },
    protocol: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelFilter: /^whisper-/i,
    endpointEditable: false,
    apiKeyRequired: true
  },
  {
    id: 'bailian',
    name: { en: 'Alibaba Cloud Model Studio', zh: '阿里云百炼' },
    protocol: 'dashscope-asr',
    endpointEditable: true,
    apiKeyRequired: true
  },
  {
    id: 'custom',
    name: { en: 'Custom OpenAI-compatible', zh: '自定义 OpenAI 兼容' },
    protocol: 'openai-compatible',
    defaultModel: 'whisper-1',
    endpointEditable: true,
    apiKeyRequired: false
  }
]

export function cloudProviderEntry(id: string): CloudAsrProviderEntry | undefined {
  return CLOUD_ASR_PROVIDERS.find((entry) => entry.id === id)
}

export function isKnownCloudProvider(id: string): boolean {
  return CLOUD_ASR_PROVIDERS.some((entry) => entry.id === id)
}

/** Whether the provider lists its models through `GET {baseUrl}/models`. */
export function supportsModelListing(id: string): boolean {
  return cloudProviderEntry(id)?.baseUrl !== undefined
}

export function cloudAsrEndpointFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrCustomEndpoint' | 'cloudAsrBailianHost'>): string {
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry?.protocol === 'dashscope-asr') {
    const host = settings.cloudAsrBailianHost.trim()
    return host === '' ? '' : bailianGenerationUrl(host)
  }
  const baseUrl = entry?.baseUrl
  if (baseUrl !== undefined) return `${baseUrl.replace(/\/+$/, '')}/audio/transcriptions`
  return settings.cloudAsrCustomEndpoint.trim()
}

export function bailianGenerationUrl(host: string): string {
  const url = new URL(host.trim())
  url.pathname = '/api/v1/services/aigc/multimodal-generation/generation'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function cloudAsrCredentialFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrGroqApiKey' | 'cloudAsrCustomApiKey' | 'cloudAsrBailianApiKey'>): string {
  if (settings.cloudAsrProvider === 'bailian') return settings.cloudAsrBailianApiKey.trim()
  if (settings.cloudAsrProvider === 'custom') return settings.cloudAsrCustomApiKey.trim()
  return settings.cloudAsrGroqApiKey.trim()
}

export function cloudAsrModelFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrGroqModel' | 'cloudAsrCustomModel' | 'cloudAsrBailianModel'>): string {
  const model = settings.cloudAsrProvider === 'bailian'
    ? settings.cloudAsrBailianModel
    : settings.cloudAsrProvider === 'custom'
      ? settings.cloudAsrCustomModel
      : settings.cloudAsrGroqModel
  const trimmed = model.trim()
  if (trimmed !== '') return trimmed
  return cloudProviderEntry(settings.cloudAsrProvider)?.defaultModel ?? ''
}

/**
 * Settings-level validity: a cloud backend is valid once its endpoint (custom
 * only) and effective model are complete. The API key is intentionally not
 * part of validity — a keyless configuration must remain saveable so the key
 * can be entered first; key readiness is a runtime/availability concern.
 */
export function isCloudConfigurationValid(settings: Pick<EarsSettings, 'asrBackend' | 'cloudAsrProvider' | 'cloudAsrCustomEndpoint' | 'cloudAsrBailianHost' | 'cloudAsrGroqModel' | 'cloudAsrCustomModel' | 'cloudAsrBailianModel'>): boolean {
  if (settings.asrBackend !== 'cloud-openai') return true
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined) return false
  if (cloudAsrModelFor(settings) === '') return false
  if (entry.protocol === 'dashscope-asr') return isBailianAsrHost(settings.cloudAsrBailianHost)
  if (entry.endpointEditable && !isHttpEndpoint(settings.cloudAsrCustomEndpoint)) return false
  return true
}

/**
 * Runtime readiness folded into the D-021 availability signal. Evaluated
 * against the cloud configuration itself, independent of the backend
 * currently selected, because `listAsrBackends` reports every backend.
 */
export function isCloudAsrReady(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrCustomEndpoint' | 'cloudAsrBailianHost' | 'cloudAsrGroqModel' | 'cloudAsrCustomModel' | 'cloudAsrBailianModel' | 'cloudAsrGroqApiKey' | 'cloudAsrCustomApiKey' | 'cloudAsrBailianApiKey'>): boolean {
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined) return false
  if (cloudAsrModelFor(settings) === '') return false
  if (entry.protocol === 'dashscope-asr' && !isBailianAsrHost(settings.cloudAsrBailianHost)) return false
  if (entry.protocol !== 'dashscope-asr' && entry.endpointEditable && !isHttpEndpoint(settings.cloudAsrCustomEndpoint)) return false
  if (entry.apiKeyRequired && cloudAsrCredentialFor(settings) === '') return false
  return true
}
