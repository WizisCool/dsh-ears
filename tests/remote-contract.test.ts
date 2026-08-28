import { describe, expect, it } from 'vitest'
import { asrBackendInfoSchema, cloudProviderModelsViewSchema, earsSettingsPatchSchema, earsSettingsViewSchema, remoteTextResultSchema, whisperModelStateSchema } from '../src/remote-contract.js'
import { TYPERT } from '../src/typert.js'
import { TYPERT_REMOTE } from '../src/remote.js'
import { EARS_REMOTE_DESCRIPTORS } from '../src/remote-definitions.js'
import { MAX_CLOUD_API_KEY_LENGTH } from '../src/config.js'

describe('structured error Remote contracts', () => {
  it('accepts optional error codes and interpolation parameters', () => {
    expect(whisperModelStateSchema.parse({
      runtimeAvailable: true,
      downloaded: false,
      downloading: false,
      progress: null,
      bytes: null,
      totalBytes: null,
      error: 'The installed whisper does not know the model "tiny".',
      errorCode: 'whisper.modelUnknown',
      errorParams: { model: 'tiny' }
    })).toMatchObject({ errorCode: 'whisper.modelUnknown', errorParams: { model: 'tiny' } })
    expect(whisperModelStateSchema.parse({
      runtimeAvailable: false,
      downloaded: false,
      downloading: false,
      progress: null,
      bytes: null,
      totalBytes: null,
      error: null
    })).toMatchObject({ runtimeAvailable: false })
    expect(cloudProviderModelsViewSchema.parse({
      status: 'error',
      models: [],
      error: 'Cloud model listing failed with HTTP 500',
      errorCode: 'cloudModels.httpFailed',
      errorParams: { status: 500 }
    })).toMatchObject({ errorCode: 'cloudModels.httpFailed', errorParams: { status: 500 } })
    expect(asrBackendInfoSchema.parse({
      id: 'web-speech',
      name: 'Web Speech',
      available: false,
      detail: 'Browser-provided live recognition; availability depends on the browser',
      detailCode: 'backend.webSpeechUnavailable'
    })).toMatchObject({ detailCode: 'backend.webSpeechUnavailable' })
    expect(remoteTextResultSchema.parse({
      status: 'error',
      code: 'asr.providerUnknown',
      message: 'Unknown dsh-ears cloud ASR provider: future-provider',
      params: { provider: 'future-provider' }
    })).toEqual({
      status: 'error',
      code: 'asr.providerUnknown',
      message: 'Unknown dsh-ears cloud ASR provider: future-provider',
      params: { provider: 'future-provider' }
    })
  })
})

