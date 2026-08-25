import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import Github from '@thesvg/react/github'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import { MAX_POLISH_PROMPT_LENGTH, WHISPER_MODEL_IDS, effectiveRecognitionLanguage, settingsPageLabel } from '../config.js'
import type { EarsSettings, PolishRoute } from '../config.js'
import { DEFAULT_EARS_SETTINGS } from '../config.js'
import { POLISH_SYSTEM_PROMPT } from '../polish/prompts.js'
import { EMPTY_SHORTCUT_RECORDER, formatModifierChord, formatShortcut, isReservedShortcut, reduceShortcutRecorder, shortcutRejectReason } from '../shortcut.js'
import type { ShortcutModifier, ShortcutRecorderInput } from '../shortcut.js'
import type { AboutInfo, UpdateCheckResult, WhisperModelState } from '../remote-contract.js'
import type { CloudModelsHook, CloudModelsView, EarsCardHook, EarsSettingsHook, FieldName, ReasoningEffortsHook, RouteHook, WhisperModelHook } from './settings-controller.js'
import { localeEn, localizedErrorText, type Translate } from './settings-locale.js'
import styles from './SettingsSection.module.css'

export { LOCALE_NAMESPACE, localeEn, localeZh } from './settings-locale.js'
export type { LocaleKey, Translate } from './settings-locale.js'



interface EarsSettingsSectionProps {
  readonly useEarsCard: EarsCardHook
  readonly useEarsRoutes: RouteHook
  readonly useEarsReasoning: ReasoningEffortsHook
  readonly useEarsWhisper: WhisperModelHook
  readonly useEarsCloudModels: CloudModelsHook
  readonly useUiLocale?: () => string
  readonly earsT: Translate
  readonly edit: (field: FieldName, text: string) => void
  readonly setApiKey: (text: string) => void
  readonly clearApiKey: () => void
  readonly undoClearApiKey: () => void
  readonly setCustomApiKey: (text: string) => void
  readonly clearCustomApiKey: () => void
  readonly undoClearCustomApiKey: () => void
  readonly setBailianApiKey: (text: string) => void
  readonly clearBailianApiKey: () => void
  readonly undoClearBailianApiKey: () => void
  readonly flush: () => void
  readonly retryCloudModels: () => void
  readonly downloadModel: () => void
  readonly cancelModel: () => void
  readonly deleteModel: () => void
  readonly loadAbout: () => Promise<AboutInfo | null>
  readonly checkForUpdate: () => Promise<UpdateCheckResult>
}



export function createSnapshotHook<T>(store: SnapshotStore<T>, fallback: T): SnapshotSelectorHook<T> {
  return function useSnapshotStore<S>(selector: (value: T) => S): S {
    return useSyncExternalStore((listener) => store.subscribe(listener), () => selector(store.getSnapshot()), () => selector(fallback))
  }
}

export function createSettingsHook(store: SnapshotStore<EarsSettings>): EarsSettingsHook {
  return createSnapshotHook(store, DEFAULT_EARS_SETTINGS)
}

