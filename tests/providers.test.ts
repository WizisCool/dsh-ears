import { describe, expect, it } from 'vitest'
import { CLOUD_ASR_PROVIDER_IDS, DEFAULT_EARS_SETTINGS, isHttpEndpoint } from '../src/config.js'
import { DEFAULT_CLOUD_ASR_SETTINGS } from '../src/settings/cloud-asr.js'
import { EARS_ERROR_CODES } from '../src/errors.js'
import {
  CLOUD_ASR_PROVIDERS,
  bailianGenerationUrl,
  cloudAsrBackendSelection,
  cloudAsrCredentialFor,
  cloudAsrEndpointFor,
  cloudAsrModelFor,
  cloudAsrModelSupportsService,
  cloudAsrStaticModelsFor,
  cloudProviderEntry,
  isCloudAsrReady,
  isCloudConfigurationValid,
  isCloudAsrRealtime,
  isKnownCloudProvider,
  supportsModelListing,
  validateCloudAsrFieldValue
} from '../src/asr/providers.js'
import { filterDeepgramModels } from '../src/asr/cloud-provider-models.js'
import type { EarsSettings } from '../src/config.js'

function settings(overrides: Partial<EarsSettings> = {}): EarsSettings {
  return { ...DEFAULT_EARS_SETTINGS, ...overrides }
}

