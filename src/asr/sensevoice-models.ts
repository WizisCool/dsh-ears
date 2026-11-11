import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_RECOGNITION_SETTINGS, isValidLocalModelBaseUrl, type SenseVoiceModelId } from '../settings/recognition.js'
import { EARS_ERROR_CODES } from '../errors.js'
import type { EarsErrorCode } from '../errors.js'
import type { WhisperModelState } from './whisper-models.js'

const MODEL_CACHE_SUFFIX = 'sensevoice'
const PARTIAL_SUFFIX = '.partial'
const MARKER_NAME = '.dsh-ears-sensevoice.json'
const MAX_RESPONSE_BYTES = 1024 * 1024 * 1024

export interface SenseVoiceModelFile {
  readonly fileName: string
  readonly bytes: number
  readonly sha256: string
}

export interface SenseVoiceModelDefinition {
  readonly label: string
  readonly model: SenseVoiceModelFile
  readonly tokens: SenseVoiceModelFile
}

const TOKENS: SenseVoiceModelFile = Object.freeze({
  fileName: 'tokens.txt',
  bytes: 315_894,
  sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc'
})

/** The pinned sherpa-onnx export of SenseVoice Small; hashes match the upstream files. */
export const SENSEVOICE_MODEL_MANIFEST: Readonly<Record<SenseVoiceModelId, SenseVoiceModelDefinition>> = Object.freeze({
  'small-int8': Object.freeze({
    label: 'SenseVoice Small · ONNX INT8',
    model: Object.freeze({
      fileName: 'model.int8.onnx',
      bytes: 239_233_841,
      sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51'
    }),
    tokens: TOKENS
  }),
  'small-fp32': Object.freeze({
    label: 'SenseVoice Small · ONNX FP32',
    model: Object.freeze({
      fileName: 'model.onnx',
      bytes: 937_617_178,
      sha256: '977016bd9c79f9eb343430b5cc305e07ab64d5212dff41b0dcfa1694bee9a8cb'
    }),
    tokens: TOKENS
  })
})

type DownloadHandle = {
  readonly model: SenseVoiceModelId
  readonly directory: string
  readonly baseUrl: string
  readonly controller: AbortController
  readonly totalBytes: number
  bytes: number
  progress: number
  error: string | null
  errorCode?: EarsErrorCode
  finished: boolean
  cancelRequested: boolean
  promise?: Promise<void>
}

type CompletionMarker = {
  readonly version: 1
  readonly model: SenseVoiceModelId
  readonly files: readonly { readonly fileName: string; readonly bytes: number; readonly sha256: string }[]
}

export interface SenseVoiceModelsOptions {
  readonly directory?: string
  readonly fetch?: typeof fetch
  readonly manifest?: Partial<Record<SenseVoiceModelId, SenseVoiceModelDefinition>>
}

/** Downloads and verifies the two files needed by one SenseVoice ONNX variant. */
export class SenseVoiceModels {
  private readonly directory: string
  private readonly fetchImpl: typeof fetch | undefined
  private readonly manifest: Readonly<Record<SenseVoiceModelId, SenseVoiceModelDefinition>>
  private activeDownload: DownloadHandle | undefined
  private downloadSetup: Promise<void> = Promise.resolve()
  private disposed = false
  private readonly verifiedFiles = new Map<string, VerifiedFile>()

  constructor(options: SenseVoiceModelsOptions = {}) {
    this.directory = options.directory ?? senseVoiceCacheDirectory()
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.manifest = Object.freeze({ ...SENSEVOICE_MODEL_MANIFEST, ...options.manifest })
  }

  dispose(): void {
    this.disposed = true
    const handle = this.activeDownload
    if (handle !== undefined && !handle.finished) {
      handle.cancelRequested = true
      handle.controller.abort()
      void handle.promise?.catch(() => undefined)
    }
  }

