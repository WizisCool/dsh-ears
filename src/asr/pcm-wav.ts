/** The sample rate expected by the local Whisper runtime. */
export const WHISPER_SAMPLE_RATE = 16_000

/**
 * A channel-oriented Float32 PCM source. The channel arrays are borrowed and
 * are never modified by this module.
 */
export interface Float32PcmAudio {
  readonly sampleRate: number
  readonly channelData: readonly Float32Array[]
}

/**
 * The small structural part of AudioBuffer used by this module. Keeping this
 * structural type local means the conversion logic is also usable in Node and
 * tests without depending on the DOM runtime.
 */
export interface AudioBufferLike {
  readonly sampleRate: number
  readonly length: number
  readonly numberOfChannels: number
  getChannelData(channel: number): Float32Array
}

export type PcmAudioInput = Float32PcmAudio | AudioBufferLike

const WAV_HEADER_BYTES = 44
const WAV_DATA_LIMIT = 0xffff_ffff
const MAX_WAV_SAMPLES = Math.floor((WAV_DATA_LIMIT - WAV_HEADER_BYTES) / 2)

interface ChannelSource {
  readonly sampleRate: number
  readonly channelData: readonly Float32Array[]
  readonly frameCount: number
}

function assertInputSampleRate(sampleRate: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Audio sample rate must be a finite positive number')
  }
}

function assertWavSampleRate(sampleRate: number): void {
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0 || sampleRate > Math.floor(0xffff_ffff / 2)) {
    throw new RangeError('WAV sample rate must be a positive safe integer')
  }
}

function assertWavSampleCount(sampleCount: number): void {
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 0 || sampleCount > MAX_WAV_SAMPLES) {
    throw new RangeError('Audio is too large for a PCM WAV file')
  }
}

function assertChannelData(channelData: readonly Float32Array[]): number {
  if (channelData.length === 0) return 0
  const frameCount = channelData[0]?.length ?? 0
  for (let channel = 1; channel < channelData.length; channel += 1) {
    if (channelData[channel]?.length !== frameCount) {
      throw new RangeError('All PCM channels must have the same number of samples')
    }
  }
  return frameCount
}

function sourceFromInput(input: PcmAudioInput): ChannelSource {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('Audio input must be an AudioBuffer or Float32 PCM source')
  }

  assertInputSampleRate(input.sampleRate)

  if ('channelData' in input) {
    const frameCount = assertChannelData(input.channelData)
    return { sampleRate: input.sampleRate, channelData: input.channelData, frameCount }
  }

  if (!Number.isSafeInteger(input.length) || input.length < 0) {
    throw new RangeError('AudioBuffer length must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(input.numberOfChannels) || input.numberOfChannels < 0) {
    throw new RangeError('AudioBuffer channel count must be a non-negative safe integer')
  }
  if (input.numberOfChannels === 0) {
    if (input.length !== 0) throw new RangeError('An AudioBuffer with no channels must be empty')
    return { sampleRate: input.sampleRate, channelData: [], frameCount: 0 }
  }

  const channelData: Float32Array[] = []
  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const samples = input.getChannelData(channel)
    if (!(samples instanceof Float32Array)) {
      throw new TypeError('AudioBuffer channel data must be a Float32Array')
    }
    channelData.push(samples)
  }
  const frameCount = assertChannelData(channelData)
  if (frameCount !== input.length) {
    throw new RangeError('AudioBuffer length does not match its channel data')
  }
  return { sampleRate: input.sampleRate, channelData, frameCount }
}

