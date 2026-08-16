import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS, MAX_CLOUD_API_KEY_LENGTH, isHttpEndpoint, validateEarsSettings } from '../src/config.js'

describe('dsh-ears settings validation', () => {
  it('accepts HTTP(S) endpoints without embedded credentials', () => {
    expect(isHttpEndpoint('https://asr.example.test/audio/transcriptions')).toBe(true)
    expect(isHttpEndpoint('http://user:pass@asr.example.test/audio/transcriptions')).toBe(false)
    expect(isHttpEndpoint('file:///tmp/audio')).toBe(false)
  })

  it('rejects unknown backends and cloud ASR providers', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, asrBackend: 'unknown-backend' })).toThrow('ASR backend')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, cloudAsrProvider: 'unknown-provider' })).toThrow('cloud ASR provider')
  })

  it('bounds the inline cloud ASR API key length', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, cloudAsrApiKey: 'k'.repeat(MAX_CLOUD_API_KEY_LENGTH) })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, cloudAsrApiKey: 'k'.repeat(MAX_CLOUD_API_KEY_LENGTH + 1) })).toThrow('too long')
  })

  it('requires a valid endpoint for the custom provider when cloud ASR is active', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, asrBackend: 'cloud-openai', cloudAsrProvider: 'custom' })).toThrow('Cloud ASR endpoint')
    expect(() => validateEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'custom',
      cloudAsrEndpoint: 'https://asr.example.test/audio/transcriptions',
      cloudAsrModel: 'whisper-1'
    })).not.toThrow()
  })

  it('rejects incomplete polishing configuration', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider' })).toThrow('selected together')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishingEnabled: true })).toThrow('selected together')
  })

  it('allows an incomplete provider/model pair while polishing is disabled', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishingEnabled: false, polishProvider: 'provider' })).not.toThrow()
  })

  it('accepts a complete local configuration', () => {
    expect(() => validateEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'local-whisper',
      polishProvider: 'provider',
      polishModel: 'model'
    })).not.toThrow()
  })
})
