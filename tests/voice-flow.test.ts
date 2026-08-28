import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_EARS_SETTINGS } from '../src/config.js'
import { EARS_ERROR_CODES } from '../src/errors.js'
import type { RemoteTextResult } from '../src/remote-contract.js'
import { appendToDraft, commitTranscript, updateDraft } from '../src/client/voice-flow.js'
import { createVoiceStateSetter, VoiceInputSession } from '../src/client/voice-session.js'

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

  it('commits into the composer after the user clears the draft', () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: '' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      expectedDraft: 'original draft live text',
      requireUnchanged: true,
      settings: { ...DEFAULT_EARS_SETTINGS, polishingEnabled: false },
      remote: { polish: vi.fn() } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })

    expect(setDraft).toHaveBeenCalledWith('recognized text')
    expect(latestDraftRef.current).toBe('recognized text')
    expect(setState).toHaveBeenCalledWith('idle')
  })

  it('does not overwrite a manual edit after live recognition updates the draft', () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'manual edit' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      expectedDraft: 'original draft recognized text',
      requireUnchanged: true,
      settings: DEFAULT_EARS_SETTINGS,
      remote: { polish: vi.fn() } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })

    expect(setDraft).not.toHaveBeenCalled()
    expect(setState).toHaveBeenCalledWith('idle')
  })

  it('does not apply a late polish result after the user edits the draft', async () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    let resolvePolish: ((result: { ok: boolean; value?: RemoteTextResult }) => void) | undefined
    const polish = vi.fn(() => new Promise<{ ok: boolean; value?: RemoteTextResult }>((resolve) => {
      resolvePolish = resolve
    }))
    const remote = { polish } as never
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

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
    resolvePolish?.({ ok: true, value: { status: 'ok', text: 'polished text' } })
    await vi.waitFor(() => expect(setState).toHaveBeenLastCalledWith('idle'))

    expect(setDraft).toHaveBeenCalledTimes(1)
    expect(latestDraftRef.current).toBe('manual edit')
  })

  it('still applies polish when the composer has not flushed the committed raw draft', async () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    let resolvePolish: ((result: { ok: boolean; value?: RemoteTextResult }) => void) | undefined
    const polish = vi.fn(() => new Promise<{ ok: boolean; value?: RemoteTextResult }>((resolve) => {
      resolvePolish = resolve
    }))
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings,
      remote: { polish } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })
    latestDraftRef.current = 'original draft'
    resolvePolish?.({ ok: true, value: { status: 'ok', text: 'polished text' } })
    await vi.waitFor(() => expect(setDraft).toHaveBeenLastCalledWith('original draft polished text'))
    expect(setState).toHaveBeenLastCalledWith('idle')
  })

  it('does not restore polish after an initially empty draft is cleared', async () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: '' }
    let resolvePolish: ((result: { ok: boolean; value?: RemoteTextResult }) => void) | undefined
    const polish = vi.fn(() => new Promise<{ ok: boolean; value?: RemoteTextResult }>((resolve) => {
      resolvePolish = resolve
    }))
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: '',
      requireUnchanged: false,
      settings,
      remote: { polish } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })
    expect(setDraft).toHaveBeenCalledWith('recognized text')
    latestDraftRef.current = ''
    resolvePolish?.({ ok: true, value: { status: 'ok', text: 'polished text' } })
    await vi.waitFor(() => expect(setState).toHaveBeenLastCalledWith('idle'))

    expect(setDraft).toHaveBeenCalledTimes(1)
    expect(latestDraftRef.current).toBe('')
  })

  it('does not apply polish after the cleared draft is cleared again', async () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: '' }
    let resolvePolish: ((result: { ok: boolean; value?: RemoteTextResult }) => void) | undefined
    const polish = vi.fn(() => new Promise<{ ok: boolean; value?: RemoteTextResult }>((resolve) => {
      resolvePolish = resolve
    }))
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: true,
      settings,
      remote: { polish } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })
    expect(setDraft).toHaveBeenCalledWith('recognized text')
    latestDraftRef.current = ''
    resolvePolish?.({ ok: true, value: { status: 'ok', text: 'polished text' } })
    await vi.waitFor(() => expect(setState).toHaveBeenLastCalledWith('idle'))

    expect(setDraft).toHaveBeenCalledTimes(1)
    expect(latestDraftRef.current).toBe('')
  })

  it('keeps the raw draft and shows an error when the polish RPC fails', async () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    const polish = vi.fn(async () => ({ ok: false as const, error: { code: 'HOST_FAILURE', message: 'unavailable', details: {} } }))
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings,
      remote: { polish } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })
    await vi.waitFor(() => expect(setState).toHaveBeenLastCalledWith('polish-error', 'unavailable'))
    expect(setDraft).toHaveBeenCalledTimes(1)
    expect(setDraft).toHaveBeenCalledWith('original draft recognized text')
  })

  it('forwards polish error details and params into the voice session snapshot', async () => {
    const session = new VoiceInputSession()
    const setDraft = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings,
      remote: {
        polish: vi.fn(async () => ({
          ok: true as const,
          value: {
            status: 'error' as const,
            code: EARS_ERROR_CODES.polishUnexpected,
            message: 'The polishing request failed: route unavailable',
            params: { detail: 'route unavailable' }
          }
        }))
      } as never,
      setState: createVoiceStateSetter(session),
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })

    await vi.waitFor(() => expect(session.getSnapshot().state).toBe('polish-error'))
    expect(session.getSnapshot()).toMatchObject({
      state: 'polish-error',
      detail: 'The polishing request failed: route unavailable',
      detailCode: EARS_ERROR_CODES.polishUnexpected,
      detailParams: { detail: 'route unavailable' }
    })
    session.dispose()
  })

  it('does not start polishing after the voice task is discarded', () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    const polish = vi.fn()
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings,
      remote: { polish } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null },
      isCurrent: () => false
    })

    expect(setDraft).toHaveBeenCalledWith('original draft recognized text')
    expect(polish).not.toHaveBeenCalled()
    expect(setState).toHaveBeenCalledWith('idle')
    expect(setState).not.toHaveBeenCalledWith('polishing')
  })

  it('does not publish an idle state after polishing is aborted', async () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    let signal: AbortSignal | undefined
    const polish = vi.fn((_transcript: string, _provider: string, _model: string, _reasoningEffort: string, nextSignal: AbortSignal) => {
      signal = nextSignal
      return new Promise<{ ok: false }>((_resolve, reject) => {
        nextSignal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    })
    const remote = { polish } as never
    const polishAbortRef = { current: null as AbortController | null }
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings,
      remote,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef
    })
    await vi.waitFor(() => expect(signal).toBeDefined())
    polishAbortRef.current?.abort()
    await vi.waitFor(() => expect(polish).toHaveBeenCalledTimes(1))
    await Promise.resolve()

    expect(setState).toHaveBeenCalledWith('polishing')
    expect(setState).not.toHaveBeenLastCalledWith('idle')
  })

  it('ignores a late polish result when the remote ignores cancellation', async () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    let resolvePolish: ((result: { ok: true; value: string }) => void) | undefined
    const polish = vi.fn(() => new Promise<{ ok: true; value: string }>((resolve) => {
      resolvePolish = resolve
    }))
    const polishAbortRef = { current: null as AbortController | null }
    const settings = { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true, polishProvider: 'provider', polishModel: 'model' }

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings,
      remote: { polish } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef
    })
    await vi.waitFor(() => expect(polishAbortRef.current).not.toBeNull())
    polishAbortRef.current?.abort()
    resolvePolish?.({ ok: true, value: { status: 'ok', text: 'late polished text' } })
    await Promise.resolve()

    expect(setDraft).toHaveBeenCalledTimes(1)
    expect(latestDraftRef.current).toBe('original draft recognized text')
  })

  it('asks the Host to polish when polishing is on even if the local route pair is empty', () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    const polish = vi.fn(async () => ({ ok: true as const, value: { status: 'ok' as const, text: '整理后的文本' } }))

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings: { ...DEFAULT_EARS_SETTINGS, polishingEnabled: true },
      remote: { polish } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })

    expect(setDraft).toHaveBeenCalledWith('original draft recognized text')
    expect(polish).toHaveBeenCalledWith('recognized text', '', '', '', expect.any(AbortSignal))
    expect(setState).toHaveBeenCalledWith('polishing')
  })

  it('does not flash a polishing state when polishing is disabled', () => {
    const setDraft = vi.fn()
    const setState = vi.fn()
    const latestDraftRef = { current: 'original draft' }
    const polish = vi.fn()

    commitTranscript({
      transcript: 'recognized text',
      baseDraft: 'original draft',
      requireUnchanged: false,
      settings: { ...DEFAULT_EARS_SETTINGS, polishingEnabled: false },
      remote: { polish } as never,
      setState,
      latestDraftRef,
      actionsRef: { current: { setDraft } },
      polishAbortRef: { current: null }
    })

    expect(setDraft).toHaveBeenCalledWith('original draft recognized text')
    expect(polish).not.toHaveBeenCalled()
    expect(setState).toHaveBeenCalledWith('idle')
    expect(setState).not.toHaveBeenCalledWith('polishing')
  })

  it('keeps draft spacing predictable', () => {
    expect(appendToDraft('', 'hello')).toBe('hello')
    expect(appendToDraft('hello', 'world')).toBe('hello world')
    expect(appendToDraft('hello ', 'world')).toBe('hello world')
    expect(appendToDraft('hello', ' world')).toBe('hello world')
  })

  it('appends CJK transcripts without an interposed space', () => {
    expect(appendToDraft('你好', '世界')).toBe('你好世界')
    expect(appendToDraft('写完了。', '睡觉')).toBe('写完了。睡觉')
  })

  it('returns the draft written by a live recognition update', () => {
    const setDraft = vi.fn()
    const latestDraftRef = { current: 'original draft' }

    const nextDraft = updateDraft('original draft', 'recognized text', latestDraftRef, { current: { setDraft } })

    expect(nextDraft).toBe('original draft recognized text')
    expect(latestDraftRef.current).toBe(nextDraft)
    expect(setDraft).toHaveBeenCalledWith(nextDraft)
  })
})