describe('cloud ASR provider registry', () => {
  it('covers every persisted cloud field exactly once', () => {
    const fields = CLOUD_ASR_PROVIDERS.flatMap((entry) => entry.fields)
    const fieldNames = fields.map((definition) => definition.field)
    expect(new Set(fieldNames).size).toBe(fieldNames.length)
    for (const entry of CLOUD_ASR_PROVIDERS) {
      expect(entry.fields.some((definition) => definition.field === entry.credentialField)).toBe(true)
      expect(entry.fields.some((definition) => definition.field === entry.modelField)).toBe(true)
      if (entry.languageField !== undefined) expect(entry.fields.some((definition) => definition.field === entry.languageField)).toBe(true)
      expect(entry.fields.every((definition) => definition.labelKey !== '' && definition.hintKey !== '')).toBe(true)
    }
  })

  it('registers unique provider ids with the shared protocol', () => {
    const ids = CLOUD_ASR_PROVIDERS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([...CLOUD_ASR_PROVIDER_IDS])
    expect(cloudProviderEntry('groq')?.protocol).toBe('openai-compatible')
    expect(cloudProviderEntry('deepgram')?.protocol).toBe('deepgram')
    expect(cloudProviderEntry('custom')?.protocol).toBe('openai-compatible')
    expect(cloudProviderEntry('bailian')?.protocol).toBe('dashscope-asr')
    expect(cloudProviderEntry('tencent')?.protocol).toBe('tencent')
    expect(isKnownCloudProvider('groq')).toBe(true)
    expect(isKnownCloudProvider('deepgram')).toBe(true)
    expect(isKnownCloudProvider('bailian')).toBe(true)
    expect(isKnownCloudProvider('tencent')).toBe(true)
    expect(isKnownCloudProvider('custom')).toBe(true)
    expect(isKnownCloudProvider('unknown')).toBe(false)
  })

  it('keeps registry metadata internally consistent for persistence, editors, and dispatch', () => {
    const storageKeys = CLOUD_ASR_PROVIDERS.map((entry) => entry.storageKey)
    expect(new Set(storageKeys).size).toBe(storageKeys.length)

    for (const entry of CLOUD_ASR_PROVIDERS) {
      expect(Object.prototype.hasOwnProperty.call(DEFAULT_CLOUD_ASR_SETTINGS, entry.storageKey)).toBe(true)
      expect(entry.fields.length).toBeGreaterThan(0)

      const fieldNames = entry.fields.map((definition) => definition.field)
      const storageFieldNames = entry.fields.map((definition) => definition.storageKey)
      expect(new Set(storageFieldNames).size).toBe(storageFieldNames.length)
      expect(new Set(fieldNames).size).toBe(fieldNames.length)
      expect(entry.fields.every((definition) => definition.labelKey.trim() !== '' && definition.hintKey.trim() !== '')).toBe(true)

      const credential = entry.fields.find((definition) => definition.field === entry.credentialField)
      const model = entry.fields.find((definition) => definition.field === entry.modelField)
      const language = entry.languageField === undefined ? undefined : entry.fields.find((definition) => definition.field === entry.languageField)
      expect(credential?.kind).toBe('credential')
      expect(model?.kind).toBe('model')
      if (entry.languageField !== undefined) expect(language?.kind).toBe('language')
      if (entry.apiKeyRequired) expect(credential?.required).toBe(true)

      if (entry.modelStrategy === 'listing') {
        expect(entry.baseUrl).toMatch(/^https:\/\//)
        expect(supportsModelListing(entry.id)).toBe(true)
      } else {
        expect(supportsModelListing(entry.id)).toBe(false)
      }
      if (entry.modelStrategy === 'static') {
        expect(entry.defaultModel !== undefined || (entry.staticModels?.length ?? 0) > 0).toBe(true)
      }

      const serviceDefinition = entry.fields.find((definition) => definition.kind === 'service')
      if (entry.realtime) {
        const realtimeServices = entry.realtimeServices ?? []
        expect(realtimeServices.length).toBeGreaterThan(0)
        expect(new Set(realtimeServices).size).toBe(realtimeServices.length)
        expect(serviceDefinition?.allowedValues).toEqual(expect.arrayContaining(realtimeServices))
      } else {
        expect(entry.realtimeServices).toBeUndefined()
      }
      if (!entry.realtime) expect(entry.modelServiceCapabilities).toBeUndefined()
      for (const [service, capability] of Object.entries(entry.modelServiceCapabilities ?? {})) {
        expect(serviceDefinition?.allowedValues).toContain(service)
        expect(['batch', 'streaming']).toContain(capability)
        if (capability === 'streaming') expect(entry.realtime).toBe(true)
      }
      for (const modelId of entry.staticModels ?? []) {
        expect(modelId.trim()).not.toBe('')
        if (entry.staticModelCapabilities !== undefined) expect(entry.staticModelCapabilities[modelId]).toBeDefined()
      }
      for (const modelId of Object.keys(entry.staticModelCapabilities ?? {})) {
        expect(entry.staticModels).toContain(modelId)
      }
    }
  })

  it('maps every registry provider to the cloud backend selection', () => {
    for (const entry of CLOUD_ASR_PROVIDERS) {
      expect(cloudAsrBackendSelection(entry.id)).toEqual({ asrBackend: 'cloud-openai', cloudAsrProvider: entry.id })
    }
    expect(cloudAsrBackendSelection('unknown')).toBeUndefined()
  })

  it('pins the Groq transcription and listing base URL', () => {
    const groq = cloudProviderEntry('groq')
    expect(groq?.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(groq?.endpointEditable).toBe(false)
    expect(groq?.apiKeyRequired).toBe(true)
    expect(supportsModelListing('groq')).toBe(true)
    expect(supportsModelListing('deepgram')).toBe(true)
    expect(supportsModelListing('mimo')).toBe(false)
    expect(cloudAsrEndpointFor(settings({ cloudAsrProvider: 'groq', cloudAsrCustomEndpoint: 'https://ignored.example.test' }))).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
  })

  it('keeps the custom provider editable with the whisper-1 default model', () => {
    const custom = cloudProviderEntry('custom')
    expect(custom?.endpointEditable).toBe(true)
    expect(custom?.apiKeyRequired).toBe(false)
    expect(supportsModelListing('custom')).toBe(false)
    expect(cloudAsrEndpointFor(settings({ cloudAsrProvider: 'custom', cloudAsrCustomEndpoint: ' https://asr.example.test/audio/transcriptions ' }))).toBe('https://asr.example.test/audio/transcriptions')
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'custom', cloudAsrCustomModel: '' }))).toBe('whisper-1')
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'custom', cloudAsrCustomModel: 'other-model' }))).toBe('other-model')
  })

  it('applies the Groq model filter to listing candidates', () => {
    const groq = cloudProviderEntry('groq')
    if (groq?.modelFilter === undefined) throw new Error('Groq entry is missing its model filter')
    expect(groq.modelFilter.test('whisper-large-v3-turbo')).toBe(true)
    expect(groq.modelFilter.test('llama-3.3-70b-versatile')).toBe(false)
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'groq', cloudAsrGroqModel: '' }))).toBe('')
  })

  it('keeps Tencent Cloud as one provider with a recording file recognition service default', () => {
    expect(cloudAsrEndpointFor(settings({ cloudAsrProvider: 'tencent' }))).toBe('https://asr.tencentcloudapi.com/')
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'tencent' }))).toBe('16k_zh')
    expect(cloudProviderEntry('tencent')?.name.zh).toBe('腾讯云')
  })

  it('registers Deepgram with nova-3 default model and listen endpoint', () => {
    expect(cloudAsrEndpointFor(settings({ cloudAsrProvider: 'deepgram' }))).toBe('https://api.deepgram.com/v1/listen')
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'deepgram', cloudAsrDeepgramModel: '' }))).toBe('nova-3')
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'deepgram', cloudAsrDeepgramModel: 'nova-2' }))).toBe('nova-2')
    expect(cloudProviderEntry('deepgram')?.name.en).toBe('Deepgram')
    expect(cloudProviderEntry('deepgram')?.apiKeyRequired).toBe(true)
    expect(cloudProviderEntry('deepgram')?.endpointEditable).toBe(false)
  })

  it('validates registry-declared choices and credential bounds', () => {
    const deepgramService = cloudProviderEntry('deepgram')?.fields.find((definition) => definition.field === 'cloudAsrDeepgramService')
    const groqKey = cloudProviderEntry('groq')?.fields.find((definition) => definition.field === 'cloudAsrGroqApiKey')
    if (deepgramService === undefined || groqKey === undefined) throw new Error('registry field missing')
    expect(validateCloudAsrFieldValue(deepgramService, 'realtime')).toBe(true)
    expect(validateCloudAsrFieldValue(deepgramService, 'invalid')).toBe(false)
    expect(validateCloudAsrFieldValue(groqKey, 'x'.repeat(512))).toBe(true)
    expect(validateCloudAsrFieldValue(groqKey, 'x'.repeat(513))).toBe(false)
  })

  it('declares service capability mappings and per-model static fallback metadata', () => {
    const deepgram = cloudProviderEntry('deepgram')
    if (deepgram === undefined) throw new Error('Deepgram provider entry is missing')
    expect(deepgram.modelServiceCapabilities).toEqual({ 'recording-file': 'batch', realtime: 'streaming' })
    // Every static fallback model is a Listen V1 model the adapter can execute.
    for (const model of deepgram.staticModels ?? []) {
      expect(deepgram.staticModelCapabilities?.[model]?.transport).toBe('listen-v1')
      expect(deepgram.staticModelCapabilities?.[model]?.batch).toBe(true)
    }
    // Deepgram Whisper Cloud is a batch-only model and must not be exposed for realtime.
    expect(deepgram.staticModelCapabilities?.['whisper-large']).toEqual({ batch: true, streaming: false, transport: 'listen-v1' })
    expect(deepgram.staticModelCapabilities?.['nova-3']).toEqual({ batch: true, streaming: true, transport: 'listen-v1' })
    expect(cloudAsrStaticModelsFor('deepgram', 'recording-file')).toContain('nova-3')
    expect(cloudAsrStaticModelsFor('deepgram', 'recording-file')).toContain('whisper-large')
    expect(cloudAsrStaticModelsFor('deepgram', 'realtime')).toContain('nova-3')
    expect(cloudAsrStaticModelsFor('deepgram', 'realtime')).not.toContain('whisper-large')
    expect(cloudAsrModelSupportsService('deepgram', 'recording-file', { batch: true, streaming: false })).toBe(true)
    expect(cloudAsrModelSupportsService('deepgram', 'recording-file', { batch: false, streaming: true })).toBe(false)
    expect(cloudAsrModelSupportsService('deepgram', 'realtime', { batch: false, streaming: true })).toBe(true)
    expect(cloudAsrModelSupportsService('deepgram', 'realtime', { batch: true, streaming: false })).toBe(false)
    expect(cloudAsrModelSupportsService('deepgram', 'realtime', undefined)).toBe(false)
  })

  it('keeps a live-catalog Whisper model out of realtime end to end', async () => {
    // Deepgram's live /v1/models reports streaming: true for every Whisper
    // entry, but Whisper Cloud is pre-recorded only. The projected capability
    // must therefore exclude it from the realtime service while keeping it for
    // recording-file.
    const catalog = filterDeepgramModels([
      { canonical_name: 'whisper-large', architecture: 'whisper', batch: true, streaming: true },
      { canonical_name: 'nova-3-general', architecture: 'nova-3', batch: true, streaming: true }
    ])
    const capabilities = catalog.modelCapabilities ?? {}
    expect(cloudAsrModelSupportsService('deepgram', 'realtime', capabilities['whisper-large'])).toBe(false)
    expect(cloudAsrModelSupportsService('deepgram', 'recording-file', capabilities['whisper-large'])).toBe(true)
    expect(cloudAsrModelSupportsService('deepgram', 'realtime', capabilities['nova-3-general'])).toBe(true)
    expect(cloudAsrModelSupportsService('deepgram', 'recording-file', capabilities['nova-3-general'])).toBe(true)
  })

  it('refuses a streaming-capable model that requires a transport the adapter cannot execute', () => {
    // A Flux-class model reports streaming: true but requires Listen V2, which
    // the in-repo Deepgram adapters (Listen V1) cannot issue.
    expect(cloudAsrModelSupportsService('deepgram', 'realtime', { batch: false, streaming: true, transport: 'listen-v2' })).toBe(false)
    expect(cloudAsrModelSupportsService('deepgram', 'recording-file', { batch: true, streaming: true, transport: 'listen-v2' })).toBe(false)
    expect(cloudAsrModelSupportsService('deepgram', 'realtime', { batch: false, streaming: true, transport: 'listen-v1' })).toBe(true)
    // A model with no declared transport falls back to capability-only filtering.
    expect(cloudAsrModelSupportsService('deepgram', 'realtime', { batch: false, streaming: true })).toBe(true)
  })

  it('derives realtime routing from the registry instead of provider-specific UI checks', () => {
    expect(isCloudAsrRealtime(settings({ cloudAsrProvider: 'deepgram', cloudAsrDeepgramService: 'realtime' }))).toBe(true)
    expect(isCloudAsrRealtime(settings({ cloudAsrProvider: 'deepgram', cloudAsrDeepgramService: 'recording-file' }))).toBe(false)
    expect(isCloudAsrRealtime(settings({ cloudAsrProvider: 'tencent', cloudAsrTencentService: 'realtime' }))).toBe(true)
    expect(isCloudAsrRealtime(settings({ cloudAsrProvider: 'groq' }))).toBe(false)
  })
})

