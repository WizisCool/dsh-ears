import { describe, expect, it } from 'vitest'
import {
  WHISPER_SAMPLE_RATE,
  audioToPcm16Wav,
  encodePcm16Wav,
  float32PcmToPcm16Wav,
  normalizeToWhisperPcm,
  type AudioBufferLike
} from '../src/asr/pcm-wav.js'

function readInt16(wav: Uint8Array, frame: number): number {
  return new DataView(wav.buffer, wav.byteOffset, wav.byteLength).getInt16(44 + frame * 2, true)
}

function readHeader(wav: Uint8Array): {
  riff: string
  fileSize: number
  wave: string
  format: number
  channels: number
  sampleRate: number
  byteRate: number
  blockAlign: number
  bitsPerSample: number
  data: string
  dataSize: number
} {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const text = (offset: number, length: number) => String.fromCharCode(...wav.subarray(offset, offset + length))
  return {
    riff: text(0, 4),
    fileSize: view.getUint32(4, true),
    wave: text(8, 4),
    format: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    data: text(36, 4),
    dataSize: view.getUint32(40, true)
  }
}

describe('normalizeToWhisperPcm', () => {
  it('downmixes channels and linearly resamples to 16 kHz', () => {
    const normalized = normalizeToWhisperPcm({
      sampleRate: 8_000,
      channelData: [
        Float32Array.from([0, 1, 0, -1]),
        Float32Array.from([0, 1, 0, -1])
      ]
    })

    expect(normalized.length).toBe(8)
    expect(Array.from(normalized)).toHaveLength(8)
    expect(normalized[0]).toBeCloseTo(0)
    expect(normalized[1]).toBeCloseTo(3 / 7)
    expect(normalized[2]).toBeCloseTo(6 / 7)
    expect(normalized[3]).toBeCloseTo(5 / 7)
    expect(normalized[4]).toBeCloseTo(2 / 7)
    expect(normalized[5]).toBeCloseTo(-1 / 7)
    expect(normalized[6]).toBeCloseTo(-4 / 7)
    expect(normalized[7]).toBeCloseTo(-1)
  })

  it('uses the duration-based frame count for one second of 48 kHz audio', () => {
    const normalized = normalizeToWhisperPcm({
      sampleRate: 48_000,
      channelData: [new Float32Array(48_000)]
    })

    expect(normalized).toHaveLength(16_000)
  })

  it('averages finite channel values before clipping the mono sample', () => {
    const normalized = normalizeToWhisperPcm({
      sampleRate: WHISPER_SAMPLE_RATE,
      channelData: [Float32Array.from([2]), Float32Array.from([0])]
    })

    expect(Array.from(normalized)).toEqual([1])
  })

  it('clips finite samples and turns NaN or infinities into silence', () => {
    const normalized = normalizeToWhisperPcm({
      sampleRate: WHISPER_SAMPLE_RATE,
      channelData: [Float32Array.from([-2, Number.NaN, Number.POSITIVE_INFINITY, 2])]
    })

    expect(Array.from(normalized)).toEqual([-1, 0, 0, 1])
  })

  it('accepts an AudioBuffer-like source without importing DOM types', () => {
    const samples = Float32Array.from([0.25, -0.25])
    const audioBuffer: AudioBufferLike = {
      sampleRate: WHISPER_SAMPLE_RATE,
      length: samples.length,
      numberOfChannels: 1,
      getChannelData: () => samples
    }

    expect(Array.from(normalizeToWhisperPcm(audioBuffer))).toEqual([0.25, -0.25])
  })

  it('returns an empty PCM array for empty input', () => {
    expect(normalizeToWhisperPcm({ sampleRate: 48_000, channelData: [] })).toHaveLength(0)
    expect(normalizeToWhisperPcm({ sampleRate: 48_000, channelData: [new Float32Array()] })).toHaveLength(0)
  })

  it('rejects malformed sample rates and channel lengths', () => {
    expect(() => normalizeToWhisperPcm({ sampleRate: 0, channelData: [] })).toThrow(RangeError)
    expect(() => normalizeToWhisperPcm({ sampleRate: 48_000, channelData: [new Float32Array(1), new Float32Array(2)] })).toThrow(RangeError)
  })
})

describe('PCM16 WAV encoding', () => {
  it('writes a correct mono PCM16 WAV header and sample payload', () => {
    const wav = encodePcm16Wav(Float32Array.from([-1, -0.5, 0, 0.5, 1]))
    expect(readHeader(wav)).toEqual({
      riff: 'RIFF',
      fileSize: 46,
      wave: 'WAVE',
      format: 1,
      channels: 1,
      sampleRate: 16_000,
      byteRate: 32_000,
      blockAlign: 2,
      bitsPerSample: 16,
      data: 'data',
      dataSize: 10
    })
    expect([0, 1, 2, 3, 4].map((frame) => readInt16(wav, frame))).toEqual([-32_768, -16_384, 0, 16_384, 32_767])
    expect(wav.length).toBe(44 + 10)
  })

  it('encodes an empty WAV with a valid zero-length data chunk', () => {
    const wav = encodePcm16Wav(new Float32Array())
    expect(wav.length).toBe(44)
    expect(readHeader(wav)).toMatchObject({ fileSize: 36, sampleRate: 16_000, dataSize: 0 })
  })

  it('normalizes mono Float32 PCM directly to a 16 kHz WAV', () => {
    const wav = float32PcmToPcm16Wav(Float32Array.from([1, -1]), 16_000)
    expect(wav.length).toBe(48)
    expect([readInt16(wav, 0), readInt16(wav, 1)]).toEqual([32_767, -32_768])
  })

  it('does not require an intermediate full-size PCM copy for a 120 second input', () => {
    const samples = new Float32Array(120 * WHISPER_SAMPLE_RATE)
    const wav = audioToPcm16Wav({ sampleRate: WHISPER_SAMPLE_RATE, channelData: [samples] })

    expect(wav.length).toBe(44 + samples.length * 2)
    expect(readHeader(wav)).toMatchObject({ sampleRate: 16_000, dataSize: samples.length * 2 })
  })
})
