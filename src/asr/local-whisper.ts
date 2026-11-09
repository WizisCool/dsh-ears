import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { LibVariant } from '@fugood/whisper.node'
import { EARS_ERROR_CODES, EarsError, sanitizeEarsErrorText } from '../errors.js'
import type { WhisperModelId } from '../config.js'
import { whisperModelPath, type WhisperModelState } from './whisper-models.js'
import { defaultWhisperUseGpu, preflightWhisperNativePackage, WhisperRestartRequiredError, type WhisperPackageResolver } from './whisper-native.js'
import { spawnWhisperWorker, type LocalWhisperWorker } from './whisper-worker-client.js'

export {
  WHISPER_NATIVE_UNAVAILABLE_CODE,
  WHISPER_NATIVE_VARIANTS,
  WHISPER_RESTART_REQUIRED_CODE,
  WhisperNativeUnavailableError,
  WhisperRestartRequiredError,
  defaultWhisperUseGpu,
  platformWhisperVariants,
  preflightWhisperNativePackage,
  resolveWhisperNativePackage,
  whisperAccelerationCapabilities,
  whisperNativePackageName,
  type WhisperAccelerationCapabilities,
  type WhisperPackageResolver
} from './whisper-native.js'

const MAX_AUDIO_BYTES = 24 * 1024 * 1024
const TRANSCRIPTION_TIMEOUT_MS = 120_000
const CANCEL_GRACE_MS = 5_000
const RELEASE_TIMEOUT_MS = 10_000

export interface LocalWhisperOptions {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly language: string
  readonly model: WhisperModelId
  readonly signal: AbortSignal
  /** Optional test/integration override; production uses the managed model path. */
  readonly modelPath?: string
  /** Native backend variant; default uses the platform default binary. */
  readonly variant?: LibVariant
  /** Defaults to Metal on macOS arm64, and to the explicit GPU variants elsewhere. */
  readonly useGpu?: boolean
  readonly timeoutMs?: number
}

/** The Host-side face of one sacrificial Whisper worker process. */
export type WhisperWorkerFactory = () => LocalWhisperWorker

/**
 * Process-local Whisper worker supervisor. It owns no native context: the
 * worker process does. This class serializes work, keeps the acceleration
 * variant stable, and turns a worker crash into one failed request instead of
 * a fatal Host assertion.
 */
export class LocalWhisperRuntime {
  private worker: LocalWhisperWorker | undefined
  private contextKey: string | undefined
  private loadedVariant: LibVariant | undefined
  private queue: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(private readonly createWorker: WhisperWorkerFactory = () => spawnWhisperWorker()) {}

  getLoadedVariant(): LibVariant | undefined {
    return this.loadedVariant
  }

  async transcribe(options: LocalWhisperOptions): Promise<string> {
    if (this.disposed) throw new EarsError(EARS_ERROR_CODES.backendLocalUnavailable, 'Local Whisper has been disposed')
    const run = this.queue.then(() => this.transcribeNow(options))
    this.queue = run.then(() => undefined, () => undefined)
    return rejectOnAbort(run, options.signal)
  }

  async releaseContext(): Promise<void> {
    if (this.disposed) return
    await this.withContextReleased(async () => undefined)
  }

