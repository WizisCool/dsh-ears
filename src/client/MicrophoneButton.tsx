import { useEffect, useRef, useState } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { IconStopFill16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASR_BACKEND_IDS } from '../config.js'
import type { AsrBackendId, EarsSettings } from '../config.js'
import { MediaRecorderSession, isMediaRecorderAvailable } from '../asr/media-recorder.js'
import { WebSpeechSession, isWebSpeechAvailable } from '../asr/web-speech.js'
import type { EarsRemote } from '../remote.js'
import styles from './MicrophoneButton.module.css'
import { commitTranscript, updateDraft, type VoiceInputState } from './voice-flow.js'
import type { Translate } from './settings.js'
import { localeEn } from './settings.js'

type VoiceInputButtonProps = {
  readonly input: {
    readonly draft: string
  }
  readonly inputActions: {
    setDraft(text: string): void
  }
  readonly remote: EarsRemote
  readonly useEarsSettings: SnapshotSelectorHook<EarsSettings>
  readonly t?: Translate
  readonly earsT?: Translate
}

type ButtonState = VoiceInputState

export function MicrophoneButton({ input, inputActions, remote, useEarsSettings, t: slotT, earsT }: VoiceInputButtonProps) {
  const t = slotT ?? earsT ?? ((key: string) => localeEn[key as keyof typeof localeEn] ?? key)
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
    const unavailableLabel = backend === 'web-speech' ? t('voiceUnavailableWebSpeech') : t('voiceUnavailableRecorder')
    return (
      <Tooltip label={unavailableLabel} side="top" delayMs={200}>
        <button
          type="button"
          aria-label={t('voiceUnavailable')}
          aria-disabled="true"
          className={styles.button}
        >
          <MicrophoneIcon />
        </button>
      </Tooltip>
    )
  }

  const active = state === 'starting' || state === 'recording'
  const busy = state === 'transcribing' || state === 'polishing'

  const startWebSpeech = () => {
    const baseDraft = input.draft
    let sessionDraft = baseDraft
    let failed = false
    const session = new WebSpeechSession({
      language: settingsRef.current.language,
      onStart: () => {
        setState('recording')
        armRecordingTimer(recordingTimerRef, settingsRef.current.maxRecordingSeconds, () => session.stop())
      },
      onInterim: (text) => { sessionDraft = updateDraft(baseDraft, text, latestDraftRef, actionsRef) },
      onFinal: (text) => { sessionDraft = updateDraft(baseDraft, text, latestDraftRef, actionsRef) },
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
          expectedDraft: sessionDraft,
          requireUnchanged: true,
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
    let session: MediaRecorderSession | undefined
    try {
      session = await MediaRecorderSession.create()
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
      session?.abort()
      if (mediaSessionRef.current === session) mediaSessionRef.current = null
      if (mountedRef.current) setState(mediaStartCancelledRef.current ? 'idle' : 'error')
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

  const tooltipLabel =
    state === 'error'
      ? t('voiceError')
      : state === 'transcribing'
        ? t('voiceTranscribing')
        : state === 'polishing'
          ? t('voicePolishing')
          : active
            ? t('voiceStop')
            : t('voiceStart')

  const ariaLabel =
    state === 'transcribing'
      ? t('voiceTranscribing')
      : state === 'polishing'
        ? t('voicePolishing')
        : active
          ? t('voiceStop')
          : t('voiceStart')

  return (
    <Tooltip label={tooltipLabel} side="top" delayMs={200}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={active}
        aria-disabled={busy ? 'true' : undefined}
        className={styles.button}
        data-state={state}
        onClick={toggle}
      >
        {active ? <IconStopFill16 size={16} /> : <MicrophoneIcon />}
      </button>
    </Tooltip>
  )
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

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M8 1.75a2.25 2.25 0 0 0-2.25 2.25v3.5a2.25 2.25 0 0 0 4.5 0V4A2.25 2.25 0 0 0 8 1.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <path
        d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12.25V14M5.5 14h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  )
}