export function EarsSettingsSection(props: EarsSettingsSectionProps): ReactNode {
  const state = props.useEarsCard((snapshot) => snapshot)
  const routes = props.useEarsRoutes((snapshot) => snapshot)
  const reasoning = props.useEarsReasoning((snapshot) => snapshot)
  const whisper = props.useEarsWhisper((snapshot) => snapshot)
  const cloudModels = props.useEarsCloudModels((snapshot) => snapshot)
  const tabsId = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const flushRef = useRef(props.flush)
  flushRef.current = props.flush
  const [activeTab, setActiveTab] = useState<'general' | 'recognition' | 'polishing' | 'about'>('general')
  const t = props.earsT
  const uiLocale = props.useUiLocale?.() ?? 'zh'
  useEffect(() => () => {
    flushRef.current()
  }, [])
  if (!state.available) return null
  const providerOptions = uniqueProviders(routes.routes)
  const modelOptions = routes.routes.filter((route) => route.provider === state.polishProvider.text)
  const modelValueIsKnown = modelOptions.some((route) => route.model === state.polishModel.text)
  const selectedEntryId = state.asrBackend.text === 'cloud-openai' ? state.cloudAsrProvider.text : state.asrBackend.text
  const backendMenu: MenuEntry[] = [
    { type: 'label', id: 'group-local', text: t('groupLocal') },
    { id: 'web-speech', label: t('webSpeechBackend') },
    { id: 'local-whisper', label: t('localWhisperBackend') },
    { type: 'separator', id: 'separator-cloud' },
    { type: 'label', id: 'group-cloud', text: t('groupCloud') },
    { id: 'groq', label: t('groqProvider') },
    { id: 'bailian', label: t('bailianProvider') },
    { id: 'custom', label: t('customProvider') }
  ]
  const tabs: Array<{ id: 'general' | 'recognition' | 'polishing' | 'about'; label: string }> = [
    { id: 'general', label: t('groupGeneral') },
    { id: 'recognition', label: t('groupRecognition') },
    { id: 'polishing', label: t('groupPolishing') },
    { id: 'about', label: t('groupAbout') }
  ]
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>{settingsPageLabel(state.settingsDisplayName.text, { plugin: t('displayNamePlugin'), voice: t('displayNameVoice') })}</h2>
      <p className={styles.intro}>{t('description')}</p>
      {state.loadFailed ? <p className={styles.notice} role="alert">{t('loadFailed')}</p> : !state.loaded ? null : !state.writable ? <p className={styles.notice}>{t('readOnly')}</p> : state.failed ? <p className={`${styles.notice} ${styles.noticeError}`} role="alert">{t('saveFailed')}</p> : null}
      <div className={styles.tabs} role="tablist" aria-label={t('tabs')}>
        {tabs.map((tab, index) => {
          const selected = tab.id === activeTab
          return (
            <button key={tab.id} ref={(element) => { tabRefs.current[index] = element }} id={`${tabsId}-tab-${tab.id}`} type="button" role="tab" className={styles.tab} aria-selected={selected} aria-controls={`${tabsId}-panel-${tab.id}`} data-active={selected ? 'true' : undefined} tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                let nextIndex: number
                switch (event.key) {
                  case 'ArrowRight': nextIndex = (index + 1) % tabs.length; break
                  case 'ArrowLeft': nextIndex = (index - 1 + tabs.length) % tabs.length; break
                  case 'Home': nextIndex = 0; break
                  case 'End': nextIndex = tabs.length - 1; break
                  default: return
                }
                event.preventDefault()
                const nextTab = tabs[nextIndex]
                setActiveTab(nextTab.id)
                tabRefs.current[nextIndex]?.focus()
              }}>
              {tab.label}
            </button>
          )
        })}
      </div>
      {activeTab === 'general' ? (
        <div id={`${tabsId}-panel-general`} role="tabpanel" aria-labelledby={`${tabsId}-tab-general`} className={styles.panel}>
          <SelectRow label={t('displayName')} hint={t('displayNameHint')} value={state.settingsDisplayName.text} options={[['dsh-ears', t('displayNamePlugin')], ['voice', t('displayNameVoice')]]} disabled={!state.writable} invalid={state.settingsDisplayName.invalid} onChange={(value) => props.edit('settingsDisplayName', value)} />
          <SelectRow label={t('shortcutEnabled')} hint={t('shortcutEnabledHint')} value={state.voiceShortcutEnabled.text} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} disabled={!state.writable} invalid={state.voiceShortcutEnabled.invalid} onChange={(value) => props.edit('voiceShortcutEnabled', value)} />
          {state.voiceShortcutEnabled.text === 'on' ? (
            <ShortcutRecorderRow label={t('shortcut')} hint={t('shortcutHint')} value={state.voiceShortcut.text} disabled={!state.writable} invalid={state.voiceShortcut.invalid} onChange={(value) => props.edit('voiceShortcut', value)} onReset={() => props.edit('voiceShortcut', DEFAULT_EARS_SETTINGS.voiceShortcut)} t={t} />
          ) : null}
          <SelectRow label={t('soundsEnabled')} hint={t('soundsEnabledHint')} value={state.voiceSoundsEnabled.text} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} disabled={!state.writable} invalid={state.voiceSoundsEnabled.invalid} onChange={(value) => props.edit('voiceSoundsEnabled', value)} />
          <TextRow label={t('language')} hint={t('languageHint')} value={state.language.text} placeholder={effectiveRecognitionLanguage('', uiLocale)} disabled={!state.writable} invalid={state.language.invalid} onChange={(event) => props.edit('language', event.target.value)} onBlur={props.flush} />
          <TextRow label={t('recordingLimit')} hint={t('recordingLimitHint')} value={state.maxRecordingSeconds.text} disabled={!state.writable} invalid={state.maxRecordingSeconds.invalid} numeric onChange={(event) => props.edit('maxRecordingSeconds', event.target.value)} onBlur={props.flush} />
        </div>
      ) : activeTab === 'recognition' ? (
        <div id={`${tabsId}-panel-recognition`} role="tabpanel" aria-labelledby={`${tabsId}-tab-recognition`} className={styles.panel}>
          <SelectRow label={t('backend')} hint={backendHint(state.asrBackend.text, state.cloudAsrProvider.text, t)} value={selectedEntryId} entries={backendMenu} disabled={!state.writable} invalid={state.asrBackend.invalid || state.cloudAsrProvider.invalid} onChange={(id) => {
            if (id === 'groq' || id === 'bailian' || id === 'custom') {
              props.edit('asrBackend', 'cloud-openai')
              props.edit('cloudAsrProvider', id)
              return
            }
            props.edit('asrBackend', id)
          }} />
          {state.asrBackend.text === 'local-whisper' ? <WhisperModelRow label={t('localModel')} value={state.localWhisperModel.text} options={WHISPER_MODEL_IDS.map((model) => [model, model] as [string, string])} disabled={!state.writable} invalid={state.localWhisperModel.invalid} status={whisper.status} modelState={whisper.state} writable={state.writable} onDownload={props.downloadModel} onCancelDownload={props.cancelModel} onDeleteModel={props.deleteModel} onChange={(value) => props.edit('localWhisperModel', value)} t={t} /> : null}
          {state.asrBackend.text === 'cloud-openai' ? state.cloudAsrProvider.text === 'groq' ? <>
            <KeyRow label={t('cloudKey')} hint={t('cloudKeyHint')} value={state.cloudAsrGroqApiKey.text} configured={state.cloudAsrGroqApiKeyConfigured} clearPending={state.cloudAsrGroqApiKeyClearPending} disabled={!state.writable} invalid={state.cloudAsrGroqApiKey.invalid} onEdit={props.setApiKey} onClear={props.clearApiKey} onUndoClear={props.undoClearApiKey} onBlur={props.flush} t={t} />
            <CloudModelRow label={t('cloudModel')} value={state.cloudAsrGroqModel.text} models={cloudModels} disabled={!state.writable} onChange={(value) => props.edit('cloudAsrGroqModel', value)} onRetry={props.retryCloudModels} t={t} />
          </> : state.cloudAsrProvider.text === 'bailian' ? <>
            <TextRow label={t('bailianHost')} hint={t('bailianHostHint')} value={state.cloudAsrBailianHost.text} disabled={!state.writable} invalid={state.cloudAsrBailianHost.invalid} onChange={(event) => props.edit('cloudAsrBailianHost', event.target.value)} onBlur={props.flush} />
            <KeyRow label={t('cloudKey')} hint={t('cloudKeyHint')} value={state.cloudAsrBailianApiKey.text} configured={state.cloudAsrBailianApiKeyConfigured} clearPending={state.cloudAsrBailianApiKeyClearPending} disabled={!state.writable} invalid={state.cloudAsrBailianApiKey.invalid} onEdit={props.setBailianApiKey} onClear={props.clearBailianApiKey} onUndoClear={props.undoClearBailianApiKey} onBlur={props.flush} t={t} />
            <TextRow label={t('cloudModel')} hint={t('bailianModelHint')} value={state.cloudAsrBailianModel.text} disabled={!state.writable} invalid={state.cloudAsrBailianModel.invalid} onChange={(event) => props.edit('cloudAsrBailianModel', event.target.value)} onBlur={props.flush} />
          </> : <>
            <TextRow label={t('cloudEndpoint')} hint={t('cloudEndpointHint')} value={state.cloudAsrCustomEndpoint.text} disabled={!state.writable} invalid={state.cloudAsrCustomEndpoint.invalid} onChange={(event) => props.edit('cloudAsrCustomEndpoint', event.target.value)} onBlur={props.flush} />
            <KeyRow label={t('cloudKey')} hint={t('cloudKeyHint')} value={state.cloudAsrCustomApiKey.text} configured={state.cloudAsrCustomApiKeyConfigured} clearPending={state.cloudAsrCustomApiKeyClearPending} disabled={!state.writable} invalid={state.cloudAsrCustomApiKey.invalid} onEdit={props.setCustomApiKey} onClear={props.clearCustomApiKey} onUndoClear={props.undoClearCustomApiKey} onBlur={props.flush} t={t} />
            <TextRow label={t('cloudModel')} hint={t('cloudModelHint')} value={state.cloudAsrCustomModel.text} disabled={!state.writable} invalid={state.cloudAsrCustomModel.invalid} onChange={(event) => props.edit('cloudAsrCustomModel', event.target.value)} onBlur={props.flush} />
          </> : null}
        </div>
      ) : activeTab === 'polishing' ? (
        <div id={`${tabsId}-panel-polishing`} role="tabpanel" aria-labelledby={`${tabsId}-tab-polishing`} className={styles.panel}>
          <SelectRow label={t('polishing')} hint={t('polishingHint')} value={state.polishingEnabled.text} options={[['on', t('polishingOn')], ['off', t('polishingOff')]]} disabled={!state.writable} invalid={state.polishingEnabled.invalid} onChange={(value) => props.edit('polishingEnabled', value)} />
          {state.polishingEnabled.text === 'on' ? <>
            <SelectRow label={t('provider')} hint={t('providerHint')} value={state.polishProvider.text} options={providerOptions.map((provider) => [provider.provider, provider.providerName] as [string, string])} placeholder={t('providerPlaceholder')} disabled={!state.writable || routes.status === 'loading'} invalid={state.polishProvider.invalid} onChange={(value) => props.edit('polishProvider', value)} />
            <SelectRow label={t('model')} hint={routes.status === 'loading' ? t('loadingModels') : modelOptions.length === 0 ? t('noModels') : t('modelHint')} value={modelValueIsKnown ? state.polishModel.text : ''} options={modelOptions.map((model) => [model.model, model.modelName] as [string, string])} placeholder={t('modelPlaceholder')} disabled={!state.writable || state.polishProvider.text === '' || routes.status === 'loading'} invalid={state.polishModel.invalid} onChange={(value) => props.edit('polishModel', value)} />
            {state.polishProvider.text !== '' && state.polishModel.text !== '' && (reasoning.status === 'loading' || reasoning.efforts.length > 0) ? (
              <SelectRow label={t('reasoningEffort')} hint={t('reasoningEffortHint')} value={reasoning.efforts.some((effort) => effort.id === state.polishReasoningEffort.text) ? state.polishReasoningEffort.text : ''} options={[['', t('defaultEffort')], ...reasoning.efforts.map((effort) => [effort.id, effort.name] as [string, string])]} disabled={!state.writable || reasoning.status === 'loading'} invalid={state.polishReasoningEffort.invalid} onChange={(value) => props.edit('polishReasoningEffort', value)} />
            ) : null}
            <PromptRow label={t('polishPrompt')} hint={t('polishPromptHint')} value={state.polishPrompt.text} disabled={!state.writable} invalid={state.polishPrompt.invalid} defaultValue={POLISH_SYSTEM_PROMPT} t={t} onChange={(value) => props.edit('polishPrompt', value)} onReset={() => props.edit('polishPrompt', DEFAULT_EARS_SETTINGS.polishPrompt)} onBlur={props.flush} />
          </> : null}
        </div>
      ) : (
        <div id={`${tabsId}-panel-about`} role="tabpanel" aria-labelledby={`${tabsId}-tab-about`} className={styles.panel}>
          <AboutPanel t={t} loadAbout={props.loadAbout} checkForUpdate={props.checkForUpdate} />
        </div>
      )}
    </section>
  )
}