  /**
   * Run an operation while no transcription can start between releasing the
   * native context and the operation. This is the model-deletion barrier.
   */
  async withContextReleased<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue
    const run = previous.then(async () => {
      await this.releaseContextNow()
      return operation()
    })
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    // An active native call may still be running. Ask the worker to stop it,
    // then bound the drain: an unresponsive child is killed before shutdown.
    this.worker?.cancelActive()
    const killTimer = setTimeout(() => this.worker?.kill(), CANCEL_GRACE_MS)
    try {
      await this.queue.catch(() => undefined)
    } finally {
      clearTimeout(killTimer)
    }
    const worker = this.worker
    this.worker = undefined
    this.contextKey = undefined
    if (worker === undefined) return
    try {
      await worker.shutdown()
    } catch (error) {
      reportWorkerDiagnostic(`The Local Whisper worker could not shut down cleanly: ${sanitizeEarsErrorText(errorText(error))}`)
    }
  }

  private async releaseContextNow(): Promise<void> {
    const worker = this.worker
    this.contextKey = undefined
    if (worker === undefined) return
    if (!worker.alive) {
      if (this.worker === worker) this.worker = undefined
      return
    }
    try {
      await worker.request({ type: 'release' }, { timeoutMs: RELEASE_TIMEOUT_MS })
    } catch (error) {
      // A dead worker released the context with its process. A live but
      // unresponsive one cannot be trusted with the model file, so force the
      // context away before reporting the failed barrier.
      if (!worker.alive) {
        if (this.worker === worker) this.worker = undefined
        return
      }
      if (error instanceof EarsError && error.code === EARS_ERROR_CODES.whisperReleaseFailed) throw error
      worker.kill()
      throw new EarsError(
        EARS_ERROR_CODES.whisperReleaseFailed,
        'The Local Whisper model context could not be released',
        { detail: sanitizeEarsErrorText(errorText(error)) }
      )
    }
  }

  private async transcribeNow(options: LocalWhisperOptions): Promise<string> {
    if (this.disposed) throw new EarsError(EARS_ERROR_CODES.backendLocalUnavailable, 'Local Whisper has been disposed')
    options.signal.throwIfAborted()
    if (options.audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
    if (options.audio.byteLength > MAX_AUDIO_BYTES) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large')
    assertPcm16Wav(options.audio, options.mimeType)
    options.signal.throwIfAborted()

    const modelPath = options.modelPath ?? whisperModelPath(options.model)
    const variant = options.variant ?? 'default'
    if (this.loadedVariant !== undefined && this.loadedVariant !== variant) {
      throw new WhisperRestartRequiredError(this.loadedVariant, variant)
    }
    const useGpu = options.useGpu ?? defaultWhisperUseGpu(variant)
    const worker = await this.ensureContext(modelPath, variant, useGpu)
    const directory = await mkdtemp(join(tmpdir(), 'dsh-ears-whisper-node-'))
    const inputPath = join(directory, 'recording.wav')
    const timeoutController = new AbortController()
    const timer = setTimeout(() => timeoutController.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Local Whisper transcription request timed out')), options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS)
    const combined = new AbortController()
    const forwardAbort = (signal: AbortSignal) => {
      if (!combined.signal.aborted) combined.abort(signal.reason)
    }
    const forwardExternalAbort = () => forwardAbort(options.signal)
    const forwardTimeoutAbort = () => forwardAbort(timeoutController.signal)
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const stopOnAbort = () => {
      worker.cancelActive()
      // A native call that ignores cooperative cancellation must not wedge the
      // serial queue forever; the worker is sacrificial by design.
      killTimer = setTimeout(() => worker.kill(), CANCEL_GRACE_MS)
    }
    options.signal.addEventListener('abort', forwardExternalAbort, { once: true })
    timeoutController.signal.addEventListener('abort', forwardTimeoutAbort, { once: true })
    combined.signal.addEventListener('abort', stopOnAbort, { once: true })

    try {
      options.signal.throwIfAborted()
      await writeFile(inputPath, options.audio)
      combined.signal.throwIfAborted()
      const request = worker.request({
        type: 'transcribe',
        audioPath: inputPath,
        language: normalizeLanguage(options.language) ?? null
      })
      // The abort listener may have run before the request registered its id,
      // in which case cancelActive() had nothing to cancel.
      if (combined.signal.aborted) worker.cancelActive()
      const value = await request
      if (timeoutController.signal.aborted) throw timeoutController.signal.reason
      options.signal.throwIfAborted()
      if (value.kind !== 'text') throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Local Whisper returned no transcription result')
      if (value.isAborted) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Local Whisper transcription was aborted')
      const text = value.text.trim()
      if (text === '') throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'Whisper returned no transcript')
      return text
    } catch (error) {
      if (timeoutController.signal.aborted) throw timeoutController.signal.reason
      options.signal.throwIfAborted()
      throw error
    } finally {
      clearTimeout(timer)
      if (killTimer !== undefined) clearTimeout(killTimer)
      options.signal.removeEventListener('abort', forwardExternalAbort)
      timeoutController.signal.removeEventListener('abort', forwardTimeoutAbort)
      combined.signal.removeEventListener('abort', stopOnAbort)
      await rm(directory, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async ensureContext(modelPath: string, variant: LibVariant, useGpu: boolean): Promise<LocalWhisperWorker> {
    if (this.loadedVariant !== undefined && this.loadedVariant !== variant) {
      throw new WhisperRestartRequiredError(this.loadedVariant, variant)
    }
    const key = `${modelPath}\0${variant}\0${useGpu ? 'gpu' : 'cpu'}`
    const current = this.worker
    if (current?.alive === true && this.contextKey === key) return current

    const worker = this.ensureWorker()
    // The worker releases any superseded context before loading this one, so
    // the old key no longer describes worker state once init is in flight.
    this.contextKey = undefined
    await worker.request({ type: 'init', modelPath, variant, useGpu })
    this.contextKey = key
    this.loadedVariant = variant
    return worker
  }

  private ensureWorker(): LocalWhisperWorker {
    const current = this.worker
    if (current?.alive === true) return current
    let worker: LocalWhisperWorker
    try {
      worker = this.createWorker()
    } catch (error) {
      if (error instanceof EarsError) throw error
      throw new EarsError(
        EARS_ERROR_CODES.whisperWorkerFailed,
        'The Local Whisper worker process could not start',
        { detail: sanitizeEarsErrorText(errorText(error)) }
      )
    }
    this.worker = worker
    worker.onExit(() => {
      if (this.worker === worker) {
        this.worker = undefined
        this.contextKey = undefined
      }
    })
    return worker
  }
}

let runtime = new LocalWhisperRuntime()

export async function disposeWhisperRuntime(): Promise<void> {
  await runtime.dispose()
  runtime = new LocalWhisperRuntime()
}

export async function releaseWhisperModelContext(): Promise<void> {
  await runtime.releaseContext()
}

export async function withWhisperModelContextReleased<T>(operation: () => Promise<T>): Promise<T> {
  return runtime.withContextReleased(operation)
}

/** The variant the Host has committed to for this process. */
export function getLoadedWhisperVariant(): LibVariant | undefined {
  return runtime.getLoadedVariant()
}

/** Check the exact native package by resolution only; the worker loads it. */
export async function isWhisperAvailable(variant: LibVariant = 'default', signal?: AbortSignal, resolver?: WhisperPackageResolver): Promise<boolean> {
  if (signal?.aborted) return false
  const loaded = runtime.getLoadedVariant()
  if (loaded !== undefined && loaded !== variant) {
    throw new WhisperRestartRequiredError(loaded, variant)
  }
  try {
    if (signal?.aborted) return false
    preflightWhisperNativePackage(variant, resolver)
    return true
  } catch (error) {
    if (error instanceof WhisperRestartRequiredError) throw error
    return false
  }
}

export function validateWhisperTranscription(state: WhisperModelState): void {
  if (!state.runtimeAvailable) throw new EarsError(EARS_ERROR_CODES.whisperNativeUnavailable, 'The selected Local Whisper native runtime is unavailable')
  if (state.error !== null) throw new EarsError(EARS_ERROR_CODES.whisperStateQueryFailed, `The Whisper model state could not be verified: ${state.error}`, { detail: state.error })
  if (!state.downloaded) throw new EarsError(EARS_ERROR_CODES.whisperModelNotDownloaded, 'The Whisper model is not downloaded, download it on the dsh-ears settings page before recording')
}

export async function transcribeWithWhisper(options: LocalWhisperOptions): Promise<string> {
  return runtime.transcribe(options)
}

function reportWorkerDiagnostic(message: string): void {
  console.warn(`[dsh-ears] ${sanitizeEarsErrorText(message)}`)
}

function rejectOnAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    const onAbort = () => {
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }
    promise.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error: unknown) => {
        cleanup()
        reject(error)
      }
    )
  })
}

