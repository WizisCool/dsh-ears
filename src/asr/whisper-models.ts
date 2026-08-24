import { spawn, type ChildProcess } from 'node:child_process'
import { access, rm, stat, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { WHISPER_MODEL_IDS, type WhisperModelId } from '../config.js'
import { EARS_ERROR_CODES, type EarsErrorCode, type EarsErrorParams } from '../errors.js'
import { executableSuffixes, pathDelimiter, pythonCandidates, readShebangInterpreter } from './whisper-discovery.js'
import { parseDownloadProgress } from './whisper-progress.js'

export { executableSuffixes, pythonCandidates } from './whisper-discovery.js'
export { parseDownloadProgress } from './whisper-progress.js'

const STATE_COMMAND_TIMEOUT_MS = 15_000
const PROBE_COMMAND_TIMEOUT_MS = 5_000
const MAX_STDERR_TAIL = 800
const FAILURE_CACHE_TTL_MS = 30_000
const DOWNLOAD_MARKER_SUFFIX = '.dsh-ears-done'

export interface WhisperModelState {
  cliAvailable: boolean
  downloaded: boolean
  downloading: boolean
  progress: number | null
  bytes: number | null
  totalBytes: number | null
  error: string | null
  errorCode?: EarsErrorCode
  errorParams?: EarsErrorParams
}

interface DownloadHandle {
  model: WhisperModelId
  python: string
  progress: number
  bytes: number | null
  totalBytes: number | null
  error: string | null
  errorCode?: EarsErrorCode
  errorParams?: EarsErrorParams
  finished: boolean
  cancelRequested?: boolean
  child?: ChildProcess
}

interface ModelTable {
  root: string
  files: Map<string, string>
}

interface FailureEntry {
  message: string
  until: number
}

// Keep optional error fields absent rather than explicitly undefined: the
// typert gateway checks every own enumerable result property for JSON safety.
const EMPTY_STATE: WhisperModelState = Object.freeze({
  cliAvailable: false,
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
  readonly failureCacheTtlMs?: number
}

/**
 * Owns the local Whisper model lifecycle: interpreter discovery, model-table
 * resolution, download/cancel/delete, and partial-file cleanup. All state is
 * per-instance so the service can dispose it with its Cordis scope, and tests
 * can build isolated instances with an injected platform and environment.
 */
export class WhisperModels {
  private readonly platform: NodeJS.Platform
  private readonly env: NodeJS.ProcessEnv
  private readonly failureCacheTtlMs: number
  private disposed = false
  private discoveredPython: string | undefined
  private discoveringPython: Promise<string | undefined> | undefined
  private pythonFailure: FailureEntry | undefined
  private modelTable: ModelTable | undefined
  private modelTablePromise: Promise<ModelTable> | undefined
  private tableFailure: FailureEntry | undefined
  private activeDownload: DownloadHandle | undefined

  constructor(options: WhisperModelsOptions = {}) {
    this.platform = options.platform ?? process.platform
    this.env = options.env ?? process.env
    this.failureCacheTtlMs = options.failureCacheTtlMs ?? FAILURE_CACHE_TTL_MS
  }

  /**
   * Stop any running download and drop cached discoveries. After disposal the
   * instance answers with empty states and never spawns new processes; the
   * service calls this from its Cordis effect cleanup so plugin reloads do not
   * leave orphan download processes behind.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const handle = this.activeDownload
    if (handle !== undefined && !handle.finished) {
      handle.cancelRequested = true
      handle.child?.kill('SIGTERM')
      // Best-effort partial-file cleanup without spawning new probes.
      const table = this.modelTable
      if (table !== undefined) {
        const file = table.files.get(handle.model)
        if (file !== undefined) {
          const filePath = join(table.root, file)
          void rm(filePath, { force: true }).catch(() => undefined)
          void rm(markerPath(filePath), { force: true }).catch(() => undefined)
        }
      }
      handle.finished = true
    }
    this.activeDownload = undefined
    this.discoveredPython = undefined
    this.discoveringPython = undefined
    this.pythonFailure = undefined
    this.modelTable = undefined
    this.modelTablePromise = undefined
    this.tableFailure = undefined
  }

  async getWhisperModelState(model: WhisperModelId, cliAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed) return { ...EMPTY_STATE, cliAvailable }
    if (!(WHISPER_MODEL_IDS as readonly string[]).includes(model)) return { ...EMPTY_STATE, cliAvailable }
    const handle = this.activeDownload
    if (handle !== undefined && handle.model === model) {
      if (!handle.finished) return stateFromHandle(handle, cliAvailable)
      if (handle.error !== null) return stateFromHandle(handle, cliAvailable)
    }
    const python = await this.resolveWhisperPython()
    if (python === undefined) {
      return cliAvailable
        ? errorState(cliAvailable, 'Cannot inspect model state: no whisper-capable Python interpreter was found on the dsh Host.', EARS_ERROR_CODES.whisperPythonNotFound)
        : { ...EMPTY_STATE, cliAvailable }
    }
    try {
      const table = await this.resolveModelTable(python)
      const file = table.files.get(model)
      if (file === undefined) {
        return errorState(cliAvailable, `The installed whisper does not know the model "${model}".`, EARS_ERROR_CODES.whisperModelUnknown, { model })
      }
      const filePath = join(table.root, file)
      try {
        const info = await stat(filePath)
        // A model file without the dsh-ears completion marker is not trusted.
        if (!await fileExists(markerPath(filePath))) {
          return errorState(cliAvailable, 'The model file exists but was not downloaded by dsh-ears; download it again to verify.', EARS_ERROR_CODES.whisperModelUnverified)
        }
        return { cliAvailable, downloaded: true, downloading: false, progress: null, bytes: null, totalBytes: info.size, error: null }
      } catch {
        // No model file: drop an orphaned marker silently.
        await rm(markerPath(filePath), { force: true }).catch(() => undefined)
        return { cliAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null }
      }
    } catch (error) {
      this.invalidatePythonState(error)
      return {
        cliAvailable,
        downloaded: false,
        downloading: false,
        progress: null,
        bytes: null,
        totalBytes: null,
        error: error instanceof Error ? error.message : 'Whisper model state query failed',
        errorCode: EARS_ERROR_CODES.whisperStateQueryFailed,
        errorParams: { detail: error instanceof Error ? error.message : 'Whisper model state query failed' }
      }
    }
  }

  async downloadWhisperModel(model: WhisperModelId, cliAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed) return { ...EMPTY_STATE, cliAvailable }
    if (!(WHISPER_MODEL_IDS as readonly string[]).includes(model)) return { ...EMPTY_STATE, cliAvailable }
    const python = await this.resolveWhisperPython()
    if (python === undefined) {
      return cliAvailable
        ? errorState(cliAvailable, 'Cannot download models: no whisper-capable Python interpreter was found on the dsh Host.', EARS_ERROR_CODES.whisperPythonNotFound)
        : errorState(cliAvailable, 'openai-whisper is not installed on the dsh Host.', EARS_ERROR_CODES.whisperNotInstalled)
    }
    const handle = this.activeDownload
    if (handle !== undefined && !handle.finished) {
      if (handle.model === model) return stateFromHandle(handle, cliAvailable)
      return { ...stateFromHandle(handle, cliAvailable), error: 'Another Whisper model is already downloading.', errorCode: EARS_ERROR_CODES.whisperAlreadyDownloading }
    }
    this.activeDownload = {
      model,
      python,
      progress: 0,
      bytes: null,
      totalBytes: null,
      error: null,
      errorCode: undefined,
      errorParams: undefined,
      finished: false
    }
    void this.runDownload(python, model).catch(() => undefined)
    return stateFromHandle(this.activeDownload, cliAvailable)
  }

  async cancelWhisperModelDownload(model: WhisperModelId, cliAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed) return { ...EMPTY_STATE, cliAvailable }
    const handle = this.activeDownload
    if (handle !== undefined && handle.model === model && !handle.finished) {
      handle.cancelRequested = true
      handle.child?.kill('SIGTERM')
      // Best-effort cleanup of the partial file so it is not mistaken for a
      // complete model by the next state query.
      try {
        await this.removeModelArtifacts(handle.python, model)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        handle.error = `Whisper download cancellation cleanup failed: ${detail}`
        handle.errorCode = EARS_ERROR_CODES.whisperCancelCleanupFailed
        handle.errorParams = { detail }
      }
      handle.finished = true
      if (handle.error !== null) return stateFromHandle(handle, cliAvailable)
    }
    return { cliAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null }
  }

  async deleteWhisperModel(model: WhisperModelId, cliAvailable: boolean): Promise<WhisperModelState> {
    if (this.disposed) return { ...EMPTY_STATE, cliAvailable }
    if (!(WHISPER_MODEL_IDS as readonly string[]).includes(model)) return { ...EMPTY_STATE, cliAvailable }
    const handle = this.activeDownload
    if (handle !== undefined && handle.model === model && !handle.finished) {
      return { ...stateFromHandle(handle, cliAvailable), error: 'The model is still downloading.', errorCode: EARS_ERROR_CODES.whisperStillDownloading }
    }
    const python = await this.resolveWhisperPython()
    if (python === undefined) {
      return cliAvailable
        ? errorState(cliAvailable, 'Cannot delete models: no whisper-capable Python interpreter was found on the dsh Host.', EARS_ERROR_CODES.whisperPythonNotFound)
        : errorState(cliAvailable, 'openai-whisper is not installed on the dsh Host.', EARS_ERROR_CODES.whisperNotInstalled)
    }
    try {
      const table = await this.resolveModelTable(python)
      const file = table.files.get(model)
      if (file === undefined) {
        return errorState(cliAvailable, `The installed whisper does not know the model "${model}".`, EARS_ERROR_CODES.whisperModelUnknown, { model })
      }
      const filePath = join(table.root, file)
      await rm(filePath, { force: true })
      await rm(markerPath(filePath), { force: true })
      return { cliAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null }
    } catch (error) {
      return {
        cliAvailable,
        downloaded: false,
        downloading: false,
        progress: null,
        bytes: null,
        totalBytes: null,
        error: error instanceof Error ? error.message : 'Whisper model deletion failed',
        errorCode: EARS_ERROR_CODES.whisperDeleteFailed,
        errorParams: { detail: error instanceof Error ? error.message : 'Whisper model deletion failed' }
      }
    }
  }

  private async runDownload(python: string, model: WhisperModelId): Promise<void> {
    const handle = this.activeDownload
    if (handle === undefined || handle.model !== model) return
    // Exit through os._exit: on this platform mix (Homebrew python + torch +
    // openblas) the regular interpreter teardown races two OpenMP runtimes
    // (libomp and libgomp) and can SIGSEGV during exit cleanup. Skipping the
    // cleanup path keeps the download result authoritative either way.
    const script = [
      'import os, sys, traceback, whisper',
      'model = sys.argv[1]',
      "root = os.path.join(os.getenv('XDG_CACHE_HOME') or os.path.expanduser('~/.cache'), 'whisper')",
      'try:',
      "    whisper._download(whisper._MODELS[model], root, False)",
      "    sys.stderr.write('__DSH_EARS_DONE__\\n')",
      'except BaseException:',
      "    traceback.print_exc(file=sys.stderr)",
      '    sys.stderr.flush()',
      '    os._exit(1)',
      'sys.stderr.flush()',
      'os._exit(0)'
    ].join('\n')
    let child: ChildProcess
    let completionStarted = false
    const finishFailure = (message: string) => {
      if (completionStarted || handle.finished) return
      completionStarted = true
      void (async () => {
        try {
          await this.removeModelArtifacts(python, model)
        } catch (error) {
          if (handle.cancelRequested) {
            handle.finished = true
            return
          }
          const cleanupDetail = error instanceof Error ? error.message : String(error)
          handle.error = `${message}; incomplete model cleanup failed: ${cleanupDetail}`
          handle.errorCode = EARS_ERROR_CODES.whisperDownloadCleanupFailed
          handle.errorParams = { detail: cleanupDetail }
        }
        if (handle.cancelRequested) {
          handle.finished = true
          return
        }
        if (handle.error === null) {
          handle.error = message
          handle.errorCode = EARS_ERROR_CODES.whisperDownloadFailed
          handle.errorParams = { detail: message }
        }
        handle.finished = true
      })()
    }
    try {
      // Drop a stale completion marker before overwriting: if this download is
      // killed mid-write, the leftover file must not be reported as complete.
      const table = await this.resolveModelTable(python)
      const file = table.files.get(model)
      if (file !== undefined) await rm(markerPath(join(table.root, file)), { force: true })
    } catch (error) {
      finishFailure(error instanceof Error ? error.message : String(error))
      return
    }
    try {
      child = spawn(python, ['-u', '-c', script, model], {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: this.env,
        windowsHide: true
      })
    } catch (error) {
      this.invalidatePythonState(error)
      finishFailure(error instanceof Error ? error.message : String(error))
      return
    }
    handle.child = child
    let stderrTail = ''
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
      stderrTail = (stderrTail + text).slice(-MAX_STDERR_TAIL)
      const parsed = parseDownloadProgress(text)
      if (parsed.percent !== null) handle.progress = parsed.percent
      if (parsed.bytes !== null) handle.bytes = parsed.bytes
      if (parsed.totalBytes !== null) handle.totalBytes = parsed.totalBytes
    })
    child.once('error', (error) => {
      this.invalidatePythonState(error)
      if (handle.cancelRequested) return
      finishFailure(error.message)
    })
    child.once('close', (code, signal) => {
      if (handle.finished || handle.cancelRequested) return
      if (code === 0 || stderrTail.includes('__DSH_EARS_DONE__')) {
        void this.completeDownload(python, model, handle)
        return
      }
      const tail = stderrTail.trim().split(/[\r\n]+/).filter((line) => line.trim() !== '').at(-1)?.trim() ?? ''
      const message = tail === '' || tail.includes('__DSH_EARS_DONE__')
        ? `Whisper download exited with ${signal === null ? `code ${String(code)}` : signal}`
        : tail
      finishFailure(message)
    })
  }

  /** Write the completion marker that makes a downloaded file trustworthy. */
  private async completeDownload(python: string, model: WhisperModelId, handle: DownloadHandle): Promise<void> {
    try {
      const table = await this.resolveModelTable(python)
      const file = table.files.get(model)
      if (file === undefined) throw new Error(`The installed whisper does not know the model "${model}".`)
      await writeFile(markerPath(join(table.root, file)), model, 'utf8')
    } catch (error) {
      if (!handle.cancelRequested) {
        const detail = error instanceof Error ? error.message : String(error)
        handle.error = `Whisper download completed but the completion marker could not be written: ${detail}`
        handle.errorCode = EARS_ERROR_CODES.whisperMarkerWriteFailed
        handle.errorParams = { detail }
      }
      handle.progress = 1
      handle.finished = true
      return
    }
    if (handle.cancelRequested || handle.finished) return
    handle.progress = 1
    handle.finished = true
  }

  private async removeModelArtifacts(python: string, model: WhisperModelId): Promise<void> {
    const table = await this.resolveModelTable(python)
    const file = table.files.get(model)
    if (file !== undefined) {
      const filePath = join(table.root, file)
      await rm(filePath, { force: true })
      await rm(markerPath(filePath), { force: true })
    }
  }

  /**
   * Resolve a whisper-capable Python interpreter without importing the heavy
   * module: read the whisper CLI wrapper's shebang first (Homebrew/pipx venvs),
   * then probe `python3`/`python` on PATH with a spec-only lookup. Failures are
   * negative-cached briefly so a broken environment does not re-spawn probes
   * on every retry.
   */
  private async resolveWhisperPython(): Promise<string | undefined> {
    if (this.discoveredPython !== undefined) return this.discoveredPython
    if (this.discoveringPython !== undefined) return this.discoveringPython
    if (this.pythonFailure !== undefined && this.pythonFailure.until > Date.now()) return undefined
    const promise = (async () => {
      const cliPath = await this.resolveExecutable(this.platform === 'win32' ? 'whisper.exe' : 'whisper')
      if (cliPath !== undefined) {
        const interpreter = await readShebangInterpreter(cliPath)
        if (interpreter !== undefined && await this.hasWhisperSpec(interpreter)) return interpreter
      }
      for (const candidate of pythonCandidates(this.platform)) {
        const path = await this.resolveExecutable(candidate)
        if (path !== undefined && await this.hasWhisperSpec(path)) return path
      }
      return undefined
    })()
    this.discoveringPython = promise
    try {
      const result = await promise
      if (result !== undefined) {
        this.discoveredPython = result
        this.pythonFailure = undefined
        return result
      }
      this.pythonFailure = {
        message: 'No whisper-capable Python interpreter was found on the dsh Host.',
        until: Date.now() + this.failureCacheTtlMs
      }
      return undefined
    } finally {
      if (this.discoveringPython === promise) this.discoveringPython = undefined
    }
  }

  /**
   * Load the installed whisper's model→cache-filename table and cache root
   * through a real `import whisper` (the authoritative source), once per
   * instance: the slow torch import is paid a single time, and every later
   * state query is a plain file stat against the library's own table.
   * Failures are negative-cached briefly instead of re-spawning on each retry.
   */
  private async resolveModelTable(python: string): Promise<ModelTable> {
    if (this.modelTable !== undefined) return this.modelTable
    if (this.modelTablePromise !== undefined) return this.modelTablePromise
    if (this.tableFailure !== undefined && this.tableFailure.until > Date.now()) throw new Error(this.tableFailure.message)
    // Same os._exit teardown rationale as runDownload.
    const script = [
      "import json, os, sys, traceback, whisper",
      'try:',
      "    root = os.path.join(os.getenv('XDG_CACHE_HOME') or os.path.expanduser('~/.cache'), 'whisper')",
      "    print(json.dumps({'root': root, 'files': {str(k): os.path.basename(str(v)) for k, v in whisper._MODELS.items()}}))",
      'except BaseException:',
      "    traceback.print_exc(file=sys.stderr)",
      '    sys.stderr.flush()',
      '    os._exit(1)',
      'sys.stdout.flush()',
      'os._exit(0)'
    ].join('\n')
    const promise = (async () => {
      const output = await this.runPythonCollect(python, ['-c', script], STATE_COMMAND_TIMEOUT_MS)
      let parsed: { root?: unknown; files?: unknown }
      try {
        parsed = JSON.parse(output.trim()) as { root?: unknown; files?: unknown }
      } catch {
        throw new Error('The installed whisper returned an unreadable model table')
      }
      if (typeof parsed.root !== 'string' || typeof parsed.files !== 'object' || parsed.files === null) {
        throw new Error('Could not read the installed whisper model table')
      }
      const files = new Map<string, string>()
      for (const [name, file] of Object.entries(parsed.files as Record<string, unknown>)) {
        if (typeof file === 'string') files.set(name, file)
      }
      if (files.size === 0) throw new Error('The installed whisper exposes no models')
      return { root: parsed.root, files }
    })()
    this.modelTablePromise = promise
    try {
      const table = await promise
      this.modelTable = table
      this.tableFailure = undefined
      return table
    } catch (error) {
      this.tableFailure = {
        message: error instanceof Error ? error.message : 'Whisper model state query failed',
        until: Date.now() + this.failureCacheTtlMs
      }
      throw error
    } finally {
      if (this.modelTablePromise === promise) this.modelTablePromise = undefined
    }
  }

  /** Spec-only check: resolves the whisper distribution without importing it. */
  private async hasWhisperSpec(python: string): Promise<boolean> {
    try {
      const output = await this.runPythonCollect(python, ['-c', "import importlib.util, sys; print(importlib.util.find_spec('whisper') is not None); sys.stdout.flush(); import os; os._exit(0)"], PROBE_COMMAND_TIMEOUT_MS)
      return output.trim() === 'True'
    } catch {
      return false
    }
  }

  private runPythonCollect(command: string, args: readonly string[], timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        stdio: ['ignore', 'pipe', 'ignore'],
        env: this.env,
        windowsHide: true
      })
      let stdout = ''
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          child.kill('SIGTERM')
          reject(new Error('Whisper Python command timed out'))
        }
      }, timeoutMs)
      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
      })
      child.once('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (code === 0) {
          resolve(stdout)
          return
        }
        reject(new Error(`Whisper Python exited with code ${String(code)}`))
      })
    })
  }

  private async resolveExecutable(command: string): Promise<string | undefined> {
    const path = this.env.PATH ?? ''
    const suffixes = executableSuffixes(command, this.platform, this.env.PATHEXT)
    for (const directory of path.split(pathDelimiter(this.platform))) {
      if (directory === '') continue
      for (const suffix of suffixes) {
        const candidate = join(directory, `${command}${suffix}`)
        try {
          await access(candidate, this.platform === 'win32' ? constants.F_OK : constants.X_OK)
          return candidate
        } catch {
          // Keep scanning PATH.
        }
      }
    }
    return undefined
  }

  private invalidatePythonState(error: unknown): void {
    if (!isMissingExecutable(error)) return
    this.discoveredPython = undefined
    this.discoveringPython = undefined
    this.pythonFailure = undefined
    this.modelTable = undefined
    this.modelTablePromise = undefined
    this.tableFailure = undefined
  }
}

function stateFromHandle(handle: DownloadHandle, cliAvailable: boolean): WhisperModelState {
  return {
    cliAvailable,
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

function errorState(cliAvailable: boolean, error: string, errorCode: EarsErrorCode, errorParams?: EarsErrorParams): WhisperModelState {
  return {
    cliAvailable,
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

function isMissingExecutable(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function markerPath(filePath: string): string {
  return `${filePath}${DOWNLOAD_MARKER_SUFFIX}`
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}
