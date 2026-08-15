import { spawn, type ChildProcess } from 'node:child_process'
import { access, readFile, rm, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { WHISPER_MODEL_IDS, type WhisperModelId } from '../config.js'

const STATE_COMMAND_TIMEOUT_MS = 15_000
const PROBE_COMMAND_TIMEOUT_MS = 5_000
const MAX_STDERR_TAIL = 800

export interface WhisperModelState {
  cliAvailable: boolean
  downloaded: boolean
  downloading: boolean
  progress: number | null
  bytes: number | null
  totalBytes: number | null
  error: string | null
}

interface DownloadHandle {
  model: WhisperModelId
  progress: number
  bytes: number | null
  totalBytes: number | null
  error: string | null
  finished: boolean
  child?: ChildProcess
}

interface ModelTable {
  root: string
  files: Map<string, string>
}

const EMPTY_STATE: WhisperModelState = Object.freeze({
  cliAvailable: false,
  downloaded: false,
  downloading: false,
  progress: null,
  bytes: null,
  totalBytes: null,
  error: null
})

const IS_WINDOWS = process.platform === 'win32'
const PATH_DELIMITER = IS_WINDOWS ? ';' : ':'
const PYTHON_CANDIDATES = IS_WINDOWS ? ['python', 'py'] : ['python3', 'python']

let discoveredPython: string | undefined
let modelTable: ModelTable | undefined
let activeDownload: DownloadHandle | undefined

export async function getWhisperModelState(model: WhisperModelId, cliAvailable: boolean): Promise<WhisperModelState> {
  if (!(WHISPER_MODEL_IDS as readonly string[]).includes(model)) return { ...EMPTY_STATE, cliAvailable }
  const handle = activeDownload
  if (handle !== undefined && handle.model === model && !handle.finished) {
    return {
      cliAvailable,
      downloaded: false,
      downloading: true,
      progress: handle.progress,
      bytes: handle.bytes,
      totalBytes: handle.totalBytes,
      error: handle.error
    }
  }
  const python = await resolveWhisperPython()
  if (python === undefined) {
    return {
      cliAvailable,
      downloaded: false,
      downloading: false,
      progress: null,
      bytes: null,
      totalBytes: null,
      error: cliAvailable ? 'Cannot inspect model state: no whisper-capable Python interpreter was found on the dsh Host.' : null
    }
  }
  try {
    const table = await resolveModelTable(python)
    const file = table.files.get(model)
    if (file === undefined) {
      return { cliAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: `The installed whisper does not know the model "${model}".` }
    }
    const filePath = join(table.root, file)
    try {
      const info = await stat(filePath)
      return { cliAvailable, downloaded: true, downloading: false, progress: null, bytes: null, totalBytes: info.size, error: null }
    } catch {
      return { cliAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null }
    }
  } catch (error) {
    if (isMissingExecutable(error)) discoveredPython = undefined
    return {
      cliAvailable,
      downloaded: false,
      downloading: false,
      progress: null,
      bytes: null,
      totalBytes: null,
      error: error instanceof Error ? error.message : 'Whisper model state query failed'
    }
  }
}

export async function downloadWhisperModel(model: WhisperModelId, cliAvailable: boolean): Promise<WhisperModelState> {
  if (!(WHISPER_MODEL_IDS as readonly string[]).includes(model)) return { ...EMPTY_STATE, cliAvailable }
  const python = await resolveWhisperPython()
  if (python === undefined) {
    return { ...EMPTY_STATE, cliAvailable, error: cliAvailable ? 'Cannot download models: no whisper-capable Python interpreter was found on the dsh Host.' : 'openai-whisper is not installed on the dsh Host.' }
  }
  const handle = activeDownload
  if (handle !== undefined && !handle.finished) {
    if (handle.model === model) return stateFromHandle(handle, cliAvailable)
    return { ...stateFromHandle(handle, cliAvailable), error: 'Another Whisper model is already downloading.' }
  }
  activeDownload = {
    model,
    progress: 0,
    bytes: null,
    totalBytes: null,
    error: null,
    finished: false
  }
  void runDownload(python, model).catch(() => undefined)
  return stateFromHandle(activeDownload, cliAvailable)
}

export async function cancelWhisperModelDownload(model: WhisperModelId, cliAvailable: boolean): Promise<WhisperModelState> {
  const handle = activeDownload
  if (handle !== undefined && handle.model === model && !handle.finished) {
    handle.child?.kill('SIGTERM')
    handle.finished = true
    // Best-effort cleanup of the partial file so it is not mistaken for a
    // complete model by the next state query.
    try {
      const python = await resolveWhisperPython()
      if (python !== undefined) {
        const table = await resolveModelTable(python)
        const file = table.files.get(model)
        if (file !== undefined) await rm(join(table.root, file), { force: true })
      }
    } catch {
      // The next state query will surface any leftover file honestly.
    }
  }
  return { cliAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null }
}

export async function deleteWhisperModel(model: WhisperModelId, cliAvailable: boolean): Promise<WhisperModelState> {
  if (!(WHISPER_MODEL_IDS as readonly string[]).includes(model)) return { ...EMPTY_STATE, cliAvailable }
  const handle = activeDownload
  if (handle !== undefined && handle.model === model && !handle.finished) {
    return { ...stateFromHandle(handle, cliAvailable), error: 'The model is still downloading.' }
  }
  const python = await resolveWhisperPython()
  if (python === undefined) {
    return { ...EMPTY_STATE, cliAvailable, error: 'Cannot delete models: no whisper-capable Python interpreter was found on the dsh Host.' }
  }
  try {
    const table = await resolveModelTable(python)
    const file = table.files.get(model)
    if (file === undefined) {
      return { cliAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: `The installed whisper does not know the model "${model}".` }
    }
    await rm(join(table.root, file), { force: true })
    return { cliAvailable, downloaded: false, downloading: false, progress: null, bytes: null, totalBytes: null, error: null }
  } catch (error) {
    return {
      cliAvailable,
      downloaded: false,
      downloading: false,
      progress: null,
      bytes: null,
      totalBytes: null,
      error: error instanceof Error ? error.message : 'Whisper model deletion failed'
    }
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
    error: handle.error
  }
}

async function runDownload(python: string, model: WhisperModelId): Promise<void> {
  const handle = activeDownload
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
    "    sys.stderr.write('__DSH_EARS_DONE__\n')",
    'except BaseException:',
    "    traceback.print_exc(file=sys.stderr)",
    '    sys.stderr.flush()',
    '    os._exit(1)',
    'sys.stderr.flush()',
    'os._exit(0)'
  ].join('\n')
  const child = spawn(python, ['-u', '-c', script, model], {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  })
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
    if (isMissingExecutable(error)) discoveredPython = undefined
    handle.error = error.message
    handle.finished = true
  })
  child.once('close', (code, signal) => {
    if (handle.finished) return
    if (code === 0 || stderrTail.includes('__DSH_EARS_DONE__')) {
      handle.progress = 1
      handle.finished = true
      return
    }
    const tail = stderrTail.trim().split(/[\r\n]+/).filter((line) => line.trim() !== '').at(-1)?.trim() ?? ''
    handle.error = tail === '' || tail.includes('__DSH_EARS_DONE__')
      ? `Whisper download exited with ${signal === null ? `code ${String(code)}` : signal}`
      : tail
    handle.finished = true
  })
}

