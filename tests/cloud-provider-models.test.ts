import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCloudProviderModels, filterDeepgramModels } from '../src/asr/cloud-provider-models.js'
import { cloudProviderEntry } from '../src/asr/providers.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function groqEntry() {
  const entry = cloudProviderEntry('groq')
  if (entry === undefined) throw new Error('Groq provider entry is missing')
  return entry
}

function deepgramEntry() {
  const entry = cloudProviderEntry('deepgram')
  if (entry === undefined) throw new Error('Deepgram provider entry is missing')
  return entry
}

describe('cloud provider model listing', () => {
  it('lists models with a bearer header and applies the registry filter', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      data: [
        { id: 'whisper-large-v3-turbo' },
        { id: 'whisper-large-v3' },
        { id: 'llama-3.3-70b-versatile' },
        { id: 'playai-tts' }
      ]
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCloudProviderModels(groqEntry(), ' gsk_test ', new AbortController().signal)).resolves.toEqual({
      models: [
        'whisper-large-v3-turbo',
        'whisper-large-v3'
      ]
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({ headers: { accept: 'application/json', authorization: 'Bearer gsk_test' } })
    )
  })

  it('answers from static models when the provider has no listing endpoint', async () => {
    const entry = { ...groqEntry(), baseUrl: undefined, staticModels: ['static-whisper'] }
    await expect(fetchCloudProviderModels(entry, 'gsk_test', new AbortController().signal)).resolves.toEqual({ models: ['static-whisper'] })
  })

  it('lists Deepgram models with Token authorization and scientific filtering/ranking', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      stt: [
        { canonical_name: 'nova-3-general', architecture: 'nova-3' },
        { canonical_name: 'nova-3-medical', architecture: 'nova-3' },
        { canonical_name: 'nova-2-meeting', architecture: 'nova-2' },
        { canonical_name: 'nova-2-general', architecture: 'nova-2' },
        { canonical_name: 'enhanced-general', architecture: 'polaris' },
        { canonical_name: 'phoneme', architecture: 'base' },
        { canonical_name: 'general-dQw4w9WgXcQ', architecture: 'base' },
        { canonical_name: 'whisper-large', architecture: 'whisper' }
      ]
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await fetchCloudProviderModels(deepgramEntry(), 'dg_token', new AbortController().signal)
    expect(models).toEqual({
      models: [
        'nova-3',
        'nova-3-general',
        'nova-3-medical',
        'nova-2',
        'nova-2-general',
        'nova-2-meeting',
        'enhanced',
        'enhanced-general',
        'whisper-large'
      ],
      // The Whisper entry carries no batch/streaming flags, so the only
      // projected capability is the Whisper streaming correction.
      modelCapabilities: { 'whisper-large': { streaming: false } }
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepgram.com/v1/models',
      expect.objectContaining({ headers: { accept: 'application/json', authorization: 'Token dg_token' } })
    )
  })

  it('rejects invalid JSON and missing data arrays', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 200 })))
    await expect(fetchCloudProviderModels(groqEntry(), 'gsk_test', new AbortController().signal)).rejects.toThrow('invalid JSON')

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })))
    await expect(fetchCloudProviderModels(groqEntry(), 'gsk_test', new AbortController().signal)).rejects.toThrow('no models')
  })

  it('retains explicit Deepgram batch and streaming capabilities', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      stt: [
        { canonical_name: 'batch-only', batch: true, streaming: false },
        { canonical_name: 'stream-only', batch: false, streaming: true },
        { canonical_name: 'dual-mode', batch: true, streaming: true },
        { canonical_name: 'unknown-mode' }
      ]
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCloudProviderModels(deepgramEntry(), 'dg_token', new AbortController().signal)).resolves.toEqual({
      models: ['batch-only', 'dual-mode', 'stream-only', 'unknown-mode'],
      modelCapabilities: {
        'batch-only': { batch: true, streaming: false },
        'stream-only': { batch: false, streaming: true },
        'dual-mode': { batch: true, streaming: true }
      }
    })
  })

  it('marks a Flux architecture model as Listen V2 so the adapter cannot expose it', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      stt: [
        { canonical_name: 'flux-general-en', architecture: 'flux', batch: false, streaming: true },
        { canonical_name: 'nova-3-general', architecture: 'nova-3', batch: true, streaming: true }
      ]
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCloudProviderModels(deepgramEntry(), 'dg_token', new AbortController().signal)).resolves.toEqual({
      models: ['nova-3', 'nova-3-general', 'flux-general-en'],
      modelCapabilities: {
        // The adapter's default transport (Listen V1) is omitted; only a model
        // that needs a newer generation carries an explicit transport.
        'nova-3': { batch: true, streaming: true },
        'nova-3-general': { batch: true, streaming: true },
        'flux-general-en': { batch: false, streaming: true, transport: 'listen-v2' }
      }
    })
  })

  it('forces streaming off for Whisper architecture entries the catalog overreports as streaming', async () => {
    // Live /v1/models responses report streaming: true for every Whisper entry,
    // but Whisper Cloud is pre-recorded only; the documented batch-only support wins.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      stt: [
        { canonical_name: 'whisper-large', architecture: 'whisper', batch: true, streaming: true },
        { canonical_name: 'nova-3-general', architecture: 'nova-3', batch: true, streaming: true }
      ]
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchCloudProviderModels(deepgramEntry(), 'dg_token', new AbortController().signal)).resolves.toEqual({
      models: ['nova-3', 'nova-3-general', 'whisper-large'],
      modelCapabilities: {
        'nova-3': { batch: true, streaming: true },
        'nova-3-general': { batch: true, streaming: true },
        'whisper-large': { batch: true, streaming: false }
      }
    })
  })

  it('copies exact capabilities to provider aliases without inferring from the alias name', () => {
    expect(filterDeepgramModels([
      { canonical_name: 'nova-3-general', batch: true, streaming: false }
    ])).toEqual({
      models: ['nova-3', 'nova-3-general'],
      modelCapabilities: {
        'nova-3': { batch: true, streaming: false },
        'nova-3-general': { batch: true, streaming: false }
      }
    })
  })

  it('keeps exact alias metadata when the catalog also returns the alias itself', () => {
    expect(filterDeepgramModels([
      { canonical_name: 'nova-3', batch: false, streaming: true },
      { canonical_name: 'nova-3-general', batch: true, streaming: false }
    ])).toEqual({
      models: ['nova-3', 'nova-3-general'],
      modelCapabilities: {
        'nova-3': { batch: false, streaming: true },
        'nova-3-general': { batch: true, streaming: false }
      }
    })
  })

  it('surfaces a non-ok HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    await expect(fetchCloudProviderModels(groqEntry(), 'gsk_test', new AbortController().signal)).rejects.toThrow('HTTP 401')
  })

  it('bounds an oversized listing response', async () => {
    const oversized = JSON.stringify({ data: [{ id: 'x'.repeat(4 * 1024 * 1024) }] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(oversized, { status: 200 })))
    await expect(fetchCloudProviderModels(groqEntry(), 'gsk_test', new AbortController().signal)).rejects.toThrow('too large')
  })

  it('times out an unresponsive listing endpoint', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })))

    const pending = fetchCloudProviderModels(groqEntry(), 'gsk_test', new AbortController().signal)
    const rejection = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
  })
})
