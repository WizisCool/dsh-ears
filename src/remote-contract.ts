import { z } from 'zod'
import { ASR_BACKEND_IDS, CLOUD_ASR_PROVIDER_IDS, SETTINGS_DISPLAY_NAME_IDS, TENCENT_ASR_SERVICE_IDS, WHISPER_ACCELERATION_IDS, WHISPER_MODEL_IDS } from './config.js'
import type { AsrBackendId, EarsSettings, PolishRoute, WhisperAccelerationId } from './config.js'
import type { EarsErrorCode, EarsErrorParams } from './errors.js'
import type { AsrBackendInfo } from './asr/types.js'

const asrBackendSchema = z.enum(ASR_BACKEND_IDS)
const whisperModelSchema = z.enum(WHISPER_MODEL_IDS)
const cloudAsrProviderSchema = z.enum(CLOUD_ASR_PROVIDER_IDS)
export const textSchema = z.string()

export const earsSettingsSchema = z.object({
  asrBackend: z.string(),
  localWhisperModel: z.string(),
  localWhisperAcceleration: z.string(),
  cloudAsrProvider: z.string(),
  cloudAsrGroqApiKey: z.string(),
  cloudAsrGroqModel: z.string(),
  cloudAsrCustomApiKey: z.string(),
  cloudAsrCustomEndpoint: z.string(),
  cloudAsrCustomModel: z.string(),
  cloudAsrBailianApiKey: z.string(),
  cloudAsrBailianHost: z.string(),
  cloudAsrBailianModel: z.string(),
  cloudAsrTencentAppId: z.string(),
  cloudAsrTencentSecretId: z.string(),
  cloudAsrTencentSecretKey: z.string(),
  cloudAsrTencentEngineType: z.string(),
  cloudAsrTencentService: z.string(),
  language: z.string(),
  maxRecordingSeconds: z.number(),
  voiceShortcutEnabled: z.boolean(),
  voiceShortcut: z.string(),
  voiceSoundsEnabled: z.boolean(),
  settingsDisplayName: z.string(),
  polishingEnabled: z.boolean(),
  polishProvider: z.string(),
  polishModel: z.string(),
  polishReasoningEffort: z.string(),
  polishPrompt: z.string()
})

export const earsSettingsPatchSchema = z.object({
  asrBackend: asrBackendSchema.optional(),
  localWhisperModel: whisperModelSchema.optional(),
  localWhisperAcceleration: z.enum(WHISPER_ACCELERATION_IDS).optional(),
  cloudAsrProvider: cloudAsrProviderSchema.optional(),
  cloudAsrGroqApiKey: z.string().max(1024).optional(),
  cloudAsrGroqModel: z.string().optional(),
  cloudAsrCustomApiKey: z.string().max(1024).optional(),
  cloudAsrCustomEndpoint: z.string().optional(),
  cloudAsrCustomModel: z.string().optional(),
  cloudAsrBailianApiKey: z.string().max(1024).optional(),
  cloudAsrBailianHost: z.string().optional(),
  cloudAsrBailianModel: z.string().optional(),
  cloudAsrTencentAppId: z.string().optional(),
  cloudAsrTencentSecretId: z.string().optional(),
  cloudAsrTencentSecretKey: z.string().max(1024).optional(),
  cloudAsrTencentEngineType: z.string().optional(),
  cloudAsrTencentService: z.enum(TENCENT_ASR_SERVICE_IDS).optional(),
  language: z.string().optional(),
  maxRecordingSeconds: z.number().optional(),
  voiceShortcutEnabled: z.boolean().optional(),
  voiceShortcut: z.string().optional(),
  voiceSoundsEnabled: z.boolean().optional(),
  settingsDisplayName: z.enum(SETTINGS_DISPLAY_NAME_IDS).optional(),
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
  cloudAsrGroqApiKeyConfigured: z.boolean(),
  cloudAsrCustomApiKeyConfigured: z.boolean(),
  cloudAsrBailianApiKeyConfigured: z.boolean(),
  cloudAsrTencentSecretKeyConfigured: z.boolean(),
  localWhisperAccelerations: z.array(z.enum(WHISPER_ACCELERATION_IDS)).optional(),
  overridden: z.array(z.string())
})

