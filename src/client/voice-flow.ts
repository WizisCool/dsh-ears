import type { EarsSettings } from '../config.js'
import type { EarsRemote } from '../remote.js'

export type VoiceInputState = 'idle' | 'starting' | 'recording' | 'transcribing' | 'polishing' | 'error'

export interface DraftActions {
  setDraft(text: string): void
}

export interface CommitTranscriptOptions {
  transcript: string
  baseDraft: string
  expectedDraft?: string
  requireUnchanged: boolean
  settings: EarsSettings
  remote: EarsRemote
  setState: (state: VoiceInputState) => void
  latestDraftRef: { current: string }
  actionsRef: { current: DraftActions }
  polishAbortRef: { current: AbortController | null }
}

export function commitTranscript(options: CommitTranscriptOptions): void {
  const transcript = options.transcript.trim()
  if (transcript === '') {
    options.setState('idle')
    return
  }
  if (options.requireUnchanged && options.latestDraftRef.current !== (options.expectedDraft ?? options.baseDraft)) {
    options.setState('idle')
    return
  }

  const draftAtStop = appendToDraft(options.baseDraft, transcript)
  options.latestDraftRef.current = draftAtStop
  options.actionsRef.current.setDraft(draftAtStop)
  // Always ask the Host. Local settings can be stale (DEFAULT / empty pair)
  // while the Host already has polishing enabled; the Host is authoritative.
  void polishDraft({
    transcript,
    baseDraft: options.baseDraft,
    draftAtStop,
    provider: options.settings.polishProvider,
    model: options.settings.polishModel,
    reasoningEffort: options.settings.polishReasoningEffort,
    remote: options.remote,
    setState: options.setState,
    latestDraftRef: options.latestDraftRef,
    actionsRef: options.actionsRef,
    polishAbortRef: options.polishAbortRef
  })
}

export interface PolishDraftOptions {
  transcript: string
  baseDraft: string
  draftAtStop: string
  provider: string
  model: string
  reasoningEffort: string
  remote: EarsRemote
  setState: (state: VoiceInputState) => void
  latestDraftRef: { current: string }
  actionsRef: { current: DraftActions }
  polishAbortRef: { current: AbortController | null }
}

export async function polishDraft(options: PolishDraftOptions): Promise<void> {
  const controller = new AbortController()
  options.polishAbortRef.current = controller
  options.setState('polishing')

  try {
    const result = await options.remote.polish(options.transcript, options.provider, options.model, options.reasoningEffort, controller.signal)
    if (controller.signal.aborted) return
    if (options.latestDraftRef.current !== options.draftAtStop) return

    const text = result.ok && result.value.trim() !== '' ? result.value.trim() : options.transcript
    const nextDraft = appendToDraft(options.baseDraft, text)
    options.latestDraftRef.current = nextDraft
    options.actionsRef.current.setDraft(nextDraft)
  } catch {
    // The raw transcript is already in the draft. A failed optional polish must not remove it.
  } finally {
    if (options.polishAbortRef.current === controller) options.polishAbortRef.current = null
    if (!controller.signal.aborted) options.setState('idle')
  }
}

export function updateDraft(
  baseDraft: string,
  transcript: string,
  latestDraftRef: { current: string },
  actionsRef: { current: DraftActions }
): string {
  const nextDraft = appendToDraft(baseDraft, transcript)
  latestDraftRef.current = nextDraft
  actionsRef.current.setDraft(nextDraft)
  return nextDraft
}

export function appendToDraft(baseDraft: string, transcript: string): string {
  if (transcript === '') return baseDraft
  if (baseDraft === '') return transcript
  if (/\s$/.test(baseDraft) || /^\s/.test(transcript)) return baseDraft + transcript
  return `${baseDraft} ${transcript}`
}
