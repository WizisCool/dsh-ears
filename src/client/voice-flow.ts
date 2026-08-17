import type { EarsSettings } from '../config.js'
import type { EarsRemote } from '../remote.js'

export type VoiceInputState = 'idle' | 'starting' | 'recording' | 'transcribing' | 'polishing' | 'error' | 'polish-error'

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
  // Honor the local toggle so an off switch never flashes "polishing".
  // An enabled toggle still asks the Host even with an empty local pair;
  // the Host is authoritative for the stored route.
  if (!shouldRequestPolish(options.settings)) {
    options.setState('idle')
    return
  }
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

export function shouldRequestPolish(settings: Pick<EarsSettings, 'polishingEnabled'>): boolean {
  return settings.polishingEnabled
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
    if (!shouldApplyPolishResult(options.latestDraftRef.current, options.draftAtStop, options.baseDraft)) {
      if (!controller.signal.aborted) options.setState('idle')
      return
    }

    if (!result.ok) {
      options.setState('polish-error')
      return
    }
    const text = result.value.trim() !== '' ? result.value.trim() : options.transcript
    const nextDraft = appendToDraft(options.baseDraft, text)
    options.latestDraftRef.current = nextDraft
    options.actionsRef.current.setDraft(nextDraft)
    options.setState('idle')
  } catch {
    if (!controller.signal.aborted) options.setState('polish-error')
  } finally {
    if (options.polishAbortRef.current === controller) options.polishAbortRef.current = null
  }
}

export function shouldApplyPolishResult(currentDraft: string, draftAtStop: string, baseDraft: string): boolean {
  const current = collapseDraft(currentDraft)
  return current === collapseDraft(draftAtStop) || current === collapseDraft(baseDraft)
}

function collapseDraft(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
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
