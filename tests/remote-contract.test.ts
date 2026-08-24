import { describe, expect, it } from 'vitest'
import { asrBackendInfoSchema, cloudProviderModelsViewSchema, earsSettingsPatchSchema, earsSettingsViewSchema, remoteTextResultSchema, whisperModelStateSchema } from '../src/remote-contract.js'
import { TYPERT } from '../src/typert.js'
import { TYPERT_REMOTE } from '../src/remote.js'

describe('structured error Remote contracts', () => {
  it('accepts optional error codes and interpolation parameters', () => {
    expect(whisperModelStateSchema.parse({
      cliAvailable: true,
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
      cliAvailable: false,
      downloaded: false,
      downloading: false,
      progress: null,
      bytes: null,
      totalBytes: null,
      error: null,
      platform: 'windows',
      environment: 'python-missing'
    })).toMatchObject({ platform: 'windows', environment: 'python-missing' })
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
    expect(earsSettingsViewSchema.parse({
      available: true,
      writable: true,
      settings: {
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
      overridden: []
    }).settings.maxRecordingSeconds).toBe(120)
  })

  it('keeps Host and Client Remote descriptors aligned', () => {
    const hostIds = TYPERT.invocations.map((invocation) => invocation.id).sort()
    const clientIds = TYPERT_REMOTE.descriptors.map((descriptor) => descriptor.id).sort()
    expect(clientIds).toEqual(hostIds)
    expect(TYPERT_REMOTE.descriptors.filter((descriptor) => descriptor.cancellation !== undefined).map((descriptor) => descriptor.method).sort()).toEqual(['checkForUpdate', 'listCloudProviderModels', 'polish', 'transcribe', 'updateSettings'])
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
