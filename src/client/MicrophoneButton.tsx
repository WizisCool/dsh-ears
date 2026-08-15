import { useEffect, useRef, useState } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconStopFill16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASR_BACKEND_IDS } from '../config.js'
import type { AsrBackendId, EarsSettings } from '../config.js'
import { MediaRecorderSession, isMediaRecorderAvailable } from '../asr/media-recorder.js'
import { WebSpeechSession, isWebSpeechAvailable } from '../asr/web-speech.js'
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

type ButtonState = 'idle' | 'starting' | 'recording' | 'transcribing' | 'polishing' | 'error'

export function MicrophoneButton({ input, inputActions, remote, useEarsSettings }: VoiceInputButtonProps) {
  const [state, setState] = useState<ButtonState>('idle')
  const speechSessionRef = useRef<WebSpeechSession | null>(null)
  const mediaSessionRef = useRef<MediaRecorderSession | null>(null)
  const mediaBaseDraftRef = useRef('')
  const mediaStartCancelledRef = useRef(false)
  const transcribeAbortRef = useRef<AbortController | null>(null)
  const polishAbortRef = useRef<AbortController | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionsRef = useRef(inputActions)
  const latestDraftRef = useRef(input.draft)
  const settings = useEarsSettings((value) => value)
  const settingsRef = useRef(settings)
  const mountedRef = useRef(true)

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
    mountedRef.current = false
    speechSessionRef.current?.abort()
    mediaSessionRef.current?.abort()
    transcribeAbortRef.current?.abort()
    polishAbortRef.current?.abort()
    clearRecordingTimer(recordingTimerRef)
  }, [])

  const backend = normalizeBackend(settings.asrBackend)
  const backendAvailable = backend === 'web-speech' ? isWebSpeechAvailable() : isMediaRecorderAvailable()
  if (!backendAvailable) {
    return (
      <Button
        aria-label="Voice input unavailable"
        disabled
        className={styles.button}
        size="sm"
        title={backend === 'web-speech' ? 'Voice input is unavailable in this browser' : 'This browser cannot record audio for the selected ASR backend'}
        variant="toolbar"
        icon={<MicrophoneIcon />}
      />
    )
  }

  const active = state === 'starting' || state === 'recording'
  const busy = state === 'transcribing' || state === 'polishing'

  const startWebSpeech = () => {
    const baseDraft = input.draft
    let failed = false
    const session = new WebSpeechSession({
      language: settingsRef.current.language,
      onStart: () => {
        setState('recording')
        armRecordingTimer(recordingTimerRef, settingsRef.current.maxRecordingSeconds, () => session.stop())
      },
      onInterim: (text) => updateDraft(baseDraft, text, latestDraftRef, actionsRef),
      onFinal: (text) => updateDraft(baseDraft, text, latestDraftRef, actionsRef),
      onError: () => {
        failed = true
        setState('error')
      },
      onEnd: (text) => {
        clearRecordingTimer(recordingTimerRef)
        speechSessionRef.current = null
        if (failed || text === '') {
          if (!failed) setState('idle')
          return
        }
        commitTranscript({
          transcript: text,
          baseDraft,
          requireUnchanged: false,
          settings: settingsRef.current,
          remote,
          setState,
          latestDraftRef,
          actionsRef,
          polishAbortRef
        })
      }
    })

    speechSessionRef.current = session
    setState('starting')
    session.start()
  }

  const stopRecording = async () => {
    clearRecordingTimer(recordingTimerRef)
    if (state === 'starting' && speechSessionRef.current === null && mediaSessionRef.current === null) {
      mediaStartCancelledRef.current = true
      setState('idle')
      return
    }
    if (speechSessionRef.current !== null) {
      speechSessionRef.current.stop()
      return
    }
    const session = mediaSessionRef.current
    if (session === null) return
    mediaSessionRef.current = null
    const baseDraft = mediaBaseDraftRef.current
    setState('transcribing')
    const controller = new AbortController()
    transcribeAbortRef.current = controller
    try {
      const audio = await session.stop()
      const result = await remote.transcribe(audio.base64, audio.mimeType, controller.signal)
      if (!result.ok || result.value.trim() === '') throw new Error('ASR returned no transcript')
      if (!mountedRef.current) return
      commitTranscript({
        transcript: result.value,
        baseDraft,
        requireUnchanged: true,
        settings: settingsRef.current,
        remote,
        setState,
        latestDraftRef,
        actionsRef,
        polishAbortRef
      })
    } catch {
      if (mountedRef.current) setState('error')
    } finally {
      if (transcribeAbortRef.current === controller) transcribeAbortRef.current = null
    }
  }

  const startMediaRecording = async () => {
    const baseDraft = input.draft
    mediaStartCancelledRef.current = false
    setState('starting')
    try {
      const session = await MediaRecorderSession.create()
      if (!mountedRef.current || mediaStartCancelledRef.current) {
        session.abort()
        return
      }
      mediaSessionRef.current = session
      mediaBaseDraftRef.current = baseDraft
      session.start()
      setState('recording')
      armRecordingTimer(recordingTimerRef, settingsRef.current.maxRecordingSeconds, () => void stopRecording())
    } catch {
      if (mountedRef.current) setState('error')
    }
  }

  const toggle = () => {
    if (active) {
      void stopRecording()
      return
    }
    if (busy) return

    if (normalizeBackend(settingsRef.current.asrBackend) === 'web-speech') {
      startWebSpeech()
    } else {
      void startMediaRecording()
    }
  }

  return (
    <Button
      aria-label={state === 'transcribing' ? 'Transcribing voice input' : state === 'polishing' ? 'Polishing voice input' : active ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={active}
      className={styles.button}
      data-state={state}
      disabled={busy}
      onClick={toggle}
      size="sm"
      title={
        state === 'error'
          ? 'Voice input failed; click to record again'
          : state === 'transcribing'
            ? 'Transcribing voice input'
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

interface CommitTranscriptOptions {
  transcript: string
  baseDraft: string
  requireUnchanged: boolean
  settings: EarsSettings
  remote: EarsRemote
  setState: (state: ButtonState) => void
  latestDraftRef: { current: string }
  actionsRef: { current: { setDraft(text: string): void } }
  polishAbortRef: { current: AbortController | null }
}

function commitTranscript(options: CommitTranscriptOptions): void {
  const transcript = options.transcript.trim()
  if (transcript === '') {
    options.setState('idle')
    return
  }
  if (options.requireUnchanged && options.latestDraftRef.current !== options.baseDraft) {
    options.setState('idle')
    return
  }

  const draftAtStop = appendToDraft(options.baseDraft, transcript)
  options.latestDraftRef.current = draftAtStop
  options.actionsRef.current.setDraft(draftAtStop)
  if (!options.settings.polishingEnabled || options.settings.polishProvider === '' || options.settings.polishModel === '') {
    options.setState('idle')
    return
  }

  void polishDraft({
    transcript,
    baseDraft: options.baseDraft,
    draftAtStop,
    provider: options.settings.polishProvider,
    model: options.settings.polishModel,
    remote: options.remote,
    setState: options.setState,
    latestDraftRef: options.latestDraftRef,
    actionsRef: options.actionsRef,
    polishAbortRef: options.polishAbortRef
  })
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

function armRecordingTimer(timerRef: { current: ReturnType<typeof setTimeout> | null }, seconds: number, stop: () => void): void {
  clearRecordingTimer(timerRef)
  timerRef.current = setTimeout(stop, Math.max(1, seconds) * 1000)
}

function clearRecordingTimer(timerRef: { current: ReturnType<typeof setTimeout> | null }): void {
  if (timerRef.current === null) return
  clearTimeout(timerRef.current)
  timerRef.current = null
}

function normalizeBackend(value: string): AsrBackendId {
  return (ASR_BACKEND_IDS as readonly string[]).includes(value) ? value as AsrBackendId : 'web-speech'
}

export function appendToDraft(baseDraft: string, transcript: string): string {
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