function AboutPanel({ t, loadAbout, checkForUpdate }: { t: Translate; loadAbout: () => Promise<AboutInfo | null>; checkForUpdate: () => Promise<UpdateCheckResult> }) {
  const [about, setAbout] = useState<AboutInfo | null>(null)
  const [check, setCheck] = useState<UpdateCheckResult | { status: 'idle' } | { status: 'checking' }>({ status: 'idle' })
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let cancelled = false
    void loadAbout().then((value) => {
      if (!cancelled) setAbout(value)
    })
    return () => {
      cancelled = true
    }
  }, [loadAbout])
  const checkHint = check.status === 'checking'
    ? t('aboutChecking')
    : check.status === 'up-to-date'
      ? t('aboutUpToDate')
      : check.status === 'update-available'
        ? t('aboutUpdateAvailable', { version: check.latest ?? '' }).trim()
        : check.status === 'unpublished'
          ? t('aboutUnpublished')
          : check.status === 'error'
            ? t('aboutCheckFailed')
            : ''
  const checkAlert = check.status === 'unpublished' || check.status === 'error'
  return (
    <>
      <RowField label={t('aboutRepository')} hint="">
        {about === null ? <span className={styles.aboutValue}>—</span> : (
          <a className={styles.aboutRepo} href={about.repository} target="_blank" rel="noreferrer">
            <Github variant="mono" width={16} height={16} className={styles.aboutRepoIcon} aria-hidden="true" />
            <span>{about.repositorySlug}</span>
          </a>
        )}
      </RowField>
      <ValueRow label={t('aboutVersion')} value={about?.version ?? '—'} />
      <ValueRow label={t('aboutLicense')} value={about?.license ?? '—'} />
      <ValueRow label={t('aboutCompat')} value={about?.dshCompatibility ?? '—'} />
      <RowField label={t('aboutCheck')} hint={checkHint} invalid={checkAlert} alert={checkAlert}>
        <div className={styles.aboutActions}>
          <button
            type="button"
            className={styles.linkButton}
            disabled={check.status === 'checking'}
            onClick={() => {
              setCopied(false)
              setCheck({ status: 'checking' })
              void checkForUpdate().then((result) => setCheck(result))
            }}
          >
            {check.status === 'checking' ? t('aboutChecking') : t('aboutCheckAction')}
          </button>
          {check.status === 'update-available' ? (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                const command = check.updateCommand
                void navigator.clipboard.writeText(command).then(() => {
                  setCopied(true)
                }).catch(() => undefined)
              }}
            >
              {copied ? t('copied') : t('aboutCopyCommand')}
            </button>
          ) : null}
        </div>
      </RowField>
    </>
  )
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <RowField label={label} hint="">
      <span className={styles.aboutValue}>{value}</span>
    </RowField>
  )
}

