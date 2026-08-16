import { isHttpEndpoint } from '../config.js'
import type { CloudAsrProviderId, EarsSettings } from '../config.js'

/**
 * Static registry of cloud ASR providers. A preset whose wire protocol is
 * OpenAI-compatible is pure data over the existing adapter; a provider with a
 * different protocol additionally ships an adapter and declares it here.
 */
export interface CloudAsrProviderEntry {
  readonly id: CloudAsrProviderId
  readonly name: { readonly en: string; readonly zh: string }
  readonly protocol: 'openai-compatible'
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

export function cloudAsrEndpointFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrEndpoint'>): string {
  const baseUrl = cloudProviderEntry(settings.cloudAsrProvider)?.baseUrl
  if (baseUrl !== undefined) return `${baseUrl.replace(/\/+$/, '')}/audio/transcriptions`
  return settings.cloudAsrEndpoint.trim()
}

export function cloudAsrModelFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrModel'>): string {
  const model = settings.cloudAsrModel.trim()
  if (model !== '') return model
  return cloudProviderEntry(settings.cloudAsrProvider)?.defaultModel ?? ''
}

/**
 * Settings-level validity: a cloud backend is valid once its endpoint (custom
 * only) and effective model are complete. The API key is intentionally not
 * part of validity — a keyless configuration must remain saveable so the key
 * can be entered first; key readiness is a runtime/availability concern.
 */
export function isCloudConfigurationValid(settings: Pick<EarsSettings, 'asrBackend' | 'cloudAsrProvider' | 'cloudAsrEndpoint' | 'cloudAsrModel'>): boolean {
  if (settings.asrBackend !== 'cloud-openai') return true
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined) return false
  if (cloudAsrModelFor(settings) === '') return false
  if (entry.endpointEditable && !isHttpEndpoint(settings.cloudAsrEndpoint)) return false
  return true
}

/**
 * Runtime readiness folded into the D-021 availability signal. Evaluated
 * against the cloud configuration itself, independent of the backend
 * currently selected, because `listAsrBackends` reports every backend.
 */
export function isCloudAsrReady(settings: Pick<EarsSettings, 'cloudAsrProvider' | 'cloudAsrEndpoint' | 'cloudAsrModel' | 'cloudAsrApiKey'>): boolean {
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined) return false
  if (cloudAsrModelFor(settings) === '') return false
  if (entry.endpointEditable && !isHttpEndpoint(settings.cloudAsrEndpoint)) return false
  if (entry.apiKeyRequired && settings.cloudAsrApiKey.trim() === '') return false
  return true
}
