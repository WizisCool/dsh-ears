import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS, isHttpEndpoint } from '../src/config.js'
import {
  CLOUD_ASR_PROVIDERS,
  cloudAsrEndpointFor,
  cloudAsrModelFor,
  cloudProviderEntry,
  isCloudAsrReady,
  isCloudConfigurationValid,
  isKnownCloudProvider,
  supportsModelListing
} from '../src/asr/providers.js'
import type { EarsSettings } from '../src/config.js'

function settings(overrides: Partial<EarsSettings> = {}): EarsSettings {
  return { ...DEFAULT_EARS_SETTINGS, ...overrides }
}

describe('cloud ASR provider registry', () => {
  it('registers unique provider ids with the shared protocol', () => {
    const ids = CLOUD_ASR_PROVIDERS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(CLOUD_ASR_PROVIDERS.every((entry) => entry.protocol === 'openai-compatible')).toBe(true)
    expect(isKnownCloudProvider('groq')).toBe(true)
    expect(isKnownCloudProvider('custom')).toBe(true)
    expect(isKnownCloudProvider('unknown')).toBe(false)
  })

  it('pins the Groq transcription and listing base URL', () => {
    const groq = cloudProviderEntry('groq')
    expect(groq?.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(groq?.endpointEditable).toBe(false)
    expect(groq?.apiKeyRequired).toBe(true)
    expect(supportsModelListing('groq')).toBe(true)
    expect(cloudAsrEndpointFor(settings({ cloudAsrProvider: 'groq', cloudAsrEndpoint: 'https://ignored.example.test' }))).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
  })

  it('keeps the custom provider editable with the whisper-1 default model', () => {
    const custom = cloudProviderEntry('custom')
    expect(custom?.endpointEditable).toBe(true)
    expect(custom?.apiKeyRequired).toBe(false)
    expect(supportsModelListing('custom')).toBe(false)
    expect(cloudAsrEndpointFor(settings({ cloudAsrProvider: 'custom', cloudAsrEndpoint: ' https://asr.example.test/audio/transcriptions ' }))).toBe('https://asr.example.test/audio/transcriptions')
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'custom', cloudAsrModel: '' }))).toBe('whisper-1')
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'custom', cloudAsrModel: 'other-model' }))).toBe('other-model')
  })

  it('applies the Groq model filter to listing candidates', () => {
    const groq = cloudProviderEntry('groq')
    if (groq?.modelFilter === undefined) throw new Error('Groq entry is missing its model filter')
    expect(groq.modelFilter.test('whisper-large-v3-turbo')).toBe(true)
    expect(groq.modelFilter.test('llama-3.3-70b-versatile')).toBe(false)
    expect(cloudAsrModelFor(settings({ cloudAsrProvider: 'groq', cloudAsrModel: '' }))).toBe('')
  })
})

describe('cloud ASR configuration validity', () => {
  it('requires an effective model for the Groq preset', () => {
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'groq', cloudAsrModel: '' }))).toBe(false)
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'groq', cloudAsrModel: 'whisper-large-v3-turbo' }))).toBe(true)
  })

  it('uses the whisper-1 default for the custom provider', () => {
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'custom', cloudAsrEndpoint: 'https://asr.example.test/audio/transcriptions' }))).toBe(true)
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'custom', cloudAsrEndpoint: 'not-an-endpoint' }))).toBe(false)
  })

  it('does not require a key for configuration validity', () => {
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'groq', cloudAsrModel: 'whisper-large-v3-turbo', cloudAsrApiKey: '' }))).toBe(true)
    expect(isCloudConfigurationValid(settings({ asrBackend: 'cloud-openai', cloudAsrProvider: 'unknown' }))).toBe(false)
    expect(isCloudConfigurationValid(settings({ asrBackend: 'local-whisper' }))).toBe(true)
  })
})

describe('cloud ASR runtime readiness', () => {
  it('requires the key only for providers that demand one', () => {
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'groq', cloudAsrModel: 'whisper-large-v3-turbo', cloudAsrApiKey: '' }))).toBe(false)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'groq', cloudAsrModel: 'whisper-large-v3-turbo', cloudAsrApiKey: ' gsk_test ' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'custom', cloudAsrEndpoint: 'https://asr.example.test/audio/transcriptions', cloudAsrApiKey: '' }))).toBe(true)
    expect(isCloudAsrReady(settings({ cloudAsrProvider: 'groq', cloudAsrModel: '', cloudAsrApiKey: 'gsk_test' }))).toBe(false)
  })

  it('reports cloud readiness independent of the selected backend', () => {
    expect(isCloudAsrReady(settings({ asrBackend: 'web-speech', cloudAsrProvider: 'groq', cloudAsrModel: 'whisper-large-v3-turbo', cloudAsrApiKey: 'gsk_test' }))).toBe(true)
    expect(isCloudAsrReady(settings({ asrBackend: 'web-speech', cloudAsrApiKey: '' }))).toBe(false)
  })

  it('rejects embedded credentials in a custom endpoint', () => {
    expect(isHttpEndpoint('https://user:pass@asr.example.test/audio/transcriptions')).toBe(false)
  })
})