function RowField({ label, hint, invalid, alert, warn, wide = false, children }: { label: string; hint: string; invalid?: boolean; alert?: boolean; warn?: boolean; wide?: boolean; children: ReactNode }) {
  const showHint = hint !== ''
  const markInvalid = invalid === true
  return (
    <div className={`${styles.row} ${wide ? styles.rowWide : ''}`}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{label}</div>
        {showHint ? <div className={`${styles.rowDesc} ${markInvalid ? styles.invalid : ''} ${warn === true ? styles.warning : ''}`} {...(alert === true || markInvalid ? { role: 'alert' } : {})}>{hint}</div> : null}
      </div>
      <div className={styles.rowControl}>{children}</div>
    </div>
  )
}

const SHORTCUT_PLATFORM: 'mac' | 'win' | 'linux' = (() => {
  const raw = typeof navigator === 'undefined' ? '' : ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '')
  const platform = raw.toLowerCase()
  if (platform.includes('mac')) return 'mac'
  if (platform.includes('win')) return 'win'
  return 'linux'
})()

function recorderInput(type: 'keydown' | 'keyup', event: KeyboardEvent): ShortcutRecorderInput {
  return {
    type,
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    metaKey: event.metaKey,
    getModifierState: (name) => event.getModifierState(name)
  }
}

