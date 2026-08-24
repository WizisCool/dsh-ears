import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EARS_ERROR_CODES, EarsError } from '../errors.js'
import type { WhisperModelId } from '../config.js'
import type { WhisperModelState } from './whisper-models.js'

const MAX_AUDIO_BYTES = 24 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 5_000
const TRANSCRIPTION_TIMEOUT_MS = 120_000
const MAX_STDERR_BYTES = 64 * 1024
const MAX_STDERR_TAIL = 800

/**
 * Reject a local Whisper transcription before spawning the CLI when the model
 * cannot possibly succeed: no CLI, an unhealthy model state, or a model file
 * that is missing or lacks the dsh-ears completion marker. Without this gate
 * the CLI would silently auto-download the model inside the transcription
 * timeout (D-018-adjacent behavior the first release does not want).
 */
export function validateWhisperTranscription(state: WhisperModelState): void {
  if (!state.cliAvailable) throw new EarsError(EARS_ERROR_CODES.whisperNotInstalled, 'Local Whisper is unavailable: no whisper CLI was found')
  if (state.error !== null) throw new EarsError(EARS_ERROR_CODES.whisperStateQueryFailed, `The Whisper model state could not be verified: ${state.error}`, { detail: state.error })
  if (!state.downloaded) throw new EarsError(EARS_ERROR_CODES.whisperModelNotDownloaded, 'The Whisper model is not downloaded, download it on the dsh-ears settings page before recording')
}

export interface LocalWhisperOptions {
  readonly audio: Uint8Array
  readonly mimeType: string
  readonly language: string
  readonly model: WhisperModelId
  readonly signal: AbortSignal
  readonly command?: string
  readonly timeoutMs?: number
}

export async function isWhisperAvailable(command = 'whisper', signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), COMMAND_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(signal?.reason)
  signal?.addEventListener('abort', forwardAbort, { once: true })
  try {
    await runProcess(command, ['--help'], { signal: timeout.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

export async function transcribeWithWhisper(options: LocalWhisperOptions): Promise<string> {
  if (options.audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
  if (options.audio.byteLength > MAX_AUDIO_BYTES) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large')
  options.signal.throwIfAborted()

  const directory = await mkdtemp(join(tmpdir(), 'dsh-ears-whisper-'))
  const extension = audioExtension(options.mimeType)
  const inputPath = join(directory, `recording${extension}`)
  const outputPath = join(directory, 'recording.json')
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new EarsError(EARS_ERROR_CODES.asrRequestTimedOut, 'Local Whisper transcription request timed out')), options.timeoutMs ?? TRANSCRIPTION_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(options.signal.reason)
  options.signal.addEventListener('abort', forwardAbort, { once: true })

  try {
    options.signal.throwIfAborted()
    await writeFile(inputPath, options.audio)
    const language = options.language.trim().split('-', 1)[0]
    const languageArguments = language === '' ? [] : ['--language', language]
    await runProcess(options.command ?? 'whisper', [
      inputPath,
      '--model', options.model,
      ...languageArguments,
      '--task', 'transcribe',
      '--output_format', 'json',
      '--output_dir', directory,
      '--fp16', 'False',
      '--verbose', 'False'
    ], { signal: timeout.signal })

    const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as { text?: unknown }
    if (typeof parsed.text !== 'string') throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'Whisper returned no transcript')
    return parsed.text.trim()
  } catch (error) {
    if (timeout.signal.reason instanceof EarsError) throw timeout.signal.reason
    throw error
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', forwardAbort)
    await rm(directory, { recursive: true, force: true })
  }
}

function audioExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(';', 1)[0]
  if (normalized === 'audio/webm') return '.webm'
  if (normalized === 'audio/ogg') return '.ogg'
  if (normalized === 'audio/mp4' || normalized === 'audio/m4a') return '.m4a'
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') return '.wav'
  return '.audio'
}

async function runProcess(command: string, args: readonly string[], options: { signal: AbortSignal }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      signal: options.signal
    })
    let stderrBytes = 0
    let stderrTail = ''
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
      stderrBytes += Buffer.byteLength(chunk)
      stderrTail = (stderrTail + text).slice(-MAX_STDERR_TAIL)
      if (stderrBytes > MAX_STDERR_BYTES) child.kill('SIGTERM')
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      // Carry the last stderr line into the error so a failed transcription
      // can say "model not found" or "audio decode failed" instead of a bare
      // exit code.
      const tail = stderrTail.trim().split(/[\r\n]+/).filter((line) => line.trim() !== '').at(-1)?.trim() ?? ''
      const reason = signal === null ? `code ${String(code)}` : signal
      reject(new Error(tail === '' ? `Whisper process exited with ${reason}` : `Whisper process exited with ${reason}: ${tail}`))
    })
  })
}
