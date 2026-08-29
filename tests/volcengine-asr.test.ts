import { gzipSync, gunzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import {
  VolcengineRealtimeAsrSession,
  parseVolcengineResponseFrame,
  transcribeVolcengineRecording,
  volcengineAudioRequestFrame,
  volcengineFullRequestFrame,
  volcengineRealtimePayload,
  volcengineRealtimeUrl,
  volcengineRecordingRequestBody,
  type VolcengineResponseFrame,
  type VolcengineWebSocket,
  type VolcengineWebSocketEvent
} from '../src/asr/volcengine-asr.js'

const FULL_CLIENT_REQUEST = 0b0001
const AUDIO_ONLY_REQUEST = 0b0010
const SERVER_FULL_RESPONSE = 0b1001
const SERVER_ERROR_RESPONSE = 0b1111

type FakeEvent = VolcengineWebSocketEvent
type FakeListener = (event: FakeEvent) => void

/** Build a server response frame the way the Volcano gateway sends them. */
function serverFrame(options: {
  messageType: typeof SERVER_FULL_RESPONSE | typeof SERVER_ERROR_RESPONSE
  payload: Uint8Array | string
  sequence?: number
  isLast?: boolean
}): Uint8Array {
  const flags = options.isLast === true ? 0b0011 : 0b0001
  const header = new Uint8Array([0x11, (options.messageType << 4) | flags, 0x11, 0x00])
  const payload = typeof options.payload === 'string' ? new TextEncoder().encode(options.payload) : options.payload
  const frame = new Uint8Array(4 + 4 + (options.messageType === SERVER_ERROR_RESPONSE ? 4 : 0) + 4 + payload.byteLength)
  frame.set(header, 0)
  new DataView(frame.buffer).setInt32(4, options.sequence ?? 1)
  let offset = 8
  if (options.messageType === SERVER_ERROR_RESPONSE) {
    new DataView(frame.buffer).setInt32(offset, 45000001)
    offset += 4
  }
  new DataView(frame.buffer).setUint32(offset, payload.byteLength)
  frame.set(payload, offset + 4)
  return frame
}

function successFrame(payload: Record<string, unknown>, sequence: number, isLast = false): Uint8Array {
  return serverFrame({ messageType: SERVER_FULL_RESPONSE, payload: gzipSync(JSON.stringify(payload)), sequence, isLast })
}

function errorFrame(text: string): Uint8Array {
  return serverFrame({ messageType: SERVER_ERROR_RESPONSE, payload: gzipSync(text), sequence: 2 })
}

function decodeJsonFrame(frame: Uint8Array): { messageType: number; flags: number; sequence: number; payload: Record<string, unknown> } {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const payloadStart = (frame[0]! & 0x0f) * 4
  const sequence = view.getInt32(frame.byteOffset + payloadStart)
  const size = view.getUint32(frame.byteOffset + payloadStart + 4)
  const payload = JSON.parse(gunzipSync(frame.subarray(payloadStart + 8, payloadStart + 8 + size)).toString('utf8')) as Record<string, unknown>
  return { messageType: frame[1]! >> 4, flags: frame[1]! & 0x0f, sequence, payload }
}

function decodeAudioFrame(frame: Uint8Array): { messageType: number; flags: number; sequence: number; payload: Uint8Array } {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const payloadStart = (frame[0]! & 0x0f) * 4
  const sequence = view.getInt32(frame.byteOffset + payloadStart)
  const size = view.getUint32(frame.byteOffset + payloadStart + 4)
  const payload = new Uint8Array(gunzipSync(frame.subarray(payloadStart + 8, payloadStart + 8 + size)))
  return { messageType: frame[1]! >> 4, flags: frame[1]! & 0x0f, sequence, payload }
}

class FakeWebSocket implements VolcengineWebSocket {
  readyState = 1
  binaryType = ''
  readonly sent: Uint8Array[] = []
  readonly headers: Record<string, string>
  closed = false
  private readonly listeners = new Map<string, Set<FakeListener>>()
  private readonly responses: Uint8Array[]

  constructor(headers: Record<string, string>, responses: Uint8Array[] = [], private readonly autoOpen = true) {
    this.headers = headers
    this.responses = responses
    if (autoOpen) queueMicrotask(() => this.emit('open', {}))
  }

  send(data: ArrayBuffer | ArrayBufferView | string): void {
    const bytes = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new TextEncoder().encode(data)
    this.sent.push(new Uint8Array(bytes))
    const response = this.responses.shift()
    if (response !== undefined) {
      queueMicrotask(() => this.emit('message', { data: response.slice().buffer }))
    }
  }

  close(code?: number, reason?: string): void {
    if (this.closed) return
    this.closed = true
    queueMicrotask(() => this.emit('close', { code: code ?? 1000, reason: reason ?? '' }))
  }

  /** Queue a server frame that is delivered after the next send(). */
  queue(frame: Uint8Array): void {
    this.responses.push(frame)
  }

  open(): void {
    queueMicrotask(() => this.emit('open', {}))
  }

  fail(error: Error): void {
    queueMicrotask(() => this.emit('error', { error }))
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

function jsonResponse(body: unknown, statusCode: string, message: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Api-Status-Code': statusCode, 'X-Api-Message': message }
  })
}

describe('Volcano Engine binary framing', () => {
  it('wraps the full client request in a gzip JSON frame', () => {
    const payload = volcengineRealtimePayload('zh-CN')
    expect(payload).toMatchObject({
      user: { uid: 'dsh-ears' },
      audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1, language: 'zh-CN' },
      request: { model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: false, result_type: 'full', show_utterances: true }
    })
    const frame = volcengineFullRequestFrame(1, payload)
    expect(Array.from(frame.subarray(0, 4))).toEqual([0x11, 0x11, 0x11, 0x00])
    expect(decodeJsonFrame(frame)).toMatchObject({ messageType: FULL_CLIENT_REQUEST, flags: 0b0001, sequence: 1, payload })
  })

  it('omits an empty language from the realtime payload', () => {
    expect(volcengineRealtimePayload('  ').audio).not.toHaveProperty('language')
  })

  it('marks the final audio chunk with a negative sequence and the last flag', () => {
    const audio = new Uint8Array([1, 2, 3, 4])
    expect(decodeAudioFrame(volcengineAudioRequestFrame(7, audio, false)))
      .toMatchObject({ messageType: AUDIO_ONLY_REQUEST, flags: 0b0001, sequence: 7, payload: audio })
    expect(decodeAudioFrame(volcengineAudioRequestFrame(7, audio, true)))
      .toMatchObject({ messageType: AUDIO_ONLY_REQUEST, flags: 0b0011, sequence: -7, payload: audio })
  })

  it('parses server full responses and error frames', () => {
    const success = parseVolcengineResponseFrame(successFrame({ audio_info: { duration: 200 }, result: { text: '你好' } }, 2))
    expect(success.messageType).toBe(SERVER_FULL_RESPONSE)
    expect(success.payloadSequence).toBe(2)
    expect(success.isLastPackage).toBe(false)
    expect(success.payloadMsg).toMatchObject({ result: { text: '你好' } })

    const last = parseVolcengineResponseFrame(successFrame({ result: { text: '' } }, 9, true))
    expect(last.isLastPackage).toBe(true)
    expect(last.payloadSequence).toBe(9)

    const failure = parseVolcengineResponseFrame(errorFrame('quota exceeded'))
    expect(failure.messageType).toBe(SERVER_ERROR_RESPONSE)
    expect(failure.errorCode).toBe(45000001)
    expect(failure.errorText).toBe('quota exceeded')
    expect(failure.isLastPackage).toBe(false)
  })

  it('rejects frames whose declared payload size overruns the buffer', () => {
    const frame = serverFrame({ messageType: SERVER_FULL_RESPONSE, payload: gzipSync(JSON.stringify({ result: { text: 'x' } })), sequence: 2 })
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
    view.setUint32(8, 0xffffffff)
    expect(() => parseVolcengineResponseFrame(frame)).toThrow('truncated')
  })

  it('caps gzip decompression to the response limit', () => {
    const bomb = gzipSync(Buffer.alloc(3 * 1024 * 1024))
    const frame = serverFrame({ messageType: SERVER_FULL_RESPONSE, payload: bomb, sequence: 2 })
    expect(() => parseVolcengineResponseFrame(frame)).toThrow('too large')
  })

  it('maps corrupt gzip payloads to the invalid-response error, not the size limit', () => {
    const corrupt = new TextEncoder().encode('definitely-not-gzip-data')
    const frame = serverFrame({ messageType: SERVER_FULL_RESPONSE, payload: corrupt, sequence: 2 })
    expect(() => parseVolcengineResponseFrame(frame)).toThrow('undecodable')
  })
})

