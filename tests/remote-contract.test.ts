import { describe, expect, it } from 'vitest'
import { earsSettingsPatchSchema, earsSettingsViewSchema } from '../src/remote-contract.js'

describe('settings Remote contract', () => {
  it('accepts an empty provider/model pair as the no-polish state', () => {
    expect(earsSettingsPatchSchema.parse({ polishProvider: '', polishModel: '' })).toEqual({
      polishProvider: '',
      polishModel: ''
    })
  })

  it('rejects settings patches with the wrong wire types', () => {
    expect(() => earsSettingsPatchSchema.parse({ maxRecordingSeconds: '120' })).toThrow()
  })

  it('validates the complete settings view returned by Host RPC', () => {
    expect(earsSettingsViewSchema.parse({
      available: true,
      writable: true,
      settings: {
        language: 'zh-CN',
        maxRecordingSeconds: 120,
        polishingEnabled: true,
        polishProvider: '',
        polishModel: ''
      },
      overridden: []
    }).settings.maxRecordingSeconds).toBe(120)
  })
})
