import { isBailianAsrHost, isHttpEndpoint, MAX_CLOUD_API_KEY_LENGTH } from '../settings/cloud-asr.js'
import {
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
  mimoEndpoint
} from '../settings/recognition.js'
import type { CloudAsrProviderId } from '../settings/recognition.js'
import type { EarsSettings } from '../config.js'

/**
 * Static registry of cloud ASR providers. A preset whose wire protocol is
 * OpenAI-compatible is pure data over the existing adapter; a provider with
 * a different protocol additionally ships an adapter and declares it here.
 */
export type CloudAsrProtocol = 'openai-compatible' | 'dashscope-asr' | 'tencent' | 'deepgram' | 'mimo'

export type CloudAsrFieldKind =
  | 'credential'
  | 'model'
  | 'language'
  | 'endpoint'
  | 'host'
  | 'service'
  | 'cluster'
  | 'app-id'
  | 'secret-id'

export type CloudAsrCredentialField =
  | 'cloudAsrGroqApiKey'
  | 'cloudAsrDeepgramApiKey'
  | 'cloudAsrCustomApiKey'
  | 'cloudAsrBailianApiKey'
  | 'cloudAsrTencentSecretKey'
  | 'cloudAsrMimoApiKey'

export type CloudAsrCredentialConfiguredField = `${CloudAsrCredentialField}Configured`

export type CloudAsrModelField =
  | 'cloudAsrGroqModel'
  | 'cloudAsrDeepgramModel'
  | 'cloudAsrCustomModel'
  | 'cloudAsrBailianModel'
  | 'cloudAsrTencentEngineType'
  | 'cloudAsrMimoModel'

export type CloudAsrLanguageField =
  | 'cloudAsrGroqLanguage'
  | 'cloudAsrDeepgramLanguage'
  | 'cloudAsrCustomLanguage'
  | 'cloudAsrBailianLanguage'
  | 'cloudAsrMimoLanguage'

export type CloudAsrSettingField =
  | CloudAsrCredentialField
  | CloudAsrModelField
  | CloudAsrLanguageField
  | 'cloudAsrCustomEndpoint'
  | 'cloudAsrBailianHost'
  | 'cloudAsrDeepgramService'
  | 'cloudAsrTencentService'
  | 'cloudAsrTencentAppId'
  | 'cloudAsrTencentSecretId'
  | 'cloudAsrMimoService'
  | 'cloudAsrMimoCluster'

export interface CloudAsrFieldDefinition {
  readonly field: CloudAsrSettingField
  /** Key inside the corresponding fixed cloudAsr storage slot. */
  readonly storageKey: string
  readonly kind: CloudAsrFieldKind
  readonly required?: boolean
  readonly allowedValues?: readonly string[]
  readonly optionLabelKeys?: Readonly<Record<string, string>>
  readonly visibleWhen?: { readonly field: CloudAsrSettingField; readonly equals: string }
  readonly maxLength?: number
  /** Translation identifiers consumed by the browser settings view. */
  readonly labelKey: string
  readonly hintKey: string
  readonly editor?: 'text' | 'model' | 'deepgram-model'
}

export type CloudAsrEndpointKind = 'fixed' | 'custom' | 'bailian-host' | 'mimo'
export type CloudAsrModelStrategy = 'listing' | 'static' | 'free-form'

