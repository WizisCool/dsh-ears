export const VOICE_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
}

type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

export class AudioLevelMonitor {
  private readonly context: AudioContext
  private readonly analyser: AnalyserNode
  private readonly source: MediaStreamAudioSourceNode
  private readonly samples: Uint8Array<ArrayBuffer>
  private readonly stream: MediaStream
  private readonly ownsStream: boolean
  private readonly onLevel: (level: number) => void
  private frame: number | null = null
  private lastSampleAt = -Infinity
  private stopped = false

  private constructor(stream: MediaStream, ownsStream: boolean, onLevel: (level: number) => void) {
    const AudioContextConstructor = getAudioContextConstructor()
    if (AudioContextConstructor === undefined) throw new Error('Audio waveform analysis is unavailable in this browser')
    this.stream = stream
    this.ownsStream = ownsStream
    this.onLevel = onLevel
    this.context = new AudioContextConstructor()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.smoothingTimeConstant = 0.72
    this.samples = new Uint8Array(this.analyser.fftSize)
    this.source = this.context.createMediaStreamSource(stream)
    this.source.connect(this.analyser)
    void this.context.resume().catch(() => undefined)
    this.frame = requestAnimationFrame(this.sample)
  }

  static async capture(onLevel: (level: number) => void): Promise<AudioLevelMonitor> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: VOICE_AUDIO_CONSTRAINTS })
    try {
      return new AudioLevelMonitor(stream, true, onLevel)
    } catch (error) {
      stopTracks(stream)
      throw error
    }
  }

  static fromStream(stream: MediaStream, onLevel: (level: number) => void): AudioLevelMonitor {
    return new AudioLevelMonitor(stream, false, onLevel)
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.source.disconnect()
    this.analyser.disconnect()
    if (this.ownsStream) stopTracks(this.stream)
    void this.context.close().catch(() => undefined)
  }

  private readonly sample = (timestamp: number): void => {
    if (this.stopped) return
    if (timestamp - this.lastSampleAt >= 50) {
      this.lastSampleAt = timestamp
      this.analyser.getByteTimeDomainData(this.samples)
      this.onLevel(audioLevelFromTimeDomain(this.samples))
    }
    this.frame = requestAnimationFrame(this.sample)
  }
}

export function audioLevelFromTimeDomain(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let sumSquares = 0
  for (const sample of samples) {
    const amplitude = (sample - 128) / 128
    sumSquares += amplitude * amplitude
  }
  const rms = Math.sqrt(sumSquares / samples.length)
  return Math.max(0, Math.min(1, rms * 4.5))
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const audioWindow = window as AudioContextWindow
  return window.AudioContext ?? audioWindow.webkitAudioContext
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}
