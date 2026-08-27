import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { applyFlatSettingsPatch, defaultStoredEarsSettings, flattenOverriddenSettings, flattenStoredSettings, normalizeStoredEarsSettings, storedSettingsNeedRewrite, unflattenEarsSettings } from '../src/settings-store.js'

describe('canonical Host settings slots', () => {
  it('round-trips flat app settings into current schema slots', () => {
    const stored = unflattenEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      localWhisperAcceleration: 'cuda',
      cloudAsrProvider: 'bailian',
      cloudAsrGroqApiKey: 'gsk_groq',
      cloudAsrGroqModel: 'whisper-large-v3-turbo',
      cloudAsrCustomApiKey: 'sk_openai',
      cloudAsrCustomEndpoint: 'https://asr.example.test/audio/transcriptions',
      cloudAsrCustomModel: 'whisper-1',
      cloudAsrBailianApiKey: 'sk_bailian',
      cloudAsrBailianHost: 'https://ws-test.cn-beijing.maas.aliyuncs.com',
      cloudAsrBailianModel: 'fun-asr-flash',
      cloudAsrSiliconFlowApiKey: 'sk_siliconflow',
      cloudAsrSiliconFlowModel: 'Qwen/Qwen3-ASR-1.7B',
      cloudAsrSiliconFlowLanguage: 'zh',
      polishProvider: 'provider',
      polishModel: 'model',
      polishPrompt: 'Keep it short.'
    })

    expect(stored.schemaVersion).toBe(4)
    expect(stored.general).toEqual({
      displayName: 'dsh-ears',
      shortcut: { enabled: true, value: 'ctrl+shift+space' },
      soundsEnabled: true
    })
    expect(stored.recognition.localWhisper).toEqual({ model: 'tiny', acceleration: 'cuda', language: '' })
    expect(stored.cloudAsr.groq).toEqual({ apiKey: 'gsk_groq', model: 'whisper-large-v3-turbo', language: '' })
    expect(stored.cloudAsr.deepgram).toEqual({ apiKey: '', model: 'nova-3', language: '', service: 'recording-file' })
    expect(stored.cloudAsr.customOpenAi).toEqual({
      apiKey: 'sk_openai',
      endpoint: 'https://asr.example.test/audio/transcriptions',
      model: 'whisper-1',
      language: ''
    })
    expect(stored.cloudAsr.bailian).toEqual({
      apiKey: 'sk_bailian',
      host: 'https://ws-test.cn-beijing.maas.aliyuncs.com',
      model: 'fun-asr-flash',
      language: ''
    })
    expect(stored.cloudAsr.tencent).toEqual({ appId: '', secretId: '', secretKey: '', engineType: '16k_zh', service: 'recording-file' })
    expect(stored.cloudAsr.mimo).toEqual({ apiKey: '', service: 'api', cluster: 'cn', model: 'mimo-v2.5-asr', language: '' })
    expect(stored.cloudAsr.siliconflow).toEqual({ apiKey: 'sk_siliconflow', model: 'Qwen/Qwen3-ASR-1.7B', language: 'zh' })
    expect(stored.polishing).toEqual({
      enabled: false,
      provider: 'provider',
      model: 'model',
      reasoningEffort: '',
      prompt: 'Keep it short.'
    })
    expect(flattenStoredSettings(stored)).toMatchObject({
      localWhisperAcceleration: 'cuda',
      cloudAsrGroqApiKey: 'gsk_groq',
      cloudAsrCustomApiKey: 'sk_openai',
      cloudAsrBailianModel: 'fun-asr-flash',
      polishPrompt: 'Keep it short.'
    })
    expect(storedSettingsNeedRewrite(stored)).toBe(false)
  })

  it('migrates the previous fully flat settings without dropping provider secrets', () => {
    const raw = {
      asrBackend: 'cloud-openai',
      localWhisperModel: 'base',
      cloudAsrProvider: 'bailian',
      cloudAsrApiKey: 'gsk_legacy_groq',
      cloudAsrCustomApiKey: 'sk_legacy_custom',
      cloudAsrBailianApiKey: 'sk_legacy_bailian',
      cloudAsrBailianHost: 'https://ws-legacy.cn-beijing.maas.aliyuncs.com',
      cloudAsrEndpoint: 'https://legacy.example.test/audio/transcriptions',
      cloudAsrModel: 'fun-asr-flash-2026-06-15',
      polishPrompt: 'legacy prompt'
    }
    const stored = normalizeStoredEarsSettings(raw)

    expect(stored.schemaVersion).toBe(4)
    expect(stored.recognition.backend).toBe('cloud-openai')
    expect(stored.recognition.localWhisper.model).toBe('base')
    expect(stored.cloudAsr.groq).toEqual({ apiKey: 'gsk_legacy_groq', model: '', language: '' })
    expect(stored.cloudAsr.customOpenAi).toEqual({
      apiKey: 'sk_legacy_custom',
      endpoint: 'https://legacy.example.test/audio/transcriptions',
      model: '',
      language: ''
    })
    expect(stored.cloudAsr.bailian).toEqual({
      apiKey: 'sk_legacy_bailian',
      host: 'https://ws-legacy.cn-beijing.maas.aliyuncs.com',
      model: 'fun-asr-flash-2026-06-15',
      language: ''
    })
    expect(flattenStoredSettings(raw).cloudAsrBailianApiKey).toBe('sk_legacy_bailian')
    expect(storedSettingsNeedRewrite(raw)).toBe(true)
  })

  it('migrates current grouped settings and fills partial V2 slots', () => {
    const stored = normalizeStoredEarsSettings({
      schemaVersion: 2,
      recognition: { localWhisper: { acceleration: 'vulkan' } },
      cloudAsr: { groq: { apiKey: 'gsk_grouped' } },
      polishing: { prompt: 'partial prompt' }
    })

    expect(stored.recognition.localWhisper).toEqual({ model: 'tiny', acceleration: 'vulkan', language: '' })
    expect(stored.cloudAsr.groq).toEqual({ apiKey: 'gsk_grouped', model: '', language: '' })
    expect(stored.cloudAsr.customOpenAi).toEqual({ apiKey: '', endpoint: '', model: '', language: '' })
    expect(stored.polishing.prompt).toBe('partial prompt')
    expect(stored.general.shortcut.value).toBe('ctrl+shift+space')
    expect(storedSettingsNeedRewrite(stored)).toBe(false)
  })

  it('drops the V3 recognition language when rewriting to per-provider language fields', () => {
    const raw = {
      schemaVersion: 3,
      recognition: {
        backend: 'web-speech',
        localWhisper: { model: 'tiny', acceleration: 'default' },
        cloudProvider: 'groq',
        language: 'en-US',
        maxRecordingSeconds: 120
      }
    }
    const stored = normalizeStoredEarsSettings(raw)

    expect(stored.schemaVersion).toBe(4)
    expect(stored.recognition.webSpeech).toEqual({ language: '' })
    expect(stored.recognition.localWhisper.language).toBe('')
    expect(stored.cloudAsr.groq.language).toBe('')
    expect(storedSettingsNeedRewrite(raw)).toBe(true)

    const flat = flattenStoredSettings(raw)
    expect(flat.webSpeechLanguage).toBe('')
    expect(flat.localWhisperLanguage).toBe('')
  })

  it('applies a flat patch without mixing provider slots and preserves acceleration', () => {
    const stored = defaultStoredEarsSettings()
    const next = applyFlatSettingsPatch(stored, {
      localWhisperAcceleration: 'cuda',
      cloudAsrGroqApiKey: 'gsk_new',
      cloudAsrCustomApiKey: 'sk_custom',
      cloudAsrMimoApiKey: 'sk_mimo',
      cloudAsrMimoService: 'token-plan',
      cloudAsrMimoCluster: 'sgp',
      cloudAsrSiliconFlowApiKey: 'sk_sf',
      cloudAsrSiliconFlowModel: 'FunAudioLLM/SenseVoiceSmall'
    })

    expect(next.recognition.localWhisper.acceleration).toBe('cuda')
    expect(next.cloudAsr.groq.apiKey).toBe('gsk_new')
    expect(next.cloudAsr.customOpenAi.apiKey).toBe('sk_custom')
    expect(next.cloudAsr.bailian.apiKey).toBe('')
    expect(next.cloudAsr.mimo.apiKey).toBe('sk_mimo')
    expect(next.cloudAsr.mimo.service).toBe('token-plan')
    expect(next.cloudAsr.mimo.cluster).toBe('sgp')
    expect(next.cloudAsr.siliconflow.apiKey).toBe('sk_sf')
    expect(next.cloudAsr.siliconflow.model).toBe('FunAudioLLM/SenseVoiceSmall')
  })

  it('keeps explicit V2 empty secrets and values from being resurrected by legacy aliases', () => {
    const base = defaultStoredEarsSettings()
    const raw = {
      ...base,
      general: {
        ...base.general,
        displayName: '',
        shortcut: { ...base.general.shortcut, value: '' }
      },
      recognition: {
        ...base.recognition,
        backend: '',
        localWhisper: { ...base.recognition.localWhisper, model: '', acceleration: 'default', language: '' },
        webSpeech: { language: '' },
        cloudProvider: ''
      },
      cloudAsr: {
        groq: { apiKey: '', model: '', language: '' },
        customOpenAi: { apiKey: '', endpoint: '', model: '', language: '' },
        bailian: { apiKey: '', host: '', model: '', language: '' }
      },
      polishing: { enabled: false, provider: '', model: '', reasoningEffort: '', prompt: '' },
      // These stale keys must not revive explicit V2 clears.
      cloudAsrApiKey: 'legacy-secret',
      cloudAsrGroqModel: 'legacy-groq-model',
      cloudAsrCustomEndpoint: 'https://legacy.example.test/transcriptions',
      polishProvider: 'legacy-provider',
      polishModel: 'legacy-model',
      polishPrompt: 'legacy-prompt',
      settingsDisplayName: 'voice',
      voiceShortcut: 'ctrl+a',
      language: 'zh-CN'
    }
    const flat = flattenStoredSettings(raw)

    expect(flat.cloudAsrGroqApiKey).toBe('')
    expect(flat.cloudAsrGroqModel).toBe('')
    expect(flat.cloudAsrCustomEndpoint).toBe('')
    expect(flat.polishProvider).toBe('')
    expect(flat.polishModel).toBe('')
    expect(flat.polishPrompt).toBe('')
    expect(flat.webSpeechLanguage).toBe('')
    expect(flat.localWhisperLanguage).toBe('')
    expect(flat.cloudAsrGroqLanguage).toBe('')
    expect(flat.cloudAsrCustomLanguage).toBe('')
    expect(flat.cloudAsrBailianLanguage).toBe('')
    expect(flat.asrBackend).toBe('web-speech')
    expect(flat.localWhisperModel).toBe('tiny')
    expect(flat.cloudAsrProvider).toBe('groq')
    expect(flat.settingsDisplayName).toBe('dsh-ears')
    expect(flat.voiceShortcut).toBe('ctrl+shift+space')
  })

  it('flattens nested and legacy override paths to stable flat field names', () => {
    expect(flattenOverriddenSettings({
      general: { shortcut: { value: 'ctrl+a' } },
      recognition: { localWhisper: { acceleration: 'cuda' }, webSpeech: { language: 'en-US' } },
      cloudAsr: { groq: {}, siliconflow: {} },
      tencent: { appId: '1250000000', secretId: 'AKIDexample', secretKey: 'secret-placeholder', engineType: '16k_zh', service: 'realtime' },
      polishing: { prompt: '' }
    }, [
      { path: ['cloudAsr', 'groq', 'apiKey'], set: true },
      { path: ['cloudAsr', 'customOpenAi', 'apiKey'], set: false },
      { path: ['cloudAsr', 'siliconflow', 'apiKey'], set: true }
    ])).toEqual([
      'voiceShortcut',
      'webSpeechLanguage',
      'localWhisperAcceleration',
      'polishPrompt',
      'cloudAsrTencentAppId',
      'cloudAsrTencentSecretId',
      'cloudAsrTencentSecretKey',
      'cloudAsrTencentEngineType',
      'cloudAsrTencentService',
      'cloudAsrGroqApiKey',
      'cloudAsrSiliconFlowApiKey'
    ])
  })
})
