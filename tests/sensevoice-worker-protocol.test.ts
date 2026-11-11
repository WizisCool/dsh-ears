import { describe, expect, it } from 'vitest'
import { isSenseVoiceWorkerResponse } from '../src/asr/sensevoice-worker-protocol.js'

describe('SenseVoice worker timestamp protocol', () => {
  it('accepts well-formed timed segments', () => {
    expect(isSenseVoiceWorkerResponse({
      type: 'response',
      id: 1,
      ok: true,
      text: '你好。',
      segments: [{ text: '你好。', start: 0.2, end: 1.3 }]
    })).toBe(true)
  })

  it('rejects malformed segment data at the worker boundary', () => {
    expect(isSenseVoiceWorkerResponse({
      type: 'response',
      id: 1,
      ok: true,
      text: '你好。',
      segments: [{ text: '你好。', start: '0.2', end: 1.3 }]
    })).toBe(false)
  })
})
