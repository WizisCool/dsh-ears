import { describe, expect, it } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { statusLabel, type VoiceStatusDisplay } from '../src/client/voice-error.js'
import { localeZh, type Translate } from '../src/client/settings-locale.js'

const translateZh = ((key: string, params?: Record<string, unknown>) => {
  const template = localeZh[key as keyof typeof localeZh] ?? key
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params !== undefined && name in params ? String(params[name]) : match)
}) as Translate

describe('VoiceRecognitionBar error labels', () => {
  it('renders a structured configuration error instead of the generic voice error', () => {
    const display: VoiceStatusDisplay = {
      state: 'error',
      detail: 'The cloud ASR model is not configured',
      detailCode: EARS_ERROR_CODES.asrModelNotConfigured
    }

    expect(statusLabel(display, translateZh)).toBe(localeZh.errorAsrModelNotConfigured)
    expect(statusLabel(display, translateZh)).not.toBe(localeZh.voiceError)
  })

  it('falls back safely when an error has no detail or known code', () => {
    expect(statusLabel({ state: 'error', detail: '' }, translateZh)).toBe(localeZh.voiceError)
  })
})
