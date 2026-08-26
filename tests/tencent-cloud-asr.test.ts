import { describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import {
  TencentRealtimeAsrSession,
  tencentApi3Signature,
  tencentRealtimeUrl,
  tencentRecordingRequestBody,
  transcribeTencentCloudRecording,
  type TencentWebSocket
} from '../src/asr/tencent-cloud-asr.js'

type FakeEvent = { data?: unknown; error?: unknown; code?: number; reason?: string }
type FakeListener = (event: FakeEvent) => void

class FakeWebSocket implements TencentWebSocket {
  readyState = 0
  binaryType = ''
  readonly sent: Array<ArrayBuffer | ArrayBufferView | string> = []
  private readonly listeners = new Map<string, Set<FakeListener>>()

  constructor(private readonly audioResponse = JSON.stringify({
    code: 0,
    result: { voice_text_str: '你好', index: 0, slice_type: 2 }
  })) {
    queueMicrotask(() => {
      this.readyState = 1
      this.emit('open', {})
      this.emit('message', { data: JSON.stringify({ code: 0, message: 'success' }) })
    })
  }

  send(data: ArrayBuffer | ArrayBufferView | string): void {
    this.sent.push(data)
    if (typeof data === 'string') {
      if (data !== JSON.stringify({ type: 'end' })) throw new Error(`unexpected text frame: ${data}`)
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ code: 0, final: 1 }) }))
      return
    }
    queueMicrotask(() => this.emit('message', { data: this.audioResponse }))
  }

  close(): void {
    this.readyState = 3
    this.emit('close', {})
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? new Set<FakeListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  emit(type: string, event: FakeEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
  }
}

