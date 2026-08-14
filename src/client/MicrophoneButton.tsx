import { useEffect, useRef, useState } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconStopFill16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { WebSpeechSession, isWebSpeechAvailable } from '../asr/web-speech.js'
import type { EarsSettings } from '../config.js'
import type { EarsRemote } from '../remote.js'
import styles from './MicrophoneButton.module.css'

type VoiceInputButtonProps = {
  readonly input: {
    readonly draft: string
  }
  readonly inputActions: {
    setDraft(text: string): void
  }
  readonly remote: EarsRemote
  readonly useEarsSettings: SnapshotSelectorHook<EarsSettings>
}

type ButtonState = 'idle' | 'starting' | 'recording' | 'polishing' | 'error'

export function MicrophoneButton({ input, inputActions, remote, useEarsSettings }: VoiceInputButtonProps) {
  const [state, setState] = useState<ButtonState>('idle')
  const sessionRef = useRef<WebSpeechSession | null>(null)
  const polishAbortRef = useRef<AbortController | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionsRef = useRef(inputActions)
  const latestDraftRef = useRef(input.draft)
  const settings = useEarsSettings((value) => value)
  const settingsRef = useRef(settings)

  useEffect(() => {
    actionsRef.current = inputActions
  }, [inputActions])

  useEffect(() => {
    latestDraftRef.current = input.draft
  }, [input.draft])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => () => {
    sessionRef.current?.abort()
    polishAbortRef.current?.abort()
    clearRecordingTimer(recordingTimerRef)
  }, [])

  if (!isWebSpeechAvailable()) {
    return (
      <Button
        aria-label="Voice input unavailable"
        disabled
        className={styles.button}
        size="sm"
        title="Voice input is unavailable in this browser"
        variant="toolbar"
        icon={<MicrophoneIcon />}
      />
    )
  }

  const active = state === 'starting' || state === 'recording'

  const toggle = () => {
    if (active) {
      sessionRef.current?.stop()
      return
    }

    if (state === 'polishing') return

    const baseDraft = input.draft
    let failed = false
    const session = new WebSpeechSession({
      language: settingsRef.current.language,
      onStart: () => {
        setState('recording')
        clearRecordingTimer(recordingTimerRef)
        recordingTimerRef.current = setTimeout(() => session.stop(), settingsRef.current.maxRecordingSeconds * 1000)
      },
      onInterim: (text) => updateDraft(baseDraft, text, latestDraftRef, actionsRef),
      onFinal: (text) => updateDraft(baseDraft, text, latestDraftRef, actionsRef),
      onError: () => {
        failed = true
        setState('error')
      },
      onEnd: (text) => {
        clearRecordingTimer(recordingTimerRef)
        sessionRef.current = null
        if (failed || text === '') {
          if (!failed) setState('idle')
          return
        }

        const draftAtStop = appendToDraft(baseDraft, text)
        const currentSettings = settingsRef.current
        if (!currentSettings.polishingEnabled || currentSettings.polishProvider === '' || currentSettings.polishModel === '') {
          setState('idle')
          return
        }

        void polishDraft({
          transcript: text,
          baseDraft,
          draftAtStop,
          provider: currentSettings.polishProvider,
          model: currentSettings.polishModel,
          remote,
          setState,
          latestDraftRef,
          actionsRef,
          polishAbortRef
        })
      }
    })

    sessionRef.current = session
    setState('starting')
    session.start()
  }

  return (
    <Button
      aria-label={state === 'polishing' ? 'Polishing voice input' : active ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={active}
      className={styles.button}
      data-state={state}
      disabled={state === 'polishing'}
      onClick={toggle}
      size="sm"
      title={
        state === 'error'
          ? 'Voice input failed; click to record again'
          : state === 'polishing'
            ? 'Polishing voice input'
          : active
            ? 'Stop voice input'
            : 'Start voice input'
      }
      variant="toolbar"
      icon={active ? <IconStopFill16 size={16} /> : <MicrophoneIcon />}
    />
  )
}

interface PolishDraftOptions {
  transcript: string
  baseDraft: string
  draftAtStop: string
  provider: string
  model: string
  remote: EarsRemote
  setState: (state: ButtonState) => void
  latestDraftRef: { current: string }
  actionsRef: { current: { setDraft(text: string): void } }
  polishAbortRef: { current: AbortController | null }
}

async function polishDraft(options: PolishDraftOptions): Promise<void> {
  const controller = new AbortController()
  options.polishAbortRef.current = controller
  options.setState('polishing')

  try {
    const result = await options.remote.polish(options.transcript, options.provider, options.model, controller.signal)
    if (options.latestDraftRef.current !== options.draftAtStop) return

    const text = result.ok && result.value.trim() !== '' ? result.value.trim() : options.transcript
    const nextDraft = appendToDraft(options.baseDraft, text)
    options.latestDraftRef.current = nextDraft
    options.actionsRef.current.setDraft(nextDraft)
  } catch {
    // The raw transcript is already in the draft. A failed optional polish must not remove it.
  } finally {
    if (options.polishAbortRef.current === controller) options.polishAbortRef.current = null
    options.setState('idle')
  }
}

function updateDraft(
  baseDraft: string,
  transcript: string,
  latestDraftRef: { current: string },
  actionsRef: { current: { setDraft(text: string): void } }
): void {
  const nextDraft = appendToDraft(baseDraft, transcript)
  latestDraftRef.current = nextDraft
  actionsRef.current.setDraft(nextDraft)
}

function clearRecordingTimer(timerRef: { current: ReturnType<typeof setTimeout> | null }): void {
  if (timerRef.current === null) return
  clearTimeout(timerRef.current)
  timerRef.current = null
}

function appendToDraft(baseDraft: string, transcript: string): string {
  if (transcript === '') return baseDraft
  if (baseDraft === '') return transcript
  if (/\s$/.test(baseDraft) || /^\s/.test(transcript)) return baseDraft + transcript
  return `${baseDraft} ${transcript}`
}

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="7" rx="2.5" stroke="currentColor" strokeWidth="1.25" width="4.5" x="5.75" y="2" />
      <path d="M3.75 7.5a4.25 4.25 0 0 0 8.5 0M8 11.75V14M5.5 14h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
    </svg>
  )
}
