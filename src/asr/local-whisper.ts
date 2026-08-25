import { createRequire } from 'node:module'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import type { WhisperModelId } from '../config.js'
import { whisperModelPath, type WhisperModelState } from './whisper-models.js'
import type { LibVariant, TranscriptionJob, WhisperContext } from '@fugood/whisper.node'

const MAX_AUDIO_BYTES = 24 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 5_000
const TRANSCRIPTION_TIMEOUT_MS = 120_000
const nativeRequire = createRequire(import.meta.url)

function whisperNodeRequire(): NodeRequire {
  const entry = nativeRequire.resolve('@fugood/whisper.node')
  return createRequire(entry)
}

export const WHISPER_RESTART_REQUIRED_CODE = EARS_ERROR_CODES.whisperRestartRequired
export const WHISPER_NATIVE_UNAVAILABLE_CODE = EARS_ERROR_CODES.whisperNativeUnavailable

export class WhisperRestartRequiredError extends EarsError {
  readonly loadedVariant: LibVariant
  readonly requestedVariant: LibVariant

  constructor(loadedVariant: LibVariant, requestedVariant: LibVariant) {
    super(
      WHISPER_RESTART_REQUIRED_CODE,
      `Restart dsh to switch Local Whisper from "${loadedVariant}" to "${requestedVariant}"`,
      { loadedVariant, requestedVariant }
    )
    this.name = 'WhisperRestartRequiredError'
    this.loadedVariant = loadedVariant
    this.requestedVariant = requestedVariant
  }
}

export class WhisperNativeUnavailableError extends EarsError {
  readonly packageName: string

  constructor(packageName: string, cause: unknown) {
    super(
      WHISPER_NATIVE_UNAVAILABLE_CODE,
      `Whisper native package "${packageName}" is unavailable`,
      { packageName }
    )
    this.name = 'WhisperNativeUnavailableError'
    this.packageName = packageName
    Object.defineProperty(this, 'cause', {
      value: cause,
      configurable: true
    })
  }
}

interface WhisperNodeApi {
  loadWhisperModule(variant?: LibVariant): Promise<unknown>
  initWhisper(options: { filePath: string; useGpu?: boolean }, variant?: LibVariant): Promise<WhisperContext>
}

let nativeModulePromise: Promise<WhisperNodeApi> | undefined
let nativeLoadPromise: Promise<WhisperNodeApi> | undefined
let loadingVariant: LibVariant | undefined
let loadedVariant: LibVariant | undefined
let loadedNativeModule: WhisperNodeApi | undefined

export function whisperNativePackageName(
  variant: LibVariant = 'default',
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  const suffix = variant === 'default' ? '' : `-${variant}`
  return `@fugood/node-whisper-${platform}-${arch}${suffix}`
}

/**
 * Load and validate exactly the platform package requested by whisper.node.
 * This is only a preflight: inference still goes through @fugood/whisper.node.
 */
export function preflightWhisperNativePackage(
  variant: LibVariant = 'default',
  requirePackage?: NodeRequire
): string {
  const packageName = whisperNativePackageName(variant)
  try {
    const native = (requirePackage ?? whisperNodeRequire())(packageName) as { WhisperContext?: unknown } | undefined
    if (native === undefined || typeof native.WhisperContext !== 'function') {
      throw new Error('the package did not expose WhisperContext')
    }
  } catch (error) {
    throw new WhisperNativeUnavailableError(packageName, error)
  }
  return packageName
}

/** The variant that this process first initialized through the strict runtime. */
export function getLoadedWhisperVariant(): LibVariant | undefined {
  return loadedVariant
}

/**
 * The native binding is intentionally loaded only when local Whisper is used.
 * The first successful load fixes the process variant because whisper.node has
 * a global module cache that cannot be cleared by a Cordis scope dispose.
 */
async function loadNativeModule(variant: LibVariant): Promise<WhisperNodeApi> {
  for (;;) {
    if (loadedVariant !== undefined) {
      if (loadedVariant !== variant) throw new WhisperRestartRequiredError(loadedVariant, variant)
      if (loadedNativeModule === undefined) throw new Error('Whisper native module state is inconsistent')
      return loadedNativeModule
    }

    const pending = nativeLoadPromise
    if (pending !== undefined) {
      const pendingVariant = loadingVariant
      if (pendingVariant === variant) return pending

      // A different variant is only restart-required after the in-flight load
      // succeeds. If that first load fails, the requested variant still has a
      // chance to become the process's first successful native variant.
      try {
        await pending
      } catch {
        if (nativeLoadPromise === pending) nativeLoadPromise = undefined
        if (loadingVariant === pendingVariant) loadingVariant = undefined
      }
      continue
    }

    loadingVariant = variant
    const loadPromise = (async () => {
      preflightWhisperNativePackage(variant)
      const modulePromise = nativeModulePromise ??= import('@fugood/whisper.node')
      let native: WhisperNodeApi
      try {
        native = await modulePromise
      } catch (error) {
        if (nativeModulePromise === modulePromise) nativeModulePromise = undefined
        throw error
      }
      await native.loadWhisperModule(variant)
      loadedVariant = variant
      loadedNativeModule = native
      return native
    })()
    nativeLoadPromise = loadPromise
    try {
      return await loadPromise
    } finally {
      if (nativeLoadPromise === loadPromise) nativeLoadPromise = undefined
      if (loadingVariant === variant) loadingVariant = undefined
    }
  }
}

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