describe('Tencent Cloud standard recording recognition', () => {
  it('builds the API 3.0 request body and deterministic TC3 signature', () => {
    const body = tencentRecordingRequestBody({ audio: new Uint8Array([1, 2, 3]), engineType: ' 16k_zh ' })
    expect(body).toEqual({
      EngineModelType: '16k_zh',
      ChannelNum: 1,
      ResTextFormat: 3,
      SourceType: 1,
      Data: 'AQID',
      DataLen: 3,
      ConvertNumMode: 1,
      FilterDirty: 0,
      FilterPunc: 0,
      FilterModal: 0
    })
    const bodyText = JSON.stringify(body)
    expect(tencentApi3Signature({
      action: 'CreateRecTask',
      body: bodyText,
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      timestamp: 1_700_000_000
    })).toBe('TC3-HMAC-SHA256 Credential=AKIDexample/2023-11-14/asr/tc3_request, SignedHeaders=content-type;host, Signature=4bd22d4d85c503a39fc0b486dd3c1de9b943fd5221b6be39d14e12d915a5216d')
  })

  it('submits a task, polls it, and returns the final transcript', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const action = new Headers(init?.headers).get('X-TC-Action')
      if (action === 'CreateRecTask') {
        return new Response(JSON.stringify({ Response: { RequestId: 'request-1', Data: { TaskId: 123 } } }), { status: 200 })
      }
      return new Response(JSON.stringify({ Response: { RequestId: 'request-2', Data: {
        TaskId: 123,
        Status: 2,
        Result: 'ignored',
        ResultDetail: [{ FinalSentence: '第一句' }, { FinalSentence: '第二句' }]
      } } }), { status: 200 })
    })
    const now = vi.fn(() => 1_700_000_000_000)
    const signal = new AbortController().signal
    await expect(transcribeTencentCloudRecording({
      audio: new Uint8Array([1, 2, 3]),
      appId: '1250000000',
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      engineType: '16k_zh',
      signal,
      fetch: fetchMock,
      now
    })).resolves.toBe('第一句第二句')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://asr.tencentcloudapi.com/')
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(requestBody).toMatchObject({ SourceType: 1, Data: 'AQID', DataLen: 3 })
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-TC-Action')).toBe('CreateRecTask')
  })

  it('maps non-JSON HTTP failures to the shared error', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>not found</html>', { status: 404 }))
    await expect(transcribeTencentCloudRecording({
      audio: new Uint8Array([1]),
      appId: '1250000000',
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      engineType: '16k_zh',
      signal: new AbortController().signal,
      fetch: fetchMock
    })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrHttpFailed, params: { status: 404 } })
  })

  it('cancels a response body rejected by its content-length header', async () => {
    const cancel = vi.fn(async () => undefined)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(2 * 1024 * 1024 + 1) }),
      body: { cancel }
    }) as unknown as Response)
    await expect(transcribeTencentCloudRecording({
      audio: new Uint8Array([1]),
      appId: '1250000000',
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      engineType: '16k_zh',
      signal: new AbortController().signal,
      fetch: fetchMock
    })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrResponseTooLarge })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('keeps the request timeout active while reading a response body', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const reader = {
          read: () => new Promise<never>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
          }),
          releaseLock: vi.fn()
        }
        return { ok: true, status: 200, headers: new Headers(), body: { getReader: () => reader } } as unknown as Response
      })
      const pending = transcribeTencentCloudRecording({
        audio: new Uint8Array([1]),
        appId: '1250000000',
        secretId: 'AKIDexample',
        secretKey: 'secret-key',
        engineType: '16k_zh',
        signal: new AbortController().signal,
        fetch: fetchMock
      })
      const rejection = expect(pending).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrRequestTimedOut })
      await vi.advanceTimersByTimeAsync(120_000)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Tencent Cloud realtime recognition', () => {
  it('builds the signed WebSocket URL from sorted parameters', () => {
    expect(tencentRealtimeUrl({
      appId: '1250000000',
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      engineType: '16k_zh',
      timestamp: 1_700_000_000,
      nonce: 123,
      voiceId: 'voice id'
    })).toBe('wss://asr.cloud.tencent.com/asr/v2/1250000000?engine_model_type=16k_zh&expired=1700000300&nonce=123&secretid=AKIDexample&timestamp=1700000000&voice_format=1&voice_id=voice%20id&signature=dgpShHztVr8yX%2FwCiSyEUGEy%2Fbo%3D')
  })

  it('rejects malformed response codes', async () => {
    for (const code of [undefined, null, true, '', 'not-a-number', {}]) {
      const socket = new FakeWebSocket(JSON.stringify({ code, result: { voice_text_str: '你好', index: 0, slice_type: 2 } }))
      const session = new TencentRealtimeAsrSession({
        appId: '1250000000',
        secretId: 'AKIDexample',
        secretKey: 'secret-key',
        engineType: '16k_zh',
        webSocketFactory: () => socket
      })
      await session.open()
      await expect(session.sendAudio(new Uint8Array([1, 2]))).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrInvalidResponse })
    }
  })

  it('rejects malformed realtime result payloads', async () => {
    for (const result of [
      null,
      {},
      { voice_text_str: '你好', index: 0, slice_type: 3 },
      { voice_text_str: 1, index: 0, slice_type: 1 },
      { voice_text_str: '你好', index: 'not-a-number', slice_type: 1 }
    ]) {
      const socket = new FakeWebSocket(JSON.stringify({ code: 0, result }))
      const session = new TencentRealtimeAsrSession({
        appId: '1250000000',
        secretId: 'AKIDexample',
        secretKey: 'secret-key',
        engineType: '16k_zh',
        webSocketFactory: () => socket
      })
      await session.open()
      await expect(session.sendAudio(new Uint8Array([1, 2]))).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrInvalidResponse })
    }
  })
  it('accepts a numeric response code string', async () => {
    const socket = new FakeWebSocket(JSON.stringify({ code: '0', result: { voice_text_str: '你好', index: 0, slice_type: 2 } }))
    const session = new TencentRealtimeAsrSession({
      appId: '1250000000',
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      engineType: '16k_zh',
      webSocketFactory: () => socket
    })
    await session.open()
    await expect(session.sendAudio(new Uint8Array([1, 2]))).resolves.toMatchObject({ text: '你好', final: false })
    session.close()
  })

  it('opens, streams audio, finalizes, and releases the socket', async () => {
    const socket = new FakeWebSocket()
    const session = new TencentRealtimeAsrSession({
      appId: '1250000000',
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      engineType: '16k_zh',
      now: () => 1_700_000_000_000,
      webSocketFactory: () => socket
    })
    await session.open()
    await expect(session.sendAudio(new Uint8Array([1, 2]))).resolves.toMatchObject({ text: '你好', final: false })
    await expect(session.finish()).resolves.toBe('你好')
    expect(socket.sent.some((item) => typeof item === 'string' && item === JSON.stringify({ type: 'end' }))).toBe(true)
    expect(socket.readyState).toBe(3)
  })
})
