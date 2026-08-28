import { afterEach, describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES, EarsError } from '../src/errors.js'
import {
  audioFormatFromMime,
  extractMimoTranscript,
  mimoEndpoint,
  mimoErrorDetail,
  mimoLanguage,
  mimoRequestBody,
  transcribeMimoAsr
} from '../src/asr/mimo-asr.js'

describe('mimoEndpoint', () => {
  it('returns standard API endpoint for api service', () => {
    expect(mimoEndpoint('api', 'cn')).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    expect(mimoEndpoint('api', 'sgp')).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    expect(mimoEndpoint('', 'cn')).toBe('https://api.xiaomimimo.com/v1/chat/completions')
  })

  it('returns cluster-specific endpoints for token-plan service', () => {
    expect(mimoEndpoint('token-plan', 'cn')).toBe('https://token-plan-cn.xiaomimimo.com/v1/chat/completions')
    expect(mimoEndpoint('token-plan', 'sgp')).toBe('https://token-plan-sgp.xiaomimimo.com/v1/chat/completions')
    expect(mimoEndpoint('token-plan', 'ams')).toBe('https://token-plan-ams.xiaomimimo.com/v1/chat/completions')
    expect(mimoEndpoint('token-plan', 'unknown')).toBe('https://token-plan-cn.xiaomimimo.com/v1/chat/completions')
  })
})

describe('audioFormatFromMime', () => {
  it('detects mp3 and wav formats', () => {
    expect(audioFormatFromMime('audio/mp3')).toBe('mp3')
    expect(audioFormatFromMime('audio/mpeg')).toBe('mp3')
    expect(audioFormatFromMime('audio/mpeg;codecs=mp3')).toBe('mp3')
    expect(audioFormatFromMime('audio/wav')).toBe('wav')
    expect(audioFormatFromMime('audio/x-wav')).toBe('wav')
    expect(audioFormatFromMime('audio/webm')).toBe('wav')
  })
})

describe('mimoLanguage', () => {
  it('normalizes languages to auto, zh, or en', () => {
    expect(mimoLanguage('zh')).toBe('zh')
    expect(mimoLanguage('zh-CN')).toBe('zh')
    expect(mimoLanguage('en')).toBe('en')
    expect(mimoLanguage('en-US')).toBe('en')
    expect(mimoLanguage('')).toBe('auto')
    expect(mimoLanguage('auto')).toBe('auto')
    expect(mimoLanguage('fr')).toBe('auto')
  })
})

describe('mimoRequestBody', () => {
  it('constructs multimodal chat completions payload', () => {
    const body = mimoRequestBody('mimo-v2.5-asr', 'data:audio/wav;base64,AQID', 'audio/wav', 'zh-CN')
    expect(body).toEqual({
      model: 'mimo-v2.5-asr',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: {
                data: 'data:audio/wav;base64,AQID',
                format: 'wav'
              }
            }
          ]
        }
      ],
      asr_options: {
        language: 'zh'
      }
    })
  })
})

describe('extractMimoTranscript and mimoErrorDetail', () => {
  it('extracts transcript from valid chat completion response', () => {
    const response = {
      id: 'abc',
      choices: [
        {
          message: {
            role: 'assistant',
            content: '你好，世界'
          }
        }
      ]
    }
    expect(extractMimoTranscript(response)).toBe('你好，世界')
  })

  it('throws asrInvalidResponse for non-object responses', () => {
    expect(() => extractMimoTranscript(null)).toThrowError(
      expect.objectContaining({ code: EARS_ERROR_CODES.asrInvalidResponse })
    )
  })

  it('throws asrNoTranscript when content is missing', () => {
    expect(() => extractMimoTranscript({ choices: [] })).toThrowError(
      expect.objectContaining({ code: EARS_ERROR_CODES.asrNoTranscript })
    )
  })

  it('extracts error details correctly', () => {
    expect(mimoErrorDetail({ error: { message: 'API key invalid' } }, 401)).toBe('API key invalid')
    expect(mimoErrorDetail({ message: 'Generic error' }, 500)).toBe('Generic error')
    expect(mimoErrorDetail({}, 502)).toBe('Cloud ASR request failed with HTTP 502')
  })
})

