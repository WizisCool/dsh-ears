import { audioToPcm16Wav, type AudioBufferLike } from '../asr/pcm-wav.js'

/** The payload shape returned by MediaRecorderSession. */
export interface RecordedAudioPayload {
  readonly base64: string
  readonly mimeType: string
}

export type MediaCaptureBackend = 'local-whisper' | 'cloud-openai'

interface LocalWhisperAudioContext {
  decodeAudioData(audioData: ArrayBuffer): Promise<AudioBufferLike>
  close(): Promise<void>
}

type AudioContextConstructor = new () => LocalWhisperAudioContext

export interface LocalWhisperAudioOptions {
  readonly signal?: AbortSignal
  /** Cloud provider selected for the cloud-openai backend. */
  readonly cloudProvider?: string
  /** Injectable for tests; production uses AudioContext or webkitAudioContext. */
  readonly createAudioContext?: () => LocalWhisperAudioContext
}

/**
 * Prepare the MediaRecorder payload for the selected ASR backend.
 * Local Whisper, Tencent Cloud standard recording, and Xiaomi MiMo get
 * browser-decoded PCM WAV; other cloud providers keep the original MediaRecorder codec.
 */
export function prepareRecordedAudioForBackend(
  backend: MediaCaptureBackend,
  audio: RecordedAudioPayload,
  options: LocalWhisperAudioOptions = {}
): Promise<RecordedAudioPayload> {
  if (backend === 'local-whisper') return normalizeRecordedAudioForLocalWhisper(audio, options)
  if (backend === 'cloud-openai') {
    return (options.cloudProvider === 'tencent' || options.cloudProvider === 'mimo')
      ? normalizeRecordedAudioForLocalWhisper(audio, options)
      : Promise.resolve(audio)
  }
  throw new Error(`Unsupported media capture backend: ${String(backend)}`)
}

/** Keep the final send guard in one small, directly testable place. */
export function isTranscriptionStillCurrent(options: {
  readonly mounted: boolean
  readonly signal: AbortSignal
  readonly captureIsCurrent: boolean
}): boolean {
  return options.mounted && !options.signal.aborted && options.captureIsCurrent
}

/**
 * Decode a browser MediaRecorder payload and convert it to mono 16 kHz
 * PCM16 WAV for the Host-side local Whisper runtime.
 */
export async function normalizeRecordedAudioForLocalWhisper(
  audio: RecordedAudioPayload,
  options: LocalWhisperAudioOptions = {}
): Promise<RecordedAudioPayload> {
  throwIfAborted(options.signal)
  const context = (options.createAudioContext ?? createBrowserAudioContext)()

  try {
    let decoded: AudioBufferLike
    try {
      decoded = await context.decodeAudioData(base64ToArrayBuffer(audio.base64))
    } catch (error) {
      throw new Error('Failed to decode recorded audio', { cause: error })
    }
    throwIfAborted(options.signal)

    const wav = audioToPcm16Wav(decoded)
    throwIfAborted(options.signal)
    return {
      base64: bytesToBase64(wav),
      mimeType: 'audio/wav'
    }
  } finally {
    try {
      await context.close()
    } catch {
      // AudioContext cleanup must not mask a transcription or decode failure.
    }
  }
}

function createBrowserAudioContext(): LocalWhisperAudioContext {
  const scope = globalThis as typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor
  }
  const Constructor = scope.AudioContext as unknown as AudioContextConstructor | undefined
    ?? scope.webkitAudioContext
  if (Constructor === undefined) {
    throw new Error('Audio decoding is unavailable in this browser')
  }
  return new Constructor()
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  throw createAbortError()
}

function createAbortError(): DOMException {
  return new DOMException('The local Whisper audio conversion was aborted', 'AbortError')
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}
