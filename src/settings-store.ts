import { DEFAULT_EARS_SETTINGS, type EarsSettings } from './config.js'
import type { EarsSettingsPatch } from './remote-contract.js'

/** Shape written to the Host settings file (grouped for hand editing). */
export type StoredEarsSettings = {
  asrBackend: string
  localWhisperModel: string
  language: string
  maxRecordingSeconds: number
  voiceShortcutEnabled: boolean
  voiceShortcut: string
  cloudAsrProvider: string
  groq: { apiKey: string; model: string }
  customOpenAi: { apiKey: string; endpoint: string; model: string }
  bailian: { apiKey: string; host: string; model: string }
  polishingEnabled: boolean
  polishProvider: string
  polishModel: string
  polishReasoningEffort: string
  polishPrompt: string
}

const emptyGroup = { apiKey: '', model: '' }
const emptyCustom = { apiKey: '', endpoint: '', model: '' }
const emptyBailian = { apiKey: '', host: '', model: '' }

export function defaultStoredEarsSettings(): StoredEarsSettings {
  return unflattenEarsSettings(DEFAULT_EARS_SETTINGS)
}

export function flattenStoredSettings(raw: unknown): EarsSettings {
  const record = isRecord(raw) ? raw : {}
  const groq = groupOf(record.groq)
  const custom = customOf(record.customOpenAi ?? record.custom)
  const bailian = bailianOf(record.bailian)
  const legacyModel = text(record.cloudAsrModel)
  const provider = text(record.cloudAsrProvider) || DEFAULT_EARS_SETTINGS.cloudAsrProvider
  return {
    asrBackend: text(record.asrBackend) || DEFAULT_EARS_SETTINGS.asrBackend,
    localWhisperModel: text(record.localWhisperModel) || DEFAULT_EARS_SETTINGS.localWhisperModel,
    cloudAsrProvider: provider,
    cloudAsrGroqApiKey: groq.apiKey || text(record.cloudAsrApiKey) || text(record.cloudAsrGroqApiKey),
    cloudAsrGroqModel: groq.model || (provider === 'groq' ? legacyModel : '') || text(record.cloudAsrGroqModel),
    cloudAsrCustomApiKey: custom.apiKey || text(record.cloudAsrCustomApiKey),
    cloudAsrCustomEndpoint: custom.endpoint || text(record.cloudAsrEndpoint) || text(record.cloudAsrCustomEndpoint),
    cloudAsrCustomModel: custom.model || (provider === 'custom' ? legacyModel : '') || text(record.cloudAsrCustomModel),
    cloudAsrBailianApiKey: bailian.apiKey || text(record.cloudAsrBailianApiKey),
    cloudAsrBailianHost: bailian.host || text(record.cloudAsrBailianHost),
    cloudAsrBailianModel: bailian.model || (provider === 'bailian' ? legacyModel : '') || text(record.cloudAsrBailianModel),
    language: text(record.language),
    maxRecordingSeconds: typeof record.maxRecordingSeconds === 'number'
      ? record.maxRecordingSeconds
      : DEFAULT_EARS_SETTINGS.maxRecordingSeconds,
    voiceShortcutEnabled: record.voiceShortcutEnabled === false ? false : DEFAULT_EARS_SETTINGS.voiceShortcutEnabled,
    voiceShortcut: text(record.voiceShortcut) || DEFAULT_EARS_SETTINGS.voiceShortcut,
    polishingEnabled: record.polishingEnabled === true,
    polishProvider: text(record.polishProvider),
    polishModel: text(record.polishModel),
    polishReasoningEffort: text(record.polishReasoningEffort),
    polishPrompt: typeof record.polishPrompt === 'string' ? record.polishPrompt : ''
  }
}

export function unflattenEarsSettings(settings: EarsSettings): StoredEarsSettings {
  return {
    asrBackend: settings.asrBackend,
    localWhisperModel: settings.localWhisperModel,
    language: settings.language,
    maxRecordingSeconds: settings.maxRecordingSeconds,
    voiceShortcutEnabled: settings.voiceShortcutEnabled,
    voiceShortcut: settings.voiceShortcut,
    cloudAsrProvider: settings.cloudAsrProvider,
    groq: { apiKey: settings.cloudAsrGroqApiKey, model: settings.cloudAsrGroqModel },
    customOpenAi: {
      apiKey: settings.cloudAsrCustomApiKey,
      endpoint: settings.cloudAsrCustomEndpoint,
      model: settings.cloudAsrCustomModel
    },
    bailian: {
      apiKey: settings.cloudAsrBailianApiKey,
      host: settings.cloudAsrBailianHost,
      model: settings.cloudAsrBailianModel
    },
    polishingEnabled: settings.polishingEnabled,
    polishProvider: settings.polishProvider,
    polishModel: settings.polishModel,
    polishReasoningEffort: settings.polishReasoningEffort,
    polishPrompt: settings.polishPrompt
  }
}

export function applyFlatSettingsPatch(stored: unknown, patch: EarsSettingsPatch): StoredEarsSettings {
  const current = flattenStoredSettings(stored)
  const next: EarsSettings = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value
  }
  return unflattenEarsSettings(next)
}

export function storedSettingsNeedRewrite(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  const hasLegacy = [
    'cloudAsrApiKey', 'cloudAsrCustomApiKey', 'cloudAsrBailianApiKey',
    'cloudAsrEndpoint', 'cloudAsrBailianHost', 'cloudAsrModel',
    'cloudAsrGroqApiKey', 'cloudAsrCustomEndpoint'
  ].some((key) => key in raw)
  return hasLegacy || !isRecord(raw.groq) || !isRecord(raw.customOpenAi) || !isRecord(raw.bailian)
}

function groupOf(value: unknown): { apiKey: string; model: string } {
  if (!isRecord(value)) return { ...emptyGroup }
  return { apiKey: text(value.apiKey), model: text(value.model) }
}

function customOf(value: unknown): { apiKey: string; endpoint: string; model: string } {
  if (!isRecord(value)) return { ...emptyCustom }
  return { apiKey: text(value.apiKey), endpoint: text(value.endpoint), model: text(value.model) }
}

function bailianOf(value: unknown): { apiKey: string; host: string; model: string } {
  if (!isRecord(value)) return { ...emptyBailian }
  return { apiKey: text(value.apiKey), host: text(value.host), model: text(value.model) }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