function ShortcutRecorderRow({ label, hint, value, disabled, invalid, onChange, onReset, t }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; onChange: (value: string) => void; onReset: () => void; t: Translate }) {
  const [capturing, setCapturing] = useState(false)
  const [pressedModifiers, setPressedModifiers] = useState<readonly ShortcutModifier[]>([])
  const recorderRef = useRef(EMPTY_SHORTCUT_RECORDER)
  const reason = shortcutRejectReason(value)
  const invalidText = reason === 'typing-key' ? t('shortcutInvalidTypingKey') : reason === 'invalid' ? t('shortcutInvalidFormat') : null
  const reserved = !invalid && isReservedShortcut(value)
  const customized = !capturing && value !== DEFAULT_EARS_SETTINGS.voiceShortcut
  useEffect(() => {
    if (!capturing) return
    recorderRef.current = EMPTY_SHORTCUT_RECORDER
    const apply = (event: KeyboardEvent, type: 'keydown' | 'keyup') => {
      const decision = reduceShortcutRecorder(recorderRef.current, recorderInput(type, event))
      recorderRef.current = decision.state
      if (decision.kind === 'ignore') return
      if (decision.kind === 'update') {
        setPressedModifiers(decision.state.held)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setPressedModifiers([])
      setCapturing(false)
      if (decision.kind === 'commit') onChange(decision.chord)
    }
    const onKeyDown = (event: KeyboardEvent) => apply(event, 'keydown')
    const onKeyUp = (event: KeyboardEvent) => apply(event, 'keyup')
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [capturing, onChange])
  const displayedHint = capturing ? t('shortcutCaptureHint') : invalidText !== null ? invalidText : reserved ? t('shortcutReserved') : hint
  const captureLabel = pressedModifiers.length > 0 ? formatModifierChord(pressedModifiers, SHORTCUT_PLATFORM) : t('shortcutCapture')
  return (
    <RowField label={label} hint={displayedHint} invalid={invalid} alert={invalidText !== null} warn={!invalid && reserved && !capturing}>
      <div className={styles.shortcutControl}>
        <button
          type="button"
          className={`${styles.selector} ${customized ? styles.selectorHasReset : ''}`}
          aria-label={label}
          aria-invalid={invalid}
          disabled={disabled}
          onClick={() => setCapturing((current) => !current)}
        >
          <span className={styles.selectorLabel}>{capturing ? captureLabel : formatShortcut(value, SHORTCUT_PLATFORM)}</span>
        </button>
        {customized ? (
          <button type="button" className={styles.shortcutAction} disabled={disabled} onClick={onReset}>{t('shortcutClear')}</button>
        ) : null}
      </div>
    </RowField>
  )
}

function SelectRow({ label, hint, value, options, entries, placeholder, disabled, invalid, onChange }: { label: string; hint: string; value: string; options?: [string, string][]; entries?: readonly MenuEntry[]; placeholder?: string; disabled: boolean; invalid: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const menuItems: readonly MenuEntry[] = entries ?? (options ?? []).map(([id, optionLabel]) => ({ id, label: optionLabel }))
  const selected = menuItems.find((item): item is Extract<MenuEntry, { id: string; label: ReactNode }> => !('type' in item) && item.id === value)
  const labelText = selected === undefined ? (value === '' && placeholder !== undefined ? placeholder : value) : selected.label
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={menuItems}
        selectedId={value}
        onSelect={(id) => {
          setOpen(false)
          if (id === value) return
          onChange(id)
        }}
        align="end"
        portal
        anchor={
          <button type="button" className={styles.selector} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-invalid={invalid} disabled={disabled} onClick={() => setOpen((current) => !current)}>
            <span className={styles.selectorLabel}>{labelText}</span>
            <IconChevronDownOutline14 className={styles.chevron} />
          </button>
        }
      />
    </RowField>
  )
}

function TextRow({ label, hint, value, disabled, invalid, numeric, placeholder, onChange, onBlur }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; numeric?: boolean; placeholder?: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onBlur?: () => void }) {
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <Input className={styles.textInput} type={numeric ? 'number' : 'text'} value={value} placeholder={placeholder} disabled={disabled} aria-label={label} aria-invalid={invalid} onChange={onChange} onBlur={onBlur} />
    </RowField>
  )
}

