import { describe, expect, it } from 'vitest'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { SettingsDraftController } from '../src/client/settings-draft-controller.js'

describe('settings draft controller', () => {
  it('keeps a credential clear separate from write-only text drafts', () => {
    const drafts = new SettingsDraftController()
    drafts.clearCredential('cloudAsrGroqApiKey')

    expect(drafts.isDirty()).toBe(true)
    expect(drafts.buildSubmission().patch).toEqual({ cloudAsrGroqApiKey: '' })
    expect(drafts.isCredentialClearPending('cloudAsrGroqApiKey')).toBe(true)

    drafts.undoCredentialClear('cloudAsrGroqApiKey')
    expect(drafts.isDirty()).toBe(false)
  })

  it('does not let a stale save response erase a newer draft', () => {
    const drafts = new SettingsDraftController()
    drafts.edit('polishPrompt', 'first')
    const submission = drafts.buildSubmission()
    drafts.edit('polishPrompt', 'second')

    drafts.reconcile(submission)

    expect(drafts.get('polishPrompt')).toBe('second')
    expect(drafts.isDirty()).toBe(true)
  })

  it('filters invalid drafts but still submits valid fields in the same batch', () => {
    const drafts = new SettingsDraftController()
    drafts.edit('maxRecordingSeconds', 'not-a-number')
    drafts.edit('voiceShortcut', DEFAULT_EARS_SETTINGS.voiceShortcut)

    expect(drafts.hasInvalidDrafts()).toBe(true)
    expect(drafts.buildSubmission().patch).toEqual({ voiceShortcut: DEFAULT_EARS_SETTINGS.voiceShortcut })
    expect(drafts.hasPersistableDrafts()).toBe(true)
  })
})
