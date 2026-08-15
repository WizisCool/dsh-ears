import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { TYPERT_REMOTE } from '../remote.js'
import { MicrophoneButton } from './MicrophoneButton.js'
import { EarsSettingsController, EarsSettingsSection, LOCALE_NAMESPACE, createSettingsHook, localeEn, localeZh } from './settings.js'

/** Required Client service: the slot registry owns the UI contribution lifecycle. */
export const inject = ['slots', 'remote', 'locale']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(TYPERT_REMOTE)
  await ctx.inject(['slots', 'locale', 'remote.dshEars'], (remoteCtx) => {
    const earsRemote = remoteCtx.remote.dshEars
    const settingsController = new EarsSettingsController(earsRemote)
    const settingsHook = createSettingsHook(settingsController.getSettingsStore())
    const earsT = remoteCtx.locale.bind(LOCALE_NAMESPACE)

    remoteCtx.effect(() => {
      const disposeZh = remoteCtx.locale.register(LOCALE_NAMESPACE, 'zh', localeZh)
      const disposeEn = remoteCtx.locale.register(LOCALE_NAMESPACE, 'en', localeEn)
      return () => {
        disposeZh()
        disposeEn()
      }
    }, 'dsh-ears locale')

    remoteCtx.effect(() => () => {
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
          inject: () => ({
            remote: earsRemote,
            useEarsSettings: settingsHook
          })
        },
        MicrophoneButton
      )
    )

    remoteCtx.slots.inject('settings.section', () =>
      remoteCtx.slots.register(
        {
          name: 'settings.section',
          id: 'dsh-ears',
          order: 16,
          label: () => earsT('nav'),
          inject: () => ({
            hooks: {
              earsCard: settingsController.getCardStore(),
              earsRoutes: settingsController.getRouteStore(),
              earsBackends: settingsController.getBackendStore()
            },
            earsT,
            ...settingsController.actions()
          })
        },
        EarsSettingsSection
      )
    )
  })

  return async () => {
    await disposeRemote()
  }
}
