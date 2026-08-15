import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS, isCredentialReference, isHttpEndpoint, validateEarsSettings } from '../src/config.js'

describe('dsh-ears settings validation', () => {
  it('accepts the dsh credential reference shape without exposing a secret', () => {
    expect(isCredentialReference('OPENAI_API_KEY')).toBe(true)
    expect(isCredentialReference('_local_token2')).toBe(true)
    expect(isCredentialReference('not a reference')).toBe(false)
  })

  it('accepts HTTP(S) endpoints without embedded credentials', () => {
    expect(isHttpEndpoint('https://asr.example.test/audio/transcriptions')).toBe(true)
    expect(isHttpEndpoint('http://user:pass@asr.example.test/audio/transcriptions')).toBe(false)
    expect(isHttpEndpoint('file:///tmp/audio')).toBe(false)
  })

  it('rejects incomplete polishing and cloud configuration', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishProvider: 'provider' })).toThrow('selected together')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, asrBackend: 'cloud-openai' })).toThrow('Cloud ASR endpoint')
  })

  it('allows an incomplete provider/model pair while polishing is disabled', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishingEnabled: false, polishProvider: 'provider' })).not.toThrow()
  })

  it('accepts a complete local configuration', () => {
    expect(() => validateEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'local-whisper',
      cloudAsrCredentialRef: 'openai_api_key',
      polishProvider: 'provider',
      polishModel: 'model'
    })).not.toThrow()
  })
})
