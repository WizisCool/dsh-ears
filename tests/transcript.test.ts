import { describe, expect, it } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { formatTranscript, groupTimedTokens, type TranscriptDocument } from '../src/asr/transcript.js'

describe('Agent transcript formatting', () => {
  const document: TranscriptDocument = {
    text: 'Hello, world.\n你好，世界。',
    segments: [
      { start: 0, end: 1.23, text: 'Hello, world.' },
      { start: 1.23, end: 2.5, text: '你好，世界。' }
    ]
  }

  it('writes UTF-8 plain text and Markdown', () => {
    expect(formatTranscript(document, 'txt', 'meeting.wav')).toBe('Hello, world.\n你好，世界。\n')
    expect(formatTranscript(document, 'md', 'meeting.wav')).toBe('# meeting.wav\n\nHello, world.\n你好，世界。\n')
  })

  it('writes SRT, VTT, and LRC from real segment times', () => {
    expect(formatTranscript(document, 'srt', 'meeting.wav')).toBe('1\n00:00:00,000 --> 00:00:01,230\nHello, world.\n\n2\n00:00:01,230 --> 00:00:02,500\n你好，世界。\n')
    expect(formatTranscript(document, 'vtt', 'meeting.wav')).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:01.230\nHello, world.\n\n00:00:01.230 --> 00:00:02.500\n你好，世界。\n')
    expect(formatTranscript(document, 'lrc', 'meeting.wav')).toBe('[00:00.00]Hello, world.\n[00:01.23]你好，世界。\n')
  })

  it('refuses timestamped formats when the recognizer returned no segments', () => {
    expect(() => formatTranscript({ text: 'hello' }, 'srt', 'meeting.wav'))
      .toThrow(expect.objectContaining({ code: EARS_ERROR_CODES.asrServiceUnavailable }))
  })

  it('groups SenseVoice token times into readable punctuation-bounded captions', () => {
    expect(groupTimedTokens(['▁Hello', '▁world.', '▁Next'], [0, 0.5, 1], [0.5, 0.5, 1], 2))
      .toEqual([
        { start: 0, end: 1, text: 'Hello world.' },
        { start: 1, end: 2, text: 'Next' }
      ])
  })
})