function normalizeLanguage(language: string): string | undefined {
  const value = language.trim().split('-', 1)[0]
  return value === '' ? undefined : value
}

function assertPcm16Wav(audio: Uint8Array, mimeType: string): void {
  const normalized = mimeType.toLowerCase().split(';', 1)[0]
  if (normalized !== 'audio/wav' && normalized !== 'audio/x-wav') {
    throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'Local Whisper expects browser-normalized PCM16 WAV audio')
  }
  if (!isPcm16Mono16kWav(audio)) {
    throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'Local Whisper expects a 16 kHz mono PCM16 WAV file')
  }
}

function isPcm16Mono16kWav(audio: Uint8Array): boolean {
  if (audio.byteLength < 44 || ascii(audio, 0, 4) !== 'RIFF' || ascii(audio, 8, 4) !== 'WAVE') return false
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength)
  let offset = 12
  let validFormat = false
  let hasData = false
  while (offset + 8 <= audio.byteLength) {
    const chunk = ascii(audio, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (body + size > audio.byteLength) return false
    if (chunk === 'fmt ' && size >= 16) {
      validFormat = view.getUint16(body, true) === 1 && view.getUint16(body + 2, true) === 1 && view.getUint32(body + 4, true) === 16000 && view.getUint16(body + 14, true) === 16
    }
    if (chunk === 'data' && size > 0) hasData = true
    offset = body + size + (size % 2)
  }
  return validFormat && hasData
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