export interface CloudAsrProviderEntry {
  readonly id: CloudAsrProviderId
  readonly storageKey: 'groq' | 'deepgram' | 'customOpenAi' | 'bailian' | 'tencent' | 'mimo'
  readonly name: { readonly en: string; readonly zh: string }
  readonly providerLabelKey: string
  readonly backendHintKey: string
  readonly protocol: CloudAsrProtocol
  readonly fields: readonly CloudAsrFieldDefinition[]
  readonly credentialField: CloudAsrCredentialField
  readonly modelField: CloudAsrModelField
  readonly languageField?: CloudAsrLanguageField
  readonly endpointKind: CloudAsrEndpointKind
  readonly modelStrategy: CloudAsrModelStrategy
  readonly realtime: boolean
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

const field = (
  definition: Omit<CloudAsrFieldDefinition, 'labelKey' | 'hintKey'> &
    Partial<Pick<CloudAsrFieldDefinition, 'labelKey' | 'hintKey'>>
): CloudAsrFieldDefinition => ({
  labelKey: `${definition.field}.label`,
  hintKey: `${definition.field}.hint`,
  ...definition
})

const GROQ_FIELDS = [
  field({ field: 'cloudAsrGroqApiKey', storageKey: 'apiKey', kind: 'credential', required: true, maxLength: MAX_CLOUD_API_KEY_LENGTH, labelKey: 'cloudKey', hintKey: 'cloudKeyHint' }),
  field({ field: 'cloudAsrGroqModel', storageKey: 'model', kind: 'model', required: true, editor: 'model', labelKey: 'cloudModel', hintKey: 'cloudModelHint' }),
  field({ field: 'cloudAsrGroqLanguage', storageKey: 'language', kind: 'language', labelKey: 'language', hintKey: 'asrLanguageHint' })
] as const

const DEEPGRAM_FIELDS = [
  field({ field: 'cloudAsrDeepgramService', storageKey: 'service', kind: 'service', required: true, allowedValues: DEEPGRAM_ASR_SERVICE_IDS, optionLabelKeys: { 'recording-file': 'deepgramRecordingService', realtime: 'deepgramRealtimeService' }, labelKey: 'deepgramService', hintKey: 'deepgramServiceHint' }),
  field({ field: 'cloudAsrDeepgramApiKey', storageKey: 'apiKey', kind: 'credential', required: true, maxLength: MAX_CLOUD_API_KEY_LENGTH, labelKey: 'cloudKey', hintKey: 'cloudKeyHint' }),
  field({ field: 'cloudAsrDeepgramModel', storageKey: 'model', kind: 'model', required: true, editor: 'deepgram-model', labelKey: 'cloudModel', hintKey: 'deepgramModelHint' }),
  field({ field: 'cloudAsrDeepgramLanguage', storageKey: 'language', kind: 'language', labelKey: 'language', hintKey: 'asrLanguageHint' })
] as const

const BAILIAN_FIELDS = [
  field({ field: 'cloudAsrBailianHost', storageKey: 'host', kind: 'host', required: true, labelKey: 'bailianHost', hintKey: 'bailianHostHint' }),
  field({ field: 'cloudAsrBailianApiKey', storageKey: 'apiKey', kind: 'credential', required: true, maxLength: MAX_CLOUD_API_KEY_LENGTH, labelKey: 'cloudKey', hintKey: 'cloudKeyHint' }),
  field({ field: 'cloudAsrBailianModel', storageKey: 'model', kind: 'model', required: true, editor: 'text', labelKey: 'cloudModel', hintKey: 'bailianModelHint' }),
  field({ field: 'cloudAsrBailianLanguage', storageKey: 'language', kind: 'language', labelKey: 'language', hintKey: 'asrLanguageHint' })
] as const

const TENCENT_FIELDS = [
  field({ field: 'cloudAsrTencentService', storageKey: 'service', kind: 'service', required: true, allowedValues: TENCENT_ASR_SERVICE_IDS, optionLabelKeys: { 'recording-file': 'tencentRecordingService', realtime: 'tencentRealtimeService' }, labelKey: 'tencentService', hintKey: 'tencentServiceHint' }),
  field({ field: 'cloudAsrTencentAppId', storageKey: 'appId', kind: 'app-id', required: true, labelKey: 'tencentAppId', hintKey: 'tencentAppIdHint' }),
  field({ field: 'cloudAsrTencentSecretId', storageKey: 'secretId', kind: 'secret-id', required: true, labelKey: 'tencentSecretId', hintKey: 'tencentSecretIdHint' }),
  field({ field: 'cloudAsrTencentSecretKey', storageKey: 'secretKey', kind: 'credential', required: true, maxLength: MAX_CLOUD_API_KEY_LENGTH, labelKey: 'tencentSecretKey', hintKey: 'tencentSecretKeyHint' }),
  field({ field: 'cloudAsrTencentEngineType', storageKey: 'engineType', kind: 'model', required: true, labelKey: 'tencentEngineType', hintKey: 'tencentEngineTypeHint' })
] as const

const MIMO_FIELDS = [
  field({ field: 'cloudAsrMimoService', storageKey: 'service', kind: 'service', required: true, allowedValues: MIMO_ASR_SERVICE_IDS, optionLabelKeys: { api: 'mimoApiService', 'token-plan': 'mimoTokenPlanService' }, labelKey: 'mimoService', hintKey: 'mimoServiceHint' }),
  field({ field: 'cloudAsrMimoCluster', storageKey: 'cluster', kind: 'cluster', required: true, allowedValues: MIMO_ASR_CLUSTERS, optionLabelKeys: { cn: 'mimoClusterCn', sgp: 'mimoClusterSgp', ams: 'mimoClusterAms' }, visibleWhen: { field: 'cloudAsrMimoService', equals: 'token-plan' }, labelKey: 'mimoCluster', hintKey: 'mimoClusterHint' }),
  field({ field: 'cloudAsrMimoApiKey', storageKey: 'apiKey', kind: 'credential', required: true, maxLength: MAX_CLOUD_API_KEY_LENGTH, labelKey: 'cloudKey', hintKey: 'mimoApiKeyHint' }),
  field({ field: 'cloudAsrMimoModel', storageKey: 'model', kind: 'model', required: true, editor: 'text', labelKey: 'cloudModel', hintKey: 'mimoModelHint' }),
  field({ field: 'cloudAsrMimoLanguage', storageKey: 'language', kind: 'language', labelKey: 'language', hintKey: 'asrLanguageHint' })
] as const

const CUSTOM_FIELDS = [
  field({ field: 'cloudAsrCustomEndpoint', storageKey: 'endpoint', kind: 'endpoint', required: true, labelKey: 'cloudEndpoint', hintKey: 'cloudEndpointHint' }),
  field({ field: 'cloudAsrCustomApiKey', storageKey: 'apiKey', kind: 'credential', maxLength: MAX_CLOUD_API_KEY_LENGTH, labelKey: 'cloudKey', hintKey: 'cloudKeyHint' }),
  field({ field: 'cloudAsrCustomModel', storageKey: 'model', kind: 'model', required: true, editor: 'text', labelKey: 'cloudModel', hintKey: 'cloudModelHint' }),
  field({ field: 'cloudAsrCustomLanguage', storageKey: 'language', kind: 'language', labelKey: 'language', hintKey: 'asrLanguageHint' })
] as const

export const CLOUD_ASR_PROVIDERS: readonly CloudAsrProviderEntry[] = [
  {
    id: 'groq',
    storageKey: 'groq',
    name: { en: 'Groq', zh: 'Groq' },
    providerLabelKey: 'groqProvider',
    backendHintKey: 'backendHintGroq',
    protocol: 'openai-compatible',
    fields: GROQ_FIELDS,
    credentialField: 'cloudAsrGroqApiKey',
    modelField: 'cloudAsrGroqModel',
    languageField: 'cloudAsrGroqLanguage',
    endpointKind: 'fixed',
    modelStrategy: 'listing',
    realtime: false,
    baseUrl: 'https://api.groq.com/openai/v1',
    modelFilter: /^whisper-/i,
    endpointEditable: false,
    apiKeyRequired: true
  },
  {
    id: 'deepgram',
    storageKey: 'deepgram',
    name: { en: 'Deepgram', zh: 'Deepgram' },
    providerLabelKey: 'deepgramProvider',
    backendHintKey: 'backendHintDeepgram',
    protocol: 'deepgram',
    fields: DEEPGRAM_FIELDS,
    credentialField: 'cloudAsrDeepgramApiKey',
    modelField: 'cloudAsrDeepgramModel',
    languageField: 'cloudAsrDeepgramLanguage',
    endpointKind: 'fixed',
    modelStrategy: 'static',
    realtime: true,
    baseUrl: 'https://api.deepgram.com/v1',
    defaultModel: DEEPGRAM_DEFAULT_MODEL,
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
    storageKey: 'bailian',
    name: { en: 'Alibaba Cloud Model Studio', zh: '阿里云百炼' },
    providerLabelKey: 'bailianProvider',
    backendHintKey: 'backendHintBailian',
    protocol: 'dashscope-asr',
    fields: BAILIAN_FIELDS,
    credentialField: 'cloudAsrBailianApiKey',
    modelField: 'cloudAsrBailianModel',
    languageField: 'cloudAsrBailianLanguage',
    endpointKind: 'bailian-host',
    modelStrategy: 'free-form',
    realtime: false,
    endpointEditable: true,
    apiKeyRequired: true
  },
  {
    id: 'tencent',
    storageKey: 'tencent',
    name: { en: 'Tencent Cloud', zh: '腾讯云' },
    providerLabelKey: 'tencentProvider',
    backendHintKey: 'backendHintTencent',
    protocol: 'tencent',
    fields: TENCENT_FIELDS,
    credentialField: 'cloudAsrTencentSecretKey',
    modelField: 'cloudAsrTencentEngineType',
    endpointKind: 'fixed',
    modelStrategy: 'static',
    realtime: true,
    defaultModel: TENCENT_DEFAULT_ENGINE,
    endpointEditable: false,
    apiKeyRequired: true
  },
  {
    id: 'mimo',
    storageKey: 'mimo',
    name: { en: 'Xiaomi MiMo', zh: '小米 MiMo' },
    providerLabelKey: 'mimoProvider',
    backendHintKey: 'backendHintMimo',
    protocol: 'mimo',
    fields: MIMO_FIELDS,
    credentialField: 'cloudAsrMimoApiKey',
    modelField: 'cloudAsrMimoModel',
    languageField: 'cloudAsrMimoLanguage',
    endpointKind: 'mimo',
    modelStrategy: 'static',
    realtime: false,
    defaultModel: MIMO_DEFAULT_MODEL,
    staticModels: [MIMO_DEFAULT_MODEL],
    endpointEditable: false,
    apiKeyRequired: true
  },
  {
    id: 'custom',
    storageKey: 'customOpenAi',
    name: { en: 'Custom OpenAI-compatible', zh: '自定义 OpenAI 兼容' },
    providerLabelKey: 'customProvider',
    backendHintKey: 'backendHintCustom',
    protocol: 'openai-compatible',
    fields: CUSTOM_FIELDS,
    credentialField: 'cloudAsrCustomApiKey',
    modelField: 'cloudAsrCustomModel',
    languageField: 'cloudAsrCustomLanguage',
    endpointKind: 'custom',
    modelStrategy: 'free-form',
    realtime: false,
    defaultModel: 'whisper-1',
    endpointEditable: true,
    apiKeyRequired: false
  }
]

const CLOUD_ASR_FIELDS = new Map(
  CLOUD_ASR_PROVIDERS.flatMap((provider) => provider.fields.map((definition) => [definition.field, definition] as const))
)

export function cloudProviderEntry(id: string): CloudAsrProviderEntry | undefined {
  return CLOUD_ASR_PROVIDERS.find((entry) => entry.id === id)
}

export function isKnownCloudProvider(id: string): boolean {
  return cloudProviderEntry(id) !== undefined
}

export function cloudAsrFieldsFor(providerId: string): readonly CloudAsrFieldDefinition[] {
  return cloudProviderEntry(providerId)?.fields ?? []
}

export function cloudAsrFieldDefinition(fieldName: string): CloudAsrFieldDefinition | undefined {
  return CLOUD_ASR_FIELDS.get(fieldName as CloudAsrSettingField)
}

export function cloudAsrFieldFor(providerId: string, kind: CloudAsrFieldKind): CloudAsrFieldDefinition | undefined {
  return cloudProviderEntry(providerId)?.fields.find((definition) => definition.kind === kind)
}

export function cloudAsrCredentialField(providerId: string): CloudAsrCredentialField | undefined {
  return cloudProviderEntry(providerId)?.credentialField
}

export function cloudAsrModelField(providerId: string): CloudAsrModelField | undefined {
  return cloudProviderEntry(providerId)?.modelField
}

export function cloudAsrLanguageField(providerId: string): CloudAsrLanguageField | undefined {
  return cloudProviderEntry(providerId)?.languageField
}

export function cloudAsrFieldValue(
  settings: Partial<Pick<EarsSettings, CloudAsrSettingField>>,
  fieldName: CloudAsrSettingField
): string {
  const value = settings[fieldName]
  return typeof value === 'string' ? value : ''
}

/** Whether the provider lists its models through `GET {baseUrl}/models`. */
export function supportsModelListing(id: string): boolean {
  return cloudProviderEntry(id)?.baseUrl !== undefined
}

export function cloudAsrEndpointFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | CloudAsrSettingField>): string {
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined) return settings.cloudAsrCustomEndpoint.trim()

  switch (entry.endpointKind) {
    case 'fixed':
      if (entry.protocol === 'deepgram') return 'https://api.deepgram.com/v1/listen'
      if (entry.protocol === 'tencent') return 'https://asr.tencentcloudapi.com/'
      return entry.baseUrl === undefined ? '' : `${entry.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`
    case 'mimo':
      return mimoEndpoint(settings.cloudAsrMimoService, settings.cloudAsrMimoCluster)
    case 'bailian-host': {
      const host = settings.cloudAsrBailianHost.trim()
      return host === '' ? '' : bailianGenerationUrl(host)
    }
    case 'custom':
      return settings.cloudAsrCustomEndpoint.trim()
  }
}

