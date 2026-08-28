import { afterEach, describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES, EarsError } from '../src/errors.js'
import {
  DEEPGRAM_DEFAULT_MODEL,
  DEEPGRAM_REALTIME_FINISH_TIMEOUT_MS,
  DEEPGRAM_REALTIME_OPEN_TIMEOUT_MS,
  DeepgramRealtimeAsrSession,
  deepgramErrorDetail,
  deepgramListenUrl,
  deepgramRealtimeUrl,
  extractDeepgramTranscript,
  transcribeDeepgramAsr,
  type DeepgramWebSocket,
  type DeepgramWebSocketEvent
} from '../src/asr/deepgram-asr.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Deepgram URL builder', () => {
  it('builds listen URL with defaults and auto language detection', () => {
    const url = new URL(deepgramListenUrl({}))
    expect(url.origin).toBe('https://api.deepgram.com')
    expect(url.pathname).toBe('/v1/listen')
    expect(url.searchParams.get('model')).toBe(DEEPGRAM_DEFAULT_MODEL)
    expect(url.searchParams.get('smart_format')).toBe('true')
    expect(url.searchParams.get('punctuate')).toBe('true')
    expect(url.searchParams.get('detect_language')).toBe('true')
    expect(url.searchParams.has('language')).toBe(false)
  })

  it('sets explicit language when specified', () => {
    const url = new URL(deepgramListenUrl({ model: 'nova-2', language: 'zh-CN' }))
    expect(url.searchParams.get('model')).toBe('nova-2')
    expect(url.searchParams.get('language')).toBe('zh-CN')
    expect(url.searchParams.has('detect_language')).toBe(false)
  })

  it('uses detect_language when language is auto', () => {
    const url = new URL(deepgramListenUrl({ language: 'auto' }))
    expect(url.searchParams.get('detect_language')).toBe('true')
    expect(url.searchParams.has('language')).toBe(false)
  })

  it('builds realtime WebSocket URL with linear16 audio parameters', () => {
    const url = new URL(deepgramRealtimeUrl({ model: 'nova-3', language: 'en-US' }))
    expect(url.protocol).toBe('wss:')
    expect(url.pathname).toBe('/v1/listen')
    expect(url.searchParams.get('model')).toBe('nova-3')
    expect(url.searchParams.get('encoding')).toBe('linear16')
    expect(url.searchParams.get('sample_rate')).toBe('16000')
    expect(url.searchParams.get('channels')).toBe('1')
    expect(url.searchParams.get('interim_results')).toBe('true')
    expect(url.searchParams.get('endpointing')).toBe('300')
    expect(url.searchParams.get('language')).toBe('en-US')
  })

  it('omits detect_language in realtime URL when language is empty', () => {
    const url = new URL(deepgramRealtimeUrl({}))
    expect(url.searchParams.has('detect_language')).toBe(false)
    expect(url.searchParams.has('language')).toBe(false)
  })

  it('cleans up pre-existing language and detect_language query parameters from endpoint', () => {
    const listenUrl = new URL(deepgramListenUrl({
      endpoint: 'https://api.deepgram.com/v1/listen?language=fr&detect_language=false',
      language: 'auto'
    }))
    expect(listenUrl.searchParams.get('detect_language')).toBe('true')
    expect(listenUrl.searchParams.has('language')).toBe(false)

    const realtimeUrl = new URL(deepgramRealtimeUrl({
      endpoint: 'wss://api.deepgram.com/v1/listen?language=fr&detect_language=true',
      language: 'auto'
    }))
    expect(realtimeUrl.searchParams.has('detect_language')).toBe(false)
    expect(realtimeUrl.searchParams.has('language')).toBe(false)

    const realtimeExplicit = new URL(deepgramRealtimeUrl({
      endpoint: 'wss://api.deepgram.com/v1/listen?language=fr&detect_language=true',
      language: 'zh-CN'
    }))
    expect(realtimeExplicit.searchParams.has('detect_language')).toBe(false)
    expect(realtimeExplicit.searchParams.get('language')).toBe('zh-CN')
  })

  it('throws asrEndpointInvalid on malformed endpoint', () => {
    expect(() => deepgramListenUrl({ endpoint: 'not a url' })).toThrowError(
      expect.objectContaining({ code: EARS_ERROR_CODES.asrEndpointInvalid })
    )
    expect(() => deepgramRealtimeUrl({ endpoint: 'not a url' })).toThrowError(
      expect.objectContaining({ code: EARS_ERROR_CODES.asrEndpointInvalid })
    )
  })

  it('throws asrEndpointInvalid on insecure or invalid scheme', () => {
    expect(() => deepgramListenUrl({ endpoint: 'http://api.deepgram.com/v1/listen' })).toThrowError(
      expect.objectContaining({ code: EARS_ERROR_CODES.asrEndpointInvalid })
    )
    expect(() => deepgramRealtimeUrl({ endpoint: 'http://api.deepgram.com/v1/listen' })).toThrowError(
      expect.objectContaining({ code: EARS_ERROR_CODES.asrEndpointInvalid })
    )
    expect(() => deepgramRealtimeUrl({ endpoint: 'ws://api.deepgram.com/v1/listen' })).toThrowError(
      expect.objectContaining({ code: EARS_ERROR_CODES.asrEndpointInvalid })
    )
  })
})