/**
 * Resolve a whisper-capable Python interpreter without importing the heavy
 * module: read the whisper CLI wrapper's shebang first (Homebrew/pipx venvs),
 * then probe `python3`/`python` on PATH with a spec-only lookup.
 */
async function resolveWhisperPython(): Promise<string | undefined> {
  if (discoveredPython !== undefined) return discoveredPython
  const cliPath = await resolveExecutable(IS_WINDOWS ? 'whisper.exe' : 'whisper')
  if (cliPath !== undefined) {
    const interpreter = await readShebangInterpreter(cliPath)
    if (interpreter !== undefined && await hasWhisperSpec(interpreter)) {
      discoveredPython = interpreter
      return interpreter
    }
  }
  for (const candidate of PYTHON_CANDIDATES) {
    const path = await resolveExecutable(candidate)
    if (path !== undefined && await hasWhisperSpec(path)) {
      discoveredPython = path
      return path
    }
  }
  return undefined
}

/**
 * Load the installed whisper's model→cache-filename table and cache root
 * through a real `import whisper` (the authoritative source), once per
 * process: the slow torch import is paid a single time, and every later
 * state query is a plain file stat against the library's own table.
 */
async function resolveModelTable(python: string): Promise<ModelTable> {
  if (modelTable !== undefined) return modelTable
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
  const output = await runPythonCollect(python, ['-c', script], STATE_COMMAND_TIMEOUT_MS)
  const parsed = JSON.parse(output.trim()) as { root?: unknown; files?: unknown }
  if (typeof parsed.root !== 'string' || typeof parsed.files !== 'object' || parsed.files === null) {
    throw new Error('Could not read the installed whisper model table')
  }
  const files = new Map<string, string>()
  for (const [name, file] of Object.entries(parsed.files as Record<string, unknown>)) {
    if (typeof file === 'string') files.set(name, file)
  }
  if (files.size === 0) throw new Error('The installed whisper exposes no models')
  modelTable = { root: parsed.root, files }
  return modelTable
}

