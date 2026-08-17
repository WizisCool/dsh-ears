import { describe, expect, it } from 'vitest'
import { BAILIAN_MAX_RECORDING_SECONDS, DEFAULT_EARS_SETTINGS, MAX_CLOUD_API_KEY_LENGTH, MAX_POLISH_PROMPT_LENGTH, effectiveRecognitionLanguage, effectiveRecordingSeconds, isBailianAsrHost, isHttpEndpoint, settingsPageLabel, validateEarsSettings } from '../src/config.js'

describe('dsh-ears settings validation', () => {
  it('defaults the settings page name to dsh-ears and accepts the voice label', () => {
    expect(DEFAULT_EARS_SETTINGS.settingsDisplayName).toBe('dsh-ears')
    expect(settingsPageLabel('dsh-ears', { plugin: 'dsh-ears', voice: 'Voice' })).toBe('dsh-ears')
    expect(settingsPageLabel('voice', { plugin: 'dsh-ears', voice: '语音' })).toBe('语音')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, settingsDisplayName: 'voice' })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, settingsDisplayName: 'other' })).toThrow('display name')
  })

  it('follows the dsh UI locale when recognition language is unset', () => {
    expect(DEFAULT_EARS_SETTINGS.language).toBe('')
    expect(effectiveRecognitionLanguage('', 'zh')).toBe('zh-CN')
    expect(effectiveRecognitionLanguage('', 'en')).toBe('en-US')
    expect(effectiveRecognitionLanguage('ja-JP', 'en')).toBe('ja-JP')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, language: '' })).not.toThrow()
  })

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
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, cloudAsrGroqApiKey: 'k'.repeat(MAX_CLOUD_API_KEY_LENGTH) })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, cloudAsrGroqApiKey: 'k'.repeat(MAX_CLOUD_API_KEY_LENGTH + 1) })).toThrow('too long')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, cloudAsrCustomApiKey: 'k'.repeat(MAX_CLOUD_API_KEY_LENGTH + 1) })).toThrow('too long')
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, cloudAsrBailianApiKey: 'k'.repeat(MAX_CLOUD_API_KEY_LENGTH + 1) })).toThrow('too long')
  })

  it('requires HTTPS for a public Bailian host and caps Bailian recordings at 300 seconds', () => {
    expect(isBailianAsrHost('https://ws-test.cn-beijing.maas.aliyuncs.com')).toBe(true)
    expect(isBailianAsrHost('http://ws-test.cn-beijing.maas.aliyuncs.com')).toBe(false)
    expect(isBailianAsrHost('http://127.0.0.1:8080')).toBe(true)
    expect(() => validateEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      cloudAsrProvider: 'bailian',
      cloudAsrBailianHost: 'http://ws-test.cn-beijing.maas.aliyuncs.com'
    })).toThrow('Bailian ASR host')
    expect(effectiveRecordingSeconds({
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'bailian',
      maxRecordingSeconds: 600
    })).toBe(BAILIAN_MAX_RECORDING_SECONDS)
    expect(effectiveRecordingSeconds({
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'groq',
      maxRecordingSeconds: 600
    })).toBe(600)
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
      cloudAsrCustomEndpoint: 'not-a-url'
    })).toThrow('Custom OpenAI-compatible ASR endpoint')
    expect(() => validateEarsSettings({
      ...DEFAULT_EARS_SETTINGS,
      asrBackend: 'cloud-openai',
      cloudAsrProvider: 'custom',
      cloudAsrCustomEndpoint: 'https://asr.example.test/audio/transcriptions',
      cloudAsrCustomModel: 'whisper-1'
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
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'ctrl+shift' })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'f9' })).not.toThrow()
    expect(() => validateEarsSettings({ ...DEFAULT_EARS_SETTINGS, voiceShortcut: 'ctrl+enter' })).not.toThrow()
  })
})