describe('Volcano Engine recording file recognition', () => {
  const audio = new Uint8Array([1, 2, 3, 4, 5])
  const baseOptions = {
    audio,
    apiKey: 'vk-test',
    resourceId: 'volc.seedasr.auc',
    signal: new AbortController().signal
  }

  it('submits base64 audio, polls once, and returns the transcript', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) return jsonResponse({}, '20000000', 'OK')
      return jsonResponse({ audio_info: { duration: 1400 }, result: { text: '第一句，第二句' } }, '20000000', 'OK')
    })
    await expect(transcribeVolcengineRecording({ ...baseOptions, fetch: fetchMock })).resolves.toBe('第一句，第二句')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [submitUrl, submitInit] = fetchMock.mock.calls[0]!
    expect(submitUrl).toBe('https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit')
    const submitHeaders = new Headers(submitInit?.headers)
    expect(submitHeaders.get('X-Api-Key')).toBe('vk-test')
    expect(submitHeaders.get('X-Api-Resource-Id')).toBe('volc.seedasr.auc')
    expect(submitHeaders.get('X-Api-Sequence')).toBe('-1')
    expect(submitHeaders.get('X-Api-Request-Id')).toMatch(/^[0-9a-f-]{36}$/)
    const submitBody = JSON.parse(String(submitInit?.body)) as { audio: Record<string, unknown>; request: Record<string, unknown> }
    expect(submitBody.audio).toMatchObject({ data: Buffer.from(audio).toString('base64'), format: 'wav', codec: 'raw', rate: 16000, bits: 16, channel: 1 })
    expect(submitBody.request).toMatchObject({ model_name: 'bigmodel', enable_itn: true, enable_punc: true, enable_ddc: false, show_utterances: true })

    const [queryUrl, queryInit] = fetchMock.mock.calls[1]!
    expect(queryUrl).toBe('https://openspeech.bytedance.com/api/v3/auc/bigmodel/query')
    expect(String(queryInit?.body)).toBe('{}')
    expect(new Headers(queryInit?.headers).get('X-Api-Request-Id')).toBe(submitHeaders.get('X-Api-Request-Id'))
  })

  it('keeps polling an in-flight task until the result arrives', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn(async () => jsonResponse({}, '20000000', 'OK'))
        .mockImplementationOnce(async () => jsonResponse({}, '20000000', 'OK'))
        .mockImplementationOnce(async () => jsonResponse({}, '20000001', '[Processing in progress] Handle response: Start Processing'))
        .mockImplementationOnce(async () => jsonResponse({ audio_info: { duration: 1400 }, result: { text: '第二句' } }, '20000000', 'OK'))
      const pending = transcribeVolcengineRecording({ ...baseOptions, fetch: fetchMock as unknown as typeof globalThis.fetch })
      const assertion = expect(pending).resolves.toBe('第二句')
      await vi.advanceTimersByTimeAsync(600)
      await assertion
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('passes a non-empty recognition language through to the audio section', () => {
    expect(volcengineRecordingRequestBody({ audio: new Uint8Array([1]), language: ' zh-CN ' }).audio).toMatchObject({ language: 'zh-CN' })
    expect(volcengineRecordingRequestBody({ audio: new Uint8Array([1]) }).audio).not.toHaveProperty('language')
  })

  it('returns an empty transcript for the no-valid-speech status', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}, '20000003', '[Normal silence audio] Handle response: no valid speech in audio'))
      .mockImplementationOnce(async () => jsonResponse({}, '20000000', 'OK'))
    await expect(transcribeVolcengineRecording({ ...baseOptions, fetch: fetchMock })).resolves.toBe('')
  })

  it('returns an empty transcript when a completed task carries no text', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ result: { text: '   ' } }, '20000000', 'OK'))
      .mockImplementationOnce(async () => jsonResponse({}, '20000000', 'OK'))
    await expect(transcribeVolcengineRecording({ ...baseOptions, fetch: fetchMock })).resolves.toBe('')
  })

  it('rejects non-JSON and unexpected response shapes instead of polling forever', async () => {
    const invalidJson = vi.fn(async () => new Response('<html>gateway error</html>', {
      status: 200,
      headers: { 'X-Api-Status-Code': '20000000', 'X-Api-Message': 'OK' }
    })).mockImplementationOnce(async () => jsonResponse({}, '20000000', 'OK'))
    await expect(transcribeVolcengineRecording({ ...baseOptions, fetch: invalidJson })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrInvalidResponse,
      message: expect.stringContaining('invalid response')
    })
    const unexpectedShape = vi.fn(async () => jsonResponse({ unknown: true }, '20000000', 'OK'))
      .mockImplementationOnce(async () => jsonResponse({}, '20000000', 'OK'))
    await expect(transcribeVolcengineRecording({ ...baseOptions, fetch: unexpectedShape })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrInvalidResponse,
      message: expect.stringContaining('unexpected response shape')
    })
  })

  it('rejects a failed submit and a failed query with the gateway message', async () => {
    const submitFailure = vi.fn(async () => jsonResponse({}, '45000001', 'invalid audio'))
    await expect(transcribeVolcengineRecording({ ...baseOptions, fetch: submitFailure })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed,
      message: 'Volcano Engine ASR submit failed: invalid audio'
    })
    const queryFailure = vi.fn(async () => jsonResponse({}, '45000002', 'task not found'))
      .mockImplementationOnce(async () => jsonResponse({}, '20000000', 'OK'))
    await expect(transcribeVolcengineRecording({ ...baseOptions, fetch: queryFailure })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed,
      message: 'Volcano Engine ASR query failed: task not found'
    })
  })

  it('rejects empty audio and a missing key before any request', async () => {
    const fetchMock = vi.fn()
    await expect(transcribeVolcengineRecording({ ...baseOptions, audio: new Uint8Array(0), fetch: fetchMock })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrAudioEmpty })
    await expect(transcribeVolcengineRecording({ ...baseOptions, apiKey: '  ', fetch: fetchMock })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrApiKeyNotConfigured })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('times out when the task never completes', async () => {
    vi.useFakeTimers()
    try {
      // An empty body alongside 20000000 stays "in flight" until the deadline.
      const fetchMock = vi.fn(async () => new Response('', {
        status: 200,
        headers: { 'X-Api-Status-Code': '20000000', 'X-Api-Message': 'OK' }
      }))
      const pending = transcribeVolcengineRecording({ ...baseOptions, fetch: fetchMock, now: () => Date.now() })
      const rejection = expect(pending).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrRequestTimedOut })
      await vi.advanceTimersByTimeAsync(120_500)
      await rejection
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Volcano Engine one-way streaming session', () => {
  const handshakeResponse = successFrame({ audio_info: { duration: 0 }, result: { text: '' } }, 1)

  it('sends the handshake, streams chunks, and finishes with a silence end marker', async () => {
    const sockets: FakeWebSocket[] = []
    const session = new VolcengineRealtimeAsrSession({
      apiKey: 'vk-test',
      resourceId: 'volc.seedasr.sauc.duration',
      language: 'zh-CN',
      webSocketFactory: (url, headers) => {
        expect(url).toBe(volcengineRealtimeUrl())
        expect(headers).toMatchObject({ 'X-Api-Key': 'vk-test', 'X-Api-Resource-Id': 'volc.seedasr.sauc.duration', 'X-Api-Sequence': '-1' })
        const socket = new FakeWebSocket(headers, [handshakeResponse])
        sockets.push(socket)
        return socket
      }
    })
    await session.open()
    await vi.waitFor(() => expect(sockets[0]!.sent.length).toBe(1))
    const handshake = decodeJsonFrame(sockets[0]!.sent[0]!)
    expect(handshake).toMatchObject({ messageType: FULL_CLIENT_REQUEST, sequence: 1 })
    expect(handshake.payload.request).toMatchObject({ model_name: 'bigmodel' })
    expect(handshake.payload.audio).toMatchObject({ format: 'pcm', language: 'zh-CN' })

    const first = await session.sendAudio(new Uint8Array([1, 2, 3, 4]))
    expect(first).toEqual({ text: '', final: false })
    expect(decodeAudioFrame(sockets[0]!.sent[1]!)).toMatchObject({ messageType: AUDIO_ONLY_REQUEST, sequence: 2 })
    sockets[0]!.emit('message', { data: successFrame({ audio_info: { duration: 400 }, result: { text: '你好，' } }, 2).buffer })
    expect(session.snapshot()).toEqual({ text: '你好，', final: false })

    sockets[0]!.queue(successFrame({ audio_info: { duration: 800 }, result: { text: '你好，世界' } }, 3))
    const second = await session.sendAudio(new Uint8Array([5, 6, 7, 8]))
    expect(second.text).toBe('你好，')
    await vi.waitFor(() => expect(session.snapshot().text).toBe('你好，世界'))

    sockets[0]!.queue(successFrame({ audio_info: { duration: 900 }, result: { text: '你好，世界' } }, 4, true))
    await expect(session.finish()).resolves.toBe('你好，世界')
    expect(session.snapshot().final).toBe(true)
    expect(sockets[0]!.closed).toBe(true)
    expect(sockets[0]!.sent.length).toBe(4)
    const lastFrame = decodeAudioFrame(sockets[0]!.sent[3]!)
    expect(lastFrame.flags).toBe(0b0011)
    expect(lastFrame.sequence).toBeLessThan(0)
    expect(lastFrame.payload.byteLength).toBe(3200)
    expect(Array.from(lastFrame.payload)).toEqual(new Array<number>(3200).fill(0))
  })

  it('falls back to definite utterances when the result text is empty', async () => {
    const socket = new FakeWebSocket({}, [handshakeResponse])
    const session = new VolcengineRealtimeAsrSession({
      apiKey: 'vk-test',
      resourceId: 'volc.seedasr.sauc.duration',
      webSocketFactory: () => socket
    })
    await session.open()
    await expect(session.sendAudio(new Uint8Array([1]))).resolves.toEqual({ text: '', final: false })
    socket.emit('message', { data: successFrame({ result: { utterances: [
      { definite: true, text: '第一句' },
      { definite: false, text: '第二' }
    ] } }, 2).buffer })
    expect(session.snapshot()).toEqual({ text: '第一句', final: false })
  })

  it('surfaces a server error frame as a business failure', async () => {
    const socket = new FakeWebSocket({}, [handshakeResponse])
    const session = new VolcengineRealtimeAsrSession({
      apiKey: 'vk-test',
      resourceId: 'volc.seedasr.sauc.duration',
      webSocketFactory: () => socket
    })
    await session.open()
    await expect(session.sendAudio(new Uint8Array([1]))).resolves.toEqual({ text: '', final: false })
    socket.emit('message', { data: errorFrame('invalid request').buffer })
    await expect(session.finish()).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed,
      message: expect.stringContaining('invalid request')
    })
    expect(socket.closed).toBe(true)
  })

  it('treats a close before the final package as an incomplete stream', async () => {
    const socket = new FakeWebSocket({}, [handshakeResponse])
    const session = new VolcengineRealtimeAsrSession({
      apiKey: 'vk-test',
      resourceId: 'volc.seedasr.sauc.duration',
      webSocketFactory: () => socket
    })
    await session.open()
    socket.queue(successFrame({ result: { text: 'partial' } }, 2))
    const pending = session.finish()
    socket.close(1000, 'early close')
    await expect(pending).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrHttpFailed, message: expect.stringContaining('closed before') })
  })

  it('fails to open when the gateway rejects the handshake', async () => {
    const socket = new FakeWebSocket({}, [], false)
    const session = new VolcengineRealtimeAsrSession({
      apiKey: 'vk-test',
      resourceId: 'volc.seedasr.sauc.duration',
      webSocketFactory: () => socket
    })
    socket.fail(new Error('handshake rejected'))
    await expect(session.open()).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrHttpFailed })
  })

  it('fails fast when the handshake frame cannot be sent', async () => {
    class ThrowingSendSocket extends FakeWebSocket {
      override send(): void {
        throw new Error('socket closed')
      }
    }
    const socket = new ThrowingSendSocket({}, [], false)
    const session = new VolcengineRealtimeAsrSession({
      apiKey: 'vk-test',
      resourceId: 'volc.seedasr.sauc.duration',
      webSocketFactory: () => socket
    })
    socket.open()
    await expect(session.open()).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed,
      message: expect.stringContaining('failed to send the handshake')
    })
    expect(socket.closed).toBe(true)
  })

  it('refuses to open without an API key', async () => {
    const session = new VolcengineRealtimeAsrSession({
      apiKey: '  ',
      resourceId: 'volc.seedasr.sauc.duration',
      webSocketFactory: () => new FakeWebSocket({})
    })
    await expect(session.open()).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrApiKeyNotConfigured })
  })
})
