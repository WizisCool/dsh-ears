import { afterEach, describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { audioFormatFromMime, bailianModelTransportConflict, dashScopeErrorDetail, dashscopeRequestBody, extractDashScopeTranscript, isDashScopeEmptyAudioError, isDashScopeModelNotFound, isQwen3AsrFlashModel, transcribeDashScopeAsr } from '../src/asr/dashscope-asr.js'

describe('DashScope ASR request shape', () => {
  it('classifies Qwen3 Flash models separately from Fun-ASR Flash', () => {
    expect(isQwen3AsrFlashModel('qwen3-asr-flash')).toBe(true)
    expect(isQwen3AsrFlashModel('qwen3-asr-flash-2025-09-08')).toBe(true)
    expect(isQwen3AsrFlashModel('fun-asr-flash')).toBe(false)
    expect(isQwen3AsrFlashModel('qwen-audio-3.0-asr-flash')).toBe(false)
    expect(isQwen3AsrFlashModel('qwen-audio-3.1-asr-flash')).toBe(false)
  })

  it('sends the Qwen3 DashScope audio field and Fun-ASR input_audio payload', () => {
    const qwen = dashscopeRequestBody('qwen3-asr-flash', 'data:audio/webm;base64,QQ==', 'audio/webm', 'zh-CN')
    expect(qwen).toMatchObject({
      model: 'qwen3-asr-flash',
      input: { messages: [{ role: 'user', content: [{ audio: 'data:audio/webm;base64,QQ==' }] }] },
      parameters: { asr_options: { language: 'zh' } }
    })

    const fun = dashscopeRequestBody('fun-asr-flash', 'data:audio/webm;base64,QQ==', 'audio/webm;codecs=opus', 'zh-CN')
    expect(fun).toMatchObject({
      model: 'fun-asr-flash',
      input: { messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/webm;base64,QQ==' } }] }] },
      parameters: { format: 'webm', language_hints: ['zh'] }
    })
    const audio31 = dashscopeRequestBody('qwen-audio-3.1-asr-flash', 'data:audio/webm;base64,QQ==', 'audio/webm;codecs=opus', 'zh-CN')
    expect(audio31).toMatchObject({
      model: 'qwen-audio-3.1-asr-flash',
      input: { messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/webm;base64,QQ==' } }] }] },
      parameters: { format: 'webm', language_hints: ['zh'] }
    })
    expect(audioFormatFromMime('audio/mpeg')).toBe('mp3')
  })

  it('rejects the console variants that use another transport', () => {
    expect(bailianModelTransportConflict('qwen-audio-3.1-asr-flash')).toBeUndefined()
    expect(bailianModelTransportConflict('qwen-audio-3.0-asr-flash')).toBeUndefined()
    expect(bailianModelTransportConflict('qwen3-asr-flash')).toBeUndefined()
    expect(bailianModelTransportConflict('fun-asr-flash-2026-06-15')).toBeUndefined()
    expect(bailianModelTransportConflict('qwen-audio-3.1-asr-flash-filetrans')).toBe('filetrans')
    expect(bailianModelTransportConflict('qwen-audio-3.1-asr-flash-streaming')).toBe('streaming')
    expect(bailianModelTransportConflict('qwen-audio-3.1-asr-flash-message')).toBe('message')
    expect(bailianModelTransportConflict('qwen3-asr-flash-realtime')).toBe('realtime')
    expect(bailianModelTransportConflict('qwen-audio-3.0-realtime-flash')).toBe('realtime')
    expect(bailianModelTransportConflict('fun-asr-realtime')).toBe('realtime')
    expect(bailianModelTransportConflict('paraformer-realtime-v2')).toBe('realtime')
    expect(bailianModelTransportConflict('fun-asr')).toBe('async-file')
    expect(bailianModelTransportConflict('paraformer-v2')).toBe('async-file')
  })

  it('omits language when the setting is auto', () => {
    const qwen = dashscopeRequestBody('qwen3-asr-flash', 'data:audio/wav;base64,QQ==', 'audio/wav', 'auto')
    expect(qwen.parameters).toBeUndefined()
    const fun = dashscopeRequestBody('fun-asr-flash', 'data:audio/wav;base64,QQ==', 'audio/wav', 'auto')
    expect(fun.parameters).toEqual({ format: 'wav' })
  })
})

describe('DashScope ASR response parsing', () => {
  it('reads Fun-ASR Flash output.text', () => {
    expect(extractDashScopeTranscript({
      output: { sentence: { text: '句' }, text: 'Hello World，这里是阿里巴巴语音实验室。' }
    })).toBe('Hello World，这里是阿里巴巴语音实验室。')
  })

  it('reads Qwen3 DashScope choices message content', () => {
    expect(extractDashScopeTranscript({
      output: { choices: [{ message: { content: [{ text: '欢迎使用阿里云。' }] } }] }
    })).toBe('欢迎使用阿里云。')
  })

  it('reads nested and top-level sentence text from the upgraded console', () => {
    expect(extractDashScopeTranscript({
      output: { output: { sentence: { text: '嵌套句' } } }
    })).toBe('嵌套句')
    expect(extractDashScopeTranscript({
      sentence: { text: '顶层句' },
      text: '顶层文本'
    })).toBe('顶层文本')
  })

  it('surfaces a DashScope error message', () => {
    expect(() => extractDashScopeTranscript({ code: 'InvalidParameter', message: 'model not supported' })).toThrow('model not supported')
  })

  it('prefers the DashScope error code in HTTP failures', () => {
    expect(dashScopeErrorDetail({ code: 'InvalidApiKey', message: 'Invalid API-key provided.' }, 401)).toBe('InvalidApiKey: Invalid API-key provided.')
    expect(dashScopeErrorDetail({ code: 'Throttling.RateQuota' }, 429)).toBe('Throttling.RateQuota')
  })

  it('treats a successful response with no transcript text as empty speech', () => {
    expect(extractDashScopeTranscript({ output: { text: '' } })).toBe('')
    expect(extractDashScopeTranscript({ output: { choices: [{ message: { content: [{ text: '   ' }] } }] } })).toBe('')
    expect(extractDashScopeTranscript({ output: {} })).toBe('')
  })

  it('treats only explicit no-speech HTTP 400s as empty audio', () => {
    expect(isDashScopeEmptyAudioError({}, 400)).toBe(false)
    expect(isDashScopeEmptyAudioError({ request_id: 'abc' }, 400)).toBe(false)
    expect(isDashScopeEmptyAudioError({ code: 'InvalidParameter', message: 'audio too short' }, 400)).toBe(true)
    expect(isDashScopeEmptyAudioError({ error: { message: 'No valid speech detected' } }, 400)).toBe(true)
    expect(isDashScopeEmptyAudioError({ code: 'CLIENT_ERROR', message: 'ASR_RESPONSE_HAVE_NO_WORDS' }, 400)).toBe(true)
    expect(isDashScopeEmptyAudioError({ code: 'InvalidApiKey', message: 'Invalid API-key provided.' }, 400)).toBe(false)
    expect(isDashScopeEmptyAudioError({ code: 'InvalidParameter', message: 'model not exist' }, 400)).toBe(false)
  })

  it('detects the provider model-not-found reply', () => {
    expect(isDashScopeModelNotFound({ code: 'InvalidParameter', message: 'Model not exist.' })).toBe(true)
    expect(isDashScopeModelNotFound({ error: { message: 'model not found' } })).toBe(true)
    expect(isDashScopeModelNotFound({ code: 'InvalidParameter', message: 'Invalid URL' })).toBe(false)
  })
})

describe('transcribeDashScopeAsr', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts a non-streaming DashScope generation request and returns the transcript', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output: { text: '整理后的文本' }
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'fun-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).resolves.toBe('整理后的文本')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test',
          'X-DashScope-SSE': 'disable'
        })
      })
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.model).toBe('fun-asr-flash')
    expect(body.input.messages[0].content[0].type).toBe('input_audio')
  })

  it('rejects a credential-bearing HTTP endpoint before sending audio', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'http://127.0.0.1:8080/asr',
      model: 'fun-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrEndpointInvalid })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a console transport variant before sending audio', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.1-asr-flash-filetrans',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrModelUnsupported,
      params: { model: 'qwen-audio-3.1-asr-flash-filetrans' }
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns an empty transcript when Qwen-Audio 3.1 reports no words', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'CLIENT_ERROR',
      message: 'ASR_RESPONSE_HAVE_NO_WORDS',
      request_id: 'no-words'
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })))

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.1-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).resolves.toBe('')
  })

  it('returns an empty transcript when qwen-audio reports an explicit silent-audio marker', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'InvalidParameter', message: 'audio too short' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })))

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.0-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).resolves.toBe('')
  })

  it('classifies an opaque non-2xx response as an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ request_id: 'opaque' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })))

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.0-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed,
      params: { status: 400 }
    })
  })

  it('classifies a 400 response with an empty body as an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 400,
      headers: { 'content-type': 'application/json' }
    })))

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.0-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed,
      params: { status: 400 }
    })
  })

  it('classifies a non-2xx response with invalid JSON as an HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream unavailable', {
      status: 502,
      headers: { 'content-type': 'text/plain' }
    })))

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.0-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrHttpFailed,
      params: { status: 502 }
    })
  })

  it('keeps successful invalid JSON as an invalid response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    })))

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.0-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrInvalidResponse })
  })

  it('maps a model-not-found reply to actionable configuration guidance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'InvalidParameter',
      message: 'Model not exist.',
      request_id: 'missing-model'
    }), {
      status: 404,
      headers: { 'content-type': 'application/json' }
    })))

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'Qwen-Audio-3.1-ASR-Flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      code: EARS_ERROR_CODES.asrModelNotFound,
      params: { model: 'Qwen-Audio-3.1-ASR-Flash', status: 404 }
    })
  })

  it('still surfaces a configuration HTTP 400', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'InvalidParameter',
      message: 'model not exist'
    }), { status: 400, headers: { 'content-type': 'application/json' } })))

    await expect(transcribeDashScopeAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      language: 'zh-CN',
      endpoint: 'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      model: 'qwen-audio-3.0-asr-flash',
      credential: 'sk_test',
      signal: new AbortController().signal
    })).rejects.toThrow('InvalidParameter: model not exist')
  })
})