describe('transcribeMimoAsr', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty string when audio is empty', async () => {
    const result = await transcribeMimoAsr({
      audio: new Uint8Array(0),
      mimeType: 'audio/wav',
      language: '',
      endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
      model: 'mimo-v2.5-asr',
      credential: 'sk_test',
      signal: new AbortController().signal
    })
    expect(result).toBe('')
  })

  it('throws asrModelNotConfigured when model is empty', async () => {
    await expect(
      transcribeMimoAsr({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/wav',
        language: '',
        endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
        model: '   ',
        credential: 'sk_test',
        signal: new AbortController().signal
      })
    ).rejects.toThrowError(expect.objectContaining({ code: EARS_ERROR_CODES.asrModelNotConfigured }))
  })

  it('throws asrApiKeyNotConfigured when credential is empty', async () => {
    await expect(
      transcribeMimoAsr({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/wav',
        language: '',
        endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
        model: 'mimo-v2.5-asr',
        credential: '   ',
        signal: new AbortController().signal
      })
    ).rejects.toThrowError(expect.objectContaining({ code: EARS_ERROR_CODES.asrApiKeyNotConfigured }))
  })

  it('rejects a non-WAV payload when it is labelled as MiMo audio', async () => {
    await expect(
      transcribeMimoAsr({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/webm',
        language: '',
        endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
        model: 'mimo-v2.5-asr',
        credential: 'sk_test',
        signal: new AbortController().signal
      })
    ).rejects.toThrowError(expect.objectContaining({ code: EARS_ERROR_CODES.asrMimeTypeMismatch }))
  })

  it('rejects a non-HTTPS endpoint that would carry the bearer credential', async () => {
    await expect(
      transcribeMimoAsr({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/wav',
        language: '',
        endpoint: 'http://api.xiaomimimo.com/v1/chat/completions',
        model: 'mimo-v2.5-asr',
        credential: 'sk_test',
        signal: new AbortController().signal
      })
    ).rejects.toThrowError(expect.objectContaining({ code: EARS_ERROR_CODES.asrEndpointInvalid }))
  })

  it('successfully transcribes audio with 200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: '测试转写成功'
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await transcribeMimoAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/wav',
      language: 'zh-CN',
      endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
      model: 'mimo-v2.5-asr',
      credential: 'sk_mimo',
      signal: new AbortController().signal
    })

    expect(result).toBe('测试转写成功')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.xiaomimimo.com/v1/chat/completions')
    expect(init.headers).toEqual({
      Authorization: 'Bearer sk_mimo',
      'Content-Type': 'application/json'
    })
    const parsedBody = JSON.parse(init.body)
    expect(parsedBody.model).toBe('mimo-v2.5-asr')
    expect(parsedBody.asr_options).toEqual({ language: 'zh' })
  })

  it('keeps the request timeout active while reading a response body', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const reader = {
          read: () => new Promise<never>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
          }),
          cancel: vi.fn(async () => undefined),
          releaseLock: vi.fn()
        }
        return { ok: true, status: 200, headers: new Headers(), body: { getReader: () => reader } } as unknown as Response
      })
      vi.stubGlobal('fetch', fetchMock)
      const pending = transcribeMimoAsr({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/wav',
        language: '',
        endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
        model: 'mimo-v2.5-asr',
        credential: 'sk_test',
        signal: new AbortController().signal
      })
      const rejection = expect(pending).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrRequestTimedOut })
      await vi.advanceTimersByTimeAsync(120_000)
      await rejection
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws asrHttpFailed when response status is non-200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    )

    await expect(
      transcribeMimoAsr({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/wav',
        language: '',
        endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
        model: 'mimo-v2.5-asr',
        credential: 'sk_invalid',
        signal: new AbortController().signal
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: EARS_ERROR_CODES.asrHttpFailed,
        message: 'Invalid API Key'
      })
    )
  })

  it('throws asrInvalidResponse when response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        })
      )
    )

    await expect(
      transcribeMimoAsr({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/wav',
        language: '',
        endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
        model: 'mimo-v2.5-asr',
        credential: 'sk_test',
        signal: new AbortController().signal
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: EARS_ERROR_CODES.asrHttpFailed
      })
    )
  })

  it('respects abort signal', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      transcribeMimoAsr({
        audio: new Uint8Array([1, 2, 3]),
        mimeType: 'audio/wav',
        language: '',
        endpoint: 'https://api.xiaomimimo.com/v1/chat/completions',
        model: 'mimo-v2.5-asr',
        credential: 'sk_test',
        signal: controller.signal
      })
    ).rejects.toThrow()
  })
})
