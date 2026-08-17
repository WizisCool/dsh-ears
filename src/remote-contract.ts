import { z } from 'zod'
import { ASR_BACKEND_IDS, CLOUD_ASR_PROVIDER_IDS, WHISPER_MODEL_IDS } from './config.js'
import type { AsrBackendId, EarsSettings, PolishRoute } from './config.js'
import type { AsrBackendInfo } from './asr/types.js'

const asrBackendSchema = z.enum(ASR_BACKEND_IDS)
const whisperModelSchema = z.enum(WHISPER_MODEL_IDS)
const cloudAsrProviderSchema = z.enum(CLOUD_ASR_PROVIDER_IDS)
export const textSchema = z.string()

export const earsSettingsSchema = z.object({
  asrBackend: z.string(),
  localWhisperModel: z.string(),
  cloudAsrProvider: z.string(),
  cloudAsrApiKey: z.string(),
  cloudAsrCustomApiKey: z.string(),
  cloudAsrBailianApiKey: z.string(),
  cloudAsrEndpoint: z.string(),
  cloudAsrBailianHost: z.string(),
  cloudAsrModel: z.string(),
  language: z.string(),
  maxRecordingSeconds: z.number(),
  voiceShortcutEnabled: z.boolean(),
  voiceShortcut: z.string(),
  polishingEnabled: z.boolean(),
  polishProvider: z.string(),
  polishModel: z.string(),
  polishReasoningEffort: z.string(),
  polishPrompt: z.string()
})

export const earsSettingsPatchSchema = z.object({
  asrBackend: asrBackendSchema.optional(),
  localWhisperModel: whisperModelSchema.optional(),
  cloudAsrProvider: cloudAsrProviderSchema.optional(),
  cloudAsrApiKey: z.string().max(1024).optional(),
  cloudAsrCustomApiKey: z.string().max(1024).optional(),
  cloudAsrBailianApiKey: z.string().max(1024).optional(),
  cloudAsrEndpoint: z.string().optional(),
  cloudAsrBailianHost: z.string().optional(),
  cloudAsrModel: z.string().optional(),
  language: z.string().optional(),
  maxRecordingSeconds: z.number().optional(),
  voiceShortcutEnabled: z.boolean().optional(),
  voiceShortcut: z.string().optional(),
  polishingEnabled: z.boolean().optional(),
  polishProvider: z.string().optional(),
  polishModel: z.string().optional(),
  polishReasoningEffort: z.string().optional(),
  polishPrompt: z.string().optional()
})

export const earsSettingsViewSchema = z.object({
  available: z.boolean(),
  writable: z.boolean(),
  settings: earsSettingsSchema,
  cloudAsrApiKeyConfigured: z.boolean(),
  cloudAsrCustomApiKeyConfigured: z.boolean(),
  cloudAsrBailianApiKeyConfigured: z.boolean(),
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
export const reasoningEffortInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional()
})
export const reasoningEffortsViewSchema = z.object({
  efforts: z.array(reasoningEffortInfoSchema),
  defaultEffort: z.string().optional()
})
export const whisperModelStateSchema = z.object({
  cliAvailable: z.boolean(),
  downloaded: z.boolean(),
  downloading: z.boolean(),
  progress: z.number().nullable(),
  bytes: z.number().nullable(),
  totalBytes: z.number().nullable(),
  error: z.string().nullable()
})
export const cloudProviderModelsViewSchema = z.object({
  status: z.enum(['ok', 'no-key', 'error', 'unsupported']),
  models: z.array(z.string()).optional(),
  error: z.string().optional()
})
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
  cloudAsrApiKeyConfigured: boolean
  cloudAsrCustomApiKeyConfigured: boolean
  cloudAsrBailianApiKeyConfigured: boolean
  overridden: string[]
}
export type { PolishRoute }
export type { AsrBackendInfo }
export type { AsrBackendId, ReasoningEffortInfo, ReasoningEffortsView } from './config.js'
export type { WhisperModelState } from './asr/whisper-models.js'
export type CloudProviderModelsView = z.infer<typeof cloudProviderModelsViewSchema>
