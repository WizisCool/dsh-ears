import { EventEmitter } from 'node:events'
import type { ChildProcess, ForkOptions } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { SenseVoiceWorkerClient } from '../src/asr/sensevoice-worker-client.js'

class FakeSenseVoiceChild extends EventEmitter {
  connected = true
  readonly sent: Array<Record<string, unknown>> = []
  readonly stderr = new EventEmitter()
  readonly send = vi.fn((message: Record<string, unknown>, callback?: (error: Error | null) => void) => {
    this.sent.push(message)
    callback?.(null)
    return true
  })
  readonly kill = vi.fn(() => true)
}

describe('SenseVoiceWorkerClient', () => {
  it('returns token-aligned timestamp segments from the isolated worker', async () => {
    const child = new FakeSenseVoiceChild()
    const client = SenseVoiceWorkerClient.spawn({
      scriptPath: '/tmp/sensevoice-worker.js',
      fork: vi.fn((_path: string, _args: readonly string[], _options: ForkOptions) => child as unknown as ChildProcess)
    })
    const pending = client.requestTranscript({ type: 'transcribe', audioPath: '/tmp/audio.wav' })
    expect(child.sent[0]).toMatchObject({ type: 'transcribe', audioPath: '/tmp/audio.wav', id: 1 })
    child.emit('message', {
      type: 'response',
      id: 1,
      ok: true,
      text: 'Hello.',
      segments: [{ text: 'Hello.', start: 0.25, end: 1 }]
    })

    await expect(pending).resolves.toEqual({ text: 'Hello.', segments: [{ text: 'Hello.', start: 0.25, end: 1 }] })
  })
})
