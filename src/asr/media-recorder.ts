export interface RecordedAudio {
  readonly base64: string
  readonly mimeType: string
}

const MAX_AUDIO_BYTES = 24 * 1024 * 1024

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
  private closed = false
  private stopPromise: Promise<RecordedAudio> | undefined
  private stopReject: ((reason: unknown) => void) | undefined
  private stopCleanup: (() => void) | undefined
  private totalBytes = 0
  private recordingError: Error | undefined

  private constructor(stream: MediaStream, recorder: MediaRecorder) {
    this.stream = stream
    this.recorder = recorder
    recorder.addEventListener('dataavailable', (event) => {
      if (this.closed || event.data.size === 0) return
      this.totalBytes += event.data.size
      if (this.totalBytes > MAX_AUDIO_BYTES) {
        this.recordingError ??= new Error('The recorded audio is too large')
        this.closed = true
        queueMicrotask(() => {
          void this.stop().catch(() => undefined)
        })
        return
      }
      this.chunks.push(event.data)
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
    if (this.closed || this.stopPromise !== undefined) throw new Error('Media recording session cannot be restarted')
    if (this.recorder.state !== 'inactive') throw new Error('Media recording session has already started')
    try {
      this.recorder.start(1_000)
    } catch (error) {
      this.aborted = true
      this.closed = true
      stopTracks(this.stream)
      throw error
    }
  }

  stop(): Promise<RecordedAudio> {
    if (this.aborted) return Promise.reject(abortError())
    if (this.stopPromise !== undefined) return this.stopPromise
    if (this.recorder.state === 'inactive') {
      this.stopPromise = this.finish()
      return this.stopPromise
    }

    this.stopPromise = new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        this.recorder.removeEventListener('stop', onStop)
        this.recorder.removeEventListener('error', onError)
        if (this.stopCleanup === cleanup) this.stopCleanup = undefined
      }
      const fail = (error: unknown) => {
        if (settled) return
        settled = true
        cleanup()
        this.stopReject = undefined
        this.closed = true
        this.chunks.length = 0
        this.totalBytes = 0
        stopTracks(this.stream)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
      const onStop = () => {
        if (settled) return
        settled = true
        cleanup()
        this.stopReject = undefined
        void this.finish().then(resolve, reject)
      }
      const onError = () => fail(new Error('Media recording failed'))

      this.stopReject = (reason) => fail(reason)
      this.stopCleanup = cleanup
      this.recorder.addEventListener('stop', onStop)
      this.recorder.addEventListener('error', onError)
      try {
        this.recorder.stop()
      } catch (error) {
        fail(error)
      }
    })
    return this.stopPromise
  }

  abort(): void {
    if (this.aborted) return
    this.aborted = true
    this.closed = true
    this.stopCleanup?.()
    this.stopCleanup = undefined
    this.stopReject?.(abortError())
    this.stopReject = undefined
    if (this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop()
      } catch {
        // The tracks are released below even when the browser rejects stop().
      }
    }
    this.chunks.length = 0
    this.totalBytes = 0
    stopTracks(this.stream)
  }

  private async finish(): Promise<RecordedAudio> {
    try {
      if (this.aborted) throw abortError()
      if (this.recordingError !== undefined) throw this.recordingError
      const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (this.aborted) throw abortError()
      return {
        base64: bytesToBase64(bytes),
        mimeType: blob.type
      }
    } finally {
      this.closed = true
      stopTracks(this.stream)
      this.chunks.length = 0
      this.totalBytes = 0
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
