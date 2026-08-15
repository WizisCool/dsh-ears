import { describe, expect, it } from 'vitest'
import { earsSettingsPatchSchema, earsSettingsViewSchema } from '../src/remote-contract.js'
import { TYPERT } from '../src/typert.js'
import { TYPERT_REMOTE } from '../src/remote.js'

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
        asrBackend: 'web-speech',
        localWhisperModel: 'tiny',
        cloudAsrEndpoint: '',
        cloudAsrModel: 'whisper-1',
        cloudAsrCredentialRef: '',
        language: 'zh-CN',
        maxRecordingSeconds: 120,
        polishingEnabled: true,
        polishProvider: '',
        polishModel: ''
      },
      overridden: []
    }).settings.maxRecordingSeconds).toBe(120)
  })

  it('keeps Host and Client Remote descriptors aligned', () => {
    const hostIds = TYPERT.invocations.map((invocation) => invocation.id).sort()
    const clientIds = TYPERT_REMOTE.descriptors.map((descriptor) => descriptor.id).sort()
    expect(clientIds).toEqual(hostIds)
    expect(TYPERT_REMOTE.descriptors.filter((descriptor) => descriptor.cancellation !== undefined).map((descriptor) => descriptor.method).sort()).toEqual(['polish', 'transcribe', 'updateSettings'])
  })
})
