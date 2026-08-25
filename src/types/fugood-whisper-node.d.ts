declare module '@fugood/whisper.node' {
  export type LibVariant = 'default' | 'vulkan' | 'cuda'

  export interface NativeContextOptions {
    filePath: string
    useFlashAttn?: boolean
    useGpu?: boolean
    maxModelBytes?: number
  }

  export interface TranscribeOptions {
    language?: string
    translate?: boolean
    maxThreads?: number
    temperature?: number
    temperatureInc?: number
    beamSize?: number
    bestOf?: number
    onProgress?: (progress: number) => void
  }

  export interface TranscribeResult {
    language?: string
    result: string
    segments: Array<{ text: string; t0: number; t1: number }>
    isAborted: boolean
  }

  export interface TranscriptionJob {
    stop(): Promise<void>
    promise: Promise<TranscribeResult>
  }

  export interface WhisperContext {
    transcribeFile(filePath: string, options?: TranscribeOptions): TranscriptionJob
    transcribeData(audioData: ArrayBuffer, options?: TranscribeOptions): TranscriptionJob
    release(): Promise<void>
  }

  export interface WhisperNodeModule {
    WhisperContext: {
      new (options: NativeContextOptions): WhisperContext | Promise<WhisperContext>
    }
  }

  export function loadWhisperModule(variant?: LibVariant): Promise<WhisperNodeModule>
  export function initWhisper(options: NativeContextOptions, variant?: LibVariant): Promise<WhisperContext>
}
