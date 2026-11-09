import type { ChildProcess, ForkOptions } from 'node:child_process'
import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { LibVariant } from '@fugood/whisper.node'
import { EARS_ERROR_CODES, EarsError, isEarsErrorCode, sanitizeEarsErrorText, type EarsErrorParams } from '../errors.js'
import { WhisperRestartRequiredError } from './whisper-native.js'
import {
  isWhisperWorkerResponse,
  type WhisperWorkerError,
  type WhisperWorkerRequestPayload,
  type WhisperWorkerValue
} from './whisper-worker-protocol.js'

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000
const KILL_GRACE_MS = 500
const DEFAULT_STDERR_LIMIT = 2_000

/** The channels the runtime needs from a Whisper worker. */
export interface LocalWhisperWorker {
  readonly alive: boolean
  request(payload: WhisperWorkerRequestPayload, options?: { timeoutMs?: number }): Promise<WhisperWorkerValue>
  cancelActive(): void
  kill(): void
  shutdown(): Promise<void>
  onExit(listener: (error: EarsError) => void): () => void
}

export type WhisperWorkerClientOptions = {
  /** Worker entry path override; defaults to the built package entry. */
  scriptPath?: string
  /** Test seam: replace child_process.fork. */
  fork?: (scriptPath: string, args: readonly string[], options: ForkOptions) => ChildProcess
  env?: NodeJS.ProcessEnv
  shutdownTimeoutMs?: number
  stderrLimit?: number
  /** Bounded diagnostic sink; defaults to a prefixed console warning. */
  onDiagnostic?: (message: string) => void
}

type PendingRequest = {
  resolve: (value: WhisperWorkerValue) => void
  reject: (error: EarsError) => void
}

/**
 * Host-side half of the Whisper worker protocol. It never loads the native
 * addon: a fatal native assertion in the worker is process-fatal, so it must
 * happen in a process that owns no DSH session.
 */
export class WhisperWorkerClient implements LocalWhisperWorker {
  private readonly child: ChildProcess
  private readonly pending = new Map<number, PendingRequest>()
  private readonly exitListeners = new Set<(error: EarsError) => void>()
  private readonly exitWaiters = new Set<() => void>()
  private readonly shutdownTimeoutMs: number
  private readonly stderrLimit: number
  private readonly onDiagnostic: (message: string) => void
  private sequence = 0
  private activeRequestId: number | undefined
  private exited = false
  private expectedExit = false
  private exitDescription: string | undefined
  private stderr = ''

  private constructor(options: WhisperWorkerClientOptions) {
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS
    this.stderrLimit = options.stderrLimit ?? DEFAULT_STDERR_LIMIT
    this.onDiagnostic = options.onDiagnostic ?? ((message) => console.warn(`[dsh-ears] ${message}`))
    const scriptPath = options.scriptPath ?? WhisperWorkerClient.scriptPath()
    const spawnChild = options.fork ?? fork
    if (options.fork === undefined && !existsSync(scriptPath)) {
      throw workerFailure('The Local Whisper worker entry is missing', 'lib/asr/whisper-worker.js')
    }

    try {
      this.child = spawnChild(scriptPath, [], {
        cwd: process.cwd(),
        // The desktop host runs inside Electron. Plain Node ignores this flag,
        // while an Electron executable launched with it behaves as Node.
        env: { ...process.env, ...options.env, ELECTRON_RUN_AS_NODE: '1' },
        execArgv: [],
        stdio: ['ignore', 'ignore', 'pipe', 'ipc']
      })
    } catch (error) {
      throw workerFailure('The Local Whisper worker process could not start', errorText(error))
    }

    this.child.on('message', (message) => this.handleMessage(message))
    this.child.on('exit', (code, signal) => this.handleExit(code, signal))
    this.child.on('error', (error) => this.handleProcessError(error))
    this.child.stderr?.on('data', (chunk: Buffer | string) => this.appendStderr(String(chunk)))
    this.child.stderr?.on('error', () => undefined)
  }

  static spawn(options: WhisperWorkerClientOptions = {}): WhisperWorkerClient {
    return new WhisperWorkerClient(options)
  }

  /** The worker entry that ships next to the bundled Host entry. */
  static scriptPath(importMetaUrl: string = import.meta.url): string {
    return fileURLToPath(new URL('./asr/whisper-worker.js', importMetaUrl))
  }

  get alive(): boolean {
    return !this.exited
  }

  get diagnostics(): string {
    return this.stderr
  }

  get exitReason(): string | undefined {
    return this.exitDescription
  }