export function bailianGenerationUrl(host: string): string {
  const url = new URL(host.trim())
  url.pathname = '/api/v1/services/aigc/multimodal-generation/generation'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function cloudAsrCredentialFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | CloudAsrCredentialField>): string {
  const fieldName = cloudAsrCredentialField(settings.cloudAsrProvider) ?? 'cloudAsrGroqApiKey'
  return cloudAsrFieldValue(settings, fieldName).trim()
}

export function cloudAsrModelFor(settings: Pick<EarsSettings, 'cloudAsrProvider' | CloudAsrModelField>): string {
  const fieldName = cloudAsrModelField(settings.cloudAsrProvider) ?? 'cloudAsrGroqModel'
  const model = cloudAsrFieldValue(settings, fieldName).trim()
  return model !== '' ? model : cloudProviderEntry(settings.cloudAsrProvider)?.defaultModel ?? ''
}

/**
 * Settings-level validity deliberately excludes credentials. A keyless
 * configuration must remain saveable so a key can be entered separately.
 */
export function isCloudConfigurationValid(settings: Pick<EarsSettings, 'asrBackend' | 'cloudAsrProvider' | CloudAsrSettingField>): boolean {
  if (settings.asrBackend !== 'cloud-openai') return true
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined || cloudAsrModelFor(settings) === '') return false

  return entry.fields
    .filter((definition) => definition.required && definition.kind !== 'credential' && definition.kind !== 'model')
    .every((definition) => {
      const value = cloudAsrFieldValue(settings, definition.field)
      return value.trim() !== '' && validateCloudAsrFieldValue(definition, value)
    })
}

