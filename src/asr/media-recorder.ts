export interface RecordedAudio {
  readonly base64: string
  readonly mimeType: string
}

export function isMediaRecorderAvailable(): boolean {
  return typeof navigator !== 'undefined'
    && navigator.mediaDevices?.getUserMedia !== undefined
    && typeof MediaRecorder !== 'undefined'
}

export class MediaRecorderSession {
  private readonly recorder: MediaRecorder
  private readonly stream: MediaStream
  private readonly chunks: Blob[] = []
  private aborted = false

  private constructor(stream: MediaStream, recorder: MediaRecorder) {
    this.stream = stream
    this.recorder = recorder
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    })
  }

  static async create(): Promise<MediaRecorderSession> {
    if (!isMediaRecorderAvailable()) throw new Error('Media recording is unavailable in this browser')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
    try {
      const mimeType = supportedMimeType()
      const recorder = mimeType === '' ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType })
      return new MediaRecorderSession(stream, recorder)
    } catch (error) {
      stopTracks(stream)
      throw error
    }
  }

  start(): void {
    if (this.aborted) throw new Error('Media recording session is no longer active')
    this.recorder.start(1_000)
  }

  stop(): Promise<RecordedAudio> {
    if (this.aborted) return Promise.reject(abortError())
    if (this.recorder.state === 'inactive') return this.finish()
    return new Promise((resolve, reject) => {
      this.recorder.addEventListener('stop', () => {
        void this.finish().then(resolve, reject)
      }, { once: true })
      this.recorder.addEventListener('error', () => reject(new Error('Media recording failed')), { once: true })
      this.recorder.stop()
    })
  }

  abort(): void {
    if (this.aborted) return
    this.aborted = true
    if (this.recorder.state !== 'inactive') this.recorder.stop()
    this.chunks.length = 0
    stopTracks(this.stream)
  }

  private async finish(): Promise<RecordedAudio> {
    try {
      if (this.aborted) throw abortError()
      const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' })
      return {
        base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
        mimeType: blob.type
      }
    } finally {
      stopTracks(this.stream)
      this.chunks.length = 0
    }
  }
}

export function supportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const mimeType of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType
  }
  return ''
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function stopTracks(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop()
}

function abortError(): DOMException {
  return new DOMException('The recording was aborted', 'AbortError')
}