export const polishRouteSchema = z.object({
  provider: z.string(),
  providerName: z.string(),
  model: z.string(),
  modelName: z.string()
})

export const listRoutesResultSchema = z.array(polishRouteSchema)
export const reasoningEffortInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional()
})
export const reasoningEffortsViewSchema = z.object({
  efforts: z.array(reasoningEffortInfoSchema),
  defaultEffort: z.string().optional()
})
const errorParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]))

export const whisperModelStateSchema = z.object({
  runtimeAvailable: z.boolean(),
  downloaded: z.boolean(),
  downloading: z.boolean(),
  progress: z.number().nullable(),
  bytes: z.number().nullable(),
  totalBytes: z.number().nullable(),
  error: z.string().nullable(),
  errorCode: z.string().optional(),
  errorParams: errorParamsSchema.optional()
})
export const cloudProviderModelsViewSchema = z.object({
  status: z.enum(['ok', 'no-key', 'error', 'unsupported']),
  models: z.array(z.string()).optional(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  errorParams: errorParamsSchema.optional()
})
export const asrBackendInfoSchema = z.object({
  id: asrBackendSchema,
  name: z.string(),
  available: z.boolean(),
  detail: z.string(),
  detailCode: z.string().optional(),
  detailParams: errorParamsSchema.optional()
})
export const listAsrBackendsResultSchema = z.array(asrBackendInfoSchema)
export const audioBase64Schema = z.string().min(1).max(33_554_432)
export const audioMimeTypeSchema = z.string().min(1).max(128)
export const remoteTextResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    text: z.string()
  }),
  z.object({
    status: z.literal('error'),
    code: z.string(),
    message: z.string(),
    params: errorParamsSchema.optional()
  })
])
export const transcribeResultSchema = remoteTextResultSchema
export const polishResultSchema = remoteTextResultSchema
export const realtimeSessionSchema = z.object({ sessionId: z.string().min(1) })
export const realtimeTranscriptSchema = z.object({ text: z.string(), final: z.boolean() })
export const realtimeCancelledSchema = z.object({ cancelled: z.literal(true) })

export type RemoteTextResult = z.infer<typeof remoteTextResultSchema>
export type RemoteTextSuccess = Extract<RemoteTextResult, { status: 'ok' }>
export type RemoteTextFailure = Extract<RemoteTextResult, { status: 'error' }>
export type RealtimeSession = z.infer<typeof realtimeSessionSchema>
export type RealtimeTranscript = z.infer<typeof realtimeTranscriptSchema>

export function remoteTextSuccess(text: string): RemoteTextSuccess {
  return { status: 'ok', text }
}

export function remoteTextFailure(code: EarsErrorCode, message: string, params?: EarsErrorParams): RemoteTextFailure {
  return {
    status: 'error',
    code,
    message,
    ...(params === undefined ? {} : { params })
  }
}

export const aboutInfoSchema = z.object({
  repository: z.string(),
  repositorySlug: z.string(),
  version: z.string(),
  license: z.string(),
  dshCompatibility: z.string(),
  updateCommand: z.string()
})
export const updateCheckResultSchema = z.object({
  status: z.enum(['up-to-date', 'update-available', 'unpublished', 'error']),
  installed: z.string(),
  latest: z.string().nullable(),
  updateCommand: z.string()
})

export type EarsSettingsPatch = Partial<EarsSettings>
export type EarsSettingsView = {
  available: boolean
  writable: boolean
  settings: EarsSettings
  cloudAsrGroqApiKeyConfigured: boolean
  cloudAsrCustomApiKeyConfigured: boolean
  cloudAsrBailianApiKeyConfigured: boolean
  cloudAsrTencentSecretKeyConfigured: boolean
  localWhisperAccelerations?: WhisperAccelerationId[]
  overridden: string[]
}
export type { PolishRoute }
export type { AsrBackendInfo }
export type { AsrBackendId, ReasoningEffortInfo, ReasoningEffortsView } from './config.js'
export type { WhisperAccelerationId } from './config.js'
export type { WhisperModelState } from './asr/whisper-models.js'
export type CloudProviderModelsView = z.infer<typeof cloudProviderModelsViewSchema>
export type AboutInfo = z.infer<typeof aboutInfoSchema>
export type UpdateCheckResult = z.infer<typeof updateCheckResultSchema>
