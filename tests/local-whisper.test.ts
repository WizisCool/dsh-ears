import { describe, expect, it } from 'vitest'
import { LocalWhisperRuntime, whisperAccelerationCapabilities, whisperNativePackageName, type LocalWhisperWorker, type WhisperPackageResolver } from '../src/asr/local-whisper.js'
import { float32PcmToPcm16Wav } from '../src/asr/pcm-wav.js'

function resolverPackages(available: readonly string[]): WhisperPackageResolver {
  const names = new Set(available)
  return {
    resolve(name: string) {
      if (!names.has(name)) throw new Error(`Missing test package: ${name}`)
      return name
    }
  }
}

describe('Local Whisper acceleration defaults', () => {
  it('uses the platform default variant when it is installed', () => {
    const resolver = resolverPackages([
      whisperNativePackageName('default', 'win32', 'x64'),
      whisperNativePackageName('vulkan', 'win32', 'x64'),
      whisperNativePackageName('cuda', 'win32', 'x64')
    ])

    expect(whisperAccelerationCapabilities('win32', 'x64', resolver)).toEqual({
      available: ['default', 'vulkan', 'cuda'],
      default: 'default'
    })
  })

  it('falls back to an installed platform variant when the default is unavailable', () => {
    const resolver = resolverPackages([whisperNativePackageName('vulkan', 'win32', 'x64')])

    expect(whisperAccelerationCapabilities('win32', 'x64', resolver)).toEqual({
      available: ['vulkan'],
      default: 'vulkan'
    })
  })

  it('uses default when the platform has no supported native package', () => {
    expect(whisperAccelerationCapabilities('freebsd', 'x64', resolverPackages([]))).toEqual({
      available: [],
      default: 'default'
    })
  })
})

describe('Local Whisper detailed transcription', () => {
  it('returns the worker segment times alongside the complete transcript', async () => {
    const worker: LocalWhisperWorker = {
      alive: true,
      request: async (payload) => payload.type === 'transcribe'
        ? { kind: 'text', text: 'Hello.', isAborted: false, segments: [{ text: 'Hello.', start: 0.1, end: 0.9 }] }
        : { kind: 'none' },
      cancelActive: () => undefined,
      kill: () => undefined,
      shutdown: async () => undefined,
      onExit: () => () => undefined
    }
    const runtime = new LocalWhisperRuntime(() => worker)
    try {
      await expect(runtime.transcribeDetailed({
        audio: float32PcmToPcm16Wav(new Float32Array(16_000).fill(0.1), 16_000),
        mimeType: 'audio/wav',
        language: 'en',
        model: 'tiny',
        signal: new AbortController().signal,
        modelPath: '/models/tiny.bin',
        variant: 'default',
        useGpu: false
      })).resolves.toEqual({ text: 'Hello.', segments: [{ text: 'Hello.', start: 0.1, end: 0.9 }] })
    } finally {
      await runtime.dispose()
    }
  })
})
