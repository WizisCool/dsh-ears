import s from '@deepseek-ai/schemastery'
import { DEFAULT_EARS_SETTINGS } from './config.js'

/** Host-only dsh settings schema; keep schemastery out of the browser bundle. */
export const EarsSettingsSchema = s.object({
  asrBackend: s.string().default(DEFAULT_EARS_SETTINGS.asrBackend),
  localWhisperModel: s.string().default(DEFAULT_EARS_SETTINGS.localWhisperModel),
  cloudAsrProvider: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrProvider),
  cloudAsrApiKey: s.string().role('secret').default(DEFAULT_EARS_SETTINGS.cloudAsrApiKey),
  cloudAsrEndpoint: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrEndpoint),
  cloudAsrModel: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrModel),
  language: s.string().default(DEFAULT_EARS_SETTINGS.language),
  maxRecordingSeconds: s.number().default(DEFAULT_EARS_SETTINGS.maxRecordingSeconds),
  voiceShortcutEnabled: s.boolean().default(DEFAULT_EARS_SETTINGS.voiceShortcutEnabled),
  voiceShortcut: s.string().default(DEFAULT_EARS_SETTINGS.voiceShortcut),
  polishingEnabled: s.boolean().default(DEFAULT_EARS_SETTINGS.polishingEnabled),
  polishProvider: s.string().default(DEFAULT_EARS_SETTINGS.polishProvider),
  polishModel: s.string().default(DEFAULT_EARS_SETTINGS.polishModel),
  polishReasoningEffort: s.string().default(DEFAULT_EARS_SETTINGS.polishReasoningEffort)
})
