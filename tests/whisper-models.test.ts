import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WHISPER_MODEL_MANIFEST,
  WhisperModels,
  whisperCacheDirectory,
  whisperModelPath,
  type WhisperModelDefinition,
  type WhisperModelState
} from '../src/asr/whisper-models.js'

const TEST_BYTES = Buffer.from('small deterministic whisper model fixture')
const TEST_SHA256 = createHash('sha256').update(TEST_BYTES).digest('hex')
const TEST_DEFINITION: WhisperModelDefinition = {
  fileName: 'ggml-tiny.bin',
  url: 'https://models.example.test/ggml-tiny.bin',
  sha256: TEST_SHA256,
  bytes: TEST_BYTES.byteLength
}

const managers: WhisperModels[] = []
const directories: string[] = []

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.dispose()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function makeManager(fetch: typeof globalThis.fetch = async () => new Response(TEST_BYTES, { headers: { 'content-length': String(TEST_BYTES.byteLength) } }), definition: WhisperModelDefinition = TEST_DEFINITION) {
  const cacheDir = await mkdtemp(joinPath(tmpdir(), 'dsh-ears-whisper-models-'))
  directories.push(cacheDir)
  const manager = new WhisperModels({
    env: { ...process.env, DSH_EARS_WHISPER_CACHE_DIR: cacheDir },
    fetch,
    manifest: { tiny: definition }
  })
  managers.push(manager)
  return { manager, cacheDir }
}

async function waitForState(manager: WhisperModels, predicate: (state: WhisperModelState) => boolean, timeoutMs = 5000): Promise<WhisperModelState> {
  const deadline = Date.now() + timeoutMs
  let state = await manager.getWhisperModelState('tiny', true)
  while (!predicate(state)) {
    if (Date.now() > deadline) throw new Error('timed out waiting for whisper model state')
    await new Promise((resolve) => setTimeout(resolve, 10))
    state = await manager.getWhisperModelState('tiny', true)
  }
  return state
}

