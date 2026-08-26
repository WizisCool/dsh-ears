import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRealtimeAudioCaptureAvailable, RealtimeAudioCaptureSession } from '../src/client/realtime-audio-capture.js'

class FakeTrack {
  readonly stop = vi.fn()
}

class FakeStream {
  readonly track = new FakeTrack()

  getTracks(): FakeTrack[] {
    return [this.track]
  }
}

class FakeNode {
  readonly connect = vi.fn()
  readonly disconnect = vi.fn()
}

class FakeProcessor extends FakeNode {
  onaudioprocess: ((event: { inputBuffer: { sampleRate: number; getChannelData(channel: number): Float32Array } }) => void) | null = null
}

class FakeAudioContext {
  readonly destination = {}
  readonly source = new FakeNode()
  readonly processor = new FakeProcessor()
  readonly sink = Object.assign(new FakeNode(), { gain: { value: 1 } })
  readonly resume = vi.fn(async () => undefined)
  readonly close = vi.fn(async () => undefined)

  createMediaStreamSource(): FakeNode {
    return this.source
  }

  createScriptProcessor(): FakeProcessor {
    return this.processor
  }

  createGain(): typeof this.sink {
    return this.sink
  }
}


function emitAudio(context: FakeAudioContext, samples: number[], sampleRate = 16_000): void {
  context.processor.onaudioprocess?.({
    inputBuffer: {
      sampleRate,
      getChannelData: () => Float32Array.from(samples)
    }
  })
}

function decodePcm16(base64: string): number[] {
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: bytes.byteLength / 2 }, (_, index) => view.getInt16(index * 2, true))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('realtime audio capture capability detection', () => {
  it('requires a callable microphone API and script processor support', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => new FakeStream()) } })
    vi.stubGlobal('AudioContext', FakeAudioContext)
    expect(isRealtimeAudioCaptureAvailable()).toBe(true)

    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: 'unavailable' } })
    expect(isRealtimeAudioCaptureAvailable()).toBe(false)

    class MissingProcessorAudioContext {}
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } })
    vi.stubGlobal('AudioContext', MissingProcessorAudioContext)
    expect(isRealtimeAudioCaptureAvailable()).toBe(false)
  })
})

describe('RealtimeAudioCaptureSession', () => {
  it('captures mono PCM16 chunks at 16 kHz and releases resources on stop', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    const chunks: string[] = []
    session.start(async (chunk) => {
      chunks.push(chunk)
    })
    emitAudio(context, [1, -1])

    await session.stop()

    expect(chunks).toHaveLength(1)
    expect(decodePcm16(chunks[0]!)).toEqual([32_767, -32_768])
    expect(stream.track.stop).toHaveBeenCalledOnce()
    expect(context.resume).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
    expect(context.source.disconnect).toHaveBeenCalledOnce()
    expect(context.processor.disconnect).toHaveBeenCalledOnce()
    expect(context.sink.disconnect).toHaveBeenCalledOnce()
  })

  it('waits for queued chunks before closing the audio context', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    const chunks: string[] = []
    let releaseFirst!: () => void
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    session.start(async (chunk) => {
      chunks.push(chunk)
      if (chunks.length === 1) await first
    })
    emitAudio(context, [0.25, -0.25])
    emitAudio(context, [0.5, -0.5])

    const stopping = session.stop()
    await Promise.resolve()
    expect(chunks).toHaveLength(1)
    expect(context.close).not.toHaveBeenCalled()

    releaseFirst()
    await stopping
    expect(chunks).toHaveLength(2)
    expect(context.close).toHaveBeenCalledOnce()
  })

  it('propagates a chunk delivery error after cleaning up resources', async () => {
    const stream = new FakeStream()
    const context = new FakeAudioContext()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } })
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        Object.assign(this, context)
      }
    })

    const session = await RealtimeAudioCaptureSession.create()
    session.start(async () => {
      throw new Error('transport unavailable')
    })
    emitAudio(context, [0, 0])

    await expect(session.stop()).rejects.toThrow('transport unavailable')
    expect(stream.track.stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })
})
