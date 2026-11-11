import type { ChildProcess, ForkOptions } from 'node:child_process'
import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EARS_ERROR_CODES, EarsError, isEarsErrorCode, sanitizeEarsErrorText } from '../errors.js'
import { isSenseVoiceWorkerResponse, type SenseVoiceWorkerRequestPayload, type SenseVoiceWorkerError, type SenseVoiceWorkerTranscript } from './sensevoice-worker-protocol.js'

const DEFAULT_TIMEOUT_MS = 120_000
const SHUTDOWN_TIMEOUT_MS = 3_000
const KILL_GRACE_MS = 500
const STDERR_LIMIT = 2_000

export interface LocalSenseVoiceWorker {
  readonly alive: boolean
  request(payload: SenseVoiceWorkerRequestPayload, options?: { timeoutMs?: number }): Promise<string | undefined>
  requestTranscript?(payload: SenseVoiceWorkerRequestPayload, options?: { timeoutMs?: number }): Promise<SenseVoiceWorkerTranscript | undefined>
  cancelActive(): void
  kill(): void
  shutdown(): Promise<void>
  onExit(listener: (error: EarsError) => void): () => void
}

export interface SenseVoiceWorkerClientOptions {
  readonly scriptPath?: string
  readonly fork?: (scriptPath: string, args: readonly string[], options: ForkOptions) => ChildProcess
  readonly env?: NodeJS.ProcessEnv
  readonly onDiagnostic?: (message: string) => void
}

type PendingRequest = {
  resolve: (value: SenseVoiceWorkerTranscript | undefined) => void
  reject: (error: EarsError) => void
  timer: ReturnType<typeof setTimeout>
}

export class SenseVoiceWorkerClient implements LocalSenseVoiceWorker {
  private readonly child: ChildProcess
  private readonly pending = new Map<number, PendingRequest>()
  private readonly exitListeners = new Set<(error: EarsError) => void>()
  private readonly onDiagnostic: (message: string) => void
  private sequence = 0
  private activeRequestId: number | undefined
  private exited = false
  private expectedExit = false
  private exitDescription = ''
  private stderr = ''

  private constructor(options: SenseVoiceWorkerClientOptions) {
    const scriptPath = options.scriptPath ?? SenseVoiceWorkerClient.scriptPath()
    if (options.fork === undefined && !existsSync(scriptPath)) {
      throw workerFailure('The SenseVoice worker entry is missing', 'lib/asr/sensevoice-worker.js')
    }
    this.onDiagnostic = options.onDiagnostic ?? ((message) => console.warn(`[dsh-ears] ${message}`))
    try {
      this.child = (options.fork ?? fork)(scriptPath, [], {
        cwd: process.cwd(),
        env: { ...process.env, ...options.env, ELECTRON_RUN_AS_NODE: '1' },
        execArgv: [],
        stdio: ['ignore', 'ignore', 'pipe', 'ipc']
      })
    } catch (error) {
      throw workerFailure('The SenseVoice worker process could not start', errorText(error))
    }
    this.child.on('message', (message) => this.handleMessage(message))
    this.child.on('exit', (code, signal) => this.handleExit(code, signal))
    this.child.on('error', (error) => this.report(`The SenseVoice worker process reported an error: ${sanitizeEarsErrorText(error.message)}`))
    this.child.stderr?.on('data', (chunk: Buffer | string) => { this.stderr = `${this.stderr}${String(chunk)}`.slice(-STDERR_LIMIT) })
    this.child.stderr?.on('error', () => undefined)
  }

  static spawn(options: SenseVoiceWorkerClientOptions = {}): SenseVoiceWorkerClient {
    return new SenseVoiceWorkerClient(options)
  }

  static scriptPath(importMetaUrl: string = import.meta.url): string {
    return fileURLToPath(new URL('./asr/sensevoice-worker.js', importMetaUrl))
  }

  get alive(): boolean { return !this.exited }

  request(payload: SenseVoiceWorkerRequestPayload, options: { timeoutMs?: number } = {}): Promise<string | undefined> {
    return this.requestTranscript(payload, options).then((result) => result?.text)
  }

  requestTranscript(payload: SenseVoiceWorkerRequestPayload, options: { timeoutMs?: number } = {}): Promise<SenseVoiceWorkerTranscript | undefined> {
    return this.requestValue(payload, options)
  }

