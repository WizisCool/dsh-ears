import { afterEach, describe, expect, it } from 'vitest'
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
})