function PromptRow({ label, hint, value, disabled, invalid, defaultValue, t, onChange, onReset, onBlur }: { label: string; hint: string; value: string; disabled: boolean; invalid: boolean; defaultValue: string; t: Translate; onChange: (value: string) => void; onReset: () => void; onBlur?: () => void }) {
  const [showDefault, setShowDefault] = useState(false)
  const length = value.trim().length
  const over = length > MAX_POLISH_PROMPT_LENGTH
  return (
    <RowField label={label} hint={over ? t('promptTooLong') : hint} invalid={invalid} alert={over} wide>
      <div className={styles.promptControl}>
        <textarea
          className={`${styles.textInput} ${styles.promptInput}`}
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-invalid={invalid}
          placeholder={t('promptPlaceholder')}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        <div className={styles.promptMeta}>
          <p className={`${styles.promptCount} ${over ? styles.promptCountOver : ''}`}>{t('promptCount', { count: length, max: MAX_POLISH_PROMPT_LENGTH })}</p>
          <button type="button" className={styles.linkButton} disabled={disabled} onClick={() => setShowDefault((current) => !current)}>{t(showDefault ? 'collapse' : 'promptViewDefault')}</button>
          <button type="button" className={styles.linkButton} disabled={disabled || value.trim() === ''} onClick={onReset}>{t('promptReset')}</button>
        </div>
        {showDefault ? <pre className={styles.promptDefault}>{defaultValue}</pre> : null}
      </div>
    </RowField>
  )
}

