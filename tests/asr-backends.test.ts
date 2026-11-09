import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES, EarsError } from '../src/errors.js'
import {
  defaultWhisperUseGpu,
  disposeWhisperRuntime,
  getLoadedWhisperVariant,
  isWhisperAvailable,
  preflightWhisperNativePackage,
  releaseWhisperModelContext,
  transcribeWithWhisper,
  withWhisperModelContextReleased,
  validateWhisperTranscription,
  whisperAccelerationCapabilities,
  whisperNativePackageName,
  WHISPER_NATIVE_UNAVAILABLE_CODE,
  WHISPER_RESTART_REQUIRED_CODE,
  type WhisperPackageResolver
} from '../src/asr/local-whisper.js'
import type { WhisperWorkerValue } from '../src/asr/whisper-worker-protocol.js'
import { transcribeOpenAICompatible } from '../src/asr/openai-compatible.js'
import { readBoundedText } from '../src/asr/transport.js'

const workerHarness = vi.hoisted(() => {
  type Request = { type: string }
  type Handler = (request: Request) => Promise<unknown>
  const defaults: { init: Handler; transcribe: Handler; release: Handler } = {
    init: async () => ({ kind: 'none' }),
    transcribe: async () => ({ kind: 'text', text: 'ok', isAborted: false }),
    release: async () => ({ kind: 'none' })
  }
  class FakeWorker {
    static instances: FakeWorker[] = []
    alive = true
    readonly requests: Request[] = []
    initHandler: Handler = defaults.init
    transcribeHandler: Handler = defaults.transcribe
    releaseHandler: Handler = defaults.release
    readonly cancelActive = vi.fn()
    readonly kill = vi.fn(() => { this.alive = false })
    readonly shutdown = vi.fn(async () => { this.alive = false })
    private exitListener: ((error: Error) => void) | undefined
    constructor() { FakeWorker.instances.push(this) }
    onExit(listener: (error: Error) => void): () => void {
      this.exitListener = listener
      return () => { if (this.exitListener === listener) this.exitListener = undefined }
    }
    exit(error: Error): void {
      this.alive = false
      this.exitListener?.(error)
    }
    request(payload: Request): Promise<unknown> {
      this.requests.push(payload)
      if (payload.type === 'init') return this.initHandler(payload)
      if (payload.type === 'transcribe') return this.transcribeHandler(payload)
      if (payload.type === 'release') return this.releaseHandler(payload)
      return Promise.resolve({ kind: 'none' })
    }
    count(type: string): number {
      return this.requests.filter((request) => request.type === type).length
    }
  }
  const spawn = vi.fn(() => new FakeWorker())
  const reset = () => {
    defaults.init = async () => ({ kind: 'none' })
    defaults.transcribe = async () => ({ kind: 'text', text: 'ok', isAborted: false })
    defaults.release = async () => ({ kind: 'none' })
  }
  return { FakeWorker, defaults, reset, spawn }
})

vi.mock('../src/asr/whisper-worker-client.js', () => ({ spawnWhisperWorker: workerHarness.spawn }))

afterEach(async () => {
  await disposeWhisperRuntime()
  workerHarness.spawn.mockClear()
  workerHarness.FakeWorker.instances.length = 0
  workerHarness.reset()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function packageResolver(available: readonly string[], resolved: string[] = []): WhisperPackageResolver {
  const names = new Set(available)
  return {
    resolve(name: string) {
      if (!names.has(name)) throw new Error(`Missing test package: ${name}`)
      resolved.push(name)
      return name
    }
  }
}

function latestWorkerAfterSpawn(): InstanceType<typeof workerHarness.FakeWorker> {
  const worker = workerHarness.FakeWorker.instances.at(-1)
  if (worker === undefined) throw new Error('No fake Whisper worker was created')
  return worker
}

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
    useGpu: false,
    ...overrides
  }
}