/** Spec-only check: resolves the whisper distribution without importing it. */
async function hasWhisperSpec(python: string): Promise<boolean> {
  try {
    const output = await runPythonCollect(python, ['-c', "import importlib.util, sys; print(importlib.util.find_spec('whisper') is not None); sys.stdout.flush(); import os; os._exit(0)"], PROBE_COMMAND_TIMEOUT_MS)
    return output.trim() === 'True'
  } catch {
    return false
  }
}

function runPythonCollect(command: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'ignore'],
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

function isMissingExecutable(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function resolveExecutable(command: string): Promise<string | undefined> {
  const path = process.env.PATH ?? ''
  for (const directory of path.split(PATH_DELIMITER)) {
    if (directory === '') continue
    const candidate = join(directory, command)
    try {
      await access(candidate, IS_WINDOWS ? constants.F_OK : constants.X_OK)
      return candidate
    } catch {
      // Keep scanning PATH.
    }
  }
  return undefined
}

async function readShebangInterpreter(executablePath: string): Promise<string | undefined> {
  try {
    const head = (await readFile(executablePath)).subarray(0, 512).toString('utf8')
    const firstLine = head.split('\n', 1)[0] ?? ''
    if (!firstLine.startsWith('#!')) return undefined
    const parts = firstLine.slice(2).trim().split(/\s+/)
    if (parts.length === 0) return undefined
    if (parts[0] === 'env' || parts[0].endsWith('/env')) return parts[1]
    return parts[0]
  } catch {
    return undefined
  }
}

/**
 * Parse tqdm-style download progress text (`42%|██ | 63.2M/150M [...]`).
 * @param text - one stderr chunk; may contain carriage-return updates.
 * @returns the last progress tuple found in the chunk.
 */
export function parseDownloadProgress(text: string): { percent: number | null; bytes: number | null; totalBytes: number | null } {
  const lines = text.split(/[\r\n]+/)
  let percent: number | null = null
  let bytes: number | null = null
  let totalBytes: number | null = null
  for (const line of lines) {
    const match = /(\d+)%\|[^|]*\|\s*([\d.]+)\s*([KMGT]?)(?:i?B)?\/([\d.]+)\s*([KMGT]?)(?:i?B)?/.exec(line)
    if (match === null) continue
    percent = Number(match[1]) / 100
    bytes = parseSize(match[2], match[3])
    totalBytes = parseSize(match[4], match[5])
  }
  return { percent, bytes, totalBytes }
}

function parseSize(value: string, unit: string): number | null {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const multiplier = unit === 'K' ? 1024 : unit === 'M' ? 1024 * 1024 : unit === 'G' ? 1024 * 1024 * 1024 : unit === 'T' ? 1024 ** 4 : 1
  return Math.round(number * multiplier)
}
