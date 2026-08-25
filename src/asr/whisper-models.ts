import { createHash } from 'node:crypto'
import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createReadStream, constants } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { WHISPER_MODEL_IDS, type WhisperModelId } from '../config.js'
import { EARS_ERROR_CODES, type EarsErrorCode, type EarsErrorParams } from '../errors.js'

const DOWNLOAD_MARKER_SUFFIX = '.dsh-ears-done'
const DOWNLOAD_PARTIAL_SUFFIX = '.partial'
const DEFAULT_MODEL_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'
const MAX_MODEL_BYTES = 4 * 1024 * 1024 * 1024

export interface WhisperModelDefinition {
  readonly fileName: string
  readonly url: string
  readonly sha256: string
  readonly bytes: number
}

/**
 * The whisper.cpp GGML model manifest is intentionally owned by this package.
 * It is not read from Python, a CLI, or the installed native binding.
 */
export const WHISPER_MODEL_MANIFEST: Readonly<Record<WhisperModelId, WhisperModelDefinition>> = Object.freeze({
  tiny: {
    fileName: 'ggml-tiny.bin',
    url: `${DEFAULT_MODEL_BASE_URL}/ggml-tiny.bin`,
    sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
    bytes: 77691713
  },
  base: {
    fileName: 'ggml-base.bin',
    url: `${DEFAULT_MODEL_BASE_URL}/ggml-base.bin`,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
    bytes: 147951465
  },
  small: {
    fileName: 'ggml-small.bin',
    url: `${DEFAULT_MODEL_BASE_URL}/ggml-small.bin`,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
    bytes: 487601967
  },
  medium: {
    fileName: 'ggml-medium.bin',
    url: `${DEFAULT_MODEL_BASE_URL}/ggml-medium.bin`,
    sha256: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208',
    bytes: 1533763059
  },
  large: {
    fileName: 'ggml-large-v3.bin',
    url: `${DEFAULT_MODEL_BASE_URL}/ggml-large-v3.bin`,
    sha256: '64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2',
    bytes: 3095033483
  },
  turbo: {
    fileName: 'ggml-large-v3-turbo.bin',
    url: `${DEFAULT_MODEL_BASE_URL}/ggml-large-v3-turbo.bin`,
    sha256: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69',
    bytes: 1624555275
  }
})

export interface WhisperModelState {
  /** Whether the native whisper.node runtime is available. */
  runtimeAvailable: boolean
  downloaded: boolean
  downloading: boolean
  progress: number | null
  bytes: number | null
  totalBytes: number | null
  error: string | null
  errorCode?: EarsErrorCode
  errorParams?: EarsErrorParams
}

interface CompletionMarker {
  readonly version: 1
  readonly model: WhisperModelId
  readonly sha256: string
  readonly bytes: number
}

interface VerifiedFile {
  readonly size: number
  readonly mtimeMs: number
  readonly ctimeMs: number
  readonly sha256: string
}

interface DownloadHandle {
  readonly model: WhisperModelId
  readonly filePath: string
  readonly partialPath: string
  readonly markerPath: string
  readonly controller: AbortController
  progress: number
  bytes: number | null
  totalBytes: number | null
  error: string | null
  errorCode?: EarsErrorCode
  errorParams?: EarsErrorParams
  finished: boolean
  cancelRequested: boolean
  promise?: Promise<void>
}

const EMPTY_STATE: WhisperModelState = Object.freeze({
  runtimeAvailable: false,
  downloaded: false,
  downloading: false,
  progress: null,
  bytes: null,
  totalBytes: null,
  error: null
})

export interface WhisperModelsOptions {
  readonly platform?: NodeJS.Platform
  readonly env?: NodeJS.ProcessEnv
  readonly fetch?: typeof fetch
  readonly manifest?: Partial<Record<WhisperModelId, WhisperModelDefinition>>
}

export function whisperCacheDirectory(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.DSH_EARS_WHISPER_CACHE_DIR?.trim()
  if (explicit !== undefined && explicit !== '') return explicit

  if (platform === 'win32') {
    return join(env.LOCALAPPDATA ?? join(env.USERPROFILE ?? homedir(), 'AppData', 'Local'), 'dsh-ears', 'whisper')
  }
  if (platform === 'darwin') return join(env.HOME ?? homedir(), 'Library', 'Caches', 'dsh-ears', 'whisper')
  return join(env.XDG_CACHE_HOME ?? join(env.HOME ?? homedir(), '.cache'), 'dsh-ears', 'whisper')
}

export function whisperModelPath(model: WhisperModelId, platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  return join(whisperCacheDirectory(platform, env), WHISPER_MODEL_MANIFEST[model].fileName)
}

