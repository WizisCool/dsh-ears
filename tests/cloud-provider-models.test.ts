import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCloudProviderModels } from '../src/asr/cloud-provider-models.js'
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

    await expect(fetchCloudProviderModels(groqEntry(), ' gsk_test ', new AbortController().signal)).resolves.toEqual([
      'whisper-large-v3-turbo',
      'whisper-large-v3'
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({ headers: { accept: 'application/json', authorization: 'Bearer gsk_test' } })
    )
  })

  it('answers from static models when the provider has no listing endpoint', async () => {
    const entry = { ...groqEntry(), baseUrl: undefined, staticModels: ['static-whisper'] }
    await expect(fetchCloudProviderModels(entry, 'gsk_test', new AbortController().signal)).resolves.toEqual(['static-whisper'])
  })

  it('rejects invalid JSON and missing data arrays', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 200 })))
    await expect(fetchCloudProviderModels(groqEntry(), 'gsk_test', new AbortController().signal)).rejects.toThrow('invalid JSON')

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [] }), { status: 200 })))
    await expect(fetchCloudProviderModels(groqEntry(), 'gsk_test', new AbortController().signal)).rejects.toThrow('no models')
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
