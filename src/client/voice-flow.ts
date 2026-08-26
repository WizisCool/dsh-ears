import type { EarsSettings } from '../config.js'
import { isEarsErrorCode } from '../errors.js'
import { joinSpacedSegments } from '../text-join.js'
import type { EarsRemote } from '../remote.js'
import { classifyVoiceFailure, failureMessage, remoteFailureDetail, remoteFailureParams } from './voice-error.js'
import type { VoiceStateDetailParams } from './voice-session.js'

export type VoiceInputState = 'idle' | 'starting' | 'recording' | 'transcribing' | 'polishing' | 'error' | 'polish-error' | 'upstream-error'

export interface DraftActions {
  setDraft(text: string): void
}

export interface CommitTranscriptOptions {
  transcript: string
  baseDraft: string
  expectedDraft?: string
  requireUnchanged: boolean
  transcriptAlreadyApplied?: boolean
  settings: EarsSettings
  remote: EarsRemote
  setState: (state: VoiceInputState, detail?: string, detailCode?: string, detailParams?: VoiceStateDetailParams) => void
  latestDraftRef: { current: string }
  actionsRef: { current: DraftActions }
  polishAbortRef: { current: AbortController | null }
  isCurrent?: () => boolean
}

export function commitTranscript(options: CommitTranscriptOptions): void {
  const transcript = options.transcript.trim()
  if (transcript === '') {
    options.setState('idle')
    return
  }
  const draftBase = resolveCommitDraftBase(options)
  if (draftBase === null) {
    options.setState('idle')
    return
  }

  const draftAtStop = options.transcriptAlreadyApplied ? options.latestDraftRef.current : appendToDraft(draftBase, transcript)
  options.latestDraftRef.current = draftAtStop
  options.actionsRef.current.setDraft(draftAtStop)
  // Honor the local toggle so an off switch never flashes "polishing".
  // An enabled toggle still asks the Host even with an empty local pair;
  // the Host is authoritative for the stored route.
  if (options.isCurrent !== undefined && !options.isCurrent()) {
    options.setState('idle')
    return
  }
  if (!shouldRequestPolish(options.settings)) {
    options.setState('idle')
    return
  }
  void polishDraft({
    transcript,
    baseDraft: draftBase,
    originalDraft: options.baseDraft,
    draftAtStop,
    provider: options.settings.polishProvider,
    model: options.settings.polishModel,
    reasoningEffort: options.settings.polishReasoningEffort,
    remote: options.remote,
    setState: options.setState,
    latestDraftRef: options.latestDraftRef,
    actionsRef: options.actionsRef,
    polishAbortRef: options.polishAbortRef,
    isCurrent: options.isCurrent
  })
}

export function shouldRequestPolish(settings: Pick<EarsSettings, 'polishingEnabled'>): boolean {
  return settings.polishingEnabled
}

function resolveCommitDraftBase(options: CommitTranscriptOptions): string | null {
  if (!options.requireUnchanged) return options.baseDraft
  const expectedDraft = options.expectedDraft ?? options.baseDraft
  const currentDraft = options.latestDraftRef.current
  if (currentDraft === expectedDraft) return options.baseDraft
  // Clearing the composer is an intentional reset of the old draft, not a
  // conflicting edit. The transcript should become the new draft instead of
  // being discarded by stale-result protection.
  if (currentDraft.trim() === '') return ''
  return null
}

export interface PolishDraftOptions {
  transcript: string
  baseDraft: string
  originalDraft: string
  draftAtStop: string
  provider: string
  model: string
  reasoningEffort: string
  remote: EarsRemote
  setState: (state: VoiceInputState, detail?: string, detailCode?: string, detailParams?: VoiceStateDetailParams) => void
  latestDraftRef: { current: string }
  actionsRef: { current: DraftActions }
  polishAbortRef: { current: AbortController | null }
  isCurrent?: () => boolean
}

export async function polishDraft(options: PolishDraftOptions): Promise<void> {
  if (options.isCurrent !== undefined && !options.isCurrent()) return
  const controller = new AbortController()
  options.polishAbortRef.current = controller
  options.setState('polishing')

  try {
    const result = await options.remote.polish(options.transcript, options.provider, options.model, options.reasoningEffort, controller.signal)
    if (controller.signal.aborted) return
    if (!shouldApplyPolishResult(options.latestDraftRef.current, options.draftAtStop, options.baseDraft, options.originalDraft)) {
      if (!controller.signal.aborted) options.setState('idle')
      return
    }

    if (!result.ok) {
      const detailCode = isEarsErrorCode(result.error.code) ? result.error.code : undefined
      const detail = remoteFailureDetail(result.error)
      if (detailCode === undefined) options.setState('polish-error', detail)
      else options.setState('polish-error', detail, detailCode)
      return
    }
    if (result.value.status === 'error') {
      const detailCode = isEarsErrorCode(result.value.code) ? result.value.code : undefined
      const detail = remoteFailureDetail(result.value)
      if (detailCode === undefined) options.setState('polish-error', detail)
      else options.setState('polish-error', detail, detailCode, result.value.params)
      return
    }
    const text = result.value.text.trim() !== '' ? result.value.text.trim() : options.transcript
    const nextDraft = appendToDraft(options.baseDraft, text)
    options.latestDraftRef.current = nextDraft
    options.actionsRef.current.setDraft(nextDraft)
    options.setState('idle')
  } catch (error) {
    if (controller.signal.aborted) return
    const message = failureMessage(error)
    if (classifyVoiceFailure(message) === 'empty') {
      options.setState('idle')
      return
    }
    const code = error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && isEarsErrorCode(error.code) ? error.code : undefined
    const detail = remoteFailureDetail({ message })
    const detailParams = remoteFailureParams(error)
    if (code === undefined) options.setState('polish-error', detail)
    else options.setState('polish-error', detail, code, detailParams)
  } finally {
    if (options.polishAbortRef.current === controller) options.polishAbortRef.current = null
  }
}

export function shouldApplyPolishResult(currentDraft: string, draftAtStop: string, baseDraft: string, originalDraft = baseDraft): boolean {
  const current = collapseDraft(currentDraft)
  const effectiveBase = collapseDraft(baseDraft)
  const original = collapseDraft(originalDraft)
  return current === collapseDraft(draftAtStop) || (original !== '' && effectiveBase === original && current === original)
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
  return joinSpacedSegments(baseDraft, transcript)
}
