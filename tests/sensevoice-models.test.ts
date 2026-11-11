import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { SenseVoiceModels, isValidLocalModelBaseUrl, type SenseVoiceModelDefinition } from '../src/asr/sensevoice-models.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('SenseVoice model manager', () => {
  it('downloads and verifies the ONNX and token files from a custom base URL', async () => {
    const directory = await temporaryDirectory()
    const model = Buffer.from('tiny ONNX fixture')
    const tokens = Buffer.from('token fixture')
    const manifest: SenseVoiceModelDefinition = {
      label: 'Test INT8 model',
      model: { fileName: 'model.int8.onnx', bytes: model.length, sha256: digest(model) },
      tokens: { fileName: 'tokens.txt', bytes: tokens.length, sha256: digest(tokens) }
    }
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const file = new URL(String(input)).pathname.split('/').pop()
      return new Response(file === 'model.int8.onnx' ? model : tokens, { status: 200 })
    }) as typeof globalThis.fetch
    const manager = new SenseVoiceModels({ directory, fetch, manifest: { 'small-int8': manifest } })
    try {
      const starting = await manager.downloadModel('small-int8', 'https://mirror.example/sensevoice/', true)
      expect(starting).toMatchObject({ runtimeAvailable: true, downloading: true, downloaded: false })
      const downloaded = await waitForDownload(manager)
      expect(downloaded).toMatchObject({ runtimeAvailable: true, downloading: false, downloaded: true, error: null })
      expect(await readFile(manager.modelPath('small-int8'))).toEqual(model)
      expect(await readFile(manager.tokensPath('small-int8'))).toEqual(tokens)
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally {
      manager.dispose()
    }
  })

  it('detects tampering after a successful download', async () => {
    const directory = await temporaryDirectory()
    const model = Buffer.from('model data')
    const tokens = Buffer.from('tokens data')
    const manifest: SenseVoiceModelDefinition = {
      label: 'Test INT8 model',
      model: { fileName: 'model.int8.onnx', bytes: model.length, sha256: digest(model) },
      tokens: { fileName: 'tokens.txt', bytes: tokens.length, sha256: digest(tokens) }
    }
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const file = new URL(String(input)).pathname.split('/').pop()
      return new Response(file === 'model.int8.onnx' ? model : tokens, { status: 200 })
    }) as typeof globalThis.fetch
    const manager = new SenseVoiceModels({ directory, fetch, manifest: { 'small-int8': manifest } })
    try {
      await manager.downloadModel('small-int8', 'https://mirror.example/sensevoice/', true)
      await waitForDownload(manager)
      manager.dispose()
      await writeFile(join(directory, 'small-int8', 'model.int8.onnx'), 'tampered')
      const verifier = new SenseVoiceModels({ directory, manifest: { 'small-int8': manifest } })
      const state = await verifier.getModelState('small-int8', 'https://mirror.example/sensevoice/', true)
      expect(state).toMatchObject({ downloaded: false, errorCode: EARS_ERROR_CODES.senseVoiceModelUnverified })
      verifier.dispose()
    } finally {
      manager.dispose()
    }
  })

  it('validates HTTP(S) model base URLs and rejects embedded credentials', () => {
    expect(isValidLocalModelBaseUrl('https://models.example/sensevoice/')).toBe(true)
    expect(isValidLocalModelBaseUrl('http://127.0.0.1:8080/models/')).toBe(true)
    expect(isValidLocalModelBaseUrl('https://user:pass@models.example/sensevoice/')).toBe(false)
    expect(isValidLocalModelBaseUrl('file:///models/sensevoice/')).toBe(false)
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-ears-sensevoice-test-'))
  temporaryDirectories.push(directory)
  return directory
}

async function waitForDownload(manager: SenseVoiceModels) {
  const timeout = Date.now() + 3_000
  while (Date.now() < timeout) {
    const state = await manager.getModelState('small-int8', 'https://mirror.example/sensevoice/', true)
    if (!state.downloading) return state
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('SenseVoice model download did not finish in time')
}

function digest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