describe('Deepgram response parsing', () => {
  it('extracts transcript from valid response', () => {
    const response = {
      results: {
        channels: [
          {
            alternatives: [
              { transcript: 'Hello from Deepgram.' }
            ]
          }
        ]
      }
    }
    expect(extractDeepgramTranscript(response)).toBe('Hello from Deepgram.')
  })

  it('returns empty string for missing or empty results', () => {
    expect(extractDeepgramTranscript({})).toBe('')
    expect(extractDeepgramTranscript({ results: {} })).toBe('')
    expect(extractDeepgramTranscript({ results: { channels: [] } })).toBe('')
    expect(extractDeepgramTranscript({ results: { channels: [{ alternatives: [] }] } })).toBe('')
    expect(extractDeepgramTranscript({ results: { channels: [{ alternatives: [{ transcript: '   ' }] }] } })).toBe('')
  })

  it('formats error detail correctly', () => {
    expect(deepgramErrorDetail({ err_code: 'INVALID_AUTH', err_msg: 'Invalid credentials.' }, 401)).toBe('INVALID_AUTH: Invalid credentials.')
    expect(deepgramErrorDetail({ error: 'Some internal error' }, 500)).toBe('Some internal error')
    expect(deepgramErrorDetail({ error: { message: 'Bad model' } }, 400)).toBe('Bad model')
    expect(deepgramErrorDetail('not-json', 502)).toBe('HTTP 502')
  })
})

describe('transcribeDeepgramAsr', () => {
  it('sends audio with Token authorization and returns transcript', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      results: {
        channels: [{ alternatives: [{ transcript: 'Deepgram transcription result' }] }]
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const audio = new Uint8Array([1, 2, 3, 4])
    const result = await transcribeDeepgramAsr({
      audio,
      mimeType: 'audio/wav',
      credential: 'test_token',
      fetch: fetchMock
    })

    expect(result).toBe('Deepgram transcription result')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://api.deepgram.com/v1/listen?'),
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: {
          Authorization: 'Token test_token',
          'Content-Type': 'audio/wav'
        },
        body: audio
      })
    )
  })

  it('throws asrHttpFailed on 401', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      err_code: 'INVALID_AUTH',
      err_msg: 'Invalid credentials.'
    }), { status: 401 }))

    await expect(transcribeDeepgramAsr({
      audio: new Uint8Array([1]),
      mimeType: 'audio/wav',
      credential: 'bad_token',
      fetch: fetchMock
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed
    })
  })

  it('throws asrHttpFailed on other HTTP errors', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      err_code: 'Bad Request',
      err_msg: 'failed to process audio'
    }), { status: 400 }))

    await expect(transcribeDeepgramAsr({
      audio: new Uint8Array([1]),
      mimeType: 'audio/wav',
      credential: 'test_token',
      fetch: fetchMock
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed
    })
  })

  it('throws asrAudioEmpty on empty audio', async () => {
    await expect(transcribeDeepgramAsr({
      audio: new Uint8Array(0),
      mimeType: 'audio/wav',
      credential: 'test_token'
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrAudioEmpty
    })
  })

  it('throws asrApiKeyNotConfigured on empty credential', async () => {
    await expect(transcribeDeepgramAsr({
      audio: new Uint8Array([1]),
      mimeType: 'audio/wav',
      credential: '   '
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrApiKeyNotConfigured
    })
  })

  it('bounds the recording response body before parsing it', async () => {
    const oversized = 'x'.repeat(1024 * 1024 + 1)
    await expect(transcribeDeepgramAsr({
      audio: new Uint8Array([1]),
      mimeType: 'audio/wav',
      credential: 'test_token',
      fetch: async () => new Response(oversized, { status: 200 })
    })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrResponseTooLarge })
  })
})

class MockDeepgramWebSocket implements DeepgramWebSocket {
  readyState = 1
  binaryType = 'arraybuffer'
  private readonly listeners = new Map<string, Set<(event: DeepgramWebSocketEvent) => void>>()
  readonly sentMessages: Array<ArrayBuffer | ArrayBufferView | string> = []