  private requestValue(payload: SenseVoiceWorkerRequestPayload, options: { timeoutMs?: number } = {}): Promise<SenseVoiceWorkerTranscript | undefined> {
    if (this.exited) return Promise.reject(workerFailure('The SenseVoice worker is not running', this.exitDescription || 'worker exited'))
    if (this.activeRequestId !== undefined) return Promise.reject(workerFailure('The SenseVoice worker is busy', 'one request at a time'))
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const timer = setTimeout(() => {
        const pending = this.pending.get(id)
        if (pending === undefined) return
        this.pending.delete(id)
        this.activeRequestId = undefined
        pending.reject(workerFailure(`The SenseVoice ${payload.type} request timed out`, this.stderrTail()))
        this.kill()
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.activeRequestId = id
      try {
        this.child.send({ ...payload, id }, (error) => {
          if (error === null) return
          const pending = this.pending.get(id)
          if (pending === undefined) return
          clearTimeout(pending.timer)
          this.pending.delete(id)
          this.activeRequestId = undefined
          pending.reject(workerFailure(`The SenseVoice worker could not receive "${payload.type}"`, error.message))
        })
      } catch (error) {
        const pending = this.pending.get(id)
        if (pending !== undefined) {
          clearTimeout(pending.timer)
          this.pending.delete(id)
          this.activeRequestId = undefined
          pending.reject(workerFailure(`The SenseVoice worker could not receive "${payload.type}"`, errorText(error)))
        }
      }
    })
  }

  cancelActive(): void {
    if (this.activeRequestId !== undefined) {
      this.expectedExit = true
      this.kill()
    }
  }

  kill(): void {
    if (this.exited) return
    try { this.child.kill('SIGKILL') } catch { /* Exit handler owns cleanup. */ }
  }

  async shutdown(): Promise<void> {
    if (this.exited) return
    this.expectedExit = true
    await this.request({ type: 'shutdown' }, { timeoutMs: SHUTDOWN_TIMEOUT_MS }).catch(() => undefined)
    if (this.exited) return
    this.kill()
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, KILL_GRACE_MS)
      this.onExit(() => { clearTimeout(timer); resolve() })
    })
  }

  onExit(listener: (error: EarsError) => void): () => void {
    this.exitListeners.add(listener)
    return () => this.exitListeners.delete(listener)
  }

  private handleMessage(message: unknown): void {
    if (!isSenseVoiceWorkerResponse(message)) return
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    this.activeRequestId = undefined
    if (message.ok) pending.resolve({
      ...(message.text === undefined ? {} : { text: message.text }),
      ...(message.segments === undefined ? {} : { segments: message.segments })
    })
    else pending.reject(workerResponseError(message.error))
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.exited) return
    this.exited = true
    this.exitDescription = signal === null ? `exit code ${code ?? 'unknown'}` : `signal ${signal}`
    const error = workerFailure('The SenseVoice worker stopped unexpectedly', `${this.exitDescription}${this.stderrTail()}`)
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.activeRequestId = undefined
    if (!this.expectedExit) this.report(error.message)
    for (const listener of this.exitListeners) listener(error)
    this.exitListeners.clear()
  }

  private stderrTail(): string {
    const text = this.stderr.trim()
    return text === '' ? '' : text.split('\n').slice(-3).join(' ')
  }

  private report(message: string): void {
    this.onDiagnostic(sanitizeEarsErrorText(message))
  }
}

export function spawnSenseVoiceWorker(options: SenseVoiceWorkerClientOptions = {}): LocalSenseVoiceWorker {
  return SenseVoiceWorkerClient.spawn(options)
}

function workerResponseError(error: SenseVoiceWorkerError | undefined): EarsError {
  if (error !== undefined && error.code !== undefined && isEarsErrorCode(error.code)) {
    return new EarsError(error.code, sanitizeEarsErrorText(error.message))
  }
  return workerFailure('The SenseVoice worker failed', error?.message ?? '')
}

function workerFailure(message: string, detail: unknown): EarsError {
  const text = typeof detail === 'string' ? detail : errorText(detail)
  return new EarsError(
    EARS_ERROR_CODES.senseVoiceWorkerFailed,
    text === '' ? message : `${message}: ${sanitizeEarsErrorText(text)}`,
    text === '' ? undefined : { detail: sanitizeEarsErrorText(text) }
  )
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
