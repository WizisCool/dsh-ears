import { useEffect, useRef } from 'react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { effectiveRecognitionLanguage, effectiveRecordingSeconds } from '../config.js'
import type { EarsSettings } from '../config.js'
import type { AsrBackendInfo } from '../remote-contract.js'
import { AudioLevelMonitor } from '../asr/audio-level.js'
import { MediaRecorderSession, isMediaRecorderAvailable, warmMicrophone } from '../asr/media-recorder.js'
import { WebSpeechSession, isWebSpeechAvailable } from '../asr/web-speech.js'
import type { EarsRemote } from '../remote.js'
import styles from './MicrophoneButton.module.css'
import { base64ByteLength, classifyVoiceFailure, failureMessage, isTrivialRecording, remoteFailureDetail } from './voice-error.js'
import { commitTranscript, updateDraft, type VoiceInputState } from './voice-flow.js'
import { matchesShortcut } from '../shortcut.js'
import type { Translate } from './settings.js'
import { localeEn } from './settings.js'
import { resolveCaptureBackend, shouldAbandonPendingCapture, webSpeechCommittedTranscript } from './voice-capture.js'
import { micUnavailableReason, type MicUnavailableReason } from './mic-availability.js'
import type { BackendHook, WhisperModelHook } from './settings-controller.js'
import { playClick, resumeSounds, retainSounds } from './sounds.js'
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
  readonly useUiLocale?: () => string
  readonly t?: Translate
  readonly earsT?: Translate
}

type ButtonState = VoiceInputState