describe('cloud ASR configuration validity', () => {
  it('requires an effective model for the Groq preset', () => {
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'groq', cloudAsrGroqModel: '' }))).toBe(false)
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'groq', cloudAsrGroqModel: 'whisper-large-v3-turbo' }))).toBe(true)
  })

  it('uses the whisper-1 default for the custom provider', () => {
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'custom', cloudAsrCustomEndpoint: 'https://asr.example.test/audio/transcriptions' }))).toBe(true)
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'custom', cloudAsrCustomEndpoint: 'not-an-endpoint' }))).toBe(false)
  })

  it('does not require a key for configuration validity', () => {
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'groq', cloudAsrGroqModel: 'whisper-large-v3-turbo', cloudAsrGroqApiKey: '' }))).toBe(true)
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'unknown' }))).toBe(false)
    expect(isCloudConfigurationValid(settings({ asrBackend: 'local-whisper' }))).toBe(true)
  })
})

describe('cloud ASR runtime readiness', () => {
  it('requires the key only for providers that demand one', () => {
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'groq', cloudAsrGroqModel: 'whisper-large-v3-turbo', cloudAsrGroqApiKey: '' }))).toBe(false)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'groq', cloudAsrGroqModel: 'whisper-large-v3-turbo', cloudAsrGroqApiKey: ' gsk_test ' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'custom', cloudAsrCustomEndpoint: 'https://asr.example.test/audio/transcriptions', cloudAsrGroqApiKey: '' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'groq', cloudAsrGroqModel: '', cloudAsrGroqApiKey: 'gsk_test' }))).toBe(false)
  })

  it('keeps a credential-bearing custom HTTP endpoint unready while allowing local keyless HTTP', () => {
    const base = { asrBackend: 'cloud-openai' as const, cloudAsrProvider: 'custom' as const, cloudAsrCustomModel: 'whisper-1', cloudAsrCustomEndpoint: 'http://127.0.0.1:8080/v1/audio/transcriptions' }
    expect(isCloudConfigurationValid(settings({ ...base, cloudAsrCustomApiKey: '' }))).toBe(true)
    expect(isCloudAsrReady(settings({ ...base, cloudAsrCustomApiKey: '' }))).toBe(true)
    expect(isCloudConfigurationValid(settings({ ...base, cloudAsrCustomApiKey: 'sk_local' }))).toBe(true)
    expect(isCloudAsrReady(settings({ ...base, cloudAsrCustomApiKey: 'sk_local' }))).toBe(false)
    expect(isCloudAsrReady(settings({ ...base, cloudAsrCustomEndpoint: 'https://asr.example.test/v1/audio/transcriptions', cloudAsrCustomApiKey: 'sk_remote' }))).toBe(true)
  })

  it('reports cloud readiness independent of the selected backend', () => {
    expect(isCloudAsrReady(settings({ asrBackend: 'web-speech', cloudAsrProvider: 'groq', cloudAsrGroqModel: 'whisper-large-v3-turbo', cloudAsrGroqApiKey: 'gsk_test' }))).toBe(true)
    expect(isCloudAsrReady(settings({ asrBackend: 'web-speech', cloudAsrGroqApiKey: '' }))).toBe(false)
  })

  it('requires Tencent Cloud credentials and an executable service', () => {
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'tencent', cloudAsrTencentService: 'recording-file', cloudAsrTencentAppId: '1250000000', cloudAsrTencentSecretId: 'AKID', cloudAsrTencentSecretKey: 'secret' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'tencent', cloudAsrTencentService: 'recording-file', cloudAsrTencentAppId: '1250000000', cloudAsrTencentSecretId: '', cloudAsrTencentSecretKey: 'secret' }))).toBe(false)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'tencent', cloudAsrTencentService: 'unsupported', cloudAsrTencentAppId: '1250000000', cloudAsrTencentSecretId: 'AKID', cloudAsrTencentSecretKey: 'secret' }))).toBe(false)
  })

  it('requires Deepgram API key and an executable service', () => {
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'deepgram', cloudAsrDeepgramModel: 'nova-3', cloudAsrDeepgramApiKey: 'test_key', cloudAsrDeepgramService: 'recording-file' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'deepgram', cloudAsrDeepgramModel: 'nova-3', cloudAsrDeepgramApiKey: 'test_key', cloudAsrDeepgramService: 'realtime' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'deepgram', cloudAsrDeepgramModel: 'nova-3', cloudAsrDeepgramApiKey: '', cloudAsrDeepgramService: 'recording-file' }))).toBe(false)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'deepgram', cloudAsrDeepgramModel: 'nova-3', cloudAsrDeepgramApiKey: 'test_key', cloudAsrDeepgramService: 'unsupported' }))).toBe(false)
  })

  it('rejects embedded credentials in a custom endpoint', () => {
    expect(isHttpEndpoint('https://user:pass@asr.example.test/audio/transcriptions')).toBe(false)
  })

  it('keeps Groq, custom, and Bailian API keys on separate fields', () => {
    const mixed = settings({
      cloudAsrProvider: 'bailian',
      cloudAsrGroqApiKey: 'gsk_groq',
      cloudAsrDeepgramApiKey: 'dg_key',
      cloudAsrCustomApiKey: 'sk_custom',
      cloudAsrBailianApiKey: 'sk_bailian'
    })
    expect(cloudAsrCredentialFor({ ...mixed, cloudAsrProvider: 'groq' })).toBe('gsk_groq')
    expect(cloudAsrCredentialFor({ ...mixed, cloudAsrProvider: 'deepgram' })).toBe('dg_key')
    expect(cloudAsrCredentialFor({ ...mixed, cloudAsrProvider: 'custom' })).toBe('sk_custom')
    expect(cloudAsrCredentialFor(mixed)).toBe('sk_bailian')
  })

  it('builds the DashScope generation URL from a Bailian origin', () => {
    expect(bailianGenerationUrl('https://ws-test.cn-beijing.maas.aliyuncs.com/')).toBe(
      'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
    )
    expect(cloudAsrEndpointFor(settings({
      cloudAsrProvider: 'bailian',
      cloudAsrBailianHost: 'https://ws-test.cn-beijing.maas.aliyuncs.com'
    }))).toContain('/api/v1/services/aigc/multimodal-generation/generation')
    expect(isCloudAsrReady(settings({
      cloudAsrProvider: 'bailian',
      cloudAsrBailianHost: 'https://ws-test.cn-beijing.maas.aliyuncs.com',
      cloudAsrBailianModel: 'fun-asr-flash',
      cloudAsrBailianApiKey: 'sk_test'
    }))).toBe(true)
    expect(isCloudConfigurationValid(settings({
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'bailian',
      cloudAsrBailianHost: 'http://127.0.0.1:8080',
      cloudAsrBailianModel: 'fun-asr-flash'
    }))).toBe(true)
    expect(isCloudAsrReady(settings({
      cloudAsrProvider: 'bailian',
      cloudAsrBailianHost: 'http://127.0.0.1:8080',
      cloudAsrBailianModel: 'fun-asr-flash',
      cloudAsrBailianApiKey: 'sk_test'
    }))).toBe(false)
    expect(isCloudAsrReady(settings({
      cloudAsrProvider: 'bailian',
      cloudAsrBailianHost: 'https://ws-test.cn-beijing.maas.aliyuncs.com',
      cloudAsrBailianModel: 'fun-asr-flash',
      cloudAsrGroqApiKey: 'gsk_other',
      cloudAsrBailianApiKey: ''
    }))).toBe(false)
    expect(isCloudConfigurationValid(settings({
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'bailian',
      cloudAsrBailianHost: 'http://ws-test.cn-beijing.maas.aliyuncs.com',
      cloudAsrBailianModel: 'qwen3-asr-flash'
    }))).toBe(false)
    expect(() => bailianGenerationUrl('not-a-host')).toThrowError(expect.objectContaining({ code: EARS_ERROR_CODES.asrEndpointInvalid }))
  })

  it('validates MiMo configuration and readiness', () => {
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'mimo', cloudAsrMimoModel: 'mimo-v2.5-asr' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'mimo', cloudAsrMimoModel: 'mimo-v2.5-asr', cloudAsrMimoApiKey: '' }))).toBe(false)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'mimo', cloudAsrMimoModel: 'mimo-v2.5-asr', cloudAsrMimoApiKey: 'sk-123' }))).toBe(true)
  })
})
