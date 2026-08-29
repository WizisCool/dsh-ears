import { AudioLevelMonitor, VOICE_AUDIO_CONSTRAINTS } from '../asr/audio-level.js'
import { audioToPcm16Wav } from '../asr/pcm-wav.js'

const TARGET_SAMPLE_RATE = 16_000
const BUFFER_SIZE = 1024
const REALTIME_AUDIO_CHUNK_SAMPLES = TARGET_SAMPLE_RATE / 25
const REALTIME_AUDIO_CHUNK_BYTES = REALTIME_AUDIO_CHUNK_SAMPLES * 2
const REALTIME_CHUNK_DELIVERY_TIMEOUT_MS = 5_000

export function isRealtimeAudioCaptureAvailable(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') return false
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }
  const Constructor = scope.AudioContext ?? scope.webkitAudioContext
  return Constructor !== undefined && typeof Constructor.prototype.createScriptProcessor === 'function'
}

export interface RealtimeAudioCapture {
  createLevelMonitor(onLevel: (level: number) => void): AudioLevelMonitor
  start(onChunk: (audioBase64: string) => Promise<void>): void
  stop(): Promise<void>
  abort(): void
}

type AudioContextLike = AudioContext

export class RealtimeAudioCaptureSession implements RealtimeAudioCapture {
  private readonly stream: MediaStream
  private readonly context: AudioContextLike
  private readonly source: MediaStreamAudioSourceNode
  private readonly processor: ScriptProcessorNode
  private readonly sink: GainNode
  // Provider adapters send a packet before waiting for its response. Keep
  // packet deliveries independent so a slow response cannot stall capture;
  // stop() still awaits every delivery before the caller sends the end marker.
  private readonly deliveries = new Set<Promise<void>>()
  private onChunk: ((audioBase64: string) => Promise<void>) | undefined
  private pendingPcm = new Uint8Array()
  private resamplePhase = 0
  private closed = false
  private failure: unknown

  private constructor(stream: MediaStream, context: AudioContextLike) {
    this.stream = stream
    this.context = context
    this.source = context.createMediaStreamSource(stream)
    this.processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1)
    this.sink = context.createGain()
    this.sink.gain.value = 0
    this.source.connect(this.processor)
    this.processor.connect(this.sink)
    this.sink.connect(context.destination)
    this.processor.onaudioprocess = (event) => {
      if (this.closed || this.onChunk === undefined) return
      const samples = event.inputBuffer.getChannelData(0)
      const resampled = resampleToPcm16(samples, event.inputBuffer.sampleRate, this.resamplePhase)
      this.resamplePhase = resampled.phase
      if (resampled.pcm.byteLength === 0) return
      this.enqueuePcm(this.onChunk, resampled.pcm)
    }
  }

  static async create(): Promise<RealtimeAudioCaptureSession> {
    if (!isRealtimeAudioCaptureAvailable()) throw new Error('Realtime audio capture is unavailable in this browser')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: VOICE_AUDIO_CONSTRAINTS })
    try {
      const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }
      const Constructor = scope.AudioContext ?? scope.webkitAudioContext
      if (Constructor === undefined) throw new Error('Realtime audio capture is unavailable in this browser')
      const context = new Constructor()
      await context.resume()
      return new RealtimeAudioCaptureSession(stream, context)
    } catch (error) {
      stopTracks(stream)
      throw error
    }
  }

  createLevelMonitor(onLevel: (level: number) => void): AudioLevelMonitor {
    if (this.closed) throw new Error('Realtime audio capture is no longer active')
    return AudioLevelMonitor.fromStream(this.stream, onLevel)
  }

  start(onChunk: (audioBase64: string) => Promise<void>): void {
    if (this.closed) throw new Error('Realtime audio capture is no longer active')
    this.onChunk = onChunk
  }

  async stop(): Promise<void> {
    if (this.closed) return
    const callback = this.onChunk
    this.closed = true
    this.onChunk = undefined
    if (callback !== undefined && this.pendingPcm.byteLength > 0) {
      this.enqueueChunk(callback, this.pendingPcm)
      this.pendingPcm = new Uint8Array()
    }
    this.processor.onaudioprocess = null
    this.source.disconnect()
    this.processor.disconnect()
    this.sink.disconnect()
    stopTracks(this.stream)
    try {
      await Promise.all([...this.deliveries])
      if (this.failure !== undefined) throw this.failure
    } finally {
      await this.context.close()
    }
  }

  abort(): void {
    if (this.closed) return
    this.closed = true
    this.onChunk = undefined
    this.pendingPcm = new Uint8Array()
    this.processor.onaudioprocess = null
    this.source.disconnect()
    this.processor.disconnect()
    this.sink.disconnect()
    stopTracks(this.stream)
    void this.context.close().catch(() => undefined)
  }

  private enqueuePcm(callback: ((audioBase64: string) => Promise<void>) | undefined, pcm: Uint8Array): void {
    if (callback === undefined) return
    const combined = new Uint8Array(this.pendingPcm.byteLength + pcm.byteLength)
    combined.set(this.pendingPcm)
    combined.set(pcm, this.pendingPcm.byteLength)
    let offset = 0
    while (combined.byteLength - offset >= REALTIME_AUDIO_CHUNK_BYTES) {
      this.enqueueChunk(callback, combined.subarray(offset, offset + REALTIME_AUDIO_CHUNK_BYTES))
      offset += REALTIME_AUDIO_CHUNK_BYTES
    }
    this.pendingPcm = combined.slice(offset)
  }

  private enqueueChunk(callback: (audioBase64: string) => Promise<void>, pcm: Uint8Array): void {
    const delivery = (async () => {
      if (this.failure !== undefined) return
      await deliverChunk(callback, bytesToBase64(pcm))
    })().catch((error) => {
      this.failure ??= error
    })
    this.deliveries.add(delivery)
    void delivery.finally(() => this.deliveries.delete(delivery))
  }
}

function resampleToPcm16(samples: Float32Array, sampleRate: number, phase: number): { pcm: Uint8Array; phase: number } {
  if (samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return { pcm: new Uint8Array(), phase }
  const exactOutputSamples = samples.length * TARGET_SAMPLE_RATE / sampleRate + phase
  const roundingTolerance = Number.EPSILON * Math.max(1, Math.abs(exactOutputSamples)) * 4
  const outputSamples = Math.floor(exactOutputSamples + roundingTolerance)
  const nextPhase = Math.max(0, exactOutputSamples - outputSamples)
  if (outputSamples === 0) return { pcm: new Uint8Array(), phase: nextPhase }
  const floatSamples = new Float32Array(outputSamples)
  for (let index = 0; index < outputSamples; index += 1) {
    const position = index * (samples.length - 1) / Math.max(1, outputSamples - 1)
    const lower = Math.floor(position)
    const upper = Math.min(samples.length - 1, lower + 1)
    const fraction = position - lower
    floatSamples[index] = (samples[lower] ?? 0) + ((samples[upper] ?? 0) - (samples[lower] ?? 0)) * fraction
  }
  return {
    pcm: audioToPcm16Wav({ sampleRate: TARGET_SAMPLE_RATE, channelData: [floatSamples] }).subarray(44),
    phase: nextPhase
  }
}

async function deliverChunk(callback: (audioBase64: string) => Promise<void>, audioBase64: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      callback(audioBase64),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Realtime audio chunk delivery timed out')), REALTIME_CHUNK_DELIVERY_TIMEOUT_MS)
      })
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  return btoa(binary)
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}
