import { z } from 'zod'
import { ASR_BACKEND_IDS, WHISPER_MODEL_IDS } from './config.js'
import type { AsrBackendId, EarsSettings, PolishRoute } from './config.js'
import type { AsrBackendInfo } from './asr/types.js'

const asrBackendSchema = z.enum(ASR_BACKEND_IDS)
const whisperModelSchema = z.enum(WHISPER_MODEL_IDS)

export const earsSettingsSchema = z.object({
  asrBackend: z.string(),
  localWhisperModel: z.string(),
  cloudAsrEndpoint: z.string(),
  cloudAsrModel: z.string(),
  cloudAsrCredentialRef: z.string(),
  language: z.string(),
  maxRecordingSeconds: z.number(),
  polishingEnabled: z.boolean(),
  polishProvider: z.string(),
  polishModel: z.string()
})

export const earsSettingsPatchSchema = z.object({
  asrBackend: asrBackendSchema.optional(),
  localWhisperModel: whisperModelSchema.optional(),
  cloudAsrEndpoint: z.string().optional(),
  cloudAsrModel: z.string().optional(),
  cloudAsrCredentialRef: z.string().optional(),
  language: z.string().optional(),
  maxRecordingSeconds: z.number().optional(),
  polishingEnabled: z.boolean().optional(),
  polishProvider: z.string().optional(),
  polishModel: z.string().optional()
})

export const earsSettingsViewSchema = z.object({
  available: z.boolean(),
  writable: z.boolean(),
  settings: earsSettingsSchema,
  overridden: z.array(z.string())
})

export const polishRouteSchema = z.object({
  provider: z.string(),
  providerName: z.string(),
  model: z.string(),
  modelName: z.string()
})

export const listRoutesResultSchema = z.array(polishRouteSchema)
export const polishResultSchema = z.string()
export const asrBackendInfoSchema = z.object({
  id: asrBackendSchema,
  name: z.string(),
  available: z.boolean(),
  detail: z.string()
})
export const listAsrBackendsResultSchema = z.array(asrBackendInfoSchema)
export const audioBase64Schema = z.string().min(1).max(33_554_432)
export const audioMimeTypeSchema = z.string().min(1).max(128)
export const transcribeResultSchema = z.string()

export type EarsSettingsPatch = Partial<EarsSettings>
export type EarsSettingsView = {
  available: boolean
  writable: boolean
  settings: EarsSettings
  overridden: string[]
}
export type { PolishRoute }
export type { AsrBackendId, AsrBackendInfo }
