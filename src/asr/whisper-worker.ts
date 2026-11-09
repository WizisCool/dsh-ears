import { createRequire } from 'node:module'
import type { LibVariant, TranscriptionJob, WhisperContext } from '@fugood/whisper.node'
import { EARS_ERROR_CODES, EarsError, isEarsErrorCode, sanitizeEarsErrorText, type EarsErrorParams } from '../errors.js'
import { whisperNativePackageName, WhisperNativeUnavailableError, WhisperRestartRequiredError } from './whisper-native.js'
import type { WhisperWorkerError, WhisperWorkerRequest, WhisperWorkerResponse, WhisperWorkerValue } from './whisper-worker-protocol.js'

/**
 * Sacrificial Local Whisper runtime.
 *
 * The native binding lives only in this process. A GPU teardown assertion or
 * any other SIGABRT is process-fatal and cannot be caught in JavaScript, so
 * hosting it in DSH would take down the whole Host and every session. This
 * worker owns the model context, releases it explicitly on every exit path,
 * and lets the Host treat a crash as one failed recognition request.
 *
 * Lifecycle: the Host serializes requests, so at most one transcription is
 * active. `init` releases a superseded context before loading another one,
 * `cancel` stops the active native job, `release` is the model-deletion
 * barrier, and `shutdown` releases everything before a normal Node exit.
 */

interface WhisperNodeApi {
  loadWhisperModule(variant?: LibVariant): Promise<unknown>
  initWhisper(options: { filePath: string; useGpu?: boolean }, variant?: LibVariant): Promise<WhisperContext>
}

type RuntimeContext = {
  readonly key: string
  readonly context: WhisperContext
}

const nativeRequire = createRequire(import.meta.url)

let api: WhisperNodeApi | undefined
let apiVariant: LibVariant | undefined
let loadedVariant: LibVariant | undefined
let runtime: RuntimeContext | undefined
let activeJob: TranscriptionJob | undefined
let shuttingDown = false

process.on('message', (message) => {
  void handleMessage(message)
})

// The Host's IPC channel closes when its process dies. Releasing here keeps a
// surviving worker from retaining a GPU context after an abrupt Host exit.
process.on('disconnect', () => {
  void disconnectAndExit()
})

// A terminal Ctrl+C reaches the whole process group. Release before leaving so
// the usual developer shutdown does not abort inside Metal teardown.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void disconnectAndExit()
  })
}

async function handleMessage(message: unknown): Promise<void> {
  if (!isWhisperWorkerRequest(message) || shuttingDown) return
  if (message.type === 'shutdown') {
    shuttingDown = true
    let error: WhisperWorkerError | undefined
    try {
      await releaseContext()
    } catch (caught) {
      error = serializeError(caught)
      process.stderr.write(`[dsh-ears] ${error.message}\n`)
    }
    sendFinal(message.id, error)
    return
  }

  try {
    const value = await runRequest(message)
    send({ type: 'response', id: message.id, ok: true, value })
  } catch (error) {
    send({ type: 'response', id: message.id, ok: false, error: serializeError(error) })
  }
}

async function runRequest(request: WhisperWorkerRequest): Promise<WhisperWorkerValue> {
  switch (request.type) {
    case 'init':
      await initContext(request.modelPath, request.variant, request.useGpu)
      return { kind: 'none' }
    case 'transcribe':
      return transcribe(request.audioPath, request.language)
    case 'cancel':
      await cancelActiveJob()
      return { kind: 'none' }
    case 'release':
      await releaseContext()
      return { kind: 'none' }
    case 'shutdown':
      return { kind: 'none' }
  }
}

async function initContext(modelPath: string, variant: LibVariant, useGpu: boolean): Promise<void> {
  const key = `${modelPath}\0${variant}\0${useGpu ? 'gpu' : 'cpu'}`
  if (runtime?.key === key) return
  if (loadedVariant !== undefined && loadedVariant !== variant) {
    throw new WhisperRestartRequiredError(loadedVariant, variant)
  }
  if (runtime !== undefined) await releaseContext()
  const native = await loadWhisperNodeApi(variant)
  const context = await native.initWhisper({ filePath: modelPath, useGpu }, variant)
  runtime = { key, context }
}

