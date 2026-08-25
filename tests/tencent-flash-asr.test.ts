import { afterEach, describe, expect, it, vi } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { tencentFlashCanonicalQuery, tencentFlashQuery, tencentFlashSignature, tencentFlashVoiceFormat, transcribeTencentFlashAsr } from '../src/asr/tencent-flash-asr.js'

describe('Tencent Cloud Recording File Recognition Flash Edition request shape', () => {
  it('maps documented audio formats and rejects browser codecs', () => {
    expect(tencentFlashVoiceFormat('audio/wav; codecs=1')).toBe('wav')
    expect(tencentFlashVoiceFormat('audio/mpeg')).toBe('mp3')
    expect(tencentFlashVoiceFormat('audio/ogg; codecs=opus')).toBe('ogg-opus')
    expect(() => tencentFlashVoiceFormat('audio/webm')).toThrowError(expect.objectContaining({ code: EARS_ERROR_CODES.asrAudioInvalid }))
  })

  it('builds the sorted query and HMAC-SHA1/Base64 signature', () => {
    const query = tencentFlashQuery({
      secretId: 'AKIDexample',
      engineType: '16k_zh',
      voiceFormat: 'wav',
      timestamp: 1_700_000_000
    })
    expect(query).not.toHaveProperty('appid')
    expect(tencentFlashCanonicalQuery(query)).toBe('engine_type=16k_zh&filter_dirty=0&filter_modal=0&filter_punc=0&first_channel_only=1&secretid=AKIDexample&timestamp=1700000000&voice_format=wav&word_info=0')
    expect(tencentFlashSignature({ appId: '1250000000', secretId: 'AKIDexample', engineType: '16k_zh', voiceFormat: 'wav', timestamp: 1_700_000_000, secretKey: 'secret-key' })).toBe('S5LFxky0VGU1RcE06+P37TQChiw=')
  })
})

describe('transcribeTencentFlashAsr', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts raw audio and joins flash_result text', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      code: 0,
      flash_result: [{ text: '第一句' }, { text: '第二句' }]
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeTencentFlashAsr({
      audio: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/wav',
      appId: '1250000000',
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      engineType: '16k_zh',
      signal: new AbortController().signal
    })).resolves.toBe('第一句 第二句')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/asr\.cloud\.tencent\.com\/asr\/flash\/v1\/1250000000\?/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.any(String),
          'Content-Type': 'application/octet-stream'
        }),
        body: expect.any(Uint8Array)
      })
    )
  })

  it('maps Tencent error responses to the shared HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 4001, message: 'invalid signature' }), { status: 200 })))

    await expect(transcribeTencentFlashAsr({
      audio: new Uint8Array([1]),
      mimeType: 'audio/wav',
      appId: '1250000000',
      secretId: 'AKIDexample',
      secretKey: 'secret-key',
      engineType: '16k_zh',
      signal: new AbortController().signal
    })).rejects.toMatchObject({ code: EARS_ERROR_CODES.asrHttpFailed })
  })
})
