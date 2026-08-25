import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { applyFlatSettingsPatch, defaultStoredEarsSettings, flattenOverriddenSettings, flattenStoredSettings, normalizeStoredEarsSettings, storedSettingsNeedRewrite, unflattenEarsSettings } from '../src/settings-store.js'

describe('canonical Host settings slots', () => {
  it('round-trips flat app settings into schemaVersion 2 slots', () => {
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
      polishProvider: 'provider',
      polishModel: 'model',
      polishPrompt: 'Keep it short.'
    })

    expect(stored.schemaVersion).toBe(2)
    expect(stored.general).toEqual({
      displayName: 'dsh-ears',
      shortcut: { enabled: true, value: 'ctrl+shift+space' },
      soundsEnabled: true
    })
    expect(stored.recognition.localWhisper).toEqual({ model: 'tiny', acceleration: 'cuda' })
    expect(stored.cloudAsr.groq).toEqual({ apiKey: 'gsk_groq', model: 'whisper-large-v3-turbo' })
    expect(stored.cloudAsr.customOpenAi).toEqual({
      apiKey: 'sk_openai',
      endpoint: 'https://asr.example.test/audio/transcriptions',
      model: 'whisper-1'
    })
    expect(stored.cloudAsr.bailian).toEqual({
      apiKey: 'sk_bailian',
      host: 'https://ws-test.cn-beijing.maas.aliyuncs.com',
      model: 'fun-asr-flash'
    })
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
      language: 'en-US',
      polishPrompt: 'legacy prompt'
    }
    const stored = normalizeStoredEarsSettings(raw)

    expect(stored.schemaVersion).toBe(2)
    expect(stored.recognition.backend).toBe('cloud-openai')
    expect(stored.recognition.localWhisper.model).toBe('base')
    expect(stored.cloudAsr.groq).toEqual({ apiKey: 'gsk_legacy_groq', model: '' })
    expect(stored.cloudAsr.customOpenAi).toEqual({
      apiKey: 'sk_legacy_custom',
      endpoint: 'https://legacy.example.test/audio/transcriptions',
      model: ''
    })
    expect(stored.cloudAsr.bailian).toEqual({
      apiKey: 'sk_legacy_bailian',
      host: 'https://ws-legacy.cn-beijing.maas.aliyuncs.com',
      model: 'fun-asr-flash-2026-06-15'
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

    expect(stored.recognition.localWhisper).toEqual({ model: 'tiny', acceleration: 'vulkan' })
    expect(stored.cloudAsr.groq).toEqual({ apiKey: 'gsk_grouped', model: '' })
    expect(stored.cloudAsr.customOpenAi).toEqual({ apiKey: '', endpoint: '', model: '' })
    expect(stored.polishing.prompt).toBe('partial prompt')
    expect(stored.general.shortcut.value).toBe('ctrl+shift+space')
    expect(storedSettingsNeedRewrite(stored)).toBe(false)
  })

  it('applies a flat patch without mixing provider slots and preserves acceleration', () => {
    const stored = defaultStoredEarsSettings()
    const next = applyFlatSettingsPatch(stored, {
      localWhisperAcceleration: 'cuda',
      cloudAsrGroqApiKey: 'gsk_new',
      cloudAsrCustomApiKey: 'sk_custom'
    })

    expect(next.recognition.localWhisper.acceleration).toBe('cuda')
    expect(next.cloudAsr.groq.apiKey).toBe('gsk_new')
    expect(next.cloudAsr.customOpenAi.apiKey).toBe('sk_custom')
    expect(next.cloudAsr.bailian.apiKey).toBe('')
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
        localWhisper: { ...base.recognition.localWhisper, model: '', acceleration: 'default' },
        cloudProvider: '',
        language: ''
      },
      cloudAsr: {
        groq: { apiKey: '', model: '' },
        customOpenAi: { apiKey: '', endpoint: '', model: '' },
        bailian: { apiKey: '', host: '', model: '' }
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
    expect(flat.language).toBe('')
    expect(flat.asrBackend).toBe('web-speech')
    expect(flat.localWhisperModel).toBe('tiny')
    expect(flat.cloudAsrProvider).toBe('groq')
    expect(flat.settingsDisplayName).toBe('dsh-ears')
    expect(flat.voiceShortcut).toBe('ctrl+shift+space')
  })

  it('flattens nested and legacy override paths to stable flat field names', () => {
    expect(flattenOverriddenSettings({
      general: { shortcut: { value: 'ctrl+a' } },
      recognition: { localWhisper: { acceleration: 'cuda' }, language: 'en-US' },
      cloudAsr: { groq: {} },
      polishing: { prompt: '' }
    }, [
      { path: ['cloudAsr', 'groq', 'apiKey'], set: true },
      { path: ['cloudAsr', 'customOpenAi', 'apiKey'], set: false }
    ])).toEqual([
      'voiceShortcut',
      'localWhisperAcceleration',
      'language',
      'polishPrompt',
      'cloudAsrGroqApiKey'
    ])
  })
})
