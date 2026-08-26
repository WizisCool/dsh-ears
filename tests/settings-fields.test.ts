import { describe, expect, it } from 'vitest'
import { MAX_CLOUD_API_KEY_LENGTH, MAX_POLISH_PROMPT_LENGTH } from '../src/config.js'
import { cloudAsrModelField, isSettingsFieldInvalid, parseSettingsField } from '../src/client/settings-fields.js'

describe('parseSettingsField', () => {
  it('parses recording limits and boolean switches', () => {
    expect(parseSettingsField('maxRecordingSeconds', '180')).toBe(180)
    expect(parseSettingsField('polishingEnabled', 'on')).toBe(true)
    expect(parseSettingsField('voiceShortcutEnabled', 'off')).toBe(false)
    expect(parseSettingsField('language', 'en-US')).toBe('en-US')
  })
})

describe('isSettingsFieldInvalid', () => {
  it('rejects unknown backend and provider identifiers', () => {
    expect(isSettingsFieldInvalid('asrBackend', 'future-backend')).toBe(true)
    expect(isSettingsFieldInvalid('asrBackend', 'web-speech')).toBe(false)
    expect(isSettingsFieldInvalid('cloudAsrProvider', 'unknown')).toBe(true)
    expect(isSettingsFieldInvalid('localWhisperModel', 'tiny')).toBe(false)
    expect(isSettingsFieldInvalid('localWhisperModel', 'huge')).toBe(true)
    expect(isSettingsFieldInvalid('localWhisperAcceleration', 'default')).toBe(false)
    expect(isSettingsFieldInvalid('localWhisperAcceleration', 'vulkan')).toBe(false)
    expect(isSettingsFieldInvalid('localWhisperAcceleration', 'cuda')).toBe(false)
    expect(isSettingsFieldInvalid('localWhisperAcceleration', 'metal')).toBe(true)
  })

  it('flags over-long keys and prompts and illegal URLs', () => {
    expect(isSettingsFieldInvalid('cloudAsrGroqApiKey', 'x'.repeat(MAX_CLOUD_API_KEY_LENGTH + 1))).toBe(true)
    expect(isSettingsFieldInvalid('cloudAsrCustomEndpoint', 'not-a-url')).toBe(true)
    expect(isSettingsFieldInvalid('cloudAsrCustomEndpoint', '')).toBe(false)
    expect(isSettingsFieldInvalid('cloudAsrBailianHost', 'http://example.com')).toBe(true)
    expect(isSettingsFieldInvalid('cloudAsrBailianHost', 'https://dashscope.aliyuncs.com')).toBe(false)
    expect(isSettingsFieldInvalid('cloudAsrTencentService', 'recording-file')).toBe(false)
    expect(isSettingsFieldInvalid('cloudAsrTencentService', 'not-a-service')).toBe(true)
    expect(isSettingsFieldInvalid('polishPrompt', 'p'.repeat(MAX_POLISH_PROMPT_LENGTH + 1))).toBe(true)
    expect(isSettingsFieldInvalid('maxRecordingSeconds', '0')).toBe(true)
    expect(isSettingsFieldInvalid('maxRecordingSeconds', '')).toBe(false)
  })

  it('never marks an empty language or a valid shortcut invalid', () => {
    expect(isSettingsFieldInvalid('language', '')).toBe(false)
    expect(isSettingsFieldInvalid('voiceShortcut', 'ctrl+shift+space')).toBe(false)
    expect(isSettingsFieldInvalid('voiceShortcut', 'alt+a')).toBe(true)
  })
})

describe('cloudAsrModelField', () => {
  it('maps each provider onto its own model field', () => {
    expect(cloudAsrModelField('groq')).toBe('cloudAsrGroqModel')
    expect(cloudAsrModelField('custom')).toBe('cloudAsrCustomModel')
    expect(cloudAsrModelField('bailian')).toBe('cloudAsrBailianModel')
    expect(cloudAsrModelField('tencent')).toBe('cloudAsrTencentEngineType')
  })
})
