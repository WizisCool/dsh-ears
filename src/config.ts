import s from '@deepseek-ai/schemastery'

export const SETTINGS_NAMESPACE = 'dsh-ears'

export interface EarsSettings {
  language: string
  maxRecordingSeconds: number
  polishingEnabled: boolean
  polishProvider: string
  polishModel: string
}

export const DEFAULT_EARS_SETTINGS: EarsSettings = Object.freeze({
  language: 'zh-CN',
  maxRecordingSeconds: 120,
  polishingEnabled: true,
  polishProvider: '',
  polishModel: ''
})

export const EarsSettingsSchema = s.object({
  language: s.string().default(DEFAULT_EARS_SETTINGS.language),
  maxRecordingSeconds: s.number().default(DEFAULT_EARS_SETTINGS.maxRecordingSeconds),
  polishingEnabled: s.boolean().default(DEFAULT_EARS_SETTINGS.polishingEnabled),
  polishProvider: s.string().default(DEFAULT_EARS_SETTINGS.polishProvider),
  polishModel: s.string().default(DEFAULT_EARS_SETTINGS.polishModel)
})

export interface PolishRoute {
  provider: string
  providerName: string
  model: string
  modelName: string
}
