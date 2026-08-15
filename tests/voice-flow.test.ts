import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { appendToDraft, commitTranscript } from '../src/client/voice-flow.js'

describe('voice draft flow', () => {
  it('does not overwrite a manual edit made while final ASR is pending', () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'manual edit' }
    const remote = { polish: vi.fn() }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: true,
      settings: DEFAULT_EARS_SETTINGS,
      remote: remote as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })

    expect(setDraft).not.toHaveBeenCalled()
    expect(remote.polish).not.toHaveBeenCalled()
    expect(setState).toHaveBeenCalledWith('idle')
  })

  it('does not apply a late polish result after the user edits the draft', async () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    let resolvePolish: ((result: { ok: boolean; value?: string }) => void) | undefined
    const polish = vi.fn(() => new Promise<{ ok: boolean; value?: string }>((resolve) => {
      resolvePolish = resolve
    }))
    const remote = { polish } as never
    const settings = { ...DEFAULT_EARS_SETTINGS, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings,
      remote: remote as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })
    expect(setDraft).toHaveBeenCalledWith('original draft recognized text')
    expect(setState).toHaveBeenCalledWith('polishing')

    latestDraftRef.current = 'manual edit'
    resolvePolish?.({ ok: true, value: 'polished text' })
    await vi.waitFor(() => expect(setState).toHaveBeenLastCalledWith('idle'))

    expect(setDraft).toHaveBeenCalledTimes(1)
    expect(latestDraftRef.current).toBe('manual edit')
  })

  it('keeps draft spacing predictable', () => {
    expect(appendToDraft('', 'hello')).toBe('hello')
    expect(appendToDraft('hello', 'world')).toBe('hello world')
    expect(appendToDraft('hello ', 'world')).toBe('hello world')
    expect(appendToDraft('hello', ' world')).toBe('hello world')
  })
})
