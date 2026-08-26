import { isBailianAsrHost, isHttpEndpoint } from '../config.js'
import type { CloudAsrProviderId, EarsSettings } from '../config.js'

/**
 * Static registry of cloud ASR providers. A preset whose wire protocol is
 * OpenAI-compatible is pure data over the existing adapter; a provider with a
 * different protocol additionally ships an adapter and declares it here.
 */
export type CloudAsrProtocol = 'openai-compatible' | 'dashscope-asr' | 'tencent' | 'deepgram'

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
    id: 'deepgram',
    name: { en: 'Deepgram', zh: 'Deepgram' },
    protocol: 'deepgram',
    baseUrl: 'https://api.deepgram.com/v1',
    defaultModel: 'nova-3',
    staticModels: [
      'nova-3',
      'nova-3-general',
      'nova-3-medical',
      'nova-2',
      'nova-2-general',
      'nova-2-meeting',
      'nova-2-phonecall',
      'nova-2-conversationalai',
      'nova-2-finance',
      'nova-2-medical',
      'enhanced',
      'base',
      'whisper-large'
    ],
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
    id: 'tencent',
    name: { en: 'Tencent Cloud', zh: '腾讯云' },
    protocol: 'tencent',
    defaultModel: '16k_zh',
    endpointEditable: false,
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
  if (entry?.protocol === 'deepgram') return 'https://api.deepgram.com/v1/listen'
  if (entry?.protocol === 'tencent') return 'https://asr.tencentcloudapi.com/'
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

export function cloudAsrCredentialFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrGroqApiKey' | 'cloudAsrDeepgramApiKey' | 'cloudAsrCustomApiKey' | 'cloudAsrBailianApiKey' | 'cloudAsrTencentSecretKey'>): string {
  if (settings.cloudAsrProvider === 'deepgram') return settings.cloudAsrDeepgramApiKey.trim()
  if (settings.cloudAsrProvider === 'bailian') return settings.cloudAsrBailianApiKey.trim()
  if (settings.cloudAsrProvider === 'tencent') return settings.cloudAsrTencentSecretKey.trim()
  if (settings.cloudAsrProvider === 'custom') return settings.cloudAsrCustomApiKey.trim()
  return settings.cloudAsrGroqApiKey.trim()
}

export function cloudAsrModelFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrGroqModel' | 'cloudAsrDeepgramModel' | 'cloudAsrCustomModel' | 'cloudAsrBailianModel' | 'cloudAsrTencentEngineType'>): string {
  let model = ''
  if (settings.cloudAsrProvider === 'deepgram') {
    model = settings.cloudAsrDeepgramModel
  } else if (settings.cloudAsrProvider === 'bailian') {
    model = settings.cloudAsrBailianModel
  } else if (settings.cloudAsrProvider === 'tencent') {
    model = settings.cloudAsrTencentEngineType
  } else if (settings.cloudAsrProvider === 'custom') {
    model = settings.cloudAsrCustomModel
  } else {
    model = settings.cloudAsrGroqModel
  }
  const trimmed = model.trim()
  if (trimmed !== '') return trimmed
  return cloudProviderEntry(settings.cloudAsrProvider)?.defaultModel ?? ''
}

/**
 * Settings-level validity: a cloud backend is valid once its endpoint (custom
 * only) and effective model are complete. The API key is not part of validity
 * — a keyless configuration must remain saveable so the key can be entered
 * first; key readiness is a runtime/availability concern.
 */
export function isCloudConfigurationValid(settings: Pick<EarsSettings, 'asrBackend' | 'cloudAsrProvider' | 'cloudAsrCustomEndpoint' | 'cloudAsrBailianHost' | 'cloudAsrGroqModel' | 'cloudAsrDeepgramModel' | 'cloudAsrCustomModel' | 'cloudAsrBailianModel' | 'cloudAsrTencentEngineType'>): boolean {
  if (settings.asrBackend !== 'cloud-openai') return true
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined) return false
  if (cloudAsrModelFor(settings) === '') return false
  if (entry.protocol === 'dashscope-asr') return isBailianAsrHost(settings.cloudAsrBailianHost)
  if (entry.protocol === 'tencent' || entry.protocol === 'deepgram') return true
  if (entry.endpointEditable && !isHttpEndpoint(settings.cloudAsrCustomEndpoint)) return false
  return true
}

/** Whether the cloud ASR backend has all required credentials and configuration to transcribe. */
export function isCloudAsrReady(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrCustomEndpoint' | 'cloudAsrBailianHost' | 'cloudAsrGroqModel' | 'cloudAsrDeepgramModel' | 'cloudAsrCustomModel' | 'cloudAsrBailianModel' | 'cloudAsrTencentEngineType' | 'cloudAsrTencentService' | 'cloudAsrDeepgramService' | 'cloudAsrTencentAppId' | 'cloudAsrTencentSecretId' | 'cloudAsrGroqApiKey' | 'cloudAsrDeepgramApiKey' | 'cloudAsrCustomApiKey' | 'cloudAsrBailianApiKey' | 'cloudAsrTencentSecretKey'>): boolean {
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined) return false
  if (cloudAsrModelFor(settings) === '') return false
  if (entry.protocol === 'dashscope-asr' && !isBailianAsrHost(settings.cloudAsrBailianHost)) return false
  if (entry.protocol === 'tencent' && (!['recording-file', 'realtime'].includes(settings.cloudAsrTencentService) || settings.cloudAsrTencentAppId.trim() === '' || settings.cloudAsrTencentSecretId.trim() === '')) return false
  if (entry.protocol === 'deepgram' && !['recording-file', 'realtime'].includes(settings.cloudAsrDeepgramService)) return false
  if (entry.protocol !== 'dashscope-asr' && entry.endpointEditable && !isHttpEndpoint(settings.cloudAsrCustomEndpoint)) return false
  if (entry.apiKeyRequired && cloudAsrCredentialFor(settings) === '') return false
  return true
}