  async getModelState(model: string, baseUrl: string, runtimeAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed || !isSenseVoiceModelId(model)) return emptyState(runtimeAvailable)
    const active = this.activeDownload
    if (active?.model === model) {
      if (!active.finished) return stateFromHandle(active, runtimeAvailable)
      if (active.error !== null) {
        this.activeDownload = undefined
        return stateFromHandle(active, runtimeAvailable)
      }
    }

    const definition = this.manifest[model]
    const directory = this.modelDirectory(model)
    const markerPath = join(directory, MARKER_NAME)
    const files = [definition.model, definition.tokens]
    try {
      const marker = await readMarker(markerPath)
      if (!isValidMarker(marker, model, files)) {
        return errorState(runtimeAvailable, 'The downloaded SenseVoice files are not verified; download the model again.', EARS_ERROR_CODES.senseVoiceModelUnverified)
      }
      const infos = await Promise.all(files.map((file) => stat(join(directory, file.fileName))))
      for (const [index, file] of files.entries()) {
        const path = join(directory, file.fileName)
        const info = infos[index]
        if (info.size !== file.bytes) {
          this.verifiedFiles.delete(path)
          return errorState(runtimeAvailable, 'A SenseVoice model file has an unexpected size; download the model again.', EARS_ERROR_CODES.senseVoiceModelUnverified)
        }
        const verified = this.verifiedFiles.get(path)
        const digest = verified !== undefined && verified.size === info.size && verified.mtimeMs === info.mtimeMs && verified.ctimeMs === info.ctimeMs
          ? verified.sha256
          : await hashFile(path)
        if (digest !== file.sha256) {
          this.verifiedFiles.delete(path)
          return errorState(runtimeAvailable, 'A SenseVoice model file failed checksum verification; download the model again.', EARS_ERROR_CODES.senseVoiceModelUnverified)
        }
        this.verifiedFiles.set(path, { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, sha256: digest })
      }
      return { ...emptyState(runtimeAvailable), downloaded: true, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) }
    } catch (error) {
      if (isMissingFile(error)) {
        const fileExists = await Promise.all(files.map((file) => stat(join(directory, file.fileName)).then(() => true, () => false)))
        const hasAnyFile = fileExists.some(Boolean)
        const hasMarker = await stat(markerPath).then(() => true, () => false)
        if (hasAnyFile || hasMarker) return errorState(runtimeAvailable, 'The downloaded SenseVoice files are incomplete; download the model again.', EARS_ERROR_CODES.senseVoiceModelUnverified)
        return emptyState(runtimeAvailable)
      }
      return errorState(runtimeAvailable, errorMessage(error), EARS_ERROR_CODES.senseVoiceModelStateQueryFailed)
    }
  }

  async downloadModel(model: string, baseUrl: string, runtimeAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed || !isSenseVoiceModelId(model)) return emptyState(runtimeAvailable)
    if (!isValidLocalModelBaseUrl(baseUrl)) return errorState(runtimeAvailable, 'The SenseVoice model base URL is invalid.', EARS_ERROR_CODES.asrEndpointInvalid)
    const release = await this.acquireDownloadSetup()
    try {
      const active = this.activeDownload
      if (active !== undefined && !active.finished) {
        if (active.model === model && active.baseUrl === baseUrl) return stateFromHandle(active, runtimeAvailable)
        return { ...stateFromHandle(active, runtimeAvailable), error: 'Another local model is already downloading.', errorCode: EARS_ERROR_CODES.senseVoiceAlreadyDownloading }
      }
      const current = await this.getModelState(model, baseUrl, runtimeAvailable)
      if (current.downloaded) return current
      const handle: DownloadHandle = {
        model: model as SenseVoiceModelId,
        directory: this.modelDirectory(model as SenseVoiceModelId),
        baseUrl,
        controller: new AbortController(),
        totalBytes: this.modelTotalBytes(model as SenseVoiceModelId),
        bytes: 0,
        progress: 0,
        error: null,
        finished: false,
        cancelRequested: false
      }
      this.verifiedFiles.clear()
      this.activeDownload = handle
      handle.promise = this.runDownload(handle, current.errorCode === EARS_ERROR_CODES.senseVoiceModelUnverified)
      void handle.promise.catch(() => undefined)
      return stateFromHandle(handle, runtimeAvailable)
    } finally {
      release()
    }
  }

  async cancelDownload(model: string, runtimeAvailable: boolean): Promise<WhisperModelState> {
    const handle = this.activeDownload
    if (handle === undefined || handle.model !== model || handle.finished) return this.getModelState(model, '', runtimeAvailable)
    handle.cancelRequested = true
    handle.controller.abort()
    await handle.promise?.catch(() => undefined)
    return handle.error === null ? emptyState(runtimeAvailable) : stateFromHandle(handle, runtimeAvailable)
  }

  async deleteModel(model: string, runtimeAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed || !isSenseVoiceModelId(model)) return emptyState(runtimeAvailable)
    const active = this.activeDownload
    if (active !== undefined && active.model === model && !active.finished) {
      return { ...stateFromHandle(active, runtimeAvailable), error: 'The SenseVoice model is still downloading.', errorCode: EARS_ERROR_CODES.senseVoiceStillDownloading }
    }
    try {
      await rm(this.modelDirectory(model), { recursive: true, force: true })
      this.verifiedFiles.clear()
      return emptyState(runtimeAvailable)
    } catch (error) {
      return errorState(runtimeAvailable, errorMessage(error), EARS_ERROR_CODES.senseVoiceDeleteFailed)
    }
  }

  modelPath(model: SenseVoiceModelId): string {
    return join(this.modelDirectory(model), this.manifest[model].model.fileName)
  }

  tokensPath(model: SenseVoiceModelId): string {
    return join(this.modelDirectory(model), this.manifest[model].tokens.fileName)
  }

  private modelDirectory(model: SenseVoiceModelId): string {
    return join(this.directory, model)
  }

  private modelTotalBytes(model: SenseVoiceModelId): number {
    const definition = this.manifest[model]
    return definition.model.bytes + definition.tokens.bytes
  }

  private async acquireDownloadSetup(): Promise<() => void> {
    const previous = this.downloadSetup
    let release!: () => void
    this.downloadSetup = new Promise((resolve) => { release = resolve })
    await previous
    return release
  }

  private async runDownload(handle: DownloadHandle, removeUnverified: boolean): Promise<void> {
    const definition = this.manifest[handle.model]
    const files = [definition.model, definition.tokens]
    const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0)
    try {
      handle.controller.signal.throwIfAborted()
      await mkdir(handle.directory, { recursive: true })
      await Promise.all([
        rm(join(handle.directory, `${definition.model.fileName}${PARTIAL_SUFFIX}`), { force: true }),
        rm(join(handle.directory, `${definition.tokens.fileName}${PARTIAL_SUFFIX}`), { force: true })
      ])
      if (removeUnverified) await rm(handle.directory, { recursive: true, force: true })
      await mkdir(handle.directory, { recursive: true })

      for (const file of files) {
        await this.downloadFile(handle, file, totalBytes)
      }

      const marker: CompletionMarker = { version: 1, model: handle.model, files }
      const markerPath = join(handle.directory, MARKER_NAME)
      const markerPartial = `${markerPath}${PARTIAL_SUFFIX}`
      await writeFile(markerPartial, `${JSON.stringify(marker)}\n`)
      await rename(markerPartial, markerPath)
      handle.progress = 1
      handle.error = null
    } catch (error) {
      handle.errorCode = handle.cancelRequested ? undefined : EARS_ERROR_CODES.senseVoiceDownloadFailed
      handle.error = handle.cancelRequested ? null : errorMessage(error)
      await this.removeArtifacts(handle)
      if (handle.cancelRequested) delete handle.errorCode
      throw error
    } finally {
      handle.finished = true
    }
  }

  private async downloadFile(handle: DownloadHandle, file: SenseVoiceModelFile, totalBytes: number): Promise<void> {
    if (this.fetchImpl === undefined) throw new Error('The Node fetch API is unavailable')
    handle.controller.signal.throwIfAborted()
    const filePath = join(handle.directory, file.fileName)
    const partialPath = `${filePath}${PARTIAL_SUFFIX}`
    const response = await this.fetchImpl(modelFileUrl(handle.baseUrl, file.fileName), { signal: handle.controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error(`SenseVoice model download failed with HTTP ${response.status}`)
    if (response.body === null) throw new Error('SenseVoice model download returned an empty body')
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > file.bytes) throw new Error('SenseVoice model file is larger than expected')
    const output = await open(partialPath, 'w')
    const hash = createHash('sha256')
    let fileBytes = 0
    const reader = response.body.getReader()
    const cancelReader = () => { void reader.cancel(handle.controller.signal.reason).catch(() => undefined) }
    handle.controller.signal.addEventListener('abort', cancelReader, { once: true })
    try {
      while (true) {
        handle.controller.signal.throwIfAborted()
        const chunk = await reader.read()
        if (chunk.done) break
        if (chunk.value === undefined) continue
        const bytes = Buffer.from(chunk.value)
        fileBytes += bytes.byteLength
        if (fileBytes > file.bytes || fileBytes > MAX_RESPONSE_BYTES) throw new Error('SenseVoice model file is larger than expected')
        hash.update(bytes)
        let offset = 0
        while (offset < bytes.length) {
          const result = await output.write(bytes, offset, bytes.length - offset)
          offset += result.bytesWritten
        }
        handle.bytes += bytes.byteLength
        handle.progress = totalBytes === 0 ? 0 : Math.min(1, handle.bytes / totalBytes)
      }
    } finally {
      handle.controller.signal.removeEventListener('abort', cancelReader)
      await output.close()
    }
    handle.controller.signal.throwIfAborted()
    if (fileBytes !== file.bytes || hash.digest('hex') !== file.sha256) throw new Error('SenseVoice model file failed checksum verification')
    await rename(partialPath, filePath)
  }

  private async removeArtifacts(handle: DownloadHandle): Promise<void> {
    await rm(handle.directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function isSenseVoiceModelId(value: string): value is SenseVoiceModelId {
  return Object.prototype.hasOwnProperty.call(SENSEVOICE_MODEL_MANIFEST, value)
}

export { isValidLocalModelBaseUrl }

export function modelFileUrl(baseUrl: string, fileName: string): string {
  const url = new URL(baseUrl.trim())
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${fileName}`
  url.hash = ''
  return url.toString()
}

export function senseVoiceCacheDirectory(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (env.DSH_EARS_SENSEVOICE_CACHE_DIR?.trim()) return env.DSH_EARS_SENSEVOICE_CACHE_DIR.trim()
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(env.USERPROFILE ?? homedir(), 'AppData', 'Local'), 'dsh-ears', MODEL_CACHE_SUFFIX)
  if (platform === 'darwin') return join(env.HOME ?? homedir(), 'Library', 'Caches', 'dsh-ears', MODEL_CACHE_SUFFIX)
  return join(env.XDG_CACHE_HOME ?? join(env.HOME ?? homedir(), '.cache'), 'dsh-ears', MODEL_CACHE_SUFFIX)
}

type VerifiedFile = { size: number; mtimeMs: number; ctimeMs: number; sha256: string }

function emptyState(runtimeAvailable: boolean): WhisperModelState {
  return { runtimeAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null }
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
    ...(handle.errorCode === undefined ? {} : { errorCode: handle.errorCode })
  }
}

function errorState(runtimeAvailable: boolean, error: string, errorCode: EarsErrorCode): WhisperModelState {
  return { ...emptyState(runtimeAvailable), error, errorCode }
}

async function readMarker(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8')
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function isValidMarker(value: unknown, model: SenseVoiceModelId, files: readonly SenseVoiceModelFile[]): value is CompletionMarker {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const marker = value as Partial<CompletionMarker>
  return marker.version === 1 && marker.model === model && Array.isArray(marker.files) && files.every((file) =>
    marker.files?.some((entry) => entry.fileName === file.fileName && entry.bytes === file.bytes && entry.sha256 === file.sha256) === true
  )
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
