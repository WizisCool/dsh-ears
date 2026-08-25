import { DEFAULT_EARS_SETTINGS, EARS_SETTINGS_SCHEMA_VERSION, type EarsSettings, type WhisperAccelerationId } from './config.js'
import { DEFAULT_CLOUD_ASR_SETTINGS, type CloudAsrSettings } from './settings/cloud-asr.js'
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from './settings/general.js'
import { DEFAULT_POLISHING_SETTINGS, type PolishingSettings } from './settings/polishing.js'
import { DEFAULT_RECOGNITION_SETTINGS, WHISPER_ACCELERATION_IDS, type RecognitionSettings } from './settings/recognition.js'
import type { EarsSettingsPatch } from './remote-contract.js'

/** Canonical Host persistence. The browser-facing EarsSettings shape stays flat. */
export type StoredEarsSettings = {
  schemaVersion: typeof EARS_SETTINGS_SCHEMA_VERSION
  general: GeneralSettings
  recognition: RecognitionSettings
  cloudAsr: CloudAsrSettings
  polishing: PolishingSettings
}

const FLAT_SETTING_KEYS = Object.keys(DEFAULT_EARS_SETTINGS) as Array<keyof EarsSettings>

export function defaultStoredEarsSettings(): StoredEarsSettings {
  return unflattenEarsSettings(DEFAULT_EARS_SETTINGS)
}

