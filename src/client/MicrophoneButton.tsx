import { useEffect, useRef, useState } from 'react'
import { Button, IconStopFill16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { WebSpeechSession, isWebSpeechAvailable } from '../asr/web-speech.js'
import styles from './MicrophoneButton.module.css'

type VoiceInputButtonProps = {
  readonly input: {
    readonly draft: string
  }
  readonly inputActions: {
    setDraft(text: string): void
  }
}

type ButtonState = 'idle' | 'starting' | 'recording' | 'error'

export function MicrophoneButton({ input, inputActions }: VoiceInputButtonProps) {
  const [state, setState] = useState<ButtonState>('idle')
  const sessionRef = useRef<WebSpeechSession | null>(null)
  const actionsRef = useRef(inputActions)

  useEffect(() => {
    actionsRef.current = inputActions
  }, [inputActions])

  useEffect(() => () => sessionRef.current?.abort(), [])

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

    const baseDraft = input.draft
    let failed = false
    const session = new WebSpeechSession({
      language: 'zh-CN',
      onStart: () => setState('recording'),
      onInterim: (text) => actionsRef.current.setDraft(appendToDraft(baseDraft, text)),
      onFinal: (text) => actionsRef.current.setDraft(appendToDraft(baseDraft, text)),
      onError: () => {
        failed = true
        setState('error')
      },
      onEnd: () => {
        sessionRef.current = null
        if (!failed) setState('idle')
      }
    })

    sessionRef.current = session
    setState('starting')
    session.start()
  }

  return (
    <Button
      aria-label={active ? 'Stop voice input' : 'Start voice input'}
      aria-pressed={active}
      className={styles.button}
      data-state={state}
      onClick={toggle}
      size="sm"
      title={
        state === 'error'
          ? 'Voice input failed; click to record again'
          : active
            ? 'Stop voice input'
            : 'Start voice input'
      }
      variant="toolbar"
      icon={active ? <IconStopFill16 size={16} /> : <MicrophoneIcon />}
    />
  )
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