function KeyRow({ label, hint, value, configured, clearPending, disabled, invalid, onEdit, onClear, onUndoClear, onBlur, t }: { label: string; hint: string; value: string; configured: boolean; clearPending: boolean; disabled: boolean; invalid: boolean; onEdit: (text: string) => void; onClear: () => void; onUndoClear: () => void; onBlur?: () => void; t: Translate }) {
  const hasAction = configured || clearPending
  return (
    <RowField label={label} hint={hint} invalid={invalid}>
      <div className={styles.keyControl}>
        <input
          className={`${styles.textInput} ${styles.keyInput} ${hasAction ? styles.keyInputHasAction : ''}`}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-bwignore="true"
          data-1p-ignore="true"
          data-lpignore="true"
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-invalid={invalid}
          placeholder={clearPending ? t('cloudKeyClearPending') : configured ? t('cloudKeyConfigured') : t('cloudKeyNotConfigured')}
          onChange={(event) => onEdit(event.target.value)}
          onBlur={onBlur}
        />
        {hasAction ? <button type="button" className={styles.keyAction} disabled={disabled} onClick={clearPending ? onUndoClear : onClear}>{t(clearPending ? 'undoClearKey' : 'clearKey')}</button> : null}
      </div>
    </RowField>
  )
}

function CloudModelRow({ label, value, models, disabled, onChange, onRetry, t }: { label: string; value: string; models: CloudModelsView; disabled: boolean; onChange: (value: string) => void; onRetry: () => void; t: Translate }) {
  if (models.status === 'loading') {
    return <RowField label={label} hint={t('loadingModels')} invalid={false}><div className={styles.rowDescInline}><span className={styles.spinner} aria-hidden="true" /><span>{t('loadingModels')}</span></div></RowField>
  }
  const view = models.view
  if (view.status === 'error') {
    const errorText = localizedErrorText(t, view.errorCode, view.error ?? t('cloudModelFetchFailed'), view.errorParams)
    return (
      <RowField label={label} hint={errorText} invalid alert>
        <div className={styles.rowDescInline}>
          <span>{errorText}</span>
          <button type="button" className={styles.linkButton} disabled={disabled} onClick={onRetry}>{t('retry')}</button>
        </div>
      </RowField>
    )
  }
  const options = (view.models ?? []).map((model) => [model, model] as [string, string])
  const stale = view.status === 'ok' && value.trim() !== '' && !(view.models ?? []).includes(value)
  const noModels = view.status !== 'ok' || options.length === 0
  return (
    <>
      <SelectRow label={label} hint={t('cloudModelGroqHint')} value={value} options={options} placeholder={t('modelPlaceholder')} disabled={disabled || noModels} invalid={false} onChange={onChange} />
      {stale ? <p className={styles.statusError}>{t('cloudModelStale')}</p> : null}
    </>
  )
}

