import { describe, expect, it } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { classifyVoiceFailure, isTrivialRecording, remoteFailureDetail } from '../src/client/voice-error.js'

describe('voice failure classification', () => {
  it('treats silence and empty transcripts as a no-op', () => {
    expect(classifyVoiceFailure('Cloud ASR returned no transcript')).toBe('empty')
    expect(classifyVoiceFailure('ASR returned no transcript')).toBe('empty')
    expect(classifyVoiceFailure('The recorded audio is empty')).toBe('empty')
    expect(classifyVoiceFailure('Speech recognition failed (no-speech)')).toBe('empty')
    expect(classifyVoiceFailure('internal: Cloud ASR request failed with HTTP 400', EARS_ERROR_CODES.asrHttpFailed)).toBe('upstream')
    expect(classifyVoiceFailure('The local Whisper operation was aborted', EARS_ERROR_CODES.asrRequestTimedOut)).toBe('upstream')
    expect(classifyVoiceFailure('anything', EARS_ERROR_CODES.asrAudioEmpty)).toBe('empty')
    expect(classifyVoiceFailure('anything', EARS_ERROR_CODES.asrNoTranscript)).toBe('empty')
    expect(isTrivialRecording(100, 2000)).toBe(true)
    expect(isTrivialRecording(4000, 120)).toBe(true)
    expect(isTrivialRecording(4000, 800)).toBe(false)
  })

  it('treats missing keys and hosts as configuration issues', () => {
    expect(classifyVoiceFailure('The cloud ASR API key is not configured', EARS_ERROR_CODES.asrApiKeyNotConfigured)).toBe('config')
    expect(classifyVoiceFailure('The cloud ASR model is not configured', EARS_ERROR_CODES.asrModelNotConfigured)).toBe('config')
    expect(classifyVoiceFailure('Bailian ASR host must use HTTPS without credentials', EARS_ERROR_CODES.asrEndpointInvalid)).toBe('config')
  })

  it('treats upstream service codes as upstream failures', () => {
    expect(classifyVoiceFailure('InvalidApiKey: Invalid API-key provided.')).toBe('upstream')
    expect(classifyVoiceFailure('Cloud ASR request failed with HTTP 429')).toBe('upstream')
    expect(classifyVoiceFailure('The dsh LLM route did not complete polishing')).toBe('upstream')
  })

  it('prefers the raw service code over a generic Host failure', () => {
    expect(remoteFailureDetail({ code: 'HOST_FAILURE', message: 'InvalidApiKey' })).toBe('InvalidApiKey')
    expect(remoteFailureDetail({ code: 'InvalidApiKey', message: 'Invalid API-key provided.' })).toBe('InvalidApiKey: Invalid API-key provided.')
  })
})
