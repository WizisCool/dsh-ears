import { createRequire } from 'node:module'
import { EARS_ERROR_CODES, EarsError, isEarsErrorCode, sanitizeEarsErrorText } from '../errors.js'
import { groupTimedTokens } from './transcript.js'
import { isSenseVoiceWorkerRequest, type SenseVoiceWorkerError, type SenseVoiceWorkerRequest, type SenseVoiceWorkerResponse } from './sensevoice-worker-protocol.js'

interface WaveData {
  readonly samples: Float32Array
  readonly sampleRate: number
}

interface OfflineStream {
  acceptWaveform(wave: { sampleRate: number; samples: Float32Array }): void
}

interface OfflineResult {
  readonly text?: unknown
  readonly tokens?: unknown
  readonly timestamps?: unknown
  readonly durations?: unknown
}

interface OfflineRecognizer {
  createStream(): OfflineStream
  decodeAsync(stream: OfflineStream): Promise<OfflineResult>
}

interface SherpaOnnxApi {
  readonly OfflineRecognizer: {
    createAsync(config: Record<string, unknown>): Promise<OfflineRecognizer>
  }
  readWave(path: string): WaveData
}

const require = createRequire(import.meta.url)
let recognizer: OfflineRecognizer | undefined
let active = false
let shuttingDown = false

process.on('message', (message) => {
  void handleMessage(message)
})

process.on('disconnect', () => process.exit(0))

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => process.exit(0))
}

async function handleMessage(message: unknown): Promise<void> {
  if (!isSenseVoiceWorkerRequest(message) || shuttingDown) return
  if (message.type === 'shutdown') {
    shuttingDown = true
    sendAndExit({ type: 'response', id: message.id, ok: true })
    return
  }
  try {
    if (message.type === 'init') {
      await initRecognizer(message)
      send({ type: 'response', id: message.id, ok: true })
      return
    }
    const result = await transcribe(message.audioPath)
    send({ type: 'response', id: message.id, ok: true, text: result.text, segments: result.segments })
  } catch (error) {
    send({ type: 'response', id: message.id, ok: false, error: serializeError(error) })
  }
}

async function initRecognizer(request: Extract<SenseVoiceWorkerRequest, { type: 'init' }>): Promise<void> {
  if (active) throw new EarsError(EARS_ERROR_CODES.senseVoiceWorkerFailed, 'SenseVoice is already processing audio')
  const sherpa = require('sherpa-onnx-node') as SherpaOnnxApi
  try {
    recognizer = await sherpa.OfflineRecognizer.createAsync({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        senseVoice: { model: request.modelPath, useInverseTextNormalization: 1 },
        tokens: request.tokensPath,
        numThreads: 2,
        provider: 'cpu',
        debug: 0
      }
    })
  } catch (error) {
    throw new EarsError(EARS_ERROR_CODES.senseVoiceNativeUnavailable, 'SenseVoice could not load the selected ONNX model', {
      detail: sanitizeEarsErrorText(errorText(error))
    })
  }
}

async function transcribe(audioPath: string): Promise<{ text: string; segments: readonly { text: string; start: number; end: number }[] }> {
  if (recognizer === undefined) throw new EarsError(EARS_ERROR_CODES.senseVoiceNativeUnavailable, 'SenseVoice has no loaded model')
  if (active) throw new EarsError(EARS_ERROR_CODES.senseVoiceWorkerFailed, 'SenseVoice is already processing audio')
  active = true
  try {
    const sherpa = require('sherpa-onnx-node') as SherpaOnnxApi
    const wave = sherpa.readWave(audioPath)
    if (wave.sampleRate !== 16000 || wave.samples.length === 0) {
      throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'SenseVoice expects non-empty mono 16 kHz audio')
    }
    const stream = recognizer.createStream()
    stream.acceptWaveform(wave)
    const result = await recognizer.decodeAsync(stream)
    if (typeof result.text !== 'string' || result.text.trim() === '') {
      throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'SenseVoice returned no transcript')
    }
    const tokens = Array.isArray(result.tokens) && result.tokens.every((token) => typeof token === 'string') ? result.tokens as string[] : []
    const timestamps = Array.isArray(result.timestamps) && result.timestamps.every((time) => typeof time === 'number' && Number.isFinite(time)) ? result.timestamps as number[] : []
    const durations = Array.isArray(result.durations) && result.durations.every((time) => typeof time === 'number' && Number.isFinite(time)) ? result.durations as number[] : []
    return {
      text: result.text.trim(),
      segments: groupTimedTokens(tokens, timestamps, durations.length === tokens.length ? durations : [], wave.samples.length / wave.sampleRate)
    }
  } finally {
    active = false
  }
}

function send(response: SenseVoiceWorkerResponse): void {
  if (typeof process.send !== 'function' || !process.connected) return
  try {
    process.send(response, () => undefined)
  } catch {
    // The Host may close the IPC channel while the worker is exiting.
  }
}

function sendAndExit(response: SenseVoiceWorkerResponse): void {
  const exit = () => process.exit(0)
  if (typeof process.send !== 'function' || !process.connected) {
    exit()
    return
  }
  try {
    process.send(response, exit)
  } catch {
    exit()
    return
  }
  setTimeout(exit, 500).unref()
}

function serializeError(error: unknown): SenseVoiceWorkerError {
  const record = error !== null && typeof error === 'object' ? error as { code?: unknown } : {}
  const code = typeof record.code === 'string' && isEarsErrorCode(record.code) ? record.code : undefined
  return {
    message: sanitizeEarsErrorText(errorText(error)),
    ...(code === undefined ? {} : { code })
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