describe('local whisper native preflight', () => {
  it('maps the requested variant to the exact official platform package', () => {
    expect(whisperNativePackageName('default', 'win32', 'x64')).toBe('@fugood/node-whisper-win32-x64')
    expect(whisperNativePackageName('vulkan', 'win32', 'x64')).toBe('@fugood/node-whisper-win32-x64-vulkan')
    expect(whisperNativePackageName('cuda', 'linux', 'arm64')).toBe('@fugood/node-whisper-linux-arm64-cuda')
  })

  it('only resolves the exact package and does not use a default fallback', () => {
    const resolved: string[] = []
    const packageName = preflightWhisperNativePackage('cuda', {
      resolve: (name) => {
        resolved.push(name)
        return name
      }
    })
    expect(packageName).toBe(whisperNativePackageName('cuda'))
    expect(resolved).toEqual([packageName])
  })

  it('reports an exact package that cannot be resolved', () => {
    try {
      preflightWhisperNativePackage('cuda', { resolve: (name) => { throw new Error(`${name} is missing`) } })
      throw new Error('expected preflight to fail')
    } catch (error) {
      expect(error).toMatchObject({ code: WHISPER_NATIVE_UNAVAILABLE_CODE })
    }
  })

  it('lists only the native variants supported by each platform', () => {
    const resolved: string[] = []
    const resolver = packageResolver([
      whisperNativePackageName('default', 'darwin', 'arm64')
    ], resolved)

    expect(whisperAccelerationCapabilities('darwin', 'arm64', resolver)).toEqual({
      available: ['default'],
      default: 'default'
    })
    expect(resolved).toEqual(['@fugood/node-whisper-darwin-arm64'])
    expect(whisperAccelerationCapabilities('win32', 'arm64', packageResolver([
      whisperNativePackageName('default', 'win32', 'arm64')
    ])).available).toEqual(['default'])
    expect(whisperAccelerationCapabilities('freebsd', 'x64', packageResolver([]))).toEqual({ available: [], default: 'default' })
  })

  it('filters platform variants whose optional packages are not installed', () => {
    const resolver = packageResolver([
      whisperNativePackageName('default', 'linux', 'x64'),
      whisperNativePackageName('vulkan', 'linux', 'x64')
    ])

    expect(whisperAccelerationCapabilities('linux', 'x64', resolver)).toEqual({
      available: ['default', 'vulkan'],
      default: 'default'
    })
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
  it('preflights variants without spawning a native worker', async () => {
    const resolver = packageResolver([
      whisperNativePackageName('default'),
      whisperNativePackageName('cuda')
    ])

    await expect(Promise.all([
      isWhisperAvailable('default', undefined, resolver),
      isWhisperAvailable('cuda', undefined, resolver)
    ])).resolves.toEqual([true, true])
    expect(workerHarness.spawn).not.toHaveBeenCalled()
    expect(getLoadedWhisperVariant()).toBeUndefined()
  })

  it('requires a Host restart only after an actual transcription initializes the variant', async () => {
    await expect(transcribeWithWhisper(transcriptionOptions({ variant: 'default' }))).resolves.toBe('ok')
    expect(getLoadedWhisperVariant()).toBe('default')
    expect(latestWorkerAfterSpawn().count('init')).toBe(1)

    await expect(isWhisperAvailable('vulkan', undefined, packageResolver([]))).rejects.toMatchObject({
      code: WHISPER_RESTART_REQUIRED_CODE,
      loadedVariant: 'default',
      requestedVariant: 'vulkan'
    })
  })

  it('rejects non-WAV input before starting a native worker', async () => {
    await expect(transcribeWithWhisper(transcriptionOptions({ mimeType: 'audio/webm' }))).rejects.toThrow('PCM16 WAV')
    expect(workerHarness.spawn).not.toHaveBeenCalled()
  })

  it('creates one long-lived context and serializes transcriptions on it', async () => {
    workerHarness.defaults.transcribe = async () => ({ kind: 'text', text: '本地转录结果', isAborted: false })

    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('本地转录结果')
    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('本地转录结果')

    const worker = latestWorkerAfterSpawn()
    expect(workerHarness.spawn).toHaveBeenCalledTimes(1)
    expect(worker.count('init')).toBe(1)
    expect(worker.requests[0]).toMatchObject({
      type: 'init',
      modelPath: 'C:/models/ggml-tiny.bin',
      variant: 'default',
      useGpu: false
    })
    expect(worker.count('transcribe')).toBe(2)
  })

  it('keeps a new transcription behind an exclusive context-release operation', async () => {
    let resolveFirst!: (value: WhisperWorkerValue) => void
    let transcribeCalls = 0
    workerHarness.defaults.transcribe = () => {
      transcribeCalls += 1
      if (transcribeCalls === 1) return new Promise((resolve) => { resolveFirst = resolve })
      return Promise.resolve({ kind: 'text', text: 'second result', isAborted: false })
    }

    const first = transcribeWithWhisper(transcriptionOptions())
    const firstRejection = expect(first).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrUnexpected })
    await vi.waitFor(() => expect(transcribeCalls).toBe(1))
    const worker = latestWorkerAfterSpawn()

    let allowExclusive!: () => void
    const exclusiveGate = new Promise<void>((resolve) => { allowExclusive = resolve })
    let second: Promise<string> | undefined
    const exclusive = withWhisperModelContextReleased(async () => {
      second = transcribeWithWhisper(transcriptionOptions())
      await Promise.resolve()
      expect(worker.count('transcribe')).toBe(1)
      await exclusiveGate
      return 'deleted'
    })

    resolveFirst({ kind: 'text', text: '', isAborted: true })
    await firstRejection
    await vi.waitFor(() => expect(worker.count('release')).toBe(1))
    expect(second).toBeDefined()
    expect(worker.count('transcribe')).toBe(1)

    allowExclusive()
    await expect(exclusive).resolves.toBe('deleted')
    await expect(second).resolves.toBe('second result')
    expect(worker.count('transcribe')).toBe(2)
    expect(worker.count('init')).toBe(2)
  })

  it('cancels the active worker job when AbortSignal aborts', async () => {
    const controller = new AbortController()
    let resolveTranscription: ((value: WhisperWorkerValue) => void) | undefined
    workerHarness.defaults.transcribe = () => new Promise((resolve) => { resolveTranscription = resolve })

    const pending = transcribeWithWhisper(transcriptionOptions({ signal: controller.signal }))
    await vi.waitFor(() => expect(workerHarness.FakeWorker.instances).toHaveLength(1))
    const worker = latestWorkerAfterSpawn()
    await vi.waitFor(() => expect(worker.count('transcribe')).toBe(1))
    controller.abort()
    await vi.waitFor(() => expect(worker.cancelActive).toHaveBeenCalledTimes(1))
    await expect(pending).rejects.toThrow()

    resolveTranscription?.({ kind: 'text', text: '', isAborted: true })
    await vi.waitFor(() => expect(worker.count('transcribe')).toBe(1))
  })

  it('rejects a queued caller immediately and skips its native job after cancellation', async () => {
    let resolveFirst!: (value: WhisperWorkerValue) => void
    workerHarness.defaults.transcribe = () => new Promise((resolve) => { resolveFirst = resolve })

    const first = transcribeWithWhisper(transcriptionOptions())
    await vi.waitFor(() => expect(workerHarness.FakeWorker.instances).toHaveLength(1))
    const worker = latestWorkerAfterSpawn()
    await vi.waitFor(() => expect(worker.count('transcribe')).toBe(1))
    const controller = new AbortController()
    const queued = transcribeWithWhisper(transcriptionOptions({ signal: controller.signal }))
    controller.abort(new Error('queued transcription cancelled'))

    await expect(queued).rejects.toThrow('queued transcription cancelled')
    expect(worker.count('transcribe')).toBe(1)

    resolveFirst({ kind: 'text', text: 'first result', isAborted: false })
    await expect(first).resolves.toBe('first result')
    expect(worker.count('init')).toBe(1)
    expect(worker.count('transcribe')).toBe(1)
  })

  it('releases only the model context without disposing the runtime', async () => {
    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('ok')
    const worker = latestWorkerAfterSpawn()
    await releaseWhisperModelContext()
    expect(worker.count('release')).toBe(1)

    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('ok')
    expect(worker.count('init')).toBe(2)
    expect(worker.shutdown).not.toHaveBeenCalled()
  })

  it('surfaces a failed release instead of deleting under a live context', async () => {
    workerHarness.defaults.release = async () => {
      throw new EarsError(EARS_ERROR_CODES.whisperReleaseFailed, 'native release failed')
    }

    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('ok')
    await expect(withWhisperModelContextReleased(async () => 'deleted')).rejects.toMatchObject({
      code: EARS_ERROR_CODES.whisperReleaseFailed
    })
  })

  it('recovers with a fresh worker after an unexpected native crash', async () => {
    let rejectTranscription!: (error: Error) => void
    workerHarness.defaults.transcribe = () => new Promise((_, reject) => { rejectTranscription = reject })

    const pending = transcribeWithWhisper(transcriptionOptions())
    await vi.waitFor(() => expect(workerHarness.FakeWorker.instances).toHaveLength(1))
    const firstWorker = latestWorkerAfterSpawn()
    await vi.waitFor(() => expect(firstWorker.count('transcribe')).toBe(1))
    const crash = new EarsError(EARS_ERROR_CODES.whisperWorkerFailed, 'worker aborted')
    rejectTranscription(crash)
    firstWorker.exit(crash)
    await expect(pending).rejects.toMatchObject({ code: EARS_ERROR_CODES.whisperWorkerFailed })

    workerHarness.defaults.transcribe = async () => ({ kind: 'text', text: 'after crash', isAborted: false })
    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('after crash')
    expect(workerHarness.spawn).toHaveBeenCalledTimes(2)
    expect(latestWorkerAfterSpawn().count('init')).toBe(1)
  })

  it('shuts the worker down and starts a fresh runtime after dispose', async () => {
    await transcribeWithWhisper(transcriptionOptions())
    const worker = latestWorkerAfterSpawn()
    await disposeWhisperRuntime()
    expect(worker.shutdown).toHaveBeenCalledTimes(1)

    workerHarness.defaults.transcribe = async () => ({ kind: 'text', text: 'again', isAborted: false })
    await expect(transcribeWithWhisper(transcriptionOptions())).resolves.toBe('again')
    expect(workerHarness.spawn).toHaveBeenCalledTimes(2)
  })
})

