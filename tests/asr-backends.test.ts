import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import {
  defaultWhisperUseGpu,
  disposeWhisperRuntime,
  getLoadedWhisperVariant,
  isWhisperAvailable,
  preflightWhisperNativePackage,
  releaseWhisperModelContext,
  transcribeWithWhisper,
  validateWhisperTranscription,
  whisperNativePackageName,
  WHISPER_NATIVE_UNAVAILABLE_CODE,
  WHISPER_RESTART_REQUIRED_CODE
} from '../src/asr/local-whisper.js'
import { transcribeOpenAICompatible } from '../src/asr/openai-compatible.js'

const native = vi.hoisted(() => ({
  loadWhisperModule: vi.fn(async () => ({})),
  initWhisper: vi.fn()
}))

vi.mock('@fugood/whisper.node', () => native)

afterEach(async () => {
  await disposeWhisperRuntime()
  native.loadWhisperModule.mockClear()
  native.initWhisper.mockReset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function pcm16Wav(): Uint8Array {
  const audio = new Uint8Array(46)
  const view = new DataView(audio.buffer)
  const write = (offset: number, value: string) => value.split('').forEach((char, index) => { audio[offset + index] = char.charCodeAt(0) })
  write(0, 'RIFF')
  view.setUint32(4, 38, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, 2, true)
  view.setInt16(44, 0, true)
  return audio
}

function transcriptionOptions(overrides: Partial<Parameters<typeof transcribeWithWhisper>[0]> = {}) {
  return {
    audio: pcm16Wav(),
    mimeType: 'audio/wav',
    language: 'zh-CN',
    model: 'tiny' as const,
    signal: new AbortController().signal,
    modelPath: 'C:/models/ggml-tiny.bin',
    ...overrides
  }
}

describe('local whisper native preflight', () => {
  it('maps the requested variant to the exact official platform package', () => {
    expect(whisperNativePackageName('default', 'win32', 'x64')).toBe('@fugood/node-whisper-win32-x64')
    expect(whisperNativePackageName('vulkan', 'win32', 'x64')).toBe('@fugood/node-whisper-win32-x64-vulkan')
    expect(whisperNativePackageName('cuda', 'linux', 'arm64')).toBe('@fugood/node-whisper-linux-arm64-cuda')
  })

  it('only preflights the exact package and does not use a default fallback', () => {
    const required: string[] = []
    const packageName = preflightWhisperNativePackage('cuda', (name) => {
      required.push(name)
      return { WhisperContext: function WhisperContext() {} }
    })
    expect(packageName).toBe(whisperNativePackageName('cuda'))
    expect(required).toEqual([packageName])
  })

  it('reports an exact package load failure', () => {
    try {
      preflightWhisperNativePackage('cuda', (name) => { throw new Error(`${name} DLL failed`) })
      throw new Error('expected preflight to fail')
    } catch (error) {
      expect(error).toMatchObject({ code: WHISPER_NATIVE_UNAVAILABLE_CODE })
    }
  })

  it('uses platform defaults for GPU selection', () => {
    expect(defaultWhisperUseGpu('default', 'darwin', 'arm64')).toBe(true)
    expect(defaultWhisperUseGpu('default', 'win32', 'x64')).toBe(false)
    expect(defaultWhisperUseGpu('default', 'linux', 'x64')).toBe(false)
    expect(defaultWhisperUseGpu('cuda', 'win32', 'x64')).toBe(true)
    expect(defaultWhisperUseGpu('vulkan', 'linux', 'x64')).toBe(true)
  })
})

describe('local Whisper backend', () => {
  it('waits for the first in-flight native load before requiring a restart', async () => {
    let resolveLoad!: () => void
    const loading = new Promise<void>((resolve) => { resolveLoad = resolve })
    native.loadWhisperModule.mockImplementationOnce(() => loading.then(() => ({})))

    const first = isWhisperAvailable('default')
    await vi.waitFor(() => expect(native.loadWhisperModule).toHaveBeenCalledWith('default'))
    let waitingSettled = false
    const waiting = isWhisperAvailable('cuda').then(
      (value) => {
        waitingSettled = true
        return { status: 'fulfilled' as const, value }
      },
      (error: unknown) => {
        waitingSettled = true
        return { status: 'rejected' as const, error }
      }
    )
    await Promise.resolve()
    expect(waitingSettled).toBe(false)

    resolveLoad()
    await expect(first).resolves.toBe(true)
    await expect(waiting).resolves.toMatchObject({
      status: 'rejected',
      error: {
        code: WHISPER_RESTART_REQUIRED_CODE,
        loadedVariant: 'default',
        requestedVariant: 'cuda'
      }
    })
  })

  it('probes the requested variant before the high-level API can initialize it', async () => {
    await expect(isWhisperAvailable('default')).resolves.toBe(true)
    expect(getLoadedWhisperVariant()).toBe('default')
  })

  it('requires a Host restart instead of switching the process variant', async () => {
    await expect(isWhisperAvailable('vulkan')).rejects.toMatchObject({ code: WHISPER_RESTART_REQUIRED_CODE })
    expect(native.loadWhisperModule).not.toHaveBeenCalledWith('vulkan')
  })

  it('rejects non-WAV input before loading a native context', async () => {
    await expect(transcribeWithWhisper(transcriptionOptions({ mimeType: 'audio/webm' }))).rejects.toThrow('PCM16 WAV')
    expect(native.initWhisper).not.toHaveBeenCalled()
  })

  it('creates one long-lived context and serializes transcriptions on it', async () => {
    const transcribeFile = vi.fn(() => ({
      stop: vi.fn(async () => undefined),
      promise: Promise.resolve({ result: '本地转录结果', segments: [], isAborted: false })
    }))
    const release = vi.fn(async () => undefined)
    native.initWhisper.mockResolvedValue({ transcribeFile, release })

    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('本地转录结果')
    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('本地转录结果')
    expect(native.initWhisper).toHaveBeenCalledTimes(1)
    expect(native.initWhisper).toHaveBeenCalledWith({ filePath: 'C:/models/ggml-tiny.bin', useGpu: false }, 'default')
    expect(transcribeFile).toHaveBeenCalledTimes(2)
  })

  it('calls stop on the active native job when AbortSignal aborts', async () => {
    const controller = new AbortController()
    let resolvePromise: ((value: { result: string; segments: []; isAborted: boolean }) => void) | undefined
    const stop = vi.fn(async () => undefined)
    const transcribeFile = vi.fn(() => ({
      stop,
      promise: new Promise((resolve) => { resolvePromise = resolve })
    }))
    native.initWhisper.mockResolvedValue({ transcribeFile, release: vi.fn(async () => undefined) })

    const pending = transcribeWithWhisper(transcriptionOptions({ signal: controller.signal }))
    await vi.waitFor(() => expect(transcribeFile).toHaveBeenCalledTimes(1))
    controller.abort()
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
    resolvePromise?.({ result: '', segments: [], isAborted: true })
    await expect(pending).rejects.toThrow()
  })

  it('rejects a queued caller immediately and skips its native job after cancellation', async () => {
    let resolveFirst!: (value: { result: string; segments: []; isAborted: boolean }) => void
    const firstPromise = new Promise<{ result: string; segments: []; isAborted: boolean }>((resolve) => { resolveFirst = resolve })
    const transcribeFile = vi.fn()
      .mockImplementationOnce(() => ({ stop: vi.fn(async () => undefined), promise: firstPromise }))
      .mockImplementationOnce(() => ({ stop: vi.fn(async () => undefined), promise: Promise.resolve({ result: 'should not run', segments: [], isAborted: false }) }))
    native.initWhisper.mockResolvedValue({ transcribeFile, release: vi.fn(async () => undefined) })

    const first = transcribeWithWhisper(transcriptionOptions())
    await vi.waitFor(() => expect(transcribeFile).toHaveBeenCalledTimes(1))
    const controller = new AbortController()
    const queued = transcribeWithWhisper(transcriptionOptions({ signal: controller.signal }))
    controller.abort(new Error('queued transcription cancelled'))

    await expect(queued).rejects.toThrow('queued transcription cancelled')
    expect(transcribeFile).toHaveBeenCalledTimes(1)

    resolveFirst({ result: 'first result', segments: [], isAborted: false })
    await expect(first).resolves.toBe('first result')
    await vi.waitFor(() => expect(native.initWhisper).toHaveBeenCalledTimes(1))
    expect(transcribeFile).toHaveBeenCalledTimes(1)
  })

  it('releases only the model context without disposing the runtime', async () => {
    const release = vi.fn(async () => undefined)
    native.initWhisper.mockResolvedValue({
      transcribeFile: () => ({ stop: vi.fn(async () => undefined), promise: Promise.resolve({ result: 'ok', segments: [], isAborted: false }) }),
      release
    })

    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('ok')
    await releaseWhisperModelContext()
    expect(release).toHaveBeenCalledTimes(1)

    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('ok')
    expect(native.initWhisper).toHaveBeenCalledTimes(2)
  })

  it('releases the context and allows a fresh runtime after dispose', async () => {
    const release = vi.fn(async () => undefined)
    native.initWhisper.mockResolvedValue({
      transcribeFile: () => ({ stop: vi.fn(async () => undefined), promise: Promise.resolve({ result: 'ok', segments: [], isAborted: false }) }),
      release
    })
    await transcribeWithWhisper(transcriptionOptions())
    await disposeWhisperRuntime()
    expect(release).toHaveBeenCalledTimes(1)
    native.initWhisper.mockResolvedValue({
      transcribeFile: () => ({ stop: vi.fn(async () => undefined), promise: Promise.resolve({ result: 'again', segments: [], isAborted: false }) }),
      release: vi.fn(async () => undefined)
    })
    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('again')
    expect(native.initWhisper).toHaveBeenCalledTimes(2)
  })
})

describe('local Whisper transcription pre-flight', () => {
  const readyState = {
    runtimeAvailable: true,
    downloaded: true,
    downloading: false,
    progress: null,
    bytes: null,
    totalBytes: 100,
    error: null
  }

  it('accepts a downloaded model on a host with the native runtime', () => {
    expect(() => validateWhisperTranscription(readyState)).not.toThrow()
  })

  it('rejects a host without the native runtime', () => {
    expect(() => validateWhisperTranscription({ ...readyState, runtimeAvailable: false })).toThrow('native runtime')
  })

  it('rejects an unhealthy model state query', () => {
    expect(() => validateWhisperTranscription({ ...readyState, error: 'table broken' })).toThrow('table broken')
  })

  it('rejects a model that is not downloaded', () => {
    expect(() => validateWhisperTranscription({ ...readyState, downloaded: false })).toThrow('not downloaded')
  })
})

describe('OpenAI-compatible cloud ASR backend', () => {
  it('sends multipart audio and resolves the JSON transcript', async () => {
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ text: request.headers.authorization === 'Bearer test-credential-placeholder' && body.includes('whisper-1') ? '云端转录结果' : '' }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server did not expose an address')
    try {
      await expect(transcribeOpenAICompatible({
        audio: Uint8Array.from([1, 2, 3]),
        mimeType: 'audio/webm',
        language: 'zh-CN',
        endpoint: `http://127.0.0.1:${address.port}/audio/transcriptions`,
        model: 'whisper-1',
        credential: 'test-credential-placeholder',
        signal: new AbortController().signal
      })).resolves.toBe('云端转录结果')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('rejects endpoints that embed credentials in the URL', async () => {
    await expect(transcribeOpenAICompatible({
      audio: Uint8Array.from([1]),
      mimeType: 'audio/wav',
      language: 'en-US',
      endpoint: 'https://user:pass@example.com/audio/transcriptions',
      model: 'whisper-1',
      signal: new AbortController().signal
    })).rejects.toThrow('must not contain credentials')
  })

  it('bounds a chunked response before parsing it', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.write(Buffer.alloc(1_048_577, 65))
      response.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server did not expose an address')
    try {
      await expect(transcribeOpenAICompatible({
        audio: Uint8Array.from([1]),
        mimeType: 'audio/wav',
        language: 'en-US',
        endpoint: `http://127.0.0.1:${address.port}/audio/transcriptions`,
        model: 'whisper-1',
        signal: new AbortController().signal
      })).rejects.toThrow('response is too large')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('times out an unresponsive endpoint', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })))

    const pending = transcribeOpenAICompatible({
      audio: Uint8Array.from([1]),
      mimeType: 'audio/wav',
      language: 'en-US',
      endpoint: 'https://asr.example.test/audio/transcriptions',
      model: 'whisper-1',
      signal: new AbortController().signal
    })
    const rejection = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(120_000)
    await rejection
  })
})