interface RuntimeContext {
  readonly key: string
  readonly context: WhisperContext
}

/**
 * A concrete, process-local whisper.node runtime. It owns one model context at
 * a time, serializes work on that context, and releases native resources on
 * disposal. It deliberately does not expose a generic ASR engine interface.
 */
export class LocalWhisperRuntime {
  private context: RuntimeContext | undefined
  private activeJob: TranscriptionJob | undefined
  private queue: Promise<void> = Promise.resolve()
  private disposed = false
  private loadedVariant: LibVariant | undefined

  async transcribe(options: LocalWhisperOptions): Promise<string> {
    if (this.disposed) throw new EarsError(EARS_ERROR_CODES.backendLocalUnavailable, 'Local Whisper has been disposed')
    const run = this.queue.then(() => this.transcribeNow(options))
    this.queue = run.then(() => undefined, () => undefined)
    return rejectOnAbort(run, options.signal)
  }

  async releaseContext(): Promise<void> {
    if (this.disposed) return
    await this.drainAndReleaseContext()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.drainAndReleaseContext()
  }

  private async drainAndReleaseContext(): Promise<void> {
    await this.activeJob?.stop().catch(() => undefined)
    await this.queue.catch(() => undefined)
    const context = this.context
    this.context = undefined
    this.activeJob = undefined
    await context?.context.release().catch(() => undefined)
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
    const context = await this.ensureContext(modelPath, variant, useGpu)
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
    options.signal.addEventListener('abort', forwardExternalAbort, { once: true })
    timeoutController.signal.addEventListener('abort', forwardTimeoutAbort, { once: true })

    try {
      options.signal.throwIfAborted()
      await writeFile(inputPath, options.audio)
      const job = context.transcribeFile(inputPath, {
        language: normalizeLanguage(options.language),
        translate: false,
        temperature: 0
      })
      this.activeJob = job
      const stopOnAbort = () => {
        void job.stop().catch(() => undefined)
      }
      combined.signal.addEventListener('abort', stopOnAbort, { once: true })
      try {
        const result = await job.promise
        if (timeoutController.signal.aborted) throw timeoutController.signal.reason
        options.signal.throwIfAborted()
        if (result.isAborted) throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'Local Whisper transcription was aborted')
        const text = result.result.trim()
        if (text === '') throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'Whisper returned no transcript')
        return text
      } catch (error) {
        if (timeoutController.signal.aborted) throw timeoutController.signal.reason
        options.signal.throwIfAborted()
        throw error
      } finally {
        combined.signal.removeEventListener('abort', stopOnAbort)
        if (this.activeJob === job) this.activeJob = undefined
      }
    } finally {
      clearTimeout(timer)
      options.signal.removeEventListener('abort', forwardExternalAbort)
      timeoutController.signal.removeEventListener('abort', forwardTimeoutAbort)
      await rm(directory, { recursive: true, force: true })
    }
  }

  private async ensureContext(modelPath: string, variant: LibVariant, useGpu: boolean): Promise<WhisperContext> {
    if (this.loadedVariant !== undefined && this.loadedVariant !== variant) {
      throw new WhisperRestartRequiredError(this.loadedVariant, variant)
    }
    const key = `${modelPath}\0${variant}\0${useGpu ? 'gpu' : 'cpu'}`
    if (this.context?.key === key) return this.context.context
    const previous = this.context
    this.context = undefined
    await previous?.context.release().catch(() => undefined)
    const native = await loadNativeModule(variant)
    this.loadedVariant = variant
    const context = await native.initWhisper({ filePath: modelPath, useGpu }, variant)
    this.context = { key, context }
    return context
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

export function defaultWhisperUseGpu(
  variant: LibVariant = 'default',
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): boolean {
  if (variant !== 'default') return true
  return platform === 'darwin' && arch === 'arm64'
}

export async function isWhisperAvailable(variant: LibVariant = 'default', signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), COMMAND_TIMEOUT_MS)
  let abortListener: (() => void) | undefined
  const abortPromise = signal === undefined
    ? undefined
    : new Promise<never>((_, reject) => {
        abortListener = () => reject(signal.reason)
        signal.addEventListener('abort', abortListener, { once: true })
        if (signal.aborted) abortListener()
      })
  try {
    const load = loadNativeModule(variant).then(() => true)
    return abortPromise === undefined ? await Promise.race([load, waitForTimeout(timeout.signal)]) : await Promise.race([load, abortPromise, waitForTimeout(timeout.signal)])
  } catch (error) {
    if (error instanceof WhisperRestartRequiredError) throw error
    return false
  } finally {
    clearTimeout(timer)
    if (abortListener !== undefined) signal?.removeEventListener('abort', abortListener)
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

function waitForTimeout(signal: AbortSignal): Promise<false> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    signal.addEventListener('abort', () => resolve(false), { once: true })
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