describe('settings Remote contract', () => {
  it('accepts the supported local Whisper acceleration values', () => {
    expect(earsSettingsPatchSchema.parse({ localWhisperAcceleration: 'default' })).toEqual({ localWhisperAcceleration: 'default' })
    expect(earsSettingsPatchSchema.parse({ localWhisperAcceleration: 'vulkan' })).toEqual({ localWhisperAcceleration: 'vulkan' })
    expect(earsSettingsPatchSchema.parse({ localWhisperAcceleration: 'cuda' })).toEqual({ localWhisperAcceleration: 'cuda' })
    expect(() => earsSettingsPatchSchema.parse({ localWhisperAcceleration: 'metal' })).toThrow()
  })

  it('accepts the supported Tencent service identifiers', () => {
    expect(earsSettingsPatchSchema.parse({ cloudAsrTencentService: 'recording-file' })).toEqual({ cloudAsrTencentService: 'recording-file' })
    expect(earsSettingsPatchSchema.parse({ cloudAsrTencentService: 'realtime' })).toEqual({ cloudAsrTencentService: 'realtime' })
    expect(() => earsSettingsPatchSchema.parse({ cloudAsrTencentService: 'unsupported-service' })).toThrow()
  })

  it('accepts the supported Deepgram service identifiers', () => {
    expect(earsSettingsPatchSchema.parse({ cloudAsrDeepgramService: 'recording-file' })).toEqual({ cloudAsrDeepgramService: 'recording-file' })
    expect(earsSettingsPatchSchema.parse({ cloudAsrDeepgramService: 'realtime' })).toEqual({ cloudAsrDeepgramService: 'realtime' })
    expect(() => earsSettingsPatchSchema.parse({ cloudAsrDeepgramService: 'unsupported-service' })).toThrow()
  })

  it('accepts the supported MiMo service and cluster identifiers', () => {
    expect(earsSettingsPatchSchema.parse({ cloudAsrMimoService: 'api' })).toEqual({ cloudAsrMimoService: 'api' })
    expect(earsSettingsPatchSchema.parse({ cloudAsrMimoService: 'token-plan' })).toEqual({ cloudAsrMimoService: 'token-plan' })
    expect(() => earsSettingsPatchSchema.parse({ cloudAsrMimoService: 'invalid' })).toThrow()

    expect(earsSettingsPatchSchema.parse({ cloudAsrMimoCluster: 'cn' })).toEqual({ cloudAsrMimoCluster: 'cn' })
    expect(earsSettingsPatchSchema.parse({ cloudAsrMimoCluster: 'sgp' })).toEqual({ cloudAsrMimoCluster: 'sgp' })
    expect(earsSettingsPatchSchema.parse({ cloudAsrMimoCluster: 'ams' })).toEqual({ cloudAsrMimoCluster: 'ams' })
    expect(() => earsSettingsPatchSchema.parse({ cloudAsrMimoCluster: 'us' })).toThrow()
  })

  it('accepts an empty provider/model pair as the no-polish state', () => {
    expect(earsSettingsPatchSchema.parse({ polishProvider: '', polishModel: '' })).toEqual({
      polishProvider: '',
      polishModel: ''
    })
  })

  it('accepts an empty custom polish prompt as the explicit-clear state', () => {
    expect(earsSettingsPatchSchema.parse({ polishPrompt: '' })).toEqual({ polishPrompt: '' })
    expect(earsSettingsPatchSchema.parse({ polishPrompt: 'Polish like a friend.' })).toEqual({ polishPrompt: 'Polish like a friend.' })
  })

  it('accepts cloud provider and write-only key patch fields', () => {
    expect(earsSettingsPatchSchema.parse({ cloudAsrProvider: 'groq', cloudAsrGroqApiKey: 'gsk_test' })).toEqual({
      cloudAsrProvider: 'groq',
      cloudAsrGroqApiKey: 'gsk_test'
    })
    expect(earsSettingsPatchSchema.parse({ cloudAsrProvider: 'bailian', cloudAsrBailianApiKey: 'sk_test' })).toEqual({
      cloudAsrProvider: 'bailian',
      cloudAsrBailianApiKey: 'sk_test'
    })
    expect(earsSettingsPatchSchema.parse({ cloudAsrCustomApiKey: '' })).toEqual({ cloudAsrCustomApiKey: '' })
    expect(earsSettingsPatchSchema.parse({ cloudAsrGroqApiKey: '' })).toEqual({ cloudAsrGroqApiKey: '' })
    expect(() => earsSettingsPatchSchema.parse({ cloudAsrProvider: 'unknown' })).toThrow()
  })

  it('uses the shared cloud credential limit at the Remote boundary', () => {
    const credentialFields = [
      'cloudAsrGroqApiKey',
      'cloudAsrDeepgramApiKey',
      'cloudAsrCustomApiKey',
      'cloudAsrBailianApiKey',
      'cloudAsrTencentSecretKey',
      'cloudAsrMimoApiKey'
    ] as const
    for (const field of credentialFields) {
      expect(earsSettingsPatchSchema.parse({ [field]: 'x'.repeat(MAX_CLOUD_API_KEY_LENGTH) })).toEqual({ [field]: 'x'.repeat(MAX_CLOUD_API_KEY_LENGTH) })
      expect(() => earsSettingsPatchSchema.parse({ [field]: 'x'.repeat(MAX_CLOUD_API_KEY_LENGTH + 1) })).toThrow()
    }
  })

  it('preserves optional model capability metadata for newer Hosts', () => {
    expect(cloudProviderModelsViewSchema.parse({
      status: 'ok',
      models: ['batch-only', 'dual-mode'],
      modelCapabilities: {
        'batch-only': { batch: true, streaming: false },
        'dual-mode': { batch: true, streaming: true }
      }
    })).toMatchObject({ modelCapabilities: { 'batch-only': { batch: true, streaming: false } } })
  })

  it('rejects settings patches with the wrong wire types', () => {
    expect(() => earsSettingsPatchSchema.parse({ maxRecordingSeconds: '120' })).toThrow()
    expect(() => earsSettingsPatchSchema.parse({ voiceShortcutEnabled: 'yes' })).toThrow()
    expect(() => earsSettingsPatchSchema.parse({ voiceShortcut: 42 })).toThrow()
  })

  it('accepts voice shortcut patch fields', () => {
    expect(earsSettingsPatchSchema.parse({ voiceShortcutEnabled: false, voiceShortcut: 'ctrl+shift+space' })).toEqual({
      voiceShortcutEnabled: false,
      voiceShortcut: 'ctrl+shift+space'
    })
    expect(earsSettingsPatchSchema.parse({ voiceShortcut: 'f9' })).toEqual({ voiceShortcut: 'f9' })
  })

  it('validates the complete settings view returned by Host RPC', () => {
    const parsed = earsSettingsViewSchema.parse({
      available: true,
      writable: true,
      settings: {
        asrBackend: 'web-speech',
        localWhisperModel: 'tiny',
        localWhisperAcceleration: 'default',
        cloudAsrProvider: 'groq',
        cloudAsrGroqApiKey: '',
        cloudAsrGroqModel: '',
        cloudAsrDeepgramApiKey: '',
        cloudAsrDeepgramModel: 'nova-3',
        cloudAsrDeepgramLanguage: '',
        cloudAsrDeepgramService: 'recording-file',
        cloudAsrCustomApiKey: '',
        cloudAsrCustomEndpoint: '',
        cloudAsrCustomModel: '',
        cloudAsrBailianApiKey: '',
        cloudAsrBailianHost: '',
        cloudAsrBailianModel: '',
        cloudAsrTencentAppId: '',
        cloudAsrTencentSecretId: '',
        cloudAsrTencentSecretKey: '',
        cloudAsrTencentEngineType: '16k_zh',
        cloudAsrTencentService: 'recording-file',
        webSpeechLanguage: 'zh-CN',
        localWhisperLanguage: '',
        cloudAsrGroqLanguage: '',
        cloudAsrCustomLanguage: '',
        cloudAsrBailianLanguage: '',
        maxRecordingSeconds: 120,
        voiceShortcutEnabled: true,
        voiceShortcut: 'ctrl+shift+space',
        voiceSoundsEnabled: true,
        settingsDisplayName: 'dsh-ears',
        polishingEnabled: true,
        polishProvider: '',
        polishModel: '',
        polishReasoningEffort: '',
        polishPrompt: ''
      },
      cloudAsrGroqApiKeyConfigured: false,
      cloudAsrDeepgramApiKeyConfigured: false,
      cloudAsrCustomApiKeyConfigured: false,
      cloudAsrBailianApiKeyConfigured: false,
      cloudAsrTencentSecretKeyConfigured: false,
      defaultPolishRoute: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' },
      recoveredSettingsFields: ['cloudAsrProvider'],
      localWhisperAccelerations: ['default'],
      overridden: []
    })
    expect(parsed.settings.maxRecordingSeconds).toBe(120)
    expect(parsed.defaultPolishRoute).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'high' })
    expect(parsed.recoveredSettingsFields).toEqual(['cloudAsrProvider'])
  })

  it('parses older pre-Deepgram Host responses with backward-compatible defaults', () => {
    const legacyView = {
      available: true,
      writable: true,
      settings: {
        asrBackend: 'web-speech',
        cloudAsrProvider: 'groq',
        localWhisperModel: 'base',
        localWhisperAcceleration: 'default',
        cloudAsrGroqApiKey: '',
        cloudAsrGroqModel: '',
        cloudAsrCustomApiKey: '',
        cloudAsrCustomEndpoint: '',
        cloudAsrCustomModel: '',
        cloudAsrBailianApiKey: '',
        cloudAsrBailianHost: '',
        cloudAsrBailianModel: '',
        cloudAsrTencentAppId: '',
        cloudAsrTencentSecretId: '',
        cloudAsrTencentSecretKey: '',
        cloudAsrTencentEngineType: '16k_zh',
        cloudAsrTencentService: 'recording-file',
        webSpeechLanguage: 'zh-CN',
        localWhisperLanguage: '',
        cloudAsrGroqLanguage: '',
        cloudAsrCustomLanguage: '',
        cloudAsrBailianLanguage: '',
        maxRecordingSeconds: 120,
        voiceShortcutEnabled: true,
        voiceShortcut: 'ctrl+shift+space',
        voiceSoundsEnabled: true,
        settingsDisplayName: 'dsh-ears',
        polishingEnabled: true,
        polishProvider: '',
        polishModel: '',
        polishReasoningEffort: '',
        polishPrompt: ''
      },
      cloudAsrGroqApiKeyConfigured: false,
      cloudAsrCustomApiKeyConfigured: false,
      cloudAsrBailianApiKeyConfigured: false,
      cloudAsrTencentSecretKeyConfigured: false,
      overridden: []
    }
    const parsed = earsSettingsViewSchema.parse(legacyView)
    expect(parsed.settings.cloudAsrDeepgramApiKey).toBe('')
    expect(parsed.settings.cloudAsrDeepgramModel).toBe('nova-3')
    expect(parsed.settings.cloudAsrDeepgramService).toBe('recording-file')
    expect(parsed.cloudAsrDeepgramApiKeyConfigured).toBe(false)
  })

  it('keeps Host and Client Remote descriptors aligned', () => {
    expect(TYPERT.invocations).toBe(EARS_REMOTE_DESCRIPTORS)
    expect(TYPERT_REMOTE.descriptors).toBe(EARS_REMOTE_DESCRIPTORS)
    const hostIds = TYPERT.invocations.map((invocation) => invocation.id).sort()
    const clientIds = TYPERT_REMOTE.descriptors.map((descriptor) => descriptor.id).sort()
    expect(clientIds).toEqual(hostIds)
    expect(TYPERT_REMOTE.descriptors.filter((descriptor) => descriptor.cancellation !== undefined).map((descriptor) => descriptor.method).sort()).toEqual(['checkForUpdate', 'finishRealtime', 'listCloudProviderModels', 'polish', 'sendRealtimeAudio', 'startRealtime', 'transcribe', 'updateSettings'])
  })

  it('keeps the cloud model capability metadata in the public Typert declaration', () => {
    const service = TYPERT.model.services[0]
    const cloudModelsType = service?.types.find((type) => type.name === 'CloudProviderModelsView')
    if (cloudModelsType === undefined) throw new Error('CloudProviderModelsView declaration is missing')
    expect(cloudModelsType.declaration).toContain("transport?: 'listen-v1' | 'listen-v2'")
    const parsed = cloudProviderModelsViewSchema.parse({
      status: 'ok',
      models: ['flux-general-en'],
      modelCapabilities: { 'flux-general-en': { streaming: true, transport: 'listen-v2' } }
    })
    expect(parsed.modelCapabilities?.['flux-general-en']?.transport).toBe('listen-v2')
    const settingsViewType = TYPERT.model.services[0]?.types.find((type) => type.name === 'EarsSettingsView')
    expect(settingsViewType?.declaration).toContain('defaultPolishRoute?: { provider: string; model: string; reasoningEffort?: string }')
    expect(settingsViewType?.declaration).toContain('recoveredSettingsFields?: string[]')
  })

  it('keeps every endpoint wire shape aligned across Host and Client', () => {
    const hostById = new Map(TYPERT.invocations.map((invocation) => [invocation.id, invocation]))
    for (const client of TYPERT_REMOTE.descriptors) {
      const host = hostById.get(client.id)
      if (host === undefined) throw new Error(`Host descriptor is missing: ${client.id}`)
      expect(client.parameters.map((parameter) => ({
        name: parameter.name,
        wire: parameter.wire,
        source: parameter.source,
        codec: parameter.codec
      }))).toEqual(host.parameters.map((parameter) => ({
        name: parameter.name,
        wire: parameter.wire,
        source: parameter.source,
        codec: parameter.codec
      })))
      expect(client.cancellation).toEqual(host.cancellation)
      expect(client.result).toEqual(host.result)
    }
  })

  it('uses the same strict text codecs on both Remote faces', () => {
    const host = TYPERT.invocations.find((invocation) => invocation.id.endsWith('/polish'))
    const client = TYPERT_REMOTE.descriptors.find((descriptor) => descriptor.id.endsWith('/polish'))
    if (host === undefined || client === undefined) throw new Error('Polish descriptor is missing')
    const hostParameters = host.parameters as ReadonlyArray<{ codec: { schema: { parse(value: unknown): unknown } } }>
    const clientParameters = client.parameters as ReadonlyArray<{ codec: { schema: { parse(value: unknown): unknown } } }>

    expect(hostParameters.map((parameter) => parameter.codec.schema)).toEqual(clientParameters.map((parameter) => parameter.codec.schema))
    expect(() => hostParameters[0].codec.schema.parse(123)).toThrow()
    expect(() => clientParameters[0].codec.schema.parse(123)).toThrow()
    expect(() => host.result.schema.parse(123)).toThrow()
    expect(() => client.result.schema.parse(123)).toThrow()
  })
})
