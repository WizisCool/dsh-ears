import { describe, expect, it } from 'vitest'
import { CLOUD_ASR_PROVIDER_IDS, DEFAULT_EARS_SETTINGS, isHttpEndpoint } from '../src/config.js'
import {
  CLOUD_ASR_PROVIDERS,
  bailianGenerationUrl,
  cloudAsrBackendSelection,
  cloudAsrCredentialFor,
  cloudAsrEndpointFor,
  cloudAsrModelFor,
  cloudProviderEntry,
  isCloudAsrReady,
  isCloudConfigurationValid,
  isKnownCloudProvider,
  supportsModelListing,
  validateCloudAsrFieldValue
} from '../src/asr/providers.js'
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
  })

  it('validates MiMo configuration and readiness', () => {
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'mimo', cloudAsrMimoModel: 'mimo-v2.5-asr' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'mimo', cloudAsrMimoModel: 'mimo-v2.5-asr', cloudAsrMimoApiKey: '' }))).toBe(false)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'mimo', cloudAsrMimoModel: 'mimo-v2.5-asr', cloudAsrMimoApiKey: 'sk-123' }))).toBe(true)
  })
})
