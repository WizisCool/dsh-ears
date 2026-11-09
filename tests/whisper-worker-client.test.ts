import { EventEmitter } from 'node:events'
import type { ChildProcess, ForkOptions } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES, EarsError } from '../src/errors.js'
import { WhisperWorkerClient } from '../src/asr/whisper-worker-client.js'
import { WhisperRestartRequiredError } from '../src/asr/whisper-native.js'

class FakeChild extends EventEmitter {
  connected = true
  readonly sent: Array<Record<string, unknown>> = []
  readonly stderr = new EventEmitter()
  readonly send = vi.fn((message: Record<string, unknown>, callback?: (error: Error | null) => void) => {
    this.sent.push(message)
    callback?.(null)
    return true
  })
  readonly kill = vi.fn(() => {
    this.connected = false
    return true
  })

  emitMessage(message: unknown): void {
    this.emit('message', message)
  }

  exit(code: number | null, signal: NodeJS.Signals | null): void {
    this.connected = false
    this.emit('exit', code, signal)
  }
}

function createClient(overrides: { shutdownTimeoutMs?: number; stderrLimit?: number } = {}) {
  const child = new FakeChild()
  const onDiagnostic = vi.fn()
  const fork = vi.fn((_scriptPath: string, _args: readonly string[], _options: ForkOptions) => child as unknown as ChildProcess)
  const client = WhisperWorkerClient.spawn({
    scriptPath: '/tmp/dsh-ears-worker.js',
    fork,
    onDiagnostic,
    shutdownTimeoutMs: overrides.shutdownTimeoutMs ?? 1_000,
    stderrLimit: overrides.stderrLimit ?? 100
  })
  return { client, child, fork, onDiagnostic }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('WhisperWorkerClient', () => {
  it('spawns the bundled worker entry through Node with IPC', () => {
    const { fork } = createClient()
    expect(fork).toHaveBeenCalledTimes(1)
    const [scriptPath, args, options] = fork.mock.calls[0]
    expect(scriptPath).toBe('/tmp/dsh-ears-worker.js')
    expect(args).toEqual([])
    expect(options.stdio).toEqual(['ignore', 'ignore', 'pipe', 'ipc'])
    expect(options.execArgv).toEqual([])
    expect(options.env).toMatchObject({ ELECTRON_RUN_AS_NODE: '1' })
  })

  it('matches a response to its request id and ignores unknown ids', async () => {
    const { client, child } = createClient()
    const pending = client.request({ type: 'init', modelPath: '/models/turbo.bin', variant: 'default', useGpu: true })
    expect(child.sent[0]).toMatchObject({ type: 'init', id: 1, modelPath: '/models/turbo.bin', useGpu: true })

    child.emitMessage({ type: 'response', id: 99, ok: true, value: { kind: 'none' } })
    child.emitMessage({ type: 'response', id: 1, ok: true, value: { kind: 'text', text: 'hello', isAborted: false } })

    await expect(pending).resolves.toEqual({ kind: 'text', text: 'hello', isAborted: false })
  })

  it('reconstructs a structured worker error', async () => {
    const { client, child } = createClient()
    const pending = client.request({ type: 'transcribe', audioPath: '/tmp/a.wav', language: 'zh' })
    child.emitMessage({
      type: 'response',
      id: 1,
      ok: false,
      error: { code: EARS_ERROR_CODES.whisperReleaseFailed, message: 'release failed', params: { detail: 'metal' } }
    })

    await expect(pending).rejects.toMatchObject({
      code: EARS_ERROR_CODES.whisperReleaseFailed,
      message: 'release failed',
      params: { detail: 'metal' }
    })
  })

  it('reconstructs a restart-required error as its typed class', async () => {
    const { client, child } = createClient()
    const pending = client.request({ type: 'init', modelPath: '/models/turbo.bin', variant: 'cuda', useGpu: true })
    child.emitMessage({
      type: 'response',
      id: 1,
      ok: false,
      error: {
        code: EARS_ERROR_CODES.whisperRestartRequired,
        message: 'Restart dsh to switch Local Whisper from "default" to "cuda"',
        params: { loadedVariant: 'default', requestedVariant: 'cuda' }
      }
    })

    const error = await pending.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(WhisperRestartRequiredError)
    expect(error).toMatchObject({ loadedVariant: 'default', requestedVariant: 'cuda' })
  })

  it('turns an unexpected native abort into one failed request with bounded diagnostics', async () => {
    const { client, child, onDiagnostic } = createClient({ stderrLimit: 40 })
    const listener = vi.fn()
    client.onExit(listener)
    const pending = client.request({ type: 'transcribe', audioPath: '/tmp/a.wav', language: null })
    child.stderr.emit('data', Buffer.from('ggml-metal-device.m:952 GGML_ASSERT failed\n'))
    child.exit(134, 'SIGABRT')

    await expect(pending).rejects.toMatchObject({ code: EARS_ERROR_CODES.whisperWorkerFailed })
    await expect(pending).rejects.toThrow(/SIGABRT/u)
    expect(client.alive).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(onDiagnostic).toHaveBeenCalledWith(expect.stringContaining('SIGABRT'))
    expect(onDiagnostic.mock.calls[0][0].length).toBeLessThan(2_000)
    await expect(client.request({ type: 'transcribe', audioPath: '/tmp/a.wav', language: null })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.whisperWorkerFailed
    })
  })

  it('reports an error from a later request when the worker already exited', async () => {
    const { client, child } = createClient()
    child.exit(0, null)
    await expect(client.request({ type: 'release' })).rejects.toMatchObject({ code: EARS_ERROR_CODES.whisperWorkerFailed })
  })

  it('cancels only the active transcription', async () => {
    const { client, child } = createClient()
    const pending = client.request({ type: 'transcribe', audioPath: '/tmp/a.wav', language: null })
    client.cancelActive()
    const control = child.sent.find((message) => message.type === 'cancel')
    expect(control).toBeDefined()
    expect(control?.id).not.toBe(1)

    child.emitMessage({ type: 'response', id: 1, ok: true, value: { kind: 'text', text: '', isAborted: true } })
    await expect(pending).resolves.toEqual({ kind: 'text', text: '', isAborted: true })
    client.cancelActive()
    expect(child.sent.filter((message) => message.type === 'cancel')).toHaveLength(1)
  })

  it('times out a request without leaving the id pending', async () => {
    vi.useFakeTimers()
    const { client, child } = createClient()
    const pending = client.request({ type: 'release' }, { timeoutMs: 50 })
    const rejection = expect(pending).rejects.toMatchObject({ code: EARS_ERROR_CODES.whisperWorkerFailed })
    await vi.advanceTimersByTimeAsync(50)
    await rejection
    child.emitMessage({ type: 'response', id: 1, ok: true, value: { kind: 'none' } })
    await Promise.resolve()
  })

  it('shuts down cooperatively and waits for a normal exit', async () => {
    const { client, child, onDiagnostic } = createClient()
    const shutdown = client.shutdown()
    expect(child.sent.at(-1)).toMatchObject({ type: 'shutdown' })
    child.exit(0, null)
    await shutdown
    expect(child.kill).not.toHaveBeenCalled()
    expect(onDiagnostic).not.toHaveBeenCalled()
  })

  it('escalates to SIGKILL when the worker ignores shutdown', async () => {
    vi.useFakeTimers()
    const { client, child, onDiagnostic } = createClient({ shutdownTimeoutMs: 50 })
    const shutdown = client.shutdown()
    await vi.advanceTimersByTimeAsync(50)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    child.exit(null, 'SIGKILL')
    await shutdown
    expect(onDiagnostic).toHaveBeenCalledWith(expect.stringContaining('SIGKILL'))
  })

  it('does not treat a cancelled request as a crash', async () => {
    const { client, child, onDiagnostic } = createClient()
    const pending = client.request({ type: 'transcribe', audioPath: '/tmp/a.wav', language: null })
    client.cancelActive()
    child.emitMessage({ type: 'response', id: 1, ok: false, error: { code: EARS_ERROR_CODES.asrUnexpected, message: 'aborted' } })
    await expect(pending).rejects.toBeInstanceOf(EarsError)
    expect(onDiagnostic).not.toHaveBeenCalled()
  })
})
