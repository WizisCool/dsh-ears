import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EARS_ERROR_CODES, EarsError, sanitizeEarsErrorText } from '../errors.js'
import { assertPcm16Wav } from './local-whisper.js'
import { isSenseVoiceModelId } from './sensevoice-models.js'
import type { SenseVoiceModelId } from '../settings/recognition.js'
import { resolveSherpaNativePackage } from './sensevoice-native.js'
import { spawnSenseVoiceWorker, type LocalSenseVoiceWorker } from './sensevoice-worker-client.js'
import type { SenseVoiceWorkerTranscript } from './sensevoice-worker-protocol.js'
import type { TranscriptSegment } from './transcript.js'

const TRANSCRIPTION_TIMEOUT_MS = 120_000
const CANCEL_GRACE_MS = 5_000
const RELEASE_TIMEOUT_MS = 5_000

export interface LocalSenseVoiceOptions {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly model: SenseVoiceModelId
  readonly modelPath: string
  readonly tokensPath: string
  readonly signal: AbortSignal
  readonly timeoutMs?: number
}

export interface LocalSenseVoiceTranscript {
  readonly text: string
  readonly segments: readonly TranscriptSegment[]
}

export type SenseVoiceWorkerFactory = () => LocalSenseVoiceWorker

/** The native sherpa-onnx binding is loaded only in this child process. */
export class LocalSenseVoiceRuntime {
  private worker: LocalSenseVoiceWorker | undefined
  private contextKey: string | undefined
  private queue: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(private readonly createWorker: SenseVoiceWorkerFactory = () => spawnSenseVoiceWorker()) {}

  async transcribe(options: LocalSenseVoiceOptions): Promise<string> {
    return (await this.transcribeDetailed(options)).text
  }

  async transcribeDetailed(options: LocalSenseVoiceOptions): Promise<LocalSenseVoiceTranscript> {
    if (this.disposed) throw new EarsError(EARS_ERROR_CODES.senseVoiceNativeUnavailable, 'The SenseVoice runtime has been disposed')
    const run = this.queue.then(() => this.transcribeNow(options))
    this.queue = run.then(() => undefined, () => undefined)
    return rejectOnAbort(run, options.signal)
  }

  async releaseContext(): Promise<void> {
    if (this.disposed) return
    await this.withContextReleased(async () => undefined)
  }