/** Normalize V2, partially populated V2, current grouped, and legacy flat settings. */
export function normalizeStoredEarsSettings(raw: unknown): StoredEarsSettings {
  const record = isRecord(raw) ? raw : {}
  const general = asRecord(record.general)
  const recognition = asRecord(record.recognition)
  const localWhisper = asRecord(recognition?.localWhisper)
  const cloudAsr = asRecord(record.cloudAsr)
  const polishing = asRecord(record.polishing)

  const groqSlot = asRecord(cloudAsr?.groq)
  const groqLegacy = asRecord(record.groq)
  const customSlots = [
    asRecord(cloudAsr?.customOpenAi),
    asRecord(cloudAsr?.custom),
    asRecord(record.customOpenAi),
    asRecord(record.custom)
  ]
  const bailianSlot = asRecord(cloudAsr?.bailian)
  const bailianLegacy = asRecord(record.bailian)

  const provider = defaultSlotText(
    ownText(recognition, 'cloudProvider'),
    ownText(record, 'cloudAsrProvider'),
    DEFAULT_RECOGNITION_SETTINGS.cloudProvider
  )
  const legacyModel = ownText(record, 'cloudAsrModel')

  const groqModel = firstDefinedText(
    ownText(groqSlot, 'model'),
    ownText(groqLegacy, 'model'),
    ownText(record, 'cloudAsrGroqModel')
  ) ?? (provider === 'groq' ? legacyModel ?? '' : '')
  const customModel = firstDefinedText(
    ...customSlots.map((slot) => ownText(slot, 'model')),
    ownText(record, 'cloudAsrCustomModel')
  ) ?? (provider === 'custom' ? legacyModel ?? '' : '')
  const bailianModel = firstDefinedText(
    ownText(bailianSlot, 'model'),
    ownText(bailianLegacy, 'model'),
    ownText(record, 'cloudAsrBailianModel')
  ) ?? (provider === 'bailian' ? legacyModel ?? '' : '')

  return {
    schemaVersion: EARS_SETTINGS_SCHEMA_VERSION,
    general: {
      displayName: defaultSlotText(
        ownText(general, 'displayName'),
        ownText(record, 'settingsDisplayName'),
        DEFAULT_GENERAL_SETTINGS.displayName
      ),
      shortcut: {
        enabled: firstDefinedBoolean(
          ownBoolean(asRecord(general?.shortcut), 'enabled'),
          ownBoolean(record, 'voiceShortcutEnabled'),
          DEFAULT_GENERAL_SETTINGS.shortcut.enabled
        ),
        value: defaultSlotText(
          ownText(asRecord(general?.shortcut), 'value'),
          ownText(record, 'voiceShortcut'),
          DEFAULT_GENERAL_SETTINGS.shortcut.value
        )
      },
      soundsEnabled: firstDefinedBoolean(
        ownBoolean(general, 'soundsEnabled'),
        ownBoolean(record, 'voiceSoundsEnabled'),
        DEFAULT_GENERAL_SETTINGS.soundsEnabled
      )
    },
    recognition: {
      backend: defaultSlotText(
        ownText(recognition, 'backend'),
        ownText(record, 'asrBackend'),
        DEFAULT_RECOGNITION_SETTINGS.backend
      ),
      localWhisper: {
        model: defaultSlotText(
          ownText(localWhisper, 'model'),
          ownText(recognition, 'localWhisperModel'),
          ownText(record, 'localWhisperModel'),
          DEFAULT_RECOGNITION_SETTINGS.localWhisper.model
        ),
        acceleration: normalizeWhisperAcceleration(defaultSlotText(
          ownText(localWhisper, 'acceleration'),
          ownText(recognition, 'localWhisperAcceleration'),
          ownText(record, 'localWhisperAcceleration'),
          DEFAULT_RECOGNITION_SETTINGS.localWhisper.acceleration
        ))
      },
      cloudProvider: provider,
      language: firstDefinedText(
        ownText(recognition, 'language'),
        ownText(record, 'language')
      ) ?? DEFAULT_RECOGNITION_SETTINGS.language,
      maxRecordingSeconds: firstDefinedNumber(
        ownNumber(recognition, 'maxRecordingSeconds'),
        ownNumber(record, 'maxRecordingSeconds'),
        DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds
      ),
    },
    cloudAsr: {
      groq: {
        apiKey: firstDefinedText(
          ownText(groqSlot, 'apiKey'),
          ownText(groqLegacy, 'apiKey'),
          ownText(record, 'cloudAsrApiKey'),
          ownText(record, 'cloudAsrGroqApiKey')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.groq.apiKey,
        model: groqModel
      },
      customOpenAi: {
        apiKey: firstDefinedText(
          ...customSlots.map((slot) => ownText(slot, 'apiKey')),
          ownText(record, 'cloudAsrCustomApiKey')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.apiKey,
        endpoint: firstDefinedText(
          ...customSlots.map((slot) => ownText(slot, 'endpoint')),
          ownText(record, 'cloudAsrEndpoint'),
          ownText(record, 'cloudAsrCustomEndpoint')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.endpoint,
        model: customModel
      },
      bailian: {
        apiKey: firstDefinedText(
          ownText(bailianSlot, 'apiKey'),
          ownText(bailianLegacy, 'apiKey'),
          ownText(record, 'cloudAsrBailianApiKey')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.bailian.apiKey,
        host: firstDefinedText(
          ownText(bailianSlot, 'host'),
          ownText(bailianLegacy, 'host'),
          ownText(record, 'cloudAsrBailianHost')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.bailian.host,
        model: bailianModel
      }
    },
    polishing: {
      enabled: firstDefinedBoolean(
        ownBoolean(polishing, 'enabled'),
        ownBoolean(record, 'polishingEnabled'),
        DEFAULT_POLISHING_SETTINGS.enabled
      ),
      provider: firstDefinedText(
        ownText(polishing, 'provider'),
        ownText(record, 'polishProvider')
      ) ?? DEFAULT_POLISHING_SETTINGS.provider,
      model: firstDefinedText(
        ownText(polishing, 'model'),
        ownText(record, 'polishModel')
      ) ?? DEFAULT_POLISHING_SETTINGS.model,
      reasoningEffort: firstDefinedText(
        ownText(polishing, 'reasoningEffort'),
        ownText(record, 'polishReasoningEffort')
      ) ?? DEFAULT_POLISHING_SETTINGS.reasoningEffort,
      prompt: firstDefinedText(
        ownText(polishing, 'prompt'),
        ownText(record, 'polishPrompt')
      ) ?? DEFAULT_POLISHING_SETTINGS.prompt
    }
  }
}

export function flattenStoredSettings(raw: unknown): EarsSettings {
  const stored = normalizeStoredEarsSettings(raw)
  return {
    asrBackend: stored.recognition.backend,
    localWhisperModel: stored.recognition.localWhisper.model,
    localWhisperAcceleration: stored.recognition.localWhisper.acceleration,
    cloudAsrProvider: stored.recognition.cloudProvider,
    cloudAsrGroqApiKey: stored.cloudAsr.groq.apiKey,
    cloudAsrGroqModel: stored.cloudAsr.groq.model,
    cloudAsrCustomApiKey: stored.cloudAsr.customOpenAi.apiKey,
    cloudAsrCustomEndpoint: stored.cloudAsr.customOpenAi.endpoint,
    cloudAsrCustomModel: stored.cloudAsr.customOpenAi.model,
    cloudAsrBailianApiKey: stored.cloudAsr.bailian.apiKey,
    cloudAsrBailianHost: stored.cloudAsr.bailian.host,
    cloudAsrBailianModel: stored.cloudAsr.bailian.model,
    language: stored.recognition.language,
    maxRecordingSeconds: stored.recognition.maxRecordingSeconds,
    voiceShortcutEnabled: stored.general.shortcut.enabled,
    voiceShortcut: stored.general.shortcut.value,
    voiceSoundsEnabled: stored.general.soundsEnabled,
    settingsDisplayName: stored.general.displayName,
    polishingEnabled: stored.polishing.enabled,
    polishProvider: stored.polishing.provider,
    polishModel: stored.polishing.model,
    polishReasoningEffort: stored.polishing.reasoningEffort,
    polishPrompt: stored.polishing.prompt
  }
}

export function unflattenEarsSettings(settings: EarsSettings, acceleration = settings.localWhisperAcceleration): StoredEarsSettings {
  return {
    schemaVersion: EARS_SETTINGS_SCHEMA_VERSION,
    general: {
      displayName: settings.settingsDisplayName,
      shortcut: {
        enabled: settings.voiceShortcutEnabled,
        value: settings.voiceShortcut
      },
      soundsEnabled: settings.voiceSoundsEnabled
    },
    recognition: {
      backend: settings.asrBackend,
      localWhisper: {
        model: settings.localWhisperModel,
        acceleration: normalizeWhisperAcceleration(acceleration)
      },
      cloudProvider: settings.cloudAsrProvider,
      language: settings.language,
      maxRecordingSeconds: settings.maxRecordingSeconds
    },
    cloudAsr: {
      groq: {
        apiKey: settings.cloudAsrGroqApiKey,
        model: settings.cloudAsrGroqModel
      },
      customOpenAi: {
        apiKey: settings.cloudAsrCustomApiKey,
        endpoint: settings.cloudAsrCustomEndpoint,
        model: settings.cloudAsrCustomModel
      },
      bailian: {
        apiKey: settings.cloudAsrBailianApiKey,
        host: settings.cloudAsrBailianHost,
        model: settings.cloudAsrBailianModel
      }
    },
    polishing: {
      enabled: settings.polishingEnabled,
      provider: settings.polishProvider,
      model: settings.polishModel,
      reasoningEffort: settings.polishReasoningEffort,
      prompt: settings.polishPrompt
    }
  }
}

export function applyFlatSettingsPatch(stored: unknown, patch: EarsSettingsPatch): StoredEarsSettings {
  const currentStored = normalizeStoredEarsSettings(stored)
  const current = flattenStoredSettings(currentStored)
  const next: EarsSettings = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && isFlatSettingKey(key)) {
      ;(next as unknown as Record<string, unknown>)[key] = value
    }
  }
  return unflattenEarsSettings(next)
}

export function storedSettingsNeedRewrite(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  return !isCanonicalStoredSettings(raw)
}

/** Convert schema user overrides into the flat field names understood by the client. */
export function flattenOverriddenSettings(raw: unknown, secrets: readonly { path: string[]; set: boolean }[] = []): string[] {
  const fields: string[] = []
  const mappings: Array<{ path: string[]; field: keyof EarsSettings }> = [
    { path: ['asrBackend'], field: 'asrBackend' },
    { path: ['localWhisperModel'], field: 'localWhisperModel' },
    { path: ['localWhisperAcceleration'], field: 'localWhisperAcceleration' },
    { path: ['cloudAsrProvider'], field: 'cloudAsrProvider' },
    { path: ['cloudAsrGroqApiKey'], field: 'cloudAsrGroqApiKey' },
    { path: ['cloudAsrGroqModel'], field: 'cloudAsrGroqModel' },
    { path: ['cloudAsrCustomApiKey'], field: 'cloudAsrCustomApiKey' },
    { path: ['cloudAsrCustomEndpoint'], field: 'cloudAsrCustomEndpoint' },
    { path: ['cloudAsrCustomModel'], field: 'cloudAsrCustomModel' },
    { path: ['cloudAsrBailianApiKey'], field: 'cloudAsrBailianApiKey' },
    { path: ['cloudAsrBailianHost'], field: 'cloudAsrBailianHost' },
    { path: ['cloudAsrBailianModel'], field: 'cloudAsrBailianModel' },
    { path: ['language'], field: 'language' },
    { path: ['maxRecordingSeconds'], field: 'maxRecordingSeconds' },
    { path: ['voiceShortcutEnabled'], field: 'voiceShortcutEnabled' },
    { path: ['voiceShortcut'], field: 'voiceShortcut' },
    { path: ['voiceSoundsEnabled'], field: 'voiceSoundsEnabled' },
    { path: ['settingsDisplayName'], field: 'settingsDisplayName' },
    { path: ['polishingEnabled'], field: 'polishingEnabled' },
    { path: ['polishProvider'], field: 'polishProvider' },
    { path: ['polishModel'], field: 'polishModel' },
    { path: ['polishReasoningEffort'], field: 'polishReasoningEffort' },
    { path: ['polishPrompt'], field: 'polishPrompt' },
    { path: ['general', 'displayName'], field: 'settingsDisplayName' },
    { path: ['general', 'shortcut', 'enabled'], field: 'voiceShortcutEnabled' },
    { path: ['general', 'shortcut', 'value'], field: 'voiceShortcut' },
    { path: ['general', 'soundsEnabled'], field: 'voiceSoundsEnabled' },
    { path: ['recognition', 'backend'], field: 'asrBackend' },
    { path: ['recognition', 'localWhisper', 'model'], field: 'localWhisperModel' },
    { path: ['recognition', 'localWhisper', 'acceleration'], field: 'localWhisperAcceleration' },
    { path: ['recognition', 'cloudProvider'], field: 'cloudAsrProvider' },
    { path: ['recognition', 'language'], field: 'language' },
    { path: ['recognition', 'maxRecordingSeconds'], field: 'maxRecordingSeconds' },
    { path: ['cloudAsr', 'groq', 'apiKey'], field: 'cloudAsrGroqApiKey' },
    { path: ['cloudAsr', 'groq', 'model'], field: 'cloudAsrGroqModel' },
    { path: ['cloudAsr', 'customOpenAi', 'apiKey'], field: 'cloudAsrCustomApiKey' },
    { path: ['cloudAsr', 'customOpenAi', 'endpoint'], field: 'cloudAsrCustomEndpoint' },
    { path: ['cloudAsr', 'customOpenAi', 'model'], field: 'cloudAsrCustomModel' },
    { path: ['cloudAsr', 'bailian', 'apiKey'], field: 'cloudAsrBailianApiKey' },
    { path: ['cloudAsr', 'bailian', 'host'], field: 'cloudAsrBailianHost' },
    { path: ['cloudAsr', 'bailian', 'model'], field: 'cloudAsrBailianModel' },
    { path: ['polishing', 'enabled'], field: 'polishingEnabled' },
    { path: ['polishing', 'provider'], field: 'polishProvider' },
    { path: ['polishing', 'model'], field: 'polishModel' },
    { path: ['polishing', 'reasoningEffort'], field: 'polishReasoningEffort' },
    { path: ['polishing', 'prompt'], field: 'polishPrompt' },
    { path: ['groq', 'apiKey'], field: 'cloudAsrGroqApiKey' },
    { path: ['groq', 'model'], field: 'cloudAsrGroqModel' },
    { path: ['customOpenAi', 'apiKey'], field: 'cloudAsrCustomApiKey' },
    { path: ['customOpenAi', 'endpoint'], field: 'cloudAsrCustomEndpoint' },
    { path: ['customOpenAi', 'model'], field: 'cloudAsrCustomModel' },
    { path: ['bailian', 'apiKey'], field: 'cloudAsrBailianApiKey' },
    { path: ['bailian', 'host'], field: 'cloudAsrBailianHost' },
    { path: ['bailian', 'model'], field: 'cloudAsrBailianModel' },
    { path: ['recognition', 'localWhisperAcceleration'], field: 'localWhisperAcceleration' }
  ]
  if (isRecord(raw)) {
    for (const mapping of mappings) {
      if (hasPath(raw, mapping.path) && !fields.includes(mapping.field)) fields.push(mapping.field)
    }
  }
  const secretMappings: Array<{ path: string[]; field: keyof EarsSettings }> = [
    { path: ['cloudAsr', 'groq', 'apiKey'], field: 'cloudAsrGroqApiKey' },
    { path: ['cloudAsr', 'customOpenAi', 'apiKey'], field: 'cloudAsrCustomApiKey' },
    { path: ['cloudAsr', 'bailian', 'apiKey'], field: 'cloudAsrBailianApiKey' },
    { path: ['groq', 'apiKey'], field: 'cloudAsrGroqApiKey' },
    { path: ['customOpenAi', 'apiKey'], field: 'cloudAsrCustomApiKey' },
    { path: ['bailian', 'apiKey'], field: 'cloudAsrBailianApiKey' }
  ]
  for (const secret of secrets) {
    if (!secret.set) continue
    const mapping = secretMappings.find((candidate) => samePath(candidate.path, secret.path))
    if (mapping !== undefined && !fields.includes(mapping.field)) fields.push(mapping.field)
  }
  return fields
}

function isCanonicalStoredSettings(record: Record<string, unknown>): boolean {
  return record.schemaVersion === EARS_SETTINGS_SCHEMA_VERSION
    && hasPath(record, ['general', 'displayName'])
    && hasPath(record, ['general', 'shortcut', 'enabled'])
    && hasPath(record, ['general', 'shortcut', 'value'])
    && hasPath(record, ['general', 'soundsEnabled'])
    && hasPath(record, ['recognition', 'backend'])
    && hasPath(record, ['recognition', 'localWhisper', 'model'])
    && hasPath(record, ['recognition', 'localWhisper', 'acceleration'])
    && hasPath(record, ['recognition', 'cloudProvider'])
    && hasPath(record, ['recognition', 'language'])
    && hasPath(record, ['recognition', 'maxRecordingSeconds'])
    && hasPath(record, ['cloudAsr', 'groq', 'apiKey'])
    && hasPath(record, ['cloudAsr', 'groq', 'model'])
    && hasPath(record, ['cloudAsr', 'customOpenAi', 'apiKey'])
    && hasPath(record, ['cloudAsr', 'customOpenAi', 'endpoint'])
    && hasPath(record, ['cloudAsr', 'customOpenAi', 'model'])
    && hasPath(record, ['cloudAsr', 'bailian', 'apiKey'])
    && hasPath(record, ['cloudAsr', 'bailian', 'host'])
    && hasPath(record, ['cloudAsr', 'bailian', 'model'])
    && hasPath(record, ['polishing', 'enabled'])
    && hasPath(record, ['polishing', 'provider'])
    && hasPath(record, ['polishing', 'model'])
    && hasPath(record, ['polishing', 'reasoningEffort'])
    && hasPath(record, ['polishing', 'prompt'])
}

function normalizeWhisperAcceleration(value: string): WhisperAccelerationId {
  return (WHISPER_ACCELERATION_IDS as readonly string[]).includes(value) ? value as WhisperAccelerationId : 'default'
}

function defaultText(...values: Array<string | undefined>): string {
  return values.find((value) => value !== undefined && value !== '') ?? ''
}

function defaultSlotText(primary: string | undefined, ...legacyAndDefault: Array<string | undefined>): string {
  if (primary !== undefined) {
    const fallback = legacyAndDefault[legacyAndDefault.length - 1] ?? ''
    return primary === '' ? fallback : primary
  }
  return defaultText(...legacyAndDefault)
}

function firstDefinedText(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined)
}

function firstDefinedBoolean(...values: Array<boolean | undefined>): boolean {
  return values.find((value) => value !== undefined) ?? false
}

function firstDefinedNumber(...values: Array<number | undefined>): number {
  return values.find((value) => value !== undefined) ?? 0
}

function ownText(record: Record<string, unknown> | undefined, key: string): string | undefined {
  if (record === undefined || !Object.prototype.hasOwnProperty.call(record, key)) return undefined
  return typeof record[key] === 'string' ? record[key] : undefined
}

function ownBoolean(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  if (record === undefined || !Object.prototype.hasOwnProperty.call(record, key)) return undefined
  return typeof record[key] === 'boolean' ? record[key] : undefined
}

function ownNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  if (record === undefined || !Object.prototype.hasOwnProperty.call(record, key)) return undefined
  return typeof record[key] === 'number' ? record[key] : undefined
}

function hasPath(value: unknown, path: string[]): boolean {
  let current = value
  for (const part of path) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) return false
    current = current[part]
  }
  return true
}

function samePath(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index])
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function isFlatSettingKey(value: string): value is keyof EarsSettings {
  return FLAT_SETTING_KEYS.includes(value as keyof EarsSettings)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