async function transcribe(audioPath: string, language: string | null): Promise<WhisperWorkerValue> {
  if (runtime === undefined) {
    throw new EarsError(EARS_ERROR_CODES.backendLocalUnavailable, 'Local Whisper has no model context')
  }
  if (activeJob !== undefined) {
    throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'A Local Whisper transcription is already running')
  }

  const job = runtime.context.transcribeFile(audioPath, {
    language: language ?? undefined,
    translate: false,
    temperature: 0
  })
  activeJob = job
  try {
    const result = await job.promise
    return { kind: 'text', text: result.result, isAborted: result.isAborted }
  } finally {
    if (activeJob === job) activeJob = undefined
  }
}

async function cancelActiveJob(): Promise<void> {
  const job = activeJob
  if (job === undefined) return
  try {
    await job.stop()
  } catch {
    // The transcribe response carries the outcome; a failed stop is not fatal.
  }
}

async function releaseContext(): Promise<void> {
  const current = runtime
  if (current === undefined) return
  try {
    await current.context.release()
  } catch (error) {
    throw new EarsError(
      EARS_ERROR_CODES.whisperReleaseFailed,
      'The Local Whisper worker could not release its model context',
      { detail: sanitizeEarsErrorText(errorText(error)) }
    )
  }
  if (runtime === current) runtime = undefined
}

async function loadWhisperNodeApi(variant: LibVariant): Promise<WhisperNodeApi> {
  if (api !== undefined && apiVariant === variant) return api
  if (loadedVariant !== undefined && loadedVariant !== variant) {
    throw new WhisperRestartRequiredError(loadedVariant, variant)
  }
  const packageName = whisperNativePackageName(variant)
  try {
    const native = nativeRequire(packageName) as { WhisperContext?: unknown } | undefined
    if (native === undefined || typeof native.WhisperContext !== 'function') {
      throw new Error('the package did not expose WhisperContext')
    }
  } catch (error) {
    throw new WhisperNativeUnavailableError(packageName, error)
  }
  const module = await import('@fugood/whisper.node') as WhisperNodeApi
  await module.loadWhisperModule(variant)
  // Loading fixes the process variant even when a later init() fails, so the
  // restart rule survives a failed model load.
  loadedVariant = variant
  api = module
  apiVariant = variant
  return module
}

async function disconnectAndExit(): Promise<void> {
  shuttingDown = true
  // Never let a stuck native call hold the worker past the Host's shutdown
  // budget. Exiting with a live context can abort, but only this process dies.
  setTimeout(() => process.exit(1), 4_000).unref()
  try {
    await cancelActiveJob()
  } catch {
    // Best effort: the Host is already gone.
  }
  try {
    await releaseContext()
  } catch {
    // The process exit below is the final barrier.
  }
  process.exit(0)
}

function send(message: WhisperWorkerResponse): void {
  if (typeof process.send !== 'function' || !process.connected) return
  process.send(message, () => undefined)
}

function sendFinal(id: number, error: WhisperWorkerError | undefined): void {
  const response: WhisperWorkerResponse = error === undefined
    ? { type: 'response', id, ok: true, value: { kind: 'none' } }
    : { type: 'response', id, ok: false, error }
  const exit = () => process.exit(error === undefined ? 0 : 1)
  if (typeof process.send !== 'function' || !process.connected) {
    exit()
    return
  }
  process.send(response, () => exit())
  // The channel callback can be dropped when the Host is tearing down; the
  // context is already released, so exiting is container-safe.
  setTimeout(exit, 500).unref()
}

function serializeError(error: unknown): WhisperWorkerError {
  const message = sanitizeEarsErrorText(errorText(error))
  const record = error !== null && typeof error === 'object' ? error as { code?: unknown; params?: unknown } : {}
  const code = typeof record.code === 'string' && isEarsErrorCode(record.code) ? record.code : undefined
  const params = isEarsErrorParams(record.params) ? record.params : undefined
  return {
    message,
    ...(code === undefined ? {} : { code }),
    ...(params === undefined ? {} : { params })
  }
}

function isEarsErrorParams(value: unknown): value is EarsErrorParams {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === 'string' || typeof entry === 'number')
}

function isWhisperWorkerRequest(value: unknown): value is WhisperWorkerRequest {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'number') return false
  if (record.type === 'init') {
    return typeof record.modelPath === 'string' && (record.variant === 'default' || record.variant === 'vulkan' || record.variant === 'cuda') && typeof record.useGpu === 'boolean'
  }
  if (record.type === 'transcribe') {
    return typeof record.audioPath === 'string' && (record.language === null || typeof record.language === 'string')
  }
  return record.type === 'cancel' || record.type === 'release' || record.type === 'shutdown'
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
