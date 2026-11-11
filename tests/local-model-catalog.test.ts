import { describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { listLocalModelOptions } from '../src/asr/local-model-catalog.js'
import { SENSEVOICE_MODEL_MANIFEST } from '../src/asr/sensevoice-models.js'
import { WHISPER_MODEL_MANIFEST } from '../src/asr/whisper-models.js'

describe('local model catalog', () => {
  it('pulls the models that exist at the selected Whisper source', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return new Response(null, {
        status: url.endsWith('/ggml-tiny.bin') || url.endsWith('/ggml-small.bin') ? 200 : 404,
        headers: url.endsWith('/ggml-tiny.bin')
          ? { 'content-length': String(WHISPER_MODEL_MANIFEST.tiny.bytes) }
          : url.endsWith('/ggml-small.bin')
            ? { 'content-length': String(WHISPER_MODEL_MANIFEST.small.bytes) }
            : undefined
      })
    }) as typeof globalThis.fetch

    await expect(listLocalModelOptions('local-whisper', 'custom', 'https://mirror.example/models/', undefined, { fetch }))
      .resolves.toEqual({ backend: 'local-whisper', source: 'custom', models: ['tiny', 'small'] })
    expect(fetch).toHaveBeenCalledTimes(WHISPER_MODEL_IDS_LENGTH)
    expect(fetch).toHaveBeenCalledWith('https://mirror.example/models/ggml-tiny.bin', expect.objectContaining({ method: 'HEAD' }))
  })

  it('requires both the SenseVoice ONNX file and shared token vocabulary', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      const present = url.endsWith('/tokens.txt') || url.endsWith('/model.int8.onnx')
      const bytes = url.endsWith('/tokens.txt')
        ? SENSEVOICE_MODEL_MANIFEST['small-int8'].tokens.bytes
        : SENSEVOICE_MODEL_MANIFEST['small-int8'].model.bytes
      return new Response(null, { status: present ? 200 : 404, headers: present ? { 'content-length': String(bytes) } : undefined })
    }) as typeof globalThis.fetch

    await expect(listLocalModelOptions('local-sensevoice', 'official', 'https://models.example/sensevoice/', undefined, { fetch }))
      .resolves.toEqual({ backend: 'local-sensevoice', source: 'official', models: ['small-int8'] })
  })

  it('lists both SenseVoice model variants when both ONNX files are present', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof globalThis.fetch
    await expect(listLocalModelOptions('local-sensevoice', 'official', 'https://models.example/sensevoice/', undefined, { fetch }))
      .resolves.toEqual({ backend: 'local-sensevoice', source: 'official', models: ['small-int8', 'small-fp32'] })
  })

  it('rejects unsupported local model backend ids', async () => {
    await expect(listLocalModelOptions('cloud-openai', 'official', 'https://models.example/', undefined))
      .rejects.toMatchObject({ code: EARS_ERROR_CODES.localModelCatalogFailed })
  })
})

const WHISPER_MODEL_IDS_LENGTH = Object.keys(WHISPER_MODEL_MANIFEST).length
