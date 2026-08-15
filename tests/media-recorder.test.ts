import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaRecorderSession, isMediaRecorderAvailable } from '../src/asr/media-recorder.js'

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
const originalMediaRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')

afterEach(() => {
  if (originalNavigator === undefined) Reflect.deleteProperty(globalThis, 'navigator')
  else Object.defineProperty(globalThis, 'navigator', originalNavigator)
  if (originalMediaRecorder === undefined) Reflect.deleteProperty(globalThis, 'MediaRecorder')
  else Object.defineProperty(globalThis, 'MediaRecorder', originalMediaRecorder)
})

describe('MediaRecorderSession', () => {
  it('reports unsupported environments without touching the microphone', () => {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: undefined })
    expect(isMediaRecorderAvailable()).toBe(false)
  })

  it('collects audio bytes and releases the input track after stop', async () => {
    const track = { stop: () => { trackStopped = true } }
    let trackStopped = false
    const stream = { getTracks: () => [track] }
    class FakeRecorder extends EventTarget {
      static isTypeSupported(mimeType: string): boolean { return mimeType === 'audio/webm;codecs=opus' }
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm;codecs=opus'
      start(): void { this.state = 'recording' }
      stop(): void {
        this.state = 'inactive'
        const dataEvent = Object.assign(new Event('dataavailable'), { data: new Blob([Uint8Array.from([1, 2, 3])], { type: 'audio/webm' }) })
        this.dispatchEvent(dataEvent)
        this.dispatchEvent(new Event('stop'))
      }
    }
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } })
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder })

    const session = await MediaRecorderSession.create()
    session.start()
    const result = await session.stop()

    expect(result.mimeType).toBe('audio/webm;codecs=opus')
    expect(atob(result.base64)).toBe('\x01\x02\x03')
    expect(trackStopped).toBe(true)
  })

  it('shares one stop promise and does not duplicate recorder shutdown', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] }
    class FakeRecorder extends EventTarget {
      static isTypeSupported(): boolean { return false }
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm'
      stopCalls = 0
      start(): void { this.state = 'recording' }
      stop(): void {
        this.stopCalls += 1
        this.state = 'inactive'
        queueMicrotask(() => {
          this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob([Uint8Array.from([4])], { type: 'audio/webm' }) }))
          this.dispatchEvent(new Event('stop'))
        })
      }
    }
    let recorder: FakeRecorder | undefined
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } })
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: class extends FakeRecorder {
      constructor(...args: ConstructorParameters<typeof MediaRecorder>) {
        super()
        void args
        recorder = this
      }
    } })

    const session = await MediaRecorderSession.create()
    session.start()
    const first = session.stop()
    const second = session.stop()
    await expect(second).resolves.toEqual(await first)
    expect(recorder?.stopCalls).toBe(1)
  })

  it('releases tracks when MediaRecorder reports an error', async () => {
    let trackStopped = false
    const track = { stop: () => { trackStopped = true } }
    const stream = { getTracks: () => [track] }
    class FakeRecorder extends EventTarget {
      static isTypeSupported(): boolean { return false }
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm'
      start(): void { this.state = 'recording' }
      stop(): void {
        this.state = 'inactive'
        this.dispatchEvent(new Event('error'))
      }
    }
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } })
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder })

    const session = await MediaRecorderSession.create()
    session.start()
    await expect(session.stop()).rejects.toThrow('Media recording failed')
    expect(trackStopped).toBe(true)
  })

  it('rejects a pending stop when abort receives no recorder event', async () => {
    const stopTrack = vi.fn()
    const stream = { getTracks: () => [{ stop: stopTrack }] }
    class FakeRecorder extends EventTarget {
      static isTypeSupported(): boolean { return false }
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm'
      start(): void { this.state = 'recording' }
      stop(): void { this.state = 'inactive' }
    }
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } })
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder })

    const session = await MediaRecorderSession.create()
    session.start()
    const pending = session.stop()
    session.abort()

    await expect(pending).rejects.toThrow('aborted')
    expect(stopTrack).toHaveBeenCalled()
  })

  it('stops and rejects when captured audio exceeds the memory limit', async () => {
    let trackStopped = false
    const stream = { getTracks: () => [{ stop: () => { trackStopped = true } }] }
    class FakeRecorder extends EventTarget {
      static isTypeSupported(): boolean { return false }
      state: RecordingState = 'inactive'
      mimeType = 'audio/webm'
      start(): void { this.state = 'recording' }
      stop(): void {
        this.state = 'inactive'
        this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob([new Uint8Array(24 * 1024 * 1024 + 1)], { type: 'audio/webm' }) }))
        this.dispatchEvent(new Event('stop'))
      }
    }
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } })
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder })

    const session = await MediaRecorderSession.create()
    session.start()
    await expect(session.stop()).rejects.toThrow('audio is too large')
    expect(trackStopped).toBe(true)
  })
})
