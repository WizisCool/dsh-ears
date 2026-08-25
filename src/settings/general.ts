export const SETTINGS_DISPLAY_NAME_IDS = ['dsh-ears', 'voice'] as const
export type SettingsDisplayNameId = typeof SETTINGS_DISPLAY_NAME_IDS[number]

export interface GeneralSettings {
  displayName: SettingsDisplayNameId | string
  shortcut: {
    enabled: boolean
    value: string
  }
  soundsEnabled: boolean
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = Object.freeze({
  displayName: 'dsh-ears',
  shortcut: Object.freeze({
    enabled: true,
    value: 'ctrl+shift+space'
  }),
  soundsEnabled: true
})

export function settingsPageLabel(id: string, labels: { plugin: string; voice: string }): string {
  return id === 'voice' ? labels.voice : labels.plugin
}