describe('whisper model manifest and paths', () => {
  it('contains the six fixed whisper.cpp model definitions', () => {
    expect(Object.keys(WHISPER_MODEL_MANIFEST)).toEqual(['tiny', 'base', 'small', 'medium', 'large', 'turbo'])
    for (const definition of Object.values(WHISPER_MODEL_MANIFEST)) {
      expect(definition.url).toContain('huggingface.co/ggerganov/whisper.cpp')
      expect(definition.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(definition.bytes).toBeGreaterThan(0)
    }
  })

  it('uses platform cache conventions and ggml file names', () => {
    expect(whisperCacheDirectory('linux', { XDG_CACHE_HOME: '/cache', HOME: '/home/test' }).replaceAll('\\', '/')).toBe('/cache/dsh-ears/whisper')
    expect(whisperModelPath('tiny', 'linux', { XDG_CACHE_HOME: '/cache', HOME: '/home/test' }).replaceAll('\\', '/')).toBe('/cache/dsh-ears/whisper/ggml-tiny.bin')
  })
})

describe('whisper.cpp model lifecycle', () => {
  it('reports a missing model without probing Python or a CLI', async () => {
    const { manager } = await makeManager()
    await expect(manager.getWhisperModelState('tiny', true)).resolves.toMatchObject({
      runtimeAvailable: true,
      downloaded: false,
      downloading: false,
      error: null
    })
  })

  it('downloads to a partial file, verifies SHA-256, renames atomically, and writes a completion marker', async () => {
    const { manager, cacheDir } = await makeManager()
    await manager.downloadWhisperModel('tiny', true)
    const done = await waitForState(manager, (state) => !state.downloading)
    expect(done).toMatchObject({ downloaded: true, error: null, progress: null })
    const filePath = `${cacheDir}/ggml-tiny.bin`
    const markerPath = `${filePath}.dsh-ears-done`
    expect(await readFile(filePath)).toEqual(TEST_BYTES)
    expect(await readFile(markerPath, 'utf8')).toContain(TEST_SHA256)
    await expect(stat(`${filePath}.partial`)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a same-size model file after its bytes change', async () => {
    const { manager, cacheDir } = await makeManager()
    await manager.downloadWhisperModel('tiny', true)
    await waitForState(manager, (state) => state.downloaded)
    const tampered = Buffer.from(TEST_BYTES)
    tampered[0] ^= 1
    await writeFile(`${cacheDir}/ggml-tiny.bin`, tampered)

    await expect(manager.getWhisperModelState('tiny', true)).resolves.toMatchObject({
      downloaded: false,
      errorCode: 'whisper.modelUnverified'
    })
  })

  it('removes an invalid download and reports checksum failure', async () => {
    const { manager, cacheDir } = await makeManager(async () => new Response(Buffer.from('wrong'), { headers: { 'content-length': '5' } }), { ...TEST_DEFINITION, bytes: 5 })
    await manager.downloadWhisperModel('tiny', true)
    const done = await waitForState(manager, (state) => !state.downloading)
    expect(done.downloaded).toBe(false)
    expect(done.error).toContain('checksum')
    expect(done.errorCode).toBe('whisper.downloadFailed')
    await expect(stat(`${cacheDir}/ggml-tiny.bin`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(`${cacheDir}/ggml-tiny.bin.partial`)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('stops a stream when it exceeds the manifest size', async () => {
    const chunks = [TEST_BYTES, Buffer.from('extra'), Buffer.from('tail')]
    let pulls = 0
    let cancels = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        const chunk = chunks.shift()
        if (chunk === undefined) {
          controller.close()
          return
        }
        controller.enqueue(chunk)
      },
      cancel() {
        cancels += 1
      }
    }, { highWaterMark: 0 })
    const { manager, cacheDir } = await makeManager(async () => new Response(stream, { headers: { 'content-length': String(TEST_BYTES.byteLength) } }))
    await manager.downloadWhisperModel('tiny', true)
    const done = await waitForState(manager, (state) => !state.downloading)
    expect(done.downloaded).toBe(false)
    expect(done.error).toContain('size mismatch')
    expect(done.errorCode).toBe('whisper.downloadFailed')
    expect(pulls).toBe(2)
    expect(cancels).toBe(1)
    await expect(stat(`${cacheDir}/ggml-tiny.bin.partial`)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a second model while one download is active', async () => {
    let releaseResponse: ((response: Response) => void) | undefined
    const fetch = vi.fn(async () => await new Promise<Response>((resolve) => { releaseResponse = resolve }))
    const { manager } = await makeManager(fetch)
    const first = manager.downloadWhisperModel('tiny', true)
    const second = manager.downloadWhisperModel('base', true)
    await first
    await waitForState(manager, (state) => state.downloading)
    const blocked = await second
    expect(blocked.error).toBe('Another Whisper model is already downloading.')
    expect(blocked.errorCode).toBe('whisper.alreadyDownloading')
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    releaseResponse?.(new Response(TEST_BYTES, { headers: { 'content-length': String(TEST_BYTES.byteLength) } }))
    await waitForState(manager, (state) => !state.downloading)
  })

  it('cancels a streaming download and removes the partial file', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
        controller.enqueue(TEST_BYTES.subarray(0, 4))
      }
    })
    const { manager, cacheDir } = await makeManager(async () => new Response(stream, { headers: { 'content-length': String(TEST_BYTES.byteLength) } }))
    await manager.downloadWhisperModel('tiny', true)
    await waitForState(manager, (state) => state.downloading)
    const cancelled = await manager.cancelWhisperModelDownload('tiny', true)
    expect(cancelled).toMatchObject({ downloading: false, downloaded: false, error: null })
    await expect(stat(`${cacheDir}/ggml-tiny.bin.partial`)).rejects.toMatchObject({ code: 'ENOENT' })
    streamController?.error(new Error('closed'))
  })

  it('falls back to filesystem probing after reporting a failed download once', async () => {
    const { manager, cacheDir } = await makeManager(async () => {
      throw new Error('network unreachable')
    })
    await manager.downloadWhisperModel('tiny', true)
    const failed = await waitForState(manager, (state) => !state.downloading)
    expect(failed.error).toBe('network unreachable')
    expect(failed.downloaded).toBe(false)

    await expect(manager.getWhisperModelState('tiny', true)).resolves.toMatchObject({
      downloaded: false,
      downloading: false,
      error: null
    })

    // A manually recovered and verified model becomes visible without a restart.
    await writeFile(`${cacheDir}/ggml-tiny.bin`, TEST_BYTES)
    await writeFile(`${cacheDir}/ggml-tiny.bin.dsh-ears-done`, JSON.stringify({ version: 1, model: 'tiny', sha256: TEST_SHA256, bytes: TEST_BYTES.byteLength }))
    await expect(manager.getWhisperModelState('tiny', true)).resolves.toMatchObject({
      downloaded: true,
      error: null
    })
  })

  it('deletes the model, marker, and stale partial file', async () => {
    const { manager, cacheDir } = await makeManager()
    await manager.downloadWhisperModel('tiny', true)
    await waitForState(manager, (state) => state.downloaded)
    await writeFile(`${cacheDir}/ggml-tiny.bin.partial`, 'stale')
    await expect(manager.deleteWhisperModel('tiny', true)).resolves.toMatchObject({ downloaded: false, error: null })
    await expect(stat(`${cacheDir}/ggml-tiny.bin`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(`${cacheDir}/ggml-tiny.bin.dsh-ears-done`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(`${cacheDir}/ggml-tiny.bin.partial`)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('disposes an active download without leaving model artifacts', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const stream = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller } })
    const { manager, cacheDir } = await makeManager(async () => new Response(stream, { headers: { 'content-length': String(TEST_BYTES.byteLength) } }))
    await manager.downloadWhisperModel('tiny', true)
    await waitForState(manager, (state) => state.downloading)
    manager.dispose()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await expect(stat(`${cacheDir}/ggml-tiny.bin.partial`)).rejects.toMatchObject({ code: 'ENOENT' })
    streamController?.error(new Error('closed'))
  })
})

function joinPath(...parts: string[]): string {
  return parts.join('/').replaceAll('\\', '/')
}