describe('bounded ASR response bodies', () => {
  it('cancels a pending body reader when the request is aborted', async () => {
    const controller = new AbortController()
    let resolveRead!: (result: { done: true }) => void
    const read = vi.fn(() => new Promise<{ done: true }>((resolve) => {
      resolveRead = resolve
    }))
    const cancel = vi.fn(async () => {
      resolveRead({ done: true })
    })
    const releaseLock = vi.fn()
    const response = {
      headers: new Headers(),
      body: { getReader: () => ({ read, cancel, releaseLock }) }
    } as unknown as Response
    const pending = readBoundedText(response, 1024, controller.signal)
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())

    const reason = new Error('request cancelled')
    controller.abort(reason)

    await expect(pending).rejects.toBe(reason)
    expect(cancel).toHaveBeenCalledWith(reason)
    expect(releaseLock).toHaveBeenCalledOnce()
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
        response.end(JSON.stringify({ text: body.includes('whisper-1') ? '云端转录结果' : '' }))
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
        signal: new AbortController().signal
      })).resolves.toBe('云端转录结果')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('forwards a credential to an HTTPS endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer test-credential-placeholder')
      expect(init?.redirect).toBe('manual')
      return new Response(JSON.stringify({ text: 'authenticated transcription' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeOpenAICompatible({
      audio: Uint8Array.from([1]),
      mimeType: 'audio/wav',
      language: 'en-US',
      endpoint: 'https://asr.example.test/audio/transcriptions',
      model: 'whisper-1',
      credential: 'test-credential-placeholder',
      signal: new AbortController().signal
    })).resolves.toBe('authenticated transcription')
    expect(fetchMock).toHaveBeenCalledOnce()
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

  it('requires HTTPS when an endpoint credential is configured', async () => {
    await expect(transcribeOpenAICompatible({
      audio: Uint8Array.from([1]),
      mimeType: 'audio/wav',
      language: 'en-US',
      endpoint: 'http://127.0.0.1:12345/audio/transcriptions',
      model: 'whisper-1',
      credential: 'test-credential-placeholder',
      signal: new AbortController().signal
    })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrEndpointInvalid })
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