export function MicrophoneButton({ input, inputActions, remote, useEarsSettings, useEarsBackends, useEarsWhisper, voiceSession, useUiLocale, t: slotT, earsT }: VoiceInputButtonProps) {
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
  const mediaStartedAtRef = useRef(0)
  const mediaStartCancelledRef = useRef(false)
  const transcribeAbortRef = useRef<AbortController | null>(null)
  const polishAbortRef = useRef<AbortController | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<(() => void | Promise<void>) | null>(null)
  const actionsRef = useRef(inputActions)
  const latestDraftRef = useRef(input.draft)
  const uiLocale = useUiLocale?.() ?? 'zh'
  const settings = useEarsSettings((value) => value)
  const backendInfo = useEarsBackends((value) => value)
  const whisperView = useEarsWhisper((value) => value)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
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
    // The hotkey runs on window CAPTURE so it outranks text input: editor
    // keydown handlers (which bubble and may stopPropagation/preventDefault)
    // never see a matched combination, so pressing the shortcut inside the
    // composer cannot be swallowed by the input layer. When the chord does not
    // match (or the shortcut is disabled/gated), the event is left untouched.
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
      event.stopPropagation()
      if (gateRef.current !== null) {
        if (document.activeElement !== element) element.focus()
        return
      }
      toggleRef.current?.()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  useEffect(() => {
    stopRecordingRef.current = null
    return voiceSession.onStopRequested(() => {
      void stopRecordingRef.current?.()
    })
  }, [voiceSession])

  useEffect(() => {
    mountedRef.current = true
    const releaseSounds = retainSounds()
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
      releaseSounds()
    }
  }, [voiceSession])

  const active = state === 'starting' || state === 'recording'
  const busy = state === 'transcribing' || state === 'polishing'
  const backend = resolveCaptureBackend(settings.asrBackend)
  const configUnavailable = !active && !busy && backend !== null && (state === 'idle' || state === 'error' || state === 'polish-error' || state === 'upstream-error')
    ? micUnavailableReason(backend, backendInfo, whisperView)
    : null
  gateRef.current = backend === null ? { kind: 'backend', backendId: 'web-speech' } : configUnavailable

  if (!active && !busy && backend === null) {
    return (
      <Tooltip label={t('voiceUnavailable')} side="top" delayMs={200}>
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
        language: effectiveRecognitionLanguage(settingsRef.current.language, uiLocale),
        onStart: () => {
          startLevelMonitor()
        },
        onInterim: (text) => { sessionDraft = updateDraft(baseDraft, text, latestDraftRef, actionsRef) },
        onFinal: (text) => { sessionDraft = updateDraft(baseDraft, text, latestDraftRef, actionsRef) },
        onError: (error) => {
          failed = true
          levelMonitorRef.current?.stop()
          levelMonitorRef.current = null
          applyVoiceFailure(voiceSession, 'asr', error)
        },
        onEnd: (text) => {
          clearRecordingTimer(recordingTimerRef)
          levelMonitorRef.current?.stop()
          levelMonitorRef.current = null
          speechSessionRef.current = null
          const transcript = webSpeechCommittedTranscript({ sessionText: text, sessionDraft, baseDraft })
          if (failed || transcript === '') {
            if (!failed) setState('idle')
            return
          }
          commitTranscript({
            transcript,
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
      setState('recording')
      armRecordingTimer(recordingTimerRef, settingsRef.current.maxRecordingSeconds, () => session.stop())
    } catch {
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      speechSessionRef.current = null
      if (mountedRef.current) applyVoiceFailure(voiceSession, 'asr', new Error('Speech recognition is unavailable in this browser'))
    }
  }

  const stopRecording = async () => {
    clearRecordingTimer(recordingTimerRef)
    if (state === 'starting' && speechSessionRef.current === null && mediaSessionRef.current === null) {
      playToggleClick(settingsRef.current, 0.4)
      mediaStartCancelledRef.current = true
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      setState('idle')
      return
    }
    if (speechSessionRef.current !== null) {
      playToggleClick(settingsRef.current, 0.4)
      speechSessionRef.current.stop()
      return
    }
    const session = mediaSessionRef.current
    if (session === null) return
    playToggleClick(settingsRef.current, 0.4)
    mediaSessionRef.current = null
    levelMonitorRef.current?.stop()
    levelMonitorRef.current = null
    const baseDraft = mediaBaseDraftRef.current
    const startedAt = mediaStartedAtRef.current
    const controller = new AbortController()
    transcribeAbortRef.current = controller
    try {
      const audio = await session.stop()
      if (!mountedRef.current) return
      if (isTrivialRecording(base64ByteLength(audio.base64), Date.now() - startedAt)) {
        setState('idle')
        return
      }
      setState('transcribing')
      const result = await remote.transcribe(audio.base64, audio.mimeType, controller.signal)
      if (!mountedRef.current) return
      if (!result.ok) {
        applyVoiceFailure(voiceSession, 'asr', result.error)
        return
      }
      if (result.value.trim() === '') {
        setState('idle')
        return
      }
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
    } catch (error) {
      if (mountedRef.current) applyVoiceFailure(voiceSession, 'asr', error)
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
      if (shouldAbandonPendingCapture(mountedRef.current, mediaStartCancelledRef.current)) {
        session.abort()
        return
      }
      mediaSessionRef.current = session
      mediaBaseDraftRef.current = baseDraft
      mediaStartedAtRef.current = Date.now()
      session.start()
      setState('recording')
      armRecordingTimer(recordingTimerRef, effectiveRecordingSeconds(settingsRef.current), () => void stopRecording())
      try {
        levelMonitorRef.current = session.createLevelMonitor((level) => voiceSession.pushAudioLevel(level))
      } catch {
        // Recording remains usable when the optional waveform analyser is unavailable.
      }
    } catch {
      levelMonitorRef.current?.stop()
      levelMonitorRef.current = null
      session?.abort()
      if (mediaSessionRef.current === session) mediaSessionRef.current = null
      if (mountedRef.current) {
        if (mediaStartCancelledRef.current) setState('idle')
        else applyVoiceFailure(voiceSession, 'asr', new Error('Media recording is unavailable in this browser'))
      }
    }
  }

  const prewarmMicrophone = () => {
    if (settingsRef.current.voiceSoundsEnabled !== false) resumeSounds()
    if (active || busy) return
    if (resolveCaptureBackend(settingsRef.current.asrBackend) === 'web-speech') return
    warmMicrophone()
  }

  const toggle = () => {
    if (settingsRef.current.voiceSoundsEnabled !== false) resumeSounds()
    if (active) {
      void stopRecording()
      return
    }
    if (busy) return
    playToggleClick(settingsRef.current, 0.5)

    const nextBackend = resolveCaptureBackend(settingsRef.current.asrBackend)
    if (nextBackend === 'web-speech') {
      void startWebSpeech()
    } else if (nextBackend !== null) {
      void startMediaRecording()
    }
  }
  toggleRef.current = toggle

  const tooltipLabel = busy
    ? t('voiceBusy')
    : active
      ? t('voiceStop')
      : state === 'polish-error'
        ? `${t('voiceUpstreamPolish')}${voiceSnapshot.detail || t('voicePolishFailed')}`
        : state === 'upstream-error'
          ? `${t('voiceUpstreamAsr')}${voiceSnapshot.detail || t('voiceError')}`
          : state === 'error'
            ? t('voiceError')
            : t('voiceStart')
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
        onPointerEnter={prewarmMicrophone}
        onPointerDown={prewarmMicrophone}
        onFocus={prewarmMicrophone}
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

function playToggleClick(settings: EarsSettings, intensity: number): void {
  if (settings.voiceSoundsEnabled === false) return
  playClick(intensity)
}

function applyVoiceFailure(session: VoiceInputSession, source: 'asr' | 'polish', error: unknown): void {
  const detail = remoteFailureDetail({
    code: error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined,
    message: error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : failureMessage(error)
  })
  const kind = classifyVoiceFailure(detail)
  if (kind === 'empty') {
    session.setState('idle')
    return
  }
  if (kind === 'config') {
    session.setState('error')
    return
  }
  session.setState(source === 'polish' ? 'polish-error' : 'upstream-error', detail)
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
