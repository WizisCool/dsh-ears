import { z } from 'zod'
import type { EarsSettings, PolishRoute } from './config.js'

export const earsSettingsSchema = z.object({
  language: z.string(),
  maxRecordingSeconds: z.number(),
  polishingEnabled: z.boolean(),
  polishProvider: z.string(),
  polishModel: z.string()
})

export const earsSettingsPatchSchema = z.object({
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

export type EarsSettingsPatch = Partial<EarsSettings>
export type EarsSettingsView = {
  available: boolean
  writable: boolean
  settings: EarsSettings
  overridden: string[]
}
export type { PolishRoute }
