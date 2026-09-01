import { useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ConversationSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { settingsPageLabel } from '../config.js'
import { TYPERT_REMOTE } from '../remote.js'
import { MicrophoneButton } from './MicrophoneButton.js'
import { VoiceRecognitionBar } from './VoiceRecognitionBar.js'
import { releaseWarmedMicrophone } from '../asr/media-recorder.js'
import { disposeSounds } from './sounds.js'
import { VoiceInputSession } from './voice-session.js'
import { EarsSettingsController, EMPTY_WHISPER_STATE, type BackendState, type CloudModelsView, type WhisperModelView } from './settings-controller.js'
import { EarsSettingsSection, LOCALE_NAMESPACE, createSettingsHook, createSnapshotHook, localeEn, localeZh } from './settings.js'

/** Required Client service: the slot registry owns the UI contribution lifecycle. */
export const inject = ['slots', 'remote', 'locale']

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE)
  await ctx.inject(['slots', 'locale', 'remote.dshEars'], (remoteCtx) => {
    const earsRemote = remoteCtx.remote.dshEars
    const settingsController = new EarsSettingsController(earsRemote)
    const settingsHook = createSettingsHook(settingsController.getSettingsStore())
    const backendHook = createSnapshotHook<BackendState>(settingsController.getBackendStore(), { status: 'loading', backends: [] })
    const whisperHook = createSnapshotHook<WhisperModelView>(settingsController.getWhisperStore(), { status: 'loading', state: EMPTY_WHISPER_STATE })
    const cloudModelsHook = createSnapshotHook<CloudModelsView>(settingsController.getCloudModelsStore(), { status: 'ready', view: { status: 'unsupported' } })
    const voiceSessions = new Map<string, VoiceInputSession>()
    const voiceSessionFor = (sessionId: string): VoiceInputSession => {
      let session = voiceSessions.get(sessionId)
      if (session === undefined) {
        session = new VoiceInputSession()
        voiceSessions.set(sessionId, session)
      }
      return session
    }
    const earsT = remoteCtx.locale.bind(LOCALE_NAMESPACE)
    const useUiLocale = (): string => useSyncExternalStore(
      (listener) => remoteCtx.locale.subscribe(listener),
      () => remoteCtx.locale.getSnapshot().active,
      () => remoteCtx.locale.getSnapshot().active
    )

    remoteCtx.effect(() => {
      const disposeLocale = remoteCtx.locale.register(LOCALE_NAMESPACE, { zh: localeZh, en: localeEn })
      return disposeLocale
    }, 'dsh-ears locale')

    remoteCtx.effect(() => () => {
      for (const session of voiceSessions.values()) session.dispose()
      voiceSessions.clear()
      releaseWarmedMicrophone()
      disposeSounds()
      settingsController.dispose()
    }, 'dsh-ears settings controller lifecycle')

    void settingsController.refreshSettings()
    void settingsController.refreshRoutes()
    void settingsController.refreshBackends()

    void ({} as ConversationSlotProps)
    remoteCtx.slots.inject('conversation.input.right', () =>
      remoteCtx.slots.register(
        {
          name: 'conversation.input.right',
          id: 'dsh-ears-voice',
          order: 30,
          locale: LOCALE_NAMESPACE,
          inject: (sessionId) => ({
            remote: earsRemote,
            useEarsSettings: settingsHook,
            useEarsBackends: backendHook,
            useEarsWhisper: whisperHook,
            voiceSession: voiceSessionFor(sessionId),
            useUiLocale,
            earsT
          })
        },
        MicrophoneButton
      )
    )

    remoteCtx.slots.inject('conversation.input.dock', () =>
      remoteCtx.slots.register(
        {
          name: 'conversation.input.dock',
          id: 'dsh-ears-recognition-bar',
          order: 15,
          locale: LOCALE_NAMESPACE,
          inject: (sessionId) => ({
            voiceSession: voiceSessionFor(sessionId),
            earsT
          })
        },
        VoiceRecognitionBar
      )
    )

    remoteCtx.slots.inject('settings.section', () => {
      const sectionLabel = (): string => settingsPageLabel(settingsController.getCardStore().getSnapshot().settingsDisplayName.text, {
        plugin: earsT('displayNamePlugin'),
        voice: earsT('displayNameVoice')
      })
      const registerSection = () => remoteCtx.slots.register(
        {
          name: 'settings.section',
          id: 'dsh-ears',
          order: 16,
          label: sectionLabel(),
          inject: () => ({
            hooks: {
              earsCard: settingsController.getCardStore(),
              earsRoutes: settingsController.getRouteStore(),
              earsReasoning: settingsController.getReasoningStore(),
              earsWhisper: settingsController.getWhisperStore(),
              earsCloudModels: settingsController.getCloudModelsStore()
            },
            earsT,
            useUiLocale,
            ...settingsController.actions()
          })
        },
        EarsSettingsSection
      )
      let disposeSection = registerSection()
      let lastLabel = sectionLabel()
      let disposed = false
      const syncSectionLabel = () => {
        const nextLabel = sectionLabel()
        if (disposed || nextLabel === lastLabel) return
        lastLabel = nextLabel
        queueMicrotask(() => {
          if (disposed) return
          disposeSection()
          disposeSection = registerSection()
        })
      }
      const unsubscribeCard = settingsController.getCardStore().subscribe(syncSectionLabel)
      const unsubscribeLocale = remoteCtx.locale.subscribe(syncSectionLabel)
      return () => {
        disposed = true
        unsubscribeCard()
        unsubscribeLocale()
        disposeSection()
      }
    })
  })

  return async () => {
    await disposeRemote()
  }
}
