import { describe, expect, it } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { localeEn, localeZh, localizedErrorText, type Translate } from '../src/client/settings-locale.js'

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
}

describe('dsh-ears locale dictionaries', () => {
  it('keeps the Chinese and English dictionaries balanced', () => {
    expect(Object.keys(localeEn).sort()).toEqual(Object.keys(localeZh).sort())
  })

  it('keeps template parameters aligned across locales', () => {
    for (const key of Object.keys(localeZh) as Array<keyof typeof localeZh>) {
      expect(placeholders(localeEn[key])).toEqual(placeholders(localeZh[key]))
    }
  })

  it('uses automatic-save wording and interpolates business error params', () => {
    expect(localeZh.cloudKeyClearPending).toBe('即将自动清除')
    expect(localeEn.cloudKeyClearPending).toBe('Will be cleared automatically')
    const t = ((key: string, params?: Record<string, unknown>) => {
      const template = localeZh[key as keyof typeof localeZh] ?? key
      return template.replace(/\{(\w+)\}/g, (match, name: string) => params !== undefined && name in params ? String(params[name]) : match)
    }) as Translate

    expect(localizedErrorText(t, EARS_ERROR_CODES.asrHttpFailed, 'fallback', { status: 503 }))
      .toBe('云端语音识别请求失败（HTTP 503）')
    expect(localizedErrorText(t, EARS_ERROR_CODES.asrModelUnsupported, 'fallback', { model: 'qwen-audio-3.1-asr-flash-filetrans' }))
      .toBe('模型 qwen-audio-3.1-asr-flash-filetrans 使用文件转写或实时接口，语音输入仅支持同步模型，如 qwen-audio-3.1-asr-flash')
    expect(localizedErrorText(t, EARS_ERROR_CODES.asrModelNotFound, 'fallback', { model: 'Qwen-Audio-3.1-ASR-Flash' }))
      .toBe('模型 Qwen-Audio-3.1-ASR-Flash 不存在，请填写控制台中的模型 ID（区分大小写），并确认当前业务空间已开通该模型')
    expect(localizedErrorText(t, EARS_ERROR_CODES.asrUnexpected, 'safe fallback'))
      .toBe('safe fallback')
  })

  it('falls back when a localized error template has only partial params', () => {
    const t = ((key: string, params?: Record<string, unknown>) => {
      const template = localeZh[key as keyof typeof localeZh] ?? key
      return template.replace(/\{(\w+)\}/g, (match, name: string) => params !== undefined && name in params ? String(params[name]) : match)
    }) as Translate

    expect(localizedErrorText(t, EARS_ERROR_CODES.asrHttpFailed, 'safe fallback', { detail: 'request failed' }))
      .toBe('safe fallback')
  })

  it('uses current shortcut, Bailian, and polishing hints without terminal full stops', () => {
    expect(localeZh.shortcutEnabledHint).toBe('设置语音输入的快捷键')
    expect(localeZh.shortcutHint).toBe('设置开始/结束语音输入的热键')
    expect(localeZh.bailianHostHint).toBe('填写控制台业务空间的 API Host（如 https://ws-xxxx.cn-beijing.maas.aliyuncs.com），可保留 /compatible-mode/v1 后缀')
    expect(localeZh.bailianModelHint).toBe('填写模型 ID（如 qwen3-asr-flash、qwen-audio-3.1-asr-flash），不要填显示名称或 -filetrans/-streaming/-message 变体')
    expect(localeZh.polishingHint).toBe('对转写的文本进行润色整理')
    expect(localeZh.localAccelerationHint).toBe('默认会按当前平台和可用 native variant 自动选择推理后端')
    expect(localeEn.shortcutEnabledHint).toBe('Set the voice input shortcut')
    expect(localeEn.shortcutHint).toBe('Set the hotkey that starts and stops voice input')
    expect(localeEn.bailianHostHint).toBe('Enter the workspace API host from the console (e.g. https://ws-xxxx.cn-beijing.maas.aliyuncs.com); a /compatible-mode/v1 suffix is allowed')
    expect(localeEn.bailianModelHint).toBe('Enter the model ID (e.g. qwen3-asr-flash or qwen-audio-3.1-asr-flash), not the display name or a -filetrans/-streaming/-message variant')
    expect(localeEn.polishingHint).toBe('Polish and organize the transcribed text')
    expect(localeEn.localAccelerationHint).toBe('Default automatically selects a Whisper backend from the platform and installed native variants')
    for (const key of Object.keys(localeZh).filter((key) => key.endsWith('Hint')) as Array<keyof typeof localeZh>) {
      expect(localeZh[key]).not.toMatch(/[。.]$/)
      expect(localeEn[key]).not.toMatch(/[。.]$/)
    }
  })

  it('never ends any locale entry with a full stop', () => {
    for (const key of Object.keys(localeZh) as Array<keyof typeof localeZh>) {
      expect(localeZh[key]).not.toMatch(/[。.]$/)
      expect(localeEn[key]).not.toMatch(/[。.]$/)
    }
  })

  it('provides localized text for every structured error code', () => {
    const t = ((key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params ?? {})}`) as Translate
    for (const code of Object.values(EARS_ERROR_CODES)) {
      expect(localizedErrorText(t, code, 'fallback', { detail: 'detail', model: 'tiny', percent: 42, status: 500 })).not.toBe('fallback')
    }
    expect(localizedErrorText(t, 'future.error', 'fallback')).toBe('fallback')
  })
})
