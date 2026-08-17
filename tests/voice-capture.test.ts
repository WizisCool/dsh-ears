import { describe, expect, it } from 'vitest'
import {
  decideMicrophoneClick,
  resolveCaptureBackend,
  shouldAbandonPendingCapture,
  voiceToggleAction,
  webSpeechCommittedTranscript
} from '../src/client/voice-capture.js'

describe('resolveCaptureBackend', () => {
  it('accepts the three shipped backends', () => {
    expect(resolveCaptureBackend('web-speech')).toBe('web-speech')
    expect(resolveCaptureBackend('local-whisper')).toBe('local-whisper')
    expect(resolveCaptureBackend('cloud-openai')).toBe('cloud-openai')
  })

  it('does not silently treat an unknown stored backend as Web Speech', () => {
    expect(resolveCaptureBackend('future-backend')).toBeNull()
    expect(resolveCaptureBackend('')).toBeNull()
    expect(resolveCaptureBackend('WEB-SPEECH')).toBeNull()
  })
})

describe('decideMicrophoneClick', () => {
  const browsers = { webSpeech: true, mediaRecorder: true }

  it('starts the stored backend from idle', () => {
    expect(decideMicrophoneClick({ state: 'idle', asrBackend: 'local-whisper', browserAvailable: browsers }))
      .toEqual({ action: 'start', backend: 'local-whisper' })
  })

  it('stops an active capture instead of starting another backend', () => {
    expect(decideMicrophoneClick({ state: 'recording', asrBackend: 'cloud-openai', browserAvailable: browsers }))
      .toEqual({ action: 'stop' })
    expect(decideMicrophoneClick({ state: 'starting', asrBackend: 'web-speech', browserAvailable: browsers }))
      .toEqual({ action: 'stop' })
  })

  it('ignores clicks while transcription or polishing is in flight', () => {
    expect(voiceToggleAction('transcribing')).toBe('ignore')
    expect(voiceToggleAction('polishing')).toBe('ignore')
    expect(decideMicrophoneClick({ state: 'transcribing', asrBackend: 'web-speech', browserAvailable: browsers }))
      .toEqual({ action: 'ignore' })
    expect(decideMicrophoneClick({ state: 'polishing', asrBackend: 'web-speech', browserAvailable: browsers }))
      .toEqual({ action: 'ignore' })
  })

  it('refuses to start Web Speech for an unknown backend even when the browser supports it', () => {
    expect(decideMicrophoneClick({
      state: 'idle',
      asrBackend: 'future-backend',
      browserAvailable: browsers
    })).toEqual({ action: 'unavailable' })
  })

  it('refuses to start when the browser cannot capture the selected backend', () => {
    expect(decideMicrophoneClick({
      state: 'idle',
      asrBackend: 'web-speech',
      browserAvailable: { webSpeech: false, mediaRecorder: true }
    })).toEqual({ action: 'unavailable' })
    expect(decideMicrophoneClick({
      state: 'idle',
      asrBackend: 'local-whisper',
      browserAvailable: { webSpeech: true, mediaRecorder: false }
    })).toEqual({ action: 'unavailable' })
  })

  it('still allows a start from an error state once the backend is known', () => {
    expect(decideMicrophoneClick({ state: 'error', asrBackend: 'web-speech', browserAvailable: browsers }))
      .toEqual({ action: 'start', backend: 'web-speech' })
    expect(decideMicrophoneClick({ state: 'upstream-error', asrBackend: 'cloud-openai', browserAvailable: browsers }))
      .toEqual({ action: 'start', backend: 'cloud-openai' })
  })
})

describe('shouldAbandonPendingCapture', () => {
  it('aborts a MediaRecorder create that finishes after unmount or an explicit cancel', () => {
    expect(shouldAbandonPendingCapture(true, false)).toBe(false)
    expect(shouldAbandonPendingCapture(false, false)).toBe(true)
    expect(shouldAbandonPendingCapture(true, true)).toBe(true)
    expect(shouldAbandonPendingCapture(false, true)).toBe(true)
  })
})

describe('webSpeechCommittedTranscript', () => {
  it('uses the session text when the browser emitted a final or last-heard result', () => {
    expect(webSpeechCommittedTranscript({
      sessionText: 'recognized text',
      sessionDraft: 'hello recognized text',
      baseDraft: 'hello'
    })).toBe('recognized text')
  })

  it('recovers the interim draft slice when the session ends with no final text', () => {
    expect(webSpeechCommittedTranscript({
      sessionText: '',
      sessionDraft: 'hello recognized text',
      baseDraft: 'hello'
    })).toBe('recognized text')
  })

  it('returns empty when nothing was heard', () => {
    expect(webSpeechCommittedTranscript({
      sessionText: '   ',
      sessionDraft: 'hello',
      baseDraft: 'hello'
    })).toBe('')
  })

  it('keeps a replaced draft when the live update did not prefix the base', () => {
    expect(webSpeechCommittedTranscript({
      sessionText: '',
      sessionDraft: 'replaced',
      baseDraft: 'hello'
    })).toBe('replaced')
  })
})
