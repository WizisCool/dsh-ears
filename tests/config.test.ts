import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS, MAX_CLOUD_API_KEY_LENGTH, MAX_POLISH_PROMPT_LENGTH, isHttpEndpoint, validateEarsSettings } from '../src/config.js'

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

  it('defaults the custom polish prompt to empty (built-in prompt) and bounds it trim-based at 4000 units', () => {
    expect(DEFAULT_EARS_SETTINGS.polishPrompt).toBe('')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishPrompt: 'p'.repeat(MAX_POLISH_PROMPT_LENGTH) })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishPrompt: ` ${'p'.repeat(MAX_POLISH_PROMPT_LENGTH)} ` })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishPrompt: 'p'.repeat(MAX_POLISH_PROMPT_LENGTH + 1) })).toThrow('polish prompt')
  })

  it('validates the endpoint value per field, independent of the selected backend', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, asrBackend: 'cloud-openai', cloudAsrProvider: 'custom' })).not.toThrow()
    expect(() => validateEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'custom',
      cloudAsrEndpoint: 'not-a-url'
    })).toThrow('Cloud ASR endpoint')
    expect(() => validateEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'custom',
      cloudAsrEndpoint: 'https://asr.example.test/audio/transcriptions',
      cloudAsrModel: 'whisper-1'
    })).not.toThrow()
  })

  it('allows an incomplete provider/model pair while polishing is enabled', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider' })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, polishingEnabled: true })).not.toThrow()
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

  it('accepts the default voice shortcut and rejects invalid stored shortcuts', () => {
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcutEnabled: false })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'ctrl+a' })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'ctrl+shift+a' })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'a' })).toThrow('voice shortcut')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'alt+a' })).toThrow('voice shortcut')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'ctrl+shift' })).toThrow('voice shortcut')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'f9' })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'ctrl+enter' })).not.toThrow()
  })
})