/** Whether the cloud ASR backend has all required credentials and configuration to transcribe. */
export function isCloudAsrReady(settings: Pick<EarsSettings, 'cloudAsrProvider' | CloudAsrSettingField>): boolean {
  const entry = cloudProviderEntry(settings.cloudAsrProvider)
  if (entry === undefined || cloudAsrModelFor(settings) === '') return false
  if (!isCloudConfigurationValid({ ...settings, asrBackend: 'cloud-openai' })) return false

  return entry.fields
    .filter((definition) => definition.required && definition.kind !== 'model')
    .every((definition) => {
      const value = cloudAsrFieldValue(settings, definition.field).trim()
      return value !== '' && validateCloudAsrFieldValue(definition, value)
    })
}

export function validateCloudAsrFieldValue(definition: CloudAsrFieldDefinition, value: string): boolean {
  const trimmed = value.trim()
  if (definition.maxLength !== undefined && value.length > definition.maxLength) return false
  if (definition.allowedValues !== undefined && !definition.allowedValues.includes(trimmed)) return false
  if (definition.kind === 'endpoint') return trimmed === '' || isHttpEndpoint(trimmed)
  if (definition.kind === 'host') return trimmed === '' || isBailianAsrHost(trimmed)
  return true
}

/** Defaults used by the registry tests to ensure metadata tracks live settings. */
export const CLOUD_ASR_REGISTRY_DEFAULTS = Object.freeze({
  deepgramService: DEEPGRAM_ASR_DEFAULT_SERVICE,
  mimoService: MIMO_ASR_DEFAULT_SERVICE,
  mimoCluster: MIMO_ASR_DEFAULT_CLUSTER,
  tencentService: TENCENT_ASR_DEFAULT_SERVICE
})
