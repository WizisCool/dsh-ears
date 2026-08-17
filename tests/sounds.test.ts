import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeSounds, playClick, playRecognitionChime, retainSounds } from '../src/client/sounds.js'

class FakeOscillator extends EventTarget {
  type = 'sine'
  frequency = { value: 0 }
  startedAt: number | undefined
  stoppedAt: number | undefined
  start(time: number): void { this.startedAt = time }
  stop(time: number): void { this.stoppedAt = time }
  connect(): this { return this }
  disconnect(): void { /* no-op */ }
}

class FakeGain {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  }
  connect(): this { return this }
  disconnect(): void { /* no-op */ }
}

class FakeFilter {
  type = 'lowpass'
  Q = { value: 1 }
  frequency = { value: 0 }
  connect(): this { return this }
  disconnect(): void { /* no-op */ }
}

class FakeBufferSource extends EventTarget {
  buffer: AudioBuffer | null = null
  started = false
  start(): void { this.started = true }
  stop(): void { /* no-op */ }
  connect(): this { return this }
  disconnect(): void { /* no-op */ }
}

class FakeAudioContext {
  state: AudioContextState = 'running'
  currentTime = 1
  sampleRate = 48_000
  closed = false
  oscillators: FakeOscillator[] = []
  sources: FakeBufferSource[] = []
  filters: FakeFilter[] = []
  destination = {}
  resume = vi.fn(async () => { this.state = 'running' })
  close = vi.fn(async () => { this.closed = true; this.state = 'closed' })
  createBuffer(_channels: number, length: number, sampleRate: number): AudioBuffer {
    const data = new Float32Array(length)
    return {
      length,
      sampleRate,
      numberOfChannels: 1,
      duration: length / sampleRate,
      getChannelData: () => data
    } as AudioBuffer
  }
  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource()
    this.sources.push(source)
    return source
  }
  createBiquadFilter(): FakeFilter {
    const filter = new FakeFilter()
    this.filters.push(filter)
    return filter
  }
  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator()
    this.oscillators.push(oscillator)
    return oscillator
  }
  createGain(): FakeGain {
    return new FakeGain()
  }
}

afterEach(() => {
  disposeSounds()
  vi.unstubAllGlobals()
})

describe('voice sounds', () => {
  it('plays a band-passed noise click and a rising G5–C6 chime', async () => {
    const created: FakeAudioContext[] = []
    vi.stubGlobal('window', {
      AudioContext: class extends FakeAudioContext {
        constructor() {
          super()
          created.push(this)
        }
      }
    })

    playClick(0.5)
    playRecognitionChime()
    await vi.waitFor(() => expect(created[0]?.sources.length).toBe(1))
    await vi.waitFor(() => expect(created[0]?.oscillators.length).toBe(2))

    const ctx = created[0]
    expect(ctx?.sources[0]?.started).toBe(true)
    expect(ctx?.filters[0]?.type).toBe('bandpass')
    expect(ctx?.filters[0]?.Q.value).toBe(8)
    expect(ctx?.oscillators[0]?.frequency.value).toBeCloseTo(783.99)
    expect(ctx?.oscillators[1]?.frequency.value).toBeCloseTo(1046.5)
    expect(ctx?.oscillators[0]?.stoppedAt).toBeCloseTo(1.12)
    expect(ctx?.oscillators[1]?.startedAt).toBeCloseTo(1.10)
    expect(ctx?.oscillators[1]?.stoppedAt).toBeCloseTo(1.38)
  })

  it('closes the shared context when the last listener is released', async () => {
    const created: FakeAudioContext[] = []
    vi.stubGlobal('window', {
      AudioContext: class extends FakeAudioContext {
        constructor() {
          super()
          created.push(this)
        }
      }
    })
    const release = retainSounds()
    playClick()
    await vi.waitFor(() => expect(created).toHaveLength(1))
    release()
    await vi.waitFor(() => expect(created[0]?.closed).toBe(true))
  })
})
