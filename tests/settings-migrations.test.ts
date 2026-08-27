import { describe, expect, it } from 'vitest'
import {
  migrateSettingsToCurrent,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateV3ToV4
} from '../src/settings/migrations.js'

describe('settings migrations', () => {
  it('maps the historical flat shape through each explicit schema stage', () => {
    const legacy = {
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'bailian',
      cloudAsrApiKey: 'legacy-groq-key',
      cloudAsrModel: 'legacy-model',
      cloudAsrCustomEndpoint: 'https://asr.example.test/transcriptions',
      cloudAsrBailianHost: 'https://bailian.example.test',
      language: 'zh-CN',
      localWhisperModel: 'base',
      polishingEnabled: true,
      polishProvider: 'provider',
      polishModel: 'model'
    }

    const v2 = migrateV1ToV2(legacy)
    expect(v2.schemaVersion).toBe(2)
    expect((v2.recognition as Record<string, unknown>).language).toBe('zh-CN')
    expect((v2.cloudAsr as Record<string, unknown>).groq).toEqual({ apiKey: 'legacy-groq-key', model: '' })
    expect((v2.cloudAsr as Record<string, unknown>).bailian).toEqual({ apiKey: '', host: 'https://bailian.example.test', model: 'legacy-model' })

    const v3 = migrateV2ToV3(v2)
    expect(v3.schemaVersion).toBe(3)
    expect((v3.cloudAsr as Record<string, unknown>).tencent).toEqual({ appId: '', secretId: '', secretKey: '', engineType: '16k_zh', service: 'recording-file' })

    const v4 = migrateV3ToV4(v3)
    expect(v4.schemaVersion).toBe(4)
    expect((v4.recognition as Record<string, unknown>).language).toBeUndefined()
    expect((v4.recognition as Record<string, unknown>).webSpeech).toEqual({ language: '' })
    expect(((v4.recognition as Record<string, unknown>).localWhisper as Record<string, unknown>).language).toBe('')
    expect(((v4.cloudAsr as Record<string, unknown>).groq as Record<string, unknown>).language).toBe('')
    expect(((v4.cloudAsr as Record<string, unknown>).deepgram as Record<string, unknown>).model).toBe('nova-3')
    expect(((v4.cloudAsr as Record<string, unknown>).mimo as Record<string, unknown>).model).toBe('mimo-v2.5-asr')
  })

  it('preserves explicit empty values in already-grouped versioned data', () => {
    const v3 = {
      schemaVersion: 3,
      recognition: {
        backend: 'web-speech',
        cloudProvider: 'groq',
        language: 'zh-CN',
        webSpeech: { language: '' },
        localWhisper: { language: '' }
      },
      cloudAsr: {
        groq: { apiKey: '', model: '', language: '' },
        deepgram: { apiKey: '', model: '', language: '', service: 'recording-file' }
      }
    }

    const migrated = migrateSettingsToCurrent(v3)
    expect(migrated.schemaVersion).toBe(4)
    expect((migrated.recognition as Record<string, unknown>).language).toBeUndefined()
    expect(((migrated.recognition as Record<string, unknown>).webSpeech as Record<string, unknown>).language).toBe('')
    expect(((migrated.recognition as Record<string, unknown>).localWhisper as Record<string, unknown>).language).toBe('')
    expect(((migrated.cloudAsr as Record<string, unknown>).groq as Record<string, unknown>).language).toBe('')
  })

  it('is idempotent for the current schema and conservative for future schemas', () => {
    const current = {
      schemaVersion: 4,
      general: { displayName: 'dsh-ears' },
      recognition: { backend: 'web-speech' },
      cloudAsr: { groq: { apiKey: 'key' } },
      polishing: { enabled: false }
    }
    expect(migrateSettingsToCurrent(current)).toEqual(current)

    const future = { schemaVersion: 5, futureSetting: { enabled: true } }
    expect(migrateSettingsToCurrent(future)).toEqual(future)
  })

  it('does not mutate the source record while migrating', () => {
    const source = { schemaVersion: 3, recognition: { language: 'en-US' }, cloudAsr: {} }
    const before = structuredClone(source)
    migrateSettingsToCurrent(source)
    expect(source).toEqual(before)
  })
})
