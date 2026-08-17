import { afterEach, describe, expect, it, vi } from 'vitest'
import { disposeSounds, playClick, retainSounds } from '../src/client/sounds.js'

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
  createGain(): FakeGain {
    return new FakeGain()
  }
}

afterEach(() => {
  disposeSounds()
  vi.unstubAllGlobals()
})

describe('voice sounds', () => {
  it('plays a band-passed noise click', async () => {
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
    await vi.waitFor(() => expect(created[0]?.sources.length).toBe(1))

    const ctx = created[0]
    expect(ctx?.sources[0]?.started).toBe(true)
    expect(ctx?.filters[0]?.type).toBe('bandpass')
    expect(ctx?.filters[0]?.Q.value).toBe(8)
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
