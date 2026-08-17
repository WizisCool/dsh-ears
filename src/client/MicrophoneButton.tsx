import { useEffect, useRef } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { ASR_BACKEND_IDS } from '../config.js'
import type { AsrBackendId, EarsSettings } from '../config.js'
import type { AsrBackendInfo } from '../remote-contract.js'
import { AudioLevelMonitor } from '../asr/audio-level.js'
import { MediaRecorderSession, isMediaRecorderAvailable } from '../asr/media-recorder.js'
import { WebSpeechSession, isWebSpeechAvailable } from '../asr/web-speech.js'
import type { EarsRemote } from '../remote.js'
import styles from './MicrophoneButton.module.css'
import { commitTranscript, updateDraft, type VoiceInputState } from './voice-flow.js'
import { matchesShortcut } from '../shortcut.js'
import type { Translate } from './settings.js'
import { localeEn } from './settings.js'
import { micUnavailableReason, type MicUnavailableReason } from './mic-availability.js'
import type { BackendHook, WhisperModelHook } from './settings-controller.js'
import { useVoiceInputSession, type VoiceInputSession } from './voice-session.js'

type VoiceInputButtonProps = {
  readonly input: {
    readonly draft: string
  }
  readonly inputActions: {
    setDraft(text: string): void
  }
  readonly remote: EarsRemote
  readonly useEarsSettings: SnapshotSelectorHook<EarsSettings>
  readonly useEarsBackends: BackendHook
  readonly useEarsWhisper: WhisperModelHook
  readonly voiceSession: VoiceInputSession
  readonly t?: Translate
  readonly earsT?: Translate
}

type ButtonState = VoiceInputState