  async withContextReleased<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue
    const run = previous.then(async () => {
      await this.stopWorker()
      return operation()
    })
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.worker?.cancelActive()
    const killTimer = setTimeout(() => this.worker?.kill(), CANCEL_GRACE_MS)
    try {
      await this.queue.catch(() => undefined)
    } finally {
      clearTimeout(killTimer)
    }
    await this.stopWorker()
  }

  private async transcribeNow(options: LocalSenseVoiceOptions): Promise<LocalSenseVoiceTranscript> {
    if (this.disposed) throw new EarsError(EARS_ERROR_CODES.senseVoiceNativeUnavailable, 'The SenseVoice runtime has been disposed')
    options.signal.throwIfAborted()
    if (!isSenseVoiceModelId(options.model)) throw new EarsError(EARS_ERROR_CODES.asrModelUnsupported, 'The selected SenseVoice model is not supported')
    if (options.audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
    if (options.audio.byteLength > 24 * 1024 * 1024) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large')
    assertPcm16Wav(options.audio, options.mimeType)
    options.signal.throwIfAborted()
    try {
      resolveSherpaNativePackage()
    } catch (error) {
      throw new EarsError(EARS_ERROR_CODES.senseVoiceNativeUnavailable, 'The sherpa-onnx native runtime is unavailable', {
        detail: sanitizeEarsErrorText(error instanceof Error ? error.message : String(error))
      })
    }

    const worker = await this.ensureContext(options)
    const directory = await mkdtemp(join(tmpdir(), 'dsh-ears-sensevoice-'))
    const inputPath = join(directory, 'recording.wav')
    const timerController = new AbortController()
    const timer = setTimeout(() => timerController.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'SenseVoice transcription timed out')), options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS)
    const forwardTimeout = () => worker.cancelActive()
    const forwardExternalAbort = () => worker.cancelActive()
    timerController.signal.addEventListener('abort', forwardTimeout, { once: true })
    options.signal.addEventListener('abort', forwardExternalAbort, { once: true })
    try {
      await writeFile(inputPath, options.audio)
      options.signal.throwIfAborted()
      const response: Promise<SenseVoiceWorkerTranscript | undefined> = worker.requestTranscript === undefined
        ? worker.request({ type: 'transcribe', audioPath: inputPath }, { timeoutMs: options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS }).then((text) => text === undefined ? undefined : { text })
        : worker.requestTranscript({ type: 'transcribe', audioPath: inputPath }, { timeoutMs: options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS })
      const result = await raceAbort(response, options.signal, timerController.signal)
      options.signal.throwIfAborted()
      if (timerController.signal.aborted) throw timerController.signal.reason
      const text = result?.text?.trim()
      if (text === undefined || text === '') throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'SenseVoice returned no transcript')
      return { text, segments: result?.segments ?? [] }
    } catch (error) {
      if (timerController.signal.aborted) throw timerController.signal.reason
      options.signal.throwIfAborted()
      throw error
    } finally {
      clearTimeout(timer)
      timerController.signal.removeEventListener('abort', forwardTimeout)
      options.signal.removeEventListener('abort', forwardExternalAbort)
      if (options.signal.aborted || timerController.signal.aborted) await this.stopWorker()
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async ensureContext(options: LocalSenseVoiceOptions): Promise<LocalSenseVoiceWorker> {
    const key = `${options.modelPath}\0${options.tokensPath}`
    if (this.worker?.alive === true && this.contextKey === key) return this.worker
    await this.stopWorker()
    let worker: LocalSenseVoiceWorker
    try {
      worker = this.createWorker()
    } catch (error) {
      throw new EarsError(EARS_ERROR_CODES.senseVoiceWorkerFailed, 'The SenseVoice worker could not start', {
        detail: sanitizeEarsErrorText(error instanceof Error ? error.message : String(error))
      })
    }
    this.worker = worker
    worker.onExit(() => {
      if (this.worker === worker) {
        this.worker = undefined
        this.contextKey = undefined
      }
    })
    try {
      await worker.request({ type: 'init', model: options.model, modelPath: options.modelPath, tokensPath: options.tokensPath }, { timeoutMs: 300_000 })
      this.contextKey = key
      return worker
    } catch (error) {
      worker.kill()
      if (this.worker === worker) this.worker = undefined
      this.contextKey = undefined
      throw error
    }
  }

  private async stopWorker(): Promise<void> {
    const worker = this.worker
    this.worker = undefined
    this.contextKey = undefined
    if (worker === undefined || !worker.alive) return
    await Promise.race([
      worker.shutdown(),
      new Promise<void>((resolve) => setTimeout(resolve, RELEASE_TIMEOUT_MS))
    ]).catch(() => undefined)
    if (worker.alive) worker.kill()
  }
}

let runtime = new LocalSenseVoiceRuntime()

export async function disposeSenseVoiceRuntime(): Promise<void> {
  await runtime.dispose()
  runtime = new LocalSenseVoiceRuntime()
}

export async function releaseSenseVoiceModelContext(): Promise<void> {
  await runtime.releaseContext()
}

export async function withSenseVoiceModelContextReleased<T>(operation: () => Promise<T>): Promise<T> {
  return runtime.withContextReleased(operation)
}

export function transcribeWithSenseVoice(options: LocalSenseVoiceOptions): Promise<string> {
  return runtime.transcribe(options)
}

export function transcribeWithSenseVoiceDetailed(options: LocalSenseVoiceOptions): Promise<LocalSenseVoiceTranscript> {
  return runtime.transcribeDetailed(options)
}

function rejectOnAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return raceAbort(promise, signal)
}

function raceAbort<T>(promise: Promise<T>, ...signals: AbortSignal[]): Promise<T> {
  const alreadyAborted = signals.find((signal) => signal.aborted)
  if (alreadyAborted !== undefined) return Promise.reject(alreadyAborted.reason)
  return new Promise<T>((resolve, reject) => {
    const cleanups: Array<() => void> = []
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      for (const cleanup of cleanups) cleanup()
      callback()
    }
    for (const signal of signals) {
      const onAbort = () => finish(() => reject(signal.reason))
      signal.addEventListener('abort', onAbort, { once: true })
      cleanups.push(() => signal.removeEventListener('abort', onAbort))
    }
    promise.then((value) => finish(() => resolve(value)), (error: unknown) => finish(() => reject(error)))
  })
}
