import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioLevelMonitor, audioLevelFromTimeDomain } from '../src/asr/audio-level.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('audioLevelFromTimeDomain', () => {
  it('returns silence for a centered waveform', () => {
    expect(audioLevelFromTimeDomain(new Uint8Array([128, 128, 128, 128]))).toBe(0)
  })

  it('normalizes louder waveforms into the 0–1 display range', () => {
    expect(audioLevelFromTimeDomain(new Uint8Array([96, 160, 96, 160]))).toBeGreaterThan(0)
    expect(audioLevelFromTimeDomain(new Uint8Array([0, 255, 0, 255]))).toBe(1)
  })

  it('handles an empty analyser buffer', () => {
    expect(audioLevelFromTimeDomain(new Uint8Array())).toBe(0)
  })
})

describe('AudioLevelMonitor', () => {
  it('samples a captured stream and releases every owned resource', async () => {
    const stopTrack = vi.fn()
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    const sourceDisconnect = vi.fn()
    const analyserDisconnect = vi.fn()
    const sourceConnect = vi.fn()
    const resume = vi.fn(async () => undefined)
    const close = vi.fn(async () => undefined)
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      connect: vi.fn(),
      disconnect: analyserDisconnect,
      getByteTimeDomainData: (samples: Uint8Array) => {
        for (let index = 0; index < samples.length; index += 1) samples[index] = index % 2 === 0 ? 96 : 160
      }
    }
    const source = { connect: sourceConnect, disconnect: sourceDisconnect }
    class FakeAudioContext {
      createAnalyser = () => analyser
      createMediaStreamSource = () => source
      resume = resume
      close = close
    }
    let frameCallback: FrameRequestCallback | undefined
    let frameId = 0
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallback = callback
      frameId += 1
      return frameId
    })
    const cancelAnimationFrame = vi.fn()

    vi.stubGlobal('window', { AudioContext: FakeAudioContext })
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const onLevel = vi.fn()
    const monitor = await AudioLevelMonitor.capture(onLevel)
    frameCallback?.(50)
    monitor.stop()
    monitor.stop()

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    expect(sourceConnect).toHaveBeenCalledWith(analyser)
    expect(resume).toHaveBeenCalledOnce()
    expect(onLevel).toHaveBeenCalledOnce()
    expect(onLevel.mock.calls[0]?.[0]).toBeGreaterThan(0)
    expect(cancelAnimationFrame).toHaveBeenCalledOnce()
    expect(sourceDisconnect).toHaveBeenCalledOnce()
    expect(analyserDisconnect).toHaveBeenCalledOnce()
    expect(stopTrack).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})