export function MicrophoneButton({ input, inputActions, remote, useEarsSettings, useEarsBackends, useEarsWhisper, voiceSession, t: slotT, earsT }: VoiceInputButtonProps) {
  const t = slotT ?? earsT ?? ((key: string) => localeEn[key as keyof typeof localeEn] ?? key)
  const voiceSnapshot = useVoiceInputSession(voiceSession)
  const state = voiceSnapshot.state
  const setState = (nextState: ButtonState) => {
    voiceSession.setState(nextState)
  }
  const speechSessionRef = useRef<WebSpeechSession | null>(null)
  const mediaSessionRef = useRef<MediaRecorderSession | null>(null)
  const levelMonitorRef = useRef<AudioLevelMonitor | null>(null)
  const mediaBaseDraftRef = useRef('')
  const mediaStartCancelledRef = useRef(false)
  const transcribeAbortRef = useRef<AbortController | null>(null)
  const polishAbortRef = useRef<AbortController | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<(() => void | Promise<void>) | null>(null)
  const actionsRef = useRef(inputActions)
  const latestDraftRef = useRef(input.draft)
  const settings = useEarsSettings((value) => value)
  const backendInfo = useEarsBackends((value) => value)
  const whisperView = useEarsWhisper((value) => value)
  const settingsRef = useRef(settings)
  const mountedRef = useRef(true)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const toggleRef = useRef<(() => void) | null>(null)
  const gateRef = useRef<MicUnavailableReason | null>(null)

  useEffect(() => {
    actionsRef.current = inputActions
  }, [inputActions])

  useEffect(() => {
    latestDraftRef.current = input.draft
  }, [input.draft])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = settingsRef.current
      if (current.voiceShortcutEnabled === false) return
      if (event.isComposing || event.repeat) return
      if (!matchesShortcut(current.voiceShortcut, event)) return
      const target = event.target
      if (target instanceof Element && target.closest('[role="dialog"]') !== null) return
      if (document.visibilityState !== 'visible') return
      const element = buttonRef.current
      if (element === null || element.offsetParent === null) return
      event.preventDefault()
      if (gateRef.current !== null) {
        if (document.activeElement !== element) element.focus()
        return
      }
      toggleRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    stopRecordingRef.current = null
    return voiceSession.onStopRequested(() => {
      void stopRecordingRef.current?.()
    })
  }, [voiceSession])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopRecordingRef.current = null
      voiceSession.setState('idle')
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      speechSessionRef.current?.abort()
      speechSessionRef.current = null
      mediaSessionRef.current?.abort()
      mediaSessionRef.current = null
      transcribeAbortRef.current?.abort()
      polishAbortRef.current?.abort()
      clearRecordingTimer(recordingTimerRef)
    }
  }, [voiceSession])

  const active = state === 'starting' || state === 'recording'
  const busy = state === 'transcribing' || state === 'polishing'
  const backend = normalizeBackend(settings.asrBackend)
  const configUnavailable = !active && !busy && (state === 'idle' || state === 'error')
    ? micUnavailableReason(backend, backendInfo, whisperView)
    : null
  gateRef.current = configUnavailable

  if (!active && !busy && configUnavailable !== null) {
    return (
      <Tooltip label={micUnavailableTooltip(configUnavailable, backendInfo.backends, t)} side="top" delayMs={200}>
        <button
          ref={buttonRef}
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

  const backendAvailable = backend === 'web-speech' ? isWebSpeechAvailable() : isMediaRecorderAvailable()
  if (!active && !busy && !backendAvailable) {
    const unavailableLabel = backend === 'web-speech' ? t('voiceUnavailableWebSpeech') : t('voiceUnavailableRecorder')
    return (
      <Tooltip label={unavailableLabel} side="top" delayMs={200}>
        <button
          ref={buttonRef}
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

  const startWebSpeech = () => {
    const baseDraft = input.draft
    let sessionDraft = baseDraft
    let failed = false
    mediaStartCancelledRef.current = false
    setState('starting')

    let session!: WebSpeechSession
    let levelMonitorStarting = false
    const startLevelMonitor = () => {
      if (levelMonitorStarting || levelMonitorRef.current !== null) return
      levelMonitorStarting = true
      void AudioLevelMonitor.capture((level) => voiceSession.pushAudioLevel(level)).then((monitor) => {
        levelMonitorStarting = false
        if (!mountedRef.current || speechSessionRef.current !== session) {
          monitor.stop()
          return
        }
        levelMonitorRef.current?.stop()
        levelMonitorRef.current = monitor
      }).catch(() => {
        levelMonitorStarting = false
        // Web Speech remains usable when the optional waveform analyser is unavailable.
      })
    }

    try {
      session = new WebSpeechSession({
        language: settingsRef.current.language,
        onStart: () => {
          setState('recording')
          startLevelMonitor()
          armRecordingTimer(recordingTimerRef, settingsRef.current.maxRecordingSeconds, () => session.stop())
        },
        onInterim: (text) => { sessionDraft = updateDraft(baseDraft, text, latestDraftRef, actionsRef) },
        onFinal: (text) => { sessionDraft = updateDraft(baseDraft, text, latestDraftRef, actionsRef) },
        onError: () => {
          failed = true
          levelMonitorRef.current?.stop()
          levelMonitorRef.current = null
          setState('error')
        },
        onEnd: (text) => {
          clearRecordingTimer(recordingTimerRef)
          levelMonitorRef.current?.stop()
          levelMonitorRef.current = null
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
      session.start()
    } catch {
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      speechSessionRef.current = null
      if (mountedRef.current) setState('error')
    }
  }

  const stopRecording = async () => {
    clearRecordingTimer(recordingTimerRef)
    if (state === 'starting' && speechSessionRef.current === null && mediaSessionRef.current === null) {
      mediaStartCancelledRef.current = true
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
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
    levelMonitorRef.current?.stop()
    levelMonitorRef.current = null
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

  stopRecordingRef.current = stopRecording

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
      try {
        levelMonitorRef.current = session.createLevelMonitor((level) => voiceSession.pushAudioLevel(level))
      } catch {
        // Recording remains usable when the optional waveform analyser is unavailable.
      }
      session.start()
      setState('recording')
      armRecordingTimer(recordingTimerRef, settingsRef.current.maxRecordingSeconds, () => void stopRecording())
    } catch {
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
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
      void startWebSpeech()
    } else {
      void startMediaRecording()
    }
  }
  toggleRef.current = toggle

  const tooltipLabel = busy ? t('voiceBusy') : active ? t('voiceStop') : state === 'error' ? t('voiceError') : t('voiceStart')
  const ariaLabel = busy ? t('voiceBusy') : active ? t('voiceStop') : t('voiceStart')

  return (
    <Tooltip label={tooltipLabel} side="top" delayMs={200}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-pressed={active}
        disabled={busy}
        className={styles.button}
        data-state={state}
        onClick={toggle}
      >
        <MicrophoneIcon />
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

function micUnavailableTooltip(reason: MicUnavailableReason, backends: readonly AsrBackendInfo[], t: Translate): string {
  if (reason.kind === 'model-not-downloaded') return t('whisperNotDownloaded')
  if (reason.kind === 'model-downloading') {
    const percent = reason.percent === null ? '' : ` ${String(Math.max(0, Math.min(100, Math.round(reason.percent * 100))))}%`
    return `${t('whisperDownloading')}${percent}`
  }
  const info = backends.find((candidate) => candidate.id === reason.backendId)
  if (reason.backendId === 'local-whisper') return `${t('backendUnavailable')}${t('localUnavailable')}`
  if (reason.backendId === 'cloud-openai') return `${t('backendUnavailable')}${t('cloudUnavailable')}`
  return `${t('backendUnavailable')}${info?.detail ?? ''}`
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