export function whisperModelMarkerPath(model: WhisperModelId, platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  return `${whisperModelPath(model, platform, env)}${DOWNLOAD_MARKER_SUFFIX}`
}

/**
 * Owns only the whisper.cpp model files. Native runtime probing and inference
 * belong to local-whisper.ts; this class never starts Python or a CLI.
 */
export class WhisperModels {
  private readonly platform: NodeJS.Platform
  private readonly env: NodeJS.ProcessEnv
  private readonly fetchImpl: typeof fetch | undefined
  private readonly manifest: Readonly<Record<WhisperModelId, WhisperModelDefinition>>
  private disposed = false
  private activeDownload: DownloadHandle | undefined
  private downloadSetup: Promise<void> = Promise.resolve()
  private readonly verifiedFiles = new Map<string, VerifiedFile>()

  constructor(options: WhisperModelsOptions = {}) {
    this.platform = options.platform ?? process.platform
    this.env = options.env ?? process.env
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.manifest = Object.freeze({ ...WHISPER_MODEL_MANIFEST, ...options.manifest })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const handle = this.activeDownload
    if (handle !== undefined && !handle.finished) {
      handle.cancelRequested = true
      handle.controller.abort()
      void handle.promise?.catch(() => undefined)
    }
  }

  async getWhisperModelState(model: WhisperModelId, runtimeAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed) return { ...EMPTY_STATE, runtimeAvailable }
    if (!isWhisperModelId(model)) return { ...EMPTY_STATE, runtimeAvailable }

    const handle = this.activeDownload
    if (handle !== undefined && handle.model === model) {
      if (!handle.finished || handle.error !== null) return stateFromHandle(handle, runtimeAvailable)
    }

