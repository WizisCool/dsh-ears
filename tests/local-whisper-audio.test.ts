import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isTranscriptionStillCurrent,
  normalizeRecordedAudioForLocalWhisper,
  prepareRecordedAudioForBackend,
  type RecordedAudioPayload
} from '../src/client/local-whisper-audio.js'

const originalAudioContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
const originalWebkitAudioContext = Object.getOwnPropertyDescriptor(globalThis, 'webkitAudioContext')

function restoreGlobal(name: 'AudioContext' | 'webkitAudioContext', descriptor: PropertyDescriptor | undefined): void {
  if (descriptor === undefined) Reflect.deleteProperty(globalThis, name)
  else Object.defineProperty(globalThis, name, descriptor)
}

afterEach(() => {
  restoreGlobal('AudioContext', originalAudioContext)
  restoreGlobal('webkitAudioContext', originalWebkitAudioContext)
})

function encodedAudio(bytes = [1, 2, 3]): RecordedAudioPayload {
  return {
    base64: btoa(String.fromCharCode(...bytes)),
    mimeType: 'audio/webm;codecs=opus'
  }
}

function audioBuffer(samples: readonly Float32Array[], sampleRate = 16_000) {
  return {
    sampleRate,
    length: samples[0]?.length ?? 0,
    numberOfChannels: samples.length,
    getChannelData: (channel: number) => samples[channel] as Float32Array
  }
}

function readPcm16Wav(base64: string): { sampleRate: number; channels: number; bitsPerSample: number; samples: number[] } {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const samples: number[] = []
  for (let offset = 44; offset < bytes.length; offset += 2) samples.push(view.getInt16(offset, true))
  return {
    sampleRate: view.getUint32(24, true),
    channels: view.getUint16(22, true),
    bitsPerSample: view.getUint16(34, true),
    samples
  }
}

describe('prepareRecordedAudioForBackend', () => {
  it('keeps Cloud OpenAI on the original payload and routes Local Whisper through normalization', async () => {
    const raw = encodedAudio()
    const cloud = await prepareRecordedAudioForBackend('cloud-openai', raw)
    expect(cloud).toBe(raw)

    const local = await prepareRecordedAudioForBackend('local-whisper', raw, {
      createAudioContext: () => ({
        decodeAudioData: async () => audioBuffer([Float32Array.from([0])]),
        close: async () => undefined
      })
    })
    expect(local).not.toBe(raw)
    expect(local.mimeType).toBe('audio/wav')
  })
})

describe('isTranscriptionStillCurrent', () => {
  it('prevents a completed conversion from reaching remote.transcribe after cancel, unmount, or a stale epoch', async () => {
    const prepared = await prepareRecordedAudioForBackend('local-whisper', encodedAudio(), {
      createAudioContext: () => ({
        decodeAudioData: async () => audioBuffer([Float32Array.from([0])]),
        close: async () => undefined
      })
    })
    expect(prepared.mimeType).toBe('audio/wav')

    const remoteTranscribe = vi.fn()
    const controller = new AbortController()
    const sendIfCurrent = (options: Parameters<typeof isTranscriptionStillCurrent>[0]) => {
      if (isTranscriptionStillCurrent(options)) remoteTranscribe(prepared)
    }

    controller.abort()
    sendIfCurrent({ mounted: true, signal: controller.signal, captureIsCurrent: true })
    sendIfCurrent({ mounted: false, signal: new AbortController().signal, captureIsCurrent: true })
    sendIfCurrent({ mounted: true, signal: new AbortController().signal, captureIsCurrent: false })

    expect(remoteTranscribe).not.toHaveBeenCalled()
    sendIfCurrent({ mounted: true, signal: new AbortController().signal, captureIsCurrent: true })
    expect(remoteTranscribe).toHaveBeenCalledOnce()
  })
})

describe('normalizeRecordedAudioForLocalWhisper', () => {
  it('decodes the MediaRecorder bytes and returns mono 16 kHz PCM16 WAV', async () => {
    const decodeAudioData = vi.fn(async (input: ArrayBuffer) => {
      expect(Array.from(new Uint8Array(input))).toEqual([1, 2, 3])
      return audioBuffer([Float32Array.from([1, -1])])
    })
    const close = vi.fn(async () => undefined)

    const result = await normalizeRecordedAudioForLocalWhisper(encodedAudio(), {
      createAudioContext: () => ({ decodeAudioData, close })
    })

    expect(result.mimeType).toBe('audio/wav')
    expect(readPcm16Wav(result.base64)).toEqual({
      sampleRate: 16_000,
      channels: 1,
      bitsPerSample: 16,
      samples: [32_767, -32_768]
    })
    expect(decodeAudioData).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })

  it('uses the webkitAudioContext constructor when AudioContext is unavailable', async () => {
    const close = vi.fn(async () => undefined)
    class WebkitAudioContext {
      async decodeAudioData(): Promise<ReturnType<typeof audioBuffer>> {
        return audioBuffer([Float32Array.from([0])])
      }
      async close(): Promise<void> {
        await close()
      }
    }
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: undefined })
    Object.defineProperty(globalThis, 'webkitAudioContext', { configurable: true, value: WebkitAudioContext })

    const result = await normalizeRecordedAudioForLocalWhisper(encodedAudio([9]))

    expect(result.mimeType).toBe('audio/wav')
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes the context and reports a decode failure', async () => {
    const close = vi.fn(async () => undefined)
    const decodeAudioData = vi.fn(async () => {
      throw new Error('unsupported audio codec')
    })

    await expect(normalizeRecordedAudioForLocalWhisper(encodedAudio(), {
      createAudioContext: () => ({ decodeAudioData, close })
    })).rejects.toThrow('Failed to decode recorded audio for local Whisper')
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not create a context when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const createAudioContext = vi.fn()

    await expect(normalizeRecordedAudioForLocalWhisper(encodedAudio(), {
      signal: controller.signal,
      createAudioContext
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(createAudioContext).not.toHaveBeenCalled()
  })

  it('stops before encoding when aborted while decoding', async () => {
    const controller = new AbortController()
    const close = vi.fn(async () => undefined)
    let resolveDecode!: (buffer: ReturnType<typeof audioBuffer>) => void
    const decodeAudioData = vi.fn(() => new Promise<ReturnType<typeof audioBuffer>>((resolve) => {
      resolveDecode = resolve
    }))
    const task = normalizeRecordedAudioForLocalWhisper(encodedAudio(), {
      signal: controller.signal,
      createAudioContext: () => ({ decodeAudioData, close })
    })

    controller.abort()
    resolveDecode(audioBuffer([Float32Array.from([0])]))

    await expect(task).rejects.toMatchObject({ name: 'AbortError' })
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not let context cleanup hide a successful conversion', async () => {
    const close = vi.fn(async () => {
      throw new Error('already closed')
    })

    await expect(normalizeRecordedAudioForLocalWhisper(encodedAudio(), {
      createAudioContext: () => ({
        decodeAudioData: async () => audioBuffer([Float32Array.from([0])]),
        close
      })
    })).resolves.toMatchObject({ mimeType: 'audio/wav' })
    expect(close).toHaveBeenCalledOnce()
  })
})