  addEventListener(type: string, listener: (event: DeepgramWebSocketEvent) => void): void {
    let set = this.listeners.get(type)
    if (set === undefined) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener)
  }

  removeEventListener(type: string, listener: (event: DeepgramWebSocketEvent) => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: ArrayBuffer | ArrayBufferView | string): void {
    this.sentMessages.push(data)
  }

  close(_code?: number, _reason?: string): void {
    this.readyState = 3
    this.emit('close', { code: _code ?? 1000, reason: _reason })
  }

  emit(type: string, event: DeepgramWebSocketEvent = {}): void {
    const set = this.listeners.get(type)
    if (set !== undefined) {
      for (const listener of set) listener(event)
    }
  }
}

describe('DeepgramRealtimeAsrSession', () => {
  it('times out when the socket never opens', async () => {
    vi.useFakeTimers()
    const session = new DeepgramRealtimeAsrSession({
      apiKey: 'test_key',
      webSocketFactory: () => new MockDeepgramWebSocket()
    })

    const opening = session.open()
    const rejection = expect(opening).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrRequestTimedOut })
    await vi.advanceTimersByTimeAsync(DEEPGRAM_REALTIME_OPEN_TIMEOUT_MS)
    await rejection
  })

  it('times out when the stream never closes after CloseStream', async () => {
    vi.useFakeTimers()
    let socket: MockDeepgramWebSocket | undefined
    const session = new DeepgramRealtimeAsrSession({
      apiKey: 'test_key',
      webSocketFactory: () => {
        socket = new MockDeepgramWebSocket()
        setTimeout(() => socket?.emit('open'), 0)
        return socket
      }
    })

    const opening = session.open()
    await vi.advanceTimersByTimeAsync(0)
    await opening

    const finishing = session.finish()
    const rejection = expect(finishing).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrRequestTimedOut })
    await vi.advanceTimersByTimeAsync(DEEPGRAM_REALTIME_FINISH_TIMEOUT_MS)
    await rejection
    expect(socket?.sentMessages).toContain(JSON.stringify({ type: 'CloseStream' }))
  })

  it('connects, sends audio, streams interim/final text and finishes', async () => {
    let socket: MockDeepgramWebSocket | undefined
    let passedProtocols: string | string[] | undefined
    const session = new DeepgramRealtimeAsrSession({
      apiKey: 'test_key',
      webSocketFactory: (_url, protocols) => {
        passedProtocols = protocols
        socket = new MockDeepgramWebSocket()
        setTimeout(() => socket?.emit('open'), 0)
        return socket
      }
    })

    await session.open()
    expect(socket).toBeDefined()
    expect(passedProtocols).toEqual(['token', 'test_key'])

    // Send audio chunk
    const pcm = new Uint8Array([0, 1, 0, 2])
    const sendPromise = session.sendAudio(pcm)

    // Simulate Deepgram results message (interim)
    socket?.emit('message', {
      data: JSON.stringify({
        type: 'Results',
        is_final: false,
        channel: { alternatives: [{ transcript: 'hello' }] }
      })
    })

    const interim = await sendPromise
    expect(interim.text).toBe('hello')
    expect(interim.final).toBe(false)

    // Simulate final result
    socket?.emit('message', {
      data: JSON.stringify({
        type: 'Results',
        is_final: true,
        channel: { alternatives: [{ transcript: 'Hello world.' }] }
      })
    })

    expect(session.snapshot().text).toBe('Hello world.')

    // Finish session
    const finishPromise = session.finish()
    expect(socket?.sentMessages).toContain(JSON.stringify({ type: 'CloseStream' }))
    socket?.close(1000)

    const finalResult = await finishPromise
    expect(finalResult).toBe('Hello world.')
  })

  it('rejects on invalid auth error message from socket', async () => {
    let socket: MockDeepgramWebSocket | undefined
    const session = new DeepgramRealtimeAsrSession({
      apiKey: 'bad_key',
      webSocketFactory: () => {
        socket = new MockDeepgramWebSocket()
        setTimeout(() => {
          socket?.emit('message', {
            data: JSON.stringify({
              err_code: 'INVALID_AUTH',
              err_msg: 'Invalid credentials.'
            })
          })
        }, 0)
        return socket
      }
    })

    await expect(session.open()).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed
    })
  })

  it('rejects finish when the socket closes before a final result', async () => {
    let socket: MockDeepgramWebSocket | undefined
    const session = new DeepgramRealtimeAsrSession({
      apiKey: 'test_key',
      webSocketFactory: () => {
        socket = new MockDeepgramWebSocket()
        setTimeout(() => socket?.emit('open'), 0)
        return socket
      }
    })

    await session.open()
    const finishPromise = session.finish()
    socket?.close(1000)

    await expect(finishPromise).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed
    })
  })
})