function WhisperModelRow({ label, value, options, disabled, invalid, status, modelState, writable, onDownload, onCancelDownload, onDeleteModel, onChange, t }: { label: string; value: string; options: [string, string][]; disabled: boolean; invalid: boolean; status: 'loading' | 'ready'; modelState: WhisperModelState; writable: boolean; onDownload: () => void; onCancelDownload: () => void; onDeleteModel: () => void; onChange: (value: string) => void; t: Translate }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(([optionValue]) => optionValue === value)
  const labelText = selected === undefined ? value : selected[1]
  const alert = invalid || !modelState.runtimeAvailable || modelState.error !== null
  const statusContent = status === 'loading' ? whisperCheckingContent(t) : whisperStatusContent(modelState, t, writable, onDownload, onCancelDownload, onDeleteModel)
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{label}</div>
        <div className={`${styles.rowDesc} ${styles.rowDescInline} ${alert ? styles.invalid : ''}`} {...(alert ? { role: 'alert' } : {})}>
          {statusContent}
        </div>
      </div>
      <div className={styles.rowControl}>
        <Menu
          open={open}
          onClose={() => setOpen(false)}
          items={options.map(([id, optionLabel]) => ({ id, label: optionLabel }))}
          selectedId={value}
          onSelect={(id) => {
            setOpen(false)
            if (id === value) return
            onChange(id)
          }}
          align="end"
          portal
          anchor={
            <button type="button" className={styles.selector} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-invalid={invalid} disabled={disabled} onClick={() => setOpen((current) => !current)}>
              <span className={styles.selectorLabel}>{labelText}</span>
              <IconChevronDownOutline14 className={styles.chevron} />
            </button>
          }
        />
      </div>
    </div>
  )
}

function whisperCheckingContent(t: Translate): ReactNode {
  return <><span className={styles.spinner} aria-hidden="true" /><span>{t('whisperChecking')}</span></>
}

function whisperStatusContent(modelState: WhisperModelState, t: Translate, writable: boolean, onDownload: () => void, onCancelDownload: () => void, onDeleteModel: () => void): ReactNode {
  if (!modelState.runtimeAvailable) {
    const errorText = modelState.error === null ? t('whisperNativeUnavailable') : localizedErrorText(t, modelState.errorCode, modelState.error, modelState.errorParams)
    return <span>{errorText}</span>
  }
  if (modelState.error !== null) {
    const errorText = localizedErrorText(t, modelState.errorCode, modelState.error, modelState.errorParams)
    return <>
      <span>{errorText}</span>
      {modelState.downloading
        ? <button type="button" className={styles.linkButton} onClick={onCancelDownload}>{t('cancelDownload')}</button>
        : modelState.downloaded
          ? <WhisperDownloadedActions modelState={modelState} t={t} writable={writable} onDeleteModel={onDeleteModel} />
          : <button type="button" className={styles.linkButton} disabled={!writable} onClick={onDownload}>{t('retryDownload')}</button>}
    </>
  }
  if (modelState.downloading) {
    const percent = modelState.progress === null ? null : Math.max(0, Math.min(100, Math.round(modelState.progress * 100)))
    return <><span>{percent === null ? t('whisperDownloading') : t('whisperDownloadingProgress', { percent })}</span><button type="button" className={styles.linkButton} onClick={onCancelDownload}>{t('cancelDownload')}</button></>
  }
  if (modelState.downloaded) {
    return <WhisperDownloadedActions modelState={modelState} t={t} writable={writable} onDeleteModel={onDeleteModel} />
  }
  return <><span>{t('whisperNotDownloaded')}</span><button type="button" className={styles.linkButton} disabled={!writable} onClick={onDownload}>{t('clickDownload')}</button></>
}

function WhisperDownloadedActions({ modelState, t, writable, onDeleteModel }: { modelState: WhisperModelState; t: Translate; writable: boolean; onDeleteModel: () => void }) {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => clearTimeout(timer)
  }, [confirming])
  return (
    <>
      <span>{t('whisperDownloaded')}</span>
      {confirming
        ? <button type="button" className={`${styles.linkButton} ${styles.linkButtonDanger}`} disabled={!writable} onClick={onDeleteModel}>{t('confirmDeleteModel')}</button>
        : <button type="button" className={`${styles.linkButton} ${styles.linkButtonDanger}`} disabled={!writable} onClick={() => setConfirming(true)}>{t('deleteModel')}</button>}
    </>
  )
}

function uniqueProviders(routes: readonly PolishRoute[]): PolishRoute[] {
  const seen = new Set<string>()
  return routes.filter((route) => {
    if (seen.has(route.provider)) return false
    seen.add(route.provider)
    return true
  })
}

function backendHint(backend: string, provider: string, t: Translate): string {
  if (backend === 'local-whisper') return t('backendHintLocalWhisper')
  if (backend === 'cloud-openai') {
    if (provider === 'groq') return t('backendHintGroq')
    if (provider === 'bailian') return t('backendHintBailian')
    return t('backendHintCustom')
  }
  return t('backendHintWebSpeech')
}
