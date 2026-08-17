import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { applyFlatSettingsPatch, flattenStoredSettings, storedSettingsNeedRewrite, unflattenEarsSettings } from '../src/settings-store.js'

describe('stored settings grouping', () => {
  it('round-trips flat app settings into groq / customOpenAi / bailian groups', () => {
    const stored = unflattenEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      cloudAsrProvider: 'bailian',
      cloudAsrGroqApiKey: 'gsk_groq',
      cloudAsrGroqModel: 'whisper-large-v3-turbo',
      cloudAsrCustomApiKey: 'sk_openai',
      cloudAsrCustomEndpoint: 'https://asr.example.test/audio/transcriptions',
      cloudAsrCustomModel: 'whisper-1',
      cloudAsrBailianApiKey: 'sk_bailian',
      cloudAsrBailianHost: 'https://ws-test.cn-beijing.maas.aliyuncs.com',
      cloudAsrBailianModel: 'fun-asr-flash'
    })
    expect(stored.groq).toEqual({ apiKey: 'gsk_groq', model: 'whisper-large-v3-turbo' })
    expect(stored.customOpenAi).toEqual({
      apiKey: 'sk_openai',
      endpoint: 'https://asr.example.test/audio/transcriptions',
      model: 'whisper-1'
    })
    expect(stored.bailian).toEqual({
      apiKey: 'sk_bailian',
      host: 'https://ws-test.cn-beijing.maas.aliyuncs.com',
      model: 'fun-asr-flash'
    })
    const flat = flattenStoredSettings(stored)
    expect(flat.cloudAsrGroqApiKey).toBe('gsk_groq')
    expect(flat.cloudAsrCustomApiKey).toBe('sk_openai')
    expect(flat.cloudAsrBailianModel).toBe('fun-asr-flash')
  })

  it('reads the previous flat settings file and maps keys by provider', () => {
    const flat = flattenStoredSettings({
      cloudAsrProvider: 'bailian',
      cloudAsrApiKey: 'gsk_legacy_groq',
      cloudAsrCustomApiKey: 'sk_legacy_custom',
      cloudAsrBailianApiKey: 'sk_legacy_bailian',
      cloudAsrBailianHost: 'https://ws-legacy.cn-beijing.maas.aliyuncs.com',
      cloudAsrEndpoint: 'https://legacy.example.test/audio/transcriptions',
      cloudAsrModel: 'fun-asr-flash-2026-06-15'
    })
    expect(flat.cloudAsrGroqApiKey).toBe('gsk_legacy_groq')
    expect(flat.cloudAsrCustomApiKey).toBe('sk_legacy_custom')
    expect(flat.cloudAsrCustomEndpoint).toBe('https://legacy.example.test/audio/transcriptions')
    expect(flat.cloudAsrBailianApiKey).toBe('sk_legacy_bailian')
    expect(flat.cloudAsrBailianHost).toBe('https://ws-legacy.cn-beijing.maas.aliyuncs.com')
    expect(flat.cloudAsrBailianModel).toBe('fun-asr-flash-2026-06-15')
    expect(storedSettingsNeedRewrite({
      cloudAsrApiKey: 'gsk_legacy_groq',
      cloudAsrProvider: 'bailian'
    })).toBe(true)
  })

  it('applies a flat patch onto grouped stored settings without mixing keys', () => {
    const stored = unflattenEarsSettings(DEFAULT_EARS_SETTINGS)
    const next = applyFlatSettingsPatch(stored, {
      cloudAsrGroqApiKey: 'gsk_new',
      cloudAsrCustomApiKey: 'sk_custom'
    })
    expect(next.groq.apiKey).toBe('gsk_new')
    expect(next.customOpenAi.apiKey).toBe('sk_custom')
    expect(next.bailian.apiKey).toBe('')
  })
})