function finiteSample(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clippedSample(value: number): number {
  if (value <= -1) return -1
  if (value >= 1) return 1
  return value
}

function finiteClippedSample(value: number): number {
  return clippedSample(finiteSample(value))
}

function monoSampleAt(source: ChannelSource, frame: number): number {
  const { channelData } = source
  if (channelData.length === 0) return 0
  let average = 0
  for (const channel of channelData) average += finiteSample(channel[frame] ?? 0) / channelData.length
  return clippedSample(average)
}

function whisperFrameCount(source: ChannelSource): number {
  if (source.frameCount === 0) return 0
  return Math.max(1, Math.round(source.frameCount * WHISPER_SAMPLE_RATE / source.sampleRate))
}

function resampledSampleAt(source: ChannelSource, outputFrame: number, outputFrameCount: number): number {
  if (source.frameCount === 0) return 0
  if (outputFrameCount <= 1) return monoSampleAt(source, 0)

  const sourcePosition = outputFrame * (source.frameCount - 1) / (outputFrameCount - 1)
  const lowerFrame = Math.floor(sourcePosition)
  const upperFrame = Math.min(lowerFrame + 1, source.frameCount - 1)
  const fraction = sourcePosition - lowerFrame
  const lower = monoSampleAt(source, lowerFrame)
  if (upperFrame === lowerFrame) return lower
  const upper = monoSampleAt(source, upperFrame)
  return lower + (upper - lower) * fraction
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
}

function writeWavHeader(view: DataView, sampleRate: number, sampleCount: number): void {
  const dataBytes = sampleCount * 2
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
}

function pcm16Sample(value: number): number {
  const clipped = finiteClippedSample(value)
  return clipped < 0 ? Math.round(clipped * 32_768) : Math.round(clipped * 32_767)
}

/**
 * Downmixes and linearly resamples an audio source to mono 16 kHz Float32
 * PCM. The source channel arrays are borrowed; only the returned output is
 * allocated.
 */
export function normalizeToWhisperPcm(input: PcmAudioInput): Float32Array {
  const source = sourceFromInput(input)
  const outputFrameCount = whisperFrameCount(source)
  assertWavSampleCount(outputFrameCount)
  const output = new Float32Array(outputFrameCount)
  for (let frame = 0; frame < output.length; frame += 1) {
    output[frame] = resampledSampleAt(source, frame, output.length)
  }
  return output
}

/**
 * Encodes mono Float32 PCM as a little-endian PCM16 WAV. The samples are
 * clipped and non-finite values are encoded as silence. This function does
 * not resample; use {@link audioToPcm16Wav} for arbitrary input audio.
 */
export function encodePcm16Wav(samples: Float32Array, sampleRate = WHISPER_SAMPLE_RATE): Uint8Array {
  assertWavSampleRate(sampleRate)
  assertWavSampleCount(samples.length)
  const wav = new Uint8Array(WAV_HEADER_BYTES + samples.length * 2)
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  writeWavHeader(view, sampleRate, samples.length)
  for (let frame = 0; frame < samples.length; frame += 1) {
    view.setInt16(WAV_HEADER_BYTES + frame * 2, pcm16Sample(samples[frame] ?? 0), true)
  }
  return wav
}

/**
 * Converts an AudioBuffer-like object or channel-oriented Float32 PCM source
 * directly to a mono 16 kHz PCM16 WAV. The returned WAV is the only
 * full-audio-sized allocation made by this function.
 */
export function audioToPcm16Wav(input: PcmAudioInput): Uint8Array {
  const source = sourceFromInput(input)
  const outputFrameCount = whisperFrameCount(source)
  assertWavSampleCount(outputFrameCount)
  const wav = new Uint8Array(WAV_HEADER_BYTES + outputFrameCount * 2)
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  writeWavHeader(view, WHISPER_SAMPLE_RATE, outputFrameCount)
  for (let frame = 0; frame < outputFrameCount; frame += 1) {
    view.setInt16(WAV_HEADER_BYTES + frame * 2, pcm16Sample(resampledSampleAt(source, frame, outputFrameCount)), true)
  }
  return wav
}

/** Convenience wrapper for a mono Float32 PCM stream. */
export function float32PcmToPcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  return audioToPcm16Wav({ sampleRate, channelData: [samples] })
}