  request(payload: WhisperWorkerRequestPayload, options: { timeoutMs?: number } = {}): Promise<WhisperWorkerValue> {
    if (this.exited) return Promise.reject(this.unexpectedExitError())

    const id = this.nextId()
    if (payload.type === 'transcribe') this.activeRequestId = id
    let timer: ReturnType<typeof setTimeout> | undefined
    return new Promise<WhisperWorkerValue>((resolve, reject) => {
      let settled = false
      const finish = (error: EarsError | undefined, value?: WhisperWorkerValue) => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        if (this.pending.get(id) === pending) this.pending.delete(id)
        if (this.activeRequestId === id) this.activeRequestId = undefined
        if (error !== undefined) reject(error)
        else resolve(value as WhisperWorkerValue)
      }
      const pending: PendingRequest = {
        resolve: (value) => finish(undefined, value),
        reject: (error) => finish(error)
      }
      this.pending.set(id, pending)
      if (options.timeoutMs !== undefined) {
        timer = setTimeout(() => {
          finish(workerFailure(`The Local Whisper worker did not answer "${payload.type}" in time`, `${options.timeoutMs} ms elapsed`))
        }, options.timeoutMs)
      }
      try {
        this.child.send({ ...payload, id }, (error) => {
          if (error === null) return
          finish(workerFailure(`The Local Whisper worker could not receive "${payload.type}"`, errorText(error)))
        })
      } catch (error) {
        finish(workerFailure(`The Local Whisper worker could not receive "${payload.type}"`, errorText(error)))
      }
    })
  }

  cancelActive(): void {
    if (this.activeRequestId === undefined || this.exited) return
    this.sendControl({ type: 'cancel', id: this.nextId() })
  }

  kill(): void {
    if (this.exited) return
    try {
      this.child.kill('SIGKILL')
    } catch {
      // The child is already gone; the exit handler reports the real reason.
    }
  }

  async shutdown(): Promise<void> {
    if (this.exited) return
    this.expectedExit = true
    this.sendControl({ type: 'shutdown', id: this.nextId() })
    if (await this.waitForExit(this.shutdownTimeoutMs)) return
    this.kill()
    await this.waitForExit(KILL_GRACE_MS)
    if (!this.exited) this.report('The Local Whisper worker did not exit after SIGKILL')
  }

  onExit(listener: (error: EarsError) => void): () => void {
    this.exitListeners.add(listener)
    return () => {
      this.exitListeners.delete(listener)
    }
  }

  private nextId(): number {
    this.sequence += 1
    return this.sequence
  }

  private sendControl(message: { type: 'cancel' | 'shutdown'; id: number }): void {
    if (this.exited || this.child.connected === false) return
    try {
      this.child.send(message, () => undefined)
    } catch {
      // A closed channel means the child is exiting; the exit handler owns it.
    }
  }

  private handleMessage(message: unknown): void {
    if (!isWhisperWorkerResponse(message)) return
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    if (message.ok) {
      pending.resolve(message.value)
      return
    }
    pending.reject(workerErrorFromResponse(message.error))
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.exited) return
    this.exited = true
    this.exitDescription = describeExit(code, signal)
    const error = this.unexpectedExitError()
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    this.activeRequestId = undefined
    for (const waiter of this.exitWaiters) waiter()
    this.exitWaiters.clear()

    if (this.expectedExit) {
      if (code !== 0 || signal !== null) this.report(`The Local Whisper worker stopped with ${this.exitDescription}${this.stderrSuffix()}`)
    } else {
      this.report(error.message)
    }
    for (const listener of this.exitListeners) listener(error)
    this.exitListeners.clear()
  }

  private handleProcessError(error: Error): void {
    this.report(`The Local Whisper worker process reported an error: ${sanitizeEarsErrorText(error.message)}`)
  }

  private unexpectedExitError(): EarsError {
    const detail = `${this.exitDescription ?? 'the worker exited'}${this.stderrSuffix()}`
    return workerFailure('The Local Whisper worker stopped unexpectedly', detail)
  }

  private waitForExit(timeoutMs: number): Promise<boolean> {
    if (this.exited) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        this.exitWaiters.delete(finish)
        resolve(this.exited)
      }
      const timer = setTimeout(finish, Math.max(0, timeoutMs))
      this.exitWaiters.add(finish)
    })
  }

  private appendStderr(chunk: string): void {
    if (chunk === '') return
    this.stderr = `${this.stderr}${chunk}`.slice(-this.stderrLimit)
  }

  private stderrSuffix(): string {
    const tail = this.stderr.trim()
    if (tail === '') return ''
    return `: ${sanitizeEarsErrorText(tail.split('\n').slice(-3).join(' '))}`
  }

  private report(message: string): void {
    this.onDiagnostic(sanitizeEarsErrorText(message))
  }
}

/** Spawn the sacrificial Whisper worker used by the Host runtime. */
export function spawnWhisperWorker(options: WhisperWorkerClientOptions = {}): LocalWhisperWorker {
  return WhisperWorkerClient.spawn(options)
}

function workerFailure(message: string, detail: unknown): EarsError {
  const text = typeof detail === 'string' ? detail : errorText(detail)
  return new EarsError(
    EARS_ERROR_CODES.whisperWorkerFailed,
    text === '' ? message : `${message}: ${sanitizeEarsErrorText(text)}`,
    text === '' ? undefined : { detail: sanitizeEarsErrorText(text) }
  )
}

function workerErrorFromResponse(error: WhisperWorkerError): EarsError {
  const params: EarsErrorParams | undefined = error.params
  if (error.code === EARS_ERROR_CODES.whisperRestartRequired) {
    const loaded = params?.loadedVariant
    const requested = params?.requestedVariant
    if (typeof loaded === 'string' && typeof requested === 'string') {
      return new WhisperRestartRequiredError(loaded as LibVariant, requested as LibVariant)
    }
  }
  if (error.code !== undefined && isEarsErrorCode(error.code)) {
    return new EarsError(error.code, sanitizeEarsErrorText(error.message), params)
  }
  return workerFailure('The Local Whisper worker failed', error.message)
}

function describeExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal !== null) return `signal ${signal}`
  if (code !== null) return `exit code ${code}`
  return 'an unknown exit'
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
