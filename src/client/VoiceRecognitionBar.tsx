import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { IconLoadingOutline16, IconStopFill16, IconTrashOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { fallbackTranslate, type Translate } from './settings-locale.js'
import { recognitionBarAction, useVoiceInputSession, VOICE_WAVEFORM_SLOTS, type VoiceInputSession } from './voice-session.js'
import { statusLabel } from './voice-error.js'
import styles from './VoiceRecognitionBar.module.css'

type VoiceRecognitionBarProps = {
  readonly voiceSession: VoiceInputSession
  readonly t?: Translate
  readonly earsT?: Translate
}

type PresentationPhase = 'hidden' | 'visible' | 'exiting'

type DisplayState = {
  readonly state: 'starting' | 'recording' | 'transcribing' | 'polishing' | 'error' | 'polish-error' | 'upstream-error'
  readonly levels: readonly number[]
  readonly detail: string
  readonly detailCode?: string
  readonly detailParams?: Readonly<Record<string, string | number>>
}

const EXIT_DURATION_MS = 180

export function VoiceRecognitionBar({ voiceSession, t: slotT, earsT }: VoiceRecognitionBarProps) {
  const t = slotT ?? earsT ?? fallbackTranslate
  const { state, levels, detail, detailCode, detailParams } = useVoiceInputSession(voiceSession)
  const active = isVisibleState(state)
  const [phase, setPhase] = useState<PresentationPhase>(active ? 'visible' : 'hidden')
  const rootRef = useRef<HTMLDivElement>(null)
  const hasShownRef = useRef(active)
  const lastDisplayRef = useRef<DisplayState>({ state: 'recording', levels: [], detail: '' })

  useEffect(() => {
    if (active) lastDisplayRef.current = { state, levels, detail, ...(detailCode === undefined ? {} : { detailCode }), ...(detailParams === undefined ? {} : { detailParams }) }
  }, [active, state, levels, detail, detailCode, detailParams])

  useEffect(() => {
    if (active) {
      hasShownRef.current = true
      setPhase('visible')
      return
    }
    if (!hasShownRef.current) return

    setPhase('exiting')
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && rootRef.current?.contains(activeElement)) activeElement.blur()
    const timer = window.setTimeout(() => {
      hasShownRef.current = false
      setPhase('hidden')
    }, EXIT_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [active])

  if (phase === 'hidden') return null

  const display = active ? { state, levels, detail, ...(detailCode === undefined ? {} : { detailCode }), ...(detailParams === undefined ? {} : { detailParams }) } : lastDisplayRef.current
  const processing = display.state === 'transcribing' || display.state === 'polishing'
  const label = statusLabel(display, t)
  const notice = display.state === 'error' || display.state === 'polish-error' || display.state === 'upstream-error'
  const action = recognitionBarAction(display.state)
  const actionLabel = action === 'stop' ? t('voiceStop') : action === 'discard' ? t('voiceDiscard') : t('voiceBusy')

  return (
    <div ref={rootRef} className={styles.root} data-phase={phase} data-state={display.state} aria-hidden={phase === 'exiting'}>
      <div className={styles.collapse}>
        <div className={styles.inner}>
          <div className={styles.status} role="status" aria-live="polite">
            <span className={styles.indicator} aria-hidden="true" />
            <span className={styles.label} title={label}>{label}</span>
            {processing ? <IconLoadingOutline16 className={styles.spinner} size={16} /> : notice ? null : <Waveform levels={display.levels} />}
          </div>
          <Tooltip label={actionLabel} side="top" delayMs={200}>
            <button
              type="button"
              className={styles.stop}
              aria-label={actionLabel}
              disabled={action === 'busy'}
              onClick={() => action === 'discard' ? voiceSession.requestCancel() : voiceSession.requestStop()}
            >
              {action === 'discard' ? <IconTrashOutline16 size={14} /> : <IconStopFill16 size={16} />}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function Waveform({ levels }: { readonly levels: readonly number[] }) {
  return (
    <span className={styles.waveform} aria-hidden="true">
      {Array.from({ length: VOICE_WAVEFORM_SLOTS }, (_, index) => {
        const recorded = index < levels.length
        const level = levels[index] ?? 0
        return <i key={index} style={{ '--wave-height': `${1 + Math.round(level * 17)}px`, '--wave-opacity': recorded ? 0.92 : 0.22 } as CSSProperties} />
      })}
    </span>
  )
}

function isVisibleState(state: string): state is DisplayState['state'] {
  return state === 'starting' || state === 'recording' || state === 'transcribing' || state === 'polishing' || state === 'error' || state === 'polish-error' || state === 'upstream-error'
}