    const definition = this.manifest[model]
    const filePath = this.modelPath(model, definition)
    const marker = `${filePath}${DOWNLOAD_MARKER_SUFFIX}`
    try {
      const info = await stat(filePath)
      const markerState = await this.readCompletionMarker(marker, model, definition)
      if (markerState === 'missing') {
        return errorState(runtimeAvailable, 'The model file exists but is not verified by dsh-ears; download it again.', EARS_ERROR_CODES.whisperModelUnverified)
      }
      if (markerState === 'invalid') {
        return errorState(runtimeAvailable, 'The dsh-ears model completion marker is invalid; download the model again.', EARS_ERROR_CODES.whisperModelUnverified)
      }
      if (info.size !== definition.bytes) {
        this.verifiedFiles.delete(filePath)
        return errorState(runtimeAvailable, 'The downloaded Whisper model has an unexpected size; download it again.', EARS_ERROR_CODES.whisperModelUnverified)
      }
      const verified = this.verifiedFiles.get(filePath)
      const digest = verified !== undefined && verified.size === info.size && verified.mtimeMs === info.mtimeMs && verified.ctimeMs === info.ctimeMs
        ? verified.sha256
        : await hashFile(filePath)
      if (digest !== definition.sha256) {
        this.verifiedFiles.delete(filePath)
        return errorState(runtimeAvailable, 'The downloaded Whisper model failed checksum verification; download it again.', EARS_ERROR_CODES.whisperModelUnverified)
      }
      this.verifiedFiles.set(filePath, { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, sha256: digest })
      return {
        runtimeAvailable,
        downloaded: true,
        downloading: false,
        progress: null,
        bytes: null,
        totalBytes: info.size,
        error: null
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        return errorState(
          runtimeAvailable,
          error instanceof Error ? error.message : 'Whisper model state query failed',
          EARS_ERROR_CODES.whisperStateQueryFailed,
          { detail: error instanceof Error ? error.message : 'Whisper model state query failed' }
        )
      }
      this.verifiedFiles.delete(filePath)
      await rm(marker, { force: true }).catch(() => undefined)
      await rm(`${filePath}${DOWNLOAD_PARTIAL_SUFFIX}`, { force: true }).catch(() => undefined)
      return {
        runtimeAvailable,
        downloaded: false,
        downloading: false,
        progress: null,
        bytes: null,
        totalBytes: null,
        error: null
      }
    }
  }

  async downloadWhisperModel(model: WhisperModelId, runtimeAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed) return { ...EMPTY_STATE, runtimeAvailable }
    if (!isWhisperModelId(model)) return { ...EMPTY_STATE, runtimeAvailable }

    const releaseSetup = await this.acquireDownloadSetup()
    try {
      if (this.disposed) return { ...EMPTY_STATE, runtimeAvailable }
      const active = this.activeDownload
      if (active !== undefined && !active.finished) {
        if (active.model === model) return stateFromHandle(active, runtimeAvailable)
        return {
          ...stateFromHandle(active, runtimeAvailable),
          error: 'Another Whisper model is already downloading.',
          errorCode: EARS_ERROR_CODES.whisperAlreadyDownloading
        }
      }

      const current = await this.getWhisperModelState(model, runtimeAvailable)
      if (this.disposed) return { ...EMPTY_STATE, runtimeAvailable }
      if (current.downloaded) return current

      const definition = this.manifest[model]
      const filePath = this.modelPath(model, definition)
      const handle: DownloadHandle = {
        model,
        filePath,
        partialPath: `${filePath}${DOWNLOAD_PARTIAL_SUFFIX}`,
        markerPath: `${filePath}${DOWNLOAD_MARKER_SUFFIX}`,
        controller: new AbortController(),
        progress: 0,
        bytes: 0,
        totalBytes: definition.bytes,
        error: null,
        finished: false,
        cancelRequested: false
      }
      this.verifiedFiles.delete(filePath)
      this.activeDownload = handle
      handle.promise = this.runDownload(handle, definition, current.errorCode === EARS_ERROR_CODES.whisperModelUnverified)
      void handle.promise.catch(() => undefined)
      return stateFromHandle(handle, runtimeAvailable)
    } finally {
      releaseSetup()
    }
  }

  async cancelWhisperModelDownload(model: WhisperModelId, runtimeAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed) return { ...EMPTY_STATE, runtimeAvailable }
    const handle = this.activeDownload
    if (handle === undefined || handle.model !== model || handle.finished) {
      return this.getWhisperModelState(model, runtimeAvailable)
    }

    handle.cancelRequested = true
    handle.controller.abort()
    await handle.promise?.catch(() => undefined)
    return stateFromHandle(handle, runtimeAvailable).error === null
      ? { runtimeAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null }
      : stateFromHandle(handle, runtimeAvailable)
  }

  async deleteWhisperModel(model: WhisperModelId, runtimeAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed) return { ...EMPTY_STATE, runtimeAvailable }
    if (!isWhisperModelId(model)) return { ...EMPTY_STATE, runtimeAvailable }
    const handle = this.activeDownload
    if (handle !== undefined && handle.model === model && !handle.finished) {
      return { ...stateFromHandle(handle, runtimeAvailable), error: 'The model is still downloading.', errorCode: EARS_ERROR_CODES.whisperStillDownloading }
    }

    try {
      const filePath = this.modelPath(model, this.manifest[model])
      this.verifiedFiles.delete(filePath)
      await rm(filePath, { force: true })
      await rm(`${filePath}${DOWNLOAD_PARTIAL_SUFFIX}`, { force: true })
      await rm(`${filePath}${DOWNLOAD_MARKER_SUFFIX}`, { force: true })
      return {
        runtimeAvailable,
        downloaded: false,
        downloading: false,
        progress: null,
        bytes: null,
        totalBytes: null,
        error: null
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return errorState(runtimeAvailable, detail, EARS_ERROR_CODES.whisperDeleteFailed, { detail })
    }
  }

  private async acquireDownloadSetup(): Promise<() => void> {
    const previous = this.downloadSetup
    let release!: () => void
    this.downloadSetup = new Promise((resolve) => { release = resolve })
    await previous
    return release
  }

  private modelPath(model: WhisperModelId, definition: WhisperModelDefinition): string {
    return join(whisperCacheDirectory(this.platform, this.env), definition.fileName)
  }

  private async runDownload(handle: DownloadHandle, definition: WhisperModelDefinition, removeUnverified: boolean): Promise<void> {
    try {
      handle.controller.signal.throwIfAborted()
      await mkdir(dirname(handle.filePath), { recursive: true })
      await rm(handle.partialPath, { force: true })
      if (removeUnverified) {
        await rm(handle.filePath, { force: true })
        await rm(handle.markerPath, { force: true })
      }
      handle.controller.signal.throwIfAborted()
      if (this.fetchImpl === undefined) throw new Error('The Node fetch API is unavailable')
      const url = modelUrl(definition, this.env)
      const response = await this.fetchImpl(url, { signal: handle.controller.signal, redirect: 'follow' })
      if (!response.ok) throw new Error(`Whisper model download failed with HTTP ${response.status}`)
      if (response.body === null) throw new Error('Whisper model download returned an empty body')

      const contentLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength > 0) handle.totalBytes = contentLength
      if (handle.totalBytes !== null && handle.totalBytes > MAX_MODEL_BYTES) throw new Error('Whisper model is too large')
      handle.controller.signal.throwIfAborted()

      const file = await open(handle.partialPath, 'w')
      const hash = createHash('sha256')
      try {
        const reader = response.body.getReader()
        let streamCompleted = false
        const cancelReader = () => { void reader.cancel(handle.controller.signal.reason).catch(() => undefined) }
        handle.controller.signal.addEventListener('abort', cancelReader, { once: true })
        try {
          while (true) {
            handle.controller.signal.throwIfAborted()
            const chunk = await reader.read()
            if (chunk.done) {
              streamCompleted = true
              break
            }
            if (chunk.value === undefined) continue
            const bytes = Buffer.from(chunk.value)
            const nextBytes = (handle.bytes ?? 0) + bytes.byteLength
            if (nextBytes > MAX_MODEL_BYTES) throw new Error('Whisper model is too large')
            if (nextBytes > definition.bytes) throw new Error(`Whisper model size mismatch: expected ${definition.bytes} bytes, received more`)
            await file.write(bytes)
            hash.update(bytes)
            handle.bytes = nextBytes
            handle.progress = handle.totalBytes === null || handle.totalBytes === 0
              ? 0
              : Math.min(1, handle.bytes / handle.totalBytes)
          }
        } finally {
          handle.controller.signal.removeEventListener('abort', cancelReader)
          if (!streamCompleted) await reader.cancel(handle.controller.signal.reason).catch(() => undefined)
        }
      } finally {
        await file.close()
      }

      handle.controller.signal.throwIfAborted()
      if (handle.bytes !== definition.bytes) throw new Error(`Whisper model size mismatch: expected ${definition.bytes} bytes, received ${handle.bytes ?? 0}`)
      const digest = hash.digest('hex')
      if (digest !== definition.sha256) throw new Error('Whisper model checksum verification failed')

      await rm(handle.filePath, { force: true })
      handle.controller.signal.throwIfAborted()
      await rename(handle.partialPath, handle.filePath)
      handle.controller.signal.throwIfAborted()
      await writeFile(handle.markerPath, JSON.stringify({ version: 1, model: handle.model, sha256: definition.sha256, bytes: definition.bytes } satisfies CompletionMarker), 'utf8')
      handle.progress = 1
      handle.bytes = definition.bytes
      handle.totalBytes = definition.bytes
    } catch (error) {
      if (!handle.cancelRequested && !isAbortError(error)) {
        const detail = error instanceof Error ? error.message : String(error)
        handle.error = detail
        handle.errorCode = EARS_ERROR_CODES.whisperDownloadFailed
        handle.errorParams = { detail }
      }
      await this.removeArtifacts(handle).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error)
        handle.error = `${handle.error ?? 'Whisper model download failed'}; cleanup failed: ${detail}`
        handle.errorCode = EARS_ERROR_CODES.whisperDownloadCleanupFailed
        handle.errorParams = { detail }
      })
      if (handle.cancelRequested && handle.errorCode === undefined) {
        handle.error = null
        delete handle.errorParams
      }
      throw error
    } finally {
      handle.finished = true
    }
  }

  private async removeArtifacts(handle: DownloadHandle): Promise<void> {
    await Promise.all([
      rm(handle.partialPath, { force: true }),
      rm(handle.filePath, { force: true }),
      rm(handle.markerPath, { force: true })
    ])
  }

  private async readCompletionMarker(path: string, model: WhisperModelId, definition: WhisperModelDefinition): Promise<'valid' | 'missing' | 'invalid'> {
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch (error) {
      if (isMissingFile(error)) return 'missing'
      throw error
    }
    try {
      const marker = JSON.parse(text) as Partial<CompletionMarker>
      return marker.version === 1 && marker.model === model && marker.sha256 === definition.sha256 && marker.bytes === definition.bytes ? 'valid' : 'invalid'
    } catch {
      return 'invalid'
    }
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function modelUrl(definition: WhisperModelDefinition, env: NodeJS.ProcessEnv): string {
  const base = env.DSH_EARS_WHISPER_MODEL_BASE_URL?.trim()
  if (base === undefined || base === '') return definition.url
  return `${base.replace(/\/+$/, '')}/${definition.fileName}`
}

function isWhisperModelId(value: string): value is WhisperModelId {
  return (WHISPER_MODEL_IDS as readonly string[]).includes(value)
}

function stateFromHandle(handle: DownloadHandle, runtimeAvailable: boolean): WhisperModelState {
  return {
    runtimeAvailable,
    downloaded: false,
    downloading: !handle.finished,
    progress: handle.progress,
    bytes: handle.bytes,
    totalBytes: handle.totalBytes,
    error: handle.error,
    ...(handle.errorCode === undefined ? {} : { errorCode: handle.errorCode }),
    ...(handle.errorParams === undefined ? {} : { errorParams: handle.errorParams })
  }
}

function errorState(runtimeAvailable: boolean, error: string, errorCode: EarsErrorCode, errorParams?: EarsErrorParams): WhisperModelState {
  return {
    runtimeAvailable,
    downloaded: false,
    downloading: false,
    progress: null,
    bytes: null,
    totalBytes: null,
    error,
    errorCode,
    ...(errorParams === undefined ? {} : { errorParams })
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}
