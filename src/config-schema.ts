import s from '@deepseek-ai/schemastery'
import { DEFAULT_EARS_SETTINGS } from './config.js'

/** Host-only dsh settings schema; keep schemastery out of the browser bundle. */
export const EarsSettingsSchema = s.object({
  asrBackend: s.string().default(DEFAULT_EARS_SETTINGS.asrBackend),
  localWhisperModel: s.string().default(DEFAULT_EARS_SETTINGS.localWhisperModel),
  cloudAsrEndpoint: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrEndpoint),
  cloudAsrModel: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrModel),
  cloudAsrCredentialRef: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrCredentialRef),
  language: s.string().default(DEFAULT_EARS_SETTINGS.language),
  maxRecordingSeconds: s.number().default(DEFAULT_EARS_SETTINGS.maxRecordingSeconds),
  polishingEnabled: s.boolean().default(DEFAULT_EARS_SETTINGS.polishingEnabled),
  polishProvider: s.string().default(DEFAULT_EARS_SETTINGS.polishProvider),
  polishModel: s.string().default(DEFAULT_EARS_SETTINGS.polishModel)
})
