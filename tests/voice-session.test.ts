import { afterEach, describe, expect, it, vi } from 'vitest'
import { VOICE_ERROR_DISMISS_MS, VOICE_WAVEFORM_SLOTS, VoiceInputSession } from '../src/client/voice-session.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('VoiceInputSession', () => {
  it('publishes recognition states to all subscribers', () => {
    const session = new VoiceInputSession()
    const listener = vi.fn()
    const unsubscribe = session.subscribe(listener)

    session.setState('recording')

    expect(session.getSnapshot()).toEqual({ state: 'recording', levels: [] })
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    session.setState('transcribing')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps a bounded rolling history of real audio levels', () => {
    const session = new VoiceInputSession()
    session.setState('recording')
    const sampleCount = VOICE_WAVEFORM_SLOTS + 12
    for (let index = 0; index < sampleCount; index += 1) session.pushAudioLevel(index / (sampleCount - 1))

    expect(session.getSnapshot().levels).toHaveLength(VOICE_WAVEFORM_SLOTS)
    expect(session.getSnapshot().levels[0]).toBeCloseTo(12 / (sampleCount - 1))
    expect(session.getSnapshot().levels.at(-1)).toBe(1)
    session.setState('idle')
    expect(session.getSnapshot().levels).toEqual([])
  })

  it('notifies the active recorder when the bar requests stop', () => {
    const session = new VoiceInputSession()
    const stop = vi.fn()
    const unsubscribe = session.onStopRequested(stop)

    session.setState('recording')
    session.requestStop()

    expect(session.getSnapshot()).toEqual({ state: 'recording', levels: [] })
    expect(stop).toHaveBeenCalledOnce()
    unsubscribe()
    session.requestStop()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('dismisses recognition errors after a short delay', () => {
    vi.useFakeTimers()
    const session = new VoiceInputSession()
    session.setState('error')
    vi.advanceTimersByTime(VOICE_ERROR_DISMISS_MS - 1)
    expect(session.getSnapshot().state).toBe('error')
    vi.advanceTimersByTime(1)
    expect(session.getSnapshot().state).toBe('idle')
    session.dispose()
  })

  it('cancels the error dismiss timer when a new recording starts', () => {
    vi.useFakeTimers()
    const session = new VoiceInputSession()
    session.setState('polish-error')
    session.setState('recording')
    vi.advanceTimersByTime(VOICE_ERROR_DISMISS_MS)
    expect(session.getSnapshot().state).toBe('recording')
    session.dispose()
  })

  it('removes listeners when the plugin scope is disposed', () => {
    const session = new VoiceInputSession()
    const stateListener = vi.fn()
    const stopListener = vi.fn()
    session.subscribe(stateListener)
    session.onStopRequested(stopListener)

    session.dispose()
    session.setState('recording')
    session.requestStop()

    expect(stateListener).not.toHaveBeenCalled()
    expect(stopListener).not.toHaveBeenCalled()
  })
})
