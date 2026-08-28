import { DEFAULT_EARS_SETTINGS, EARS_SETTINGS_SCHEMA_VERSION, type EarsSettings, type WhisperAccelerationId } from './config.js'
import { DEFAULT_CLOUD_ASR_SETTINGS, type CloudAsrSettings } from './settings/cloud-asr.js'
import { DEFAULT_GENERAL_SETTINGS, type GeneralSettings } from './settings/general.js'
import { DEFAULT_POLISHING_SETTINGS, type PolishingSettings } from './settings/polishing.js'
import { DEFAULT_RECOGNITION_SETTINGS, MIMO_ASR_CLUSTERS, MIMO_ASR_SERVICE_IDS, WHISPER_ACCELERATION_IDS, type RecognitionSettings } from './settings/recognition.js'
import type { EarsSettingsPatch } from './remote-contract.js'
import { migrateSettingsToCurrent } from './settings/migrations.js'
export { migrateV1ToV2, migrateV2ToV3, migrateV3ToV4, migrateSettingsToCurrent } from './settings/migrations.js'
import { CLOUD_ASR_PROVIDERS } from './asr/providers.js'

/** Canonical Host persistence. The browser-facing EarsSettings shape stays flat. */
export type StoredEarsSettings = {
  schemaVersion: typeof EARS_SETTINGS_SCHEMA_VERSION
  general: GeneralSettings
  recognition: RecognitionSettings
  cloudAsr: CloudAsrSettings
  polishing: PolishingSettings
}

const FLAT_SETTING_KEYS = Object.keys(DEFAULT_EARS_SETTINGS) as Array<keyof EarsSettings>

type StoredFieldMapping = {
  readonly path: readonly string[]
  readonly field: keyof EarsSettings
}

const CURRENT_STORED_FIELD_MAPPINGS: readonly StoredFieldMapping[] = [
  { field: 'settingsDisplayName', path: ['general', 'displayName'] },
  { field: 'voiceShortcutEnabled', path: ['general', 'shortcut', 'enabled'] },
  { field: 'voiceShortcut', path: ['general', 'shortcut', 'value'] },
  { field: 'voiceSoundsEnabled', path: ['general', 'soundsEnabled'] },
  { field: 'asrBackend', path: ['recognition', 'backend'] },
  { field: 'webSpeechLanguage', path: ['recognition', 'webSpeech', 'language'] },
  { field: 'localWhisperModel', path: ['recognition', 'localWhisper', 'model'] },
  { field: 'localWhisperAcceleration', path: ['recognition', 'localWhisper', 'acceleration'] },
  { field: 'localWhisperLanguage', path: ['recognition', 'localWhisper', 'language'] },
  { field: 'cloudAsrProvider', path: ['recognition', 'cloudProvider'] },
  { field: 'maxRecordingSeconds', path: ['recognition', 'maxRecordingSeconds'] },
  ...CLOUD_ASR_PROVIDERS.flatMap((provider) => provider.fields.map((definition) => ({
    field: definition.field,
    path: ['cloudAsr', provider.storageKey, definition.storageKey]
  }))),
  { field: 'polishingEnabled', path: ['polishing', 'enabled'] },
  { field: 'polishProvider', path: ['polishing', 'provider'] },
  { field: 'polishModel', path: ['polishing', 'model'] },
  { field: 'polishReasoningEffort', path: ['polishing', 'reasoningEffort'] },
  { field: 'polishPrompt', path: ['polishing', 'prompt'] }
]

const CURRENT_STORED_PATHS = new Map<keyof EarsSettings, readonly string[]>(
  CURRENT_STORED_FIELD_MAPPINGS.map((mapping) => [mapping.field, mapping.path])
)

const CURRENT_SECRET_MAPPINGS: readonly StoredFieldMapping[] = CLOUD_ASR_PROVIDERS.flatMap((provider) => {
  const definition = provider.fields.find((candidate) => candidate.field === provider.credentialField)
  return definition === undefined
    ? []
    : [{ field: provider.credentialField, path: ['cloudAsr', provider.storageKey, definition.storageKey] }]
})

export function defaultStoredEarsSettings(): StoredEarsSettings {
  return unflattenEarsSettings(DEFAULT_EARS_SETTINGS)
}

/** Normalize stored settings into canonical form. */
export function normalizeStoredEarsSettings(raw: unknown): StoredEarsSettings {
  const record = migrateSettingsToCurrent(raw)
  const general = asRecord(record.general)
  const recognition = asRecord(record.recognition)
  const webSpeech = asRecord(recognition?.webSpeech)
  const localWhisper = asRecord(recognition?.localWhisper)
  const cloudAsr = asRecord(record.cloudAsr)
  const polishing = asRecord(record.polishing)

  const groqSlot = asRecord(cloudAsr?.groq)
  const groqLegacy = asRecord(record.groq)
  const deepgramSlot = asRecord(cloudAsr?.deepgram)
  const deepgramLegacy = asRecord(record.deepgram)
  const deepgramService = normalizeDeepgramService(firstDefinedText(
    ownText(deepgramSlot, 'service'),
    ownText(deepgramLegacy, 'service'),
    ownText(record, 'cloudAsrDeepgramService')
  ) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.service)
  const customSlots = [
    asRecord(cloudAsr?.customOpenAi),
    asRecord(cloudAsr?.custom),
    asRecord(record.customOpenAi),
    asRecord(record.custom)
  ]
  const bailianSlot = asRecord(cloudAsr?.bailian)
  const bailianLegacy = asRecord(record.bailian)
  const tencentSlot = asRecord(cloudAsr?.tencent)
  const tencentLegacy = asRecord(record.tencent)
  const tencentService = normalizeTencentService(firstDefinedText(
    ownText(tencentSlot, 'service'),
    ownText(tencentLegacy, 'service'),
    ownText(record, 'cloudAsrTencentService')
  ) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.service)

  const mimoSlot = asRecord(cloudAsr?.mimo)
  const mimoLegacy = asRecord(record.mimo)
  const siliconflowSlot = asRecord(cloudAsr?.siliconflow)
  const mimoService = normalizeMimoService(firstDefinedText(
    ownText(mimoSlot, 'service'),
    ownText(mimoLegacy, 'service'),
    ownText(record, 'cloudAsrMimoService')
  ) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.service)
  const mimoCluster = normalizeMimoCluster(firstDefinedText(
    ownText(mimoSlot, 'cluster'),
    ownText(mimoLegacy, 'cluster'),
    ownText(record, 'cloudAsrMimoCluster')
  ) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.cluster)

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
  const deepgramModel = firstDefinedText(
    ownText(deepgramSlot, 'model'),
    ownText(deepgramLegacy, 'model'),
    ownText(record, 'cloudAsrDeepgramModel')
  ) ?? (provider === 'deepgram' ? legacyModel ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.model : DEFAULT_CLOUD_ASR_SETTINGS.deepgram.model)
  const customModel = firstDefinedText(
    ...customSlots.map((slot) => ownText(slot, 'model')),
    ownText(record, 'cloudAsrCustomModel')
  ) ?? (provider === 'custom' ? legacyModel ?? '' : '')
  const bailianModel = firstDefinedText(
    ownText(bailianSlot, 'model'),
    ownText(bailianLegacy, 'model'),
    ownText(record, 'cloudAsrBailianModel')
  ) ?? (provider === 'bailian' ? legacyModel ?? '' : '')
  const mimoModel = firstDefinedText(
    ownText(mimoSlot, 'model'),
    ownText(mimoLegacy, 'model'),
    ownText(record, 'cloudAsrMimoModel')
  ) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.model

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
        )),
        language: ownText(localWhisper, 'language') ?? DEFAULT_RECOGNITION_SETTINGS.localWhisper.language
      },
      cloudProvider: provider,
      webSpeech: {
        language: ownText(webSpeech, 'language') ?? DEFAULT_RECOGNITION_SETTINGS.webSpeech.language
      },
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
        model: groqModel,
        language: ownText(groqSlot, 'language') ?? DEFAULT_CLOUD_ASR_SETTINGS.groq.language
      },
      deepgram: {
        apiKey: firstDefinedText(
          ownText(deepgramSlot, 'apiKey'),
          ownText(deepgramLegacy, 'apiKey'),
          ownText(record, 'cloudAsrDeepgramApiKey')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.apiKey,
        model: deepgramModel,
        language: firstDefinedText(
          ownText(deepgramSlot, 'language'),
          ownText(deepgramLegacy, 'language'),
          ownText(record, 'cloudAsrDeepgramLanguage')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.language,
        service: deepgramService
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
        model: customModel,
        language: firstDefinedText(
          ...customSlots.map((slot) => ownText(slot, 'language'))
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.language
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
        model: bailianModel,
        language: ownText(bailianSlot, 'language') ?? DEFAULT_CLOUD_ASR_SETTINGS.bailian.language
      },
      tencent: {
        appId: firstDefinedText(
          ownText(tencentSlot, 'appId'),
          ownText(tencentLegacy, 'appId'),
          ownText(record, 'cloudAsrTencentAppId')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.appId,
        secretId: firstDefinedText(
          ownText(tencentSlot, 'secretId'),
          ownText(tencentLegacy, 'secretId'),
          ownText(record, 'cloudAsrTencentSecretId')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.secretId,
        secretKey: firstDefinedText(
          ownText(tencentSlot, 'secretKey'),
          ownText(tencentLegacy, 'secretKey'),
          ownText(record, 'cloudAsrTencentSecretKey')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.secretKey,
        engineType: firstDefinedText(
          ownText(tencentSlot, 'engineType'),
          ownText(tencentLegacy, 'engineType'),
          ownText(record, 'cloudAsrTencentEngineType')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.engineType,
        service: tencentService
      },
      mimo: {
        apiKey: firstDefinedText(
          ownText(mimoSlot, 'apiKey'),
          ownText(mimoLegacy, 'apiKey'),
          ownText(record, 'cloudAsrMimoApiKey')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.apiKey,
        service: mimoService,
        cluster: mimoCluster,
        model: mimoModel,
        language: firstDefinedText(
          ownText(mimoSlot, 'language'),
          ownText(mimoLegacy, 'language'),
          ownText(record, 'cloudAsrMimoLanguage')
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.language
      },
      siliconflow: {
        apiKey: ownText(siliconflowSlot, 'apiKey') ?? DEFAULT_CLOUD_ASR_SETTINGS.siliconflow.apiKey,
        model: ownText(siliconflowSlot, 'model') ?? DEFAULT_CLOUD_ASR_SETTINGS.siliconflow.model,
        language: ownText(siliconflowSlot, 'language') ?? DEFAULT_CLOUD_ASR_SETTINGS.siliconflow.language
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
  const settings = {
    asrBackend: stored.recognition.backend,
    webSpeechLanguage: stored.recognition.webSpeech.language,
    localWhisperModel: stored.recognition.localWhisper.model,
    localWhisperAcceleration: stored.recognition.localWhisper.acceleration,
    localWhisperLanguage: stored.recognition.localWhisper.language,
    cloudAsrProvider: stored.recognition.cloudProvider,
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
  } as EarsSettings
  for (const provider of CLOUD_ASR_PROVIDERS) {
    const slot = stored.cloudAsr[provider.storageKey] as unknown as Record<string, unknown>
    for (const definition of provider.fields) {
      ;(settings as unknown as Record<string, unknown>)[definition.field] = slot[definition.storageKey]
    }
  }
  return settings
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
      webSpeech: {
        language: settings.webSpeechLanguage
      },
      localWhisper: {
        model: settings.localWhisperModel,
        acceleration: normalizeWhisperAcceleration(acceleration),
        language: settings.localWhisperLanguage
      },
      cloudProvider: settings.cloudAsrProvider,
      maxRecordingSeconds: settings.maxRecordingSeconds
    },
    cloudAsr: buildCloudAsrSlots(settings),
    polishing: {
      enabled: settings.polishingEnabled,
      provider: settings.polishProvider,
      model: settings.polishModel,
      reasoningEffort: settings.polishReasoningEffort,
      prompt: settings.polishPrompt
    }
  }
}

function buildCloudAsrSlots(settings: EarsSettings): CloudAsrSettings {
  const cloudAsr: Record<string, Record<string, unknown>> = {}
  for (const provider of CLOUD_ASR_PROVIDERS) {
    const slot: Record<string, unknown> = {}
    for (const definition of provider.fields) {
      const value = settings[definition.field]
      const allowed = definition.allowedValues
      // The first allowed value doubles as the field default for every enumerated field.
      slot[definition.storageKey] = allowed !== undefined && (typeof value !== 'string' || !allowed.includes(value))
        ? allowed[0]
        : value
    }
    cloudAsr[provider.storageKey] = slot
  }
  return cloudAsr as unknown as CloudAsrSettings
}

export function flatSettingsPatchToStoredPatch(patch: EarsSettingsPatch): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(patch)) {
    const path = CURRENT_STORED_PATHS.get(field as keyof EarsSettings)
    if (value === undefined || path === undefined) continue
    let target = result
    for (const segment of path.slice(0, -1)) {
      const next = target[segment]
      if (!isRecord(next)) target[segment] = {}
      target = target[segment] as Record<string, unknown>
    }
    target[path[path.length - 1] as string] = value
  }
  return result
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
  if (!isRecord(raw) || isFutureSettingsSchema(raw)) return false
  return !isCanonicalStoredSettings(raw) || hasLegacySettingKeys(raw)
}

export function isFutureSettingsSchema(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  return typeof raw.schemaVersion === 'number'
    && Number.isInteger(raw.schemaVersion)
    && raw.schemaVersion > EARS_SETTINGS_SCHEMA_VERSION
}

/** Convert schema user overrides into the flat field names understood by the client. */
export function flattenOverriddenSettings(raw: unknown, secrets: readonly { path: string[]; set: boolean }[] = []): string[] {
  const fields: string[] = []
  const mappings: Array<{ path: string[]; field: keyof EarsSettings }> = [
    ...FLAT_SETTING_KEYS.map((field) => ({ path: [field], field })),
    ...CURRENT_STORED_FIELD_MAPPINGS.map((mapping) => ({ path: [...mapping.path], field: mapping.field })),
    { path: ['groq', 'apiKey'], field: 'cloudAsrGroqApiKey' },
    { path: ['groq', 'model'], field: 'cloudAsrGroqModel' },
    { path: ['deepgram', 'apiKey'], field: 'cloudAsrDeepgramApiKey' },
    { path: ['deepgram', 'model'], field: 'cloudAsrDeepgramModel' },
    { path: ['deepgram', 'language'], field: 'cloudAsrDeepgramLanguage' },
    { path: ['deepgram', 'service'], field: 'cloudAsrDeepgramService' },
    { path: ['customOpenAi', 'apiKey'], field: 'cloudAsrCustomApiKey' },
    { path: ['customOpenAi', 'endpoint'], field: 'cloudAsrCustomEndpoint' },
    { path: ['customOpenAi', 'model'], field: 'cloudAsrCustomModel' },
    { path: ['bailian', 'apiKey'], field: 'cloudAsrBailianApiKey' },
    { path: ['tencent', 'appId'], field: 'cloudAsrTencentAppId' },
    { path: ['tencent', 'secretId'], field: 'cloudAsrTencentSecretId' },
    { path: ['tencent', 'secretKey'], field: 'cloudAsrTencentSecretKey' },
    { path: ['tencent', 'engineType'], field: 'cloudAsrTencentEngineType' },
    { path: ['tencent', 'service'], field: 'cloudAsrTencentService' },
    { path: ['mimo', 'apiKey'], field: 'cloudAsrMimoApiKey' },
    { path: ['mimo', 'service'], field: 'cloudAsrMimoService' },
    { path: ['mimo', 'cluster'], field: 'cloudAsrMimoCluster' },
    { path: ['mimo', 'model'], field: 'cloudAsrMimoModel' },
    { path: ['mimo', 'language'], field: 'cloudAsrMimoLanguage' },
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
    ...CURRENT_SECRET_MAPPINGS.map((mapping) => ({ path: [...mapping.path], field: mapping.field })),
    { path: ['groq', 'apiKey'], field: 'cloudAsrGroqApiKey' },
    { path: ['deepgram', 'apiKey'], field: 'cloudAsrDeepgramApiKey' },
    { path: ['customOpenAi', 'apiKey'], field: 'cloudAsrCustomApiKey' },
    { path: ['bailian', 'apiKey'], field: 'cloudAsrBailianApiKey' },
    { path: ['tencent', 'secretKey'], field: 'cloudAsrTencentSecretKey' },
    { path: ['mimo', 'apiKey'], field: 'cloudAsrMimoApiKey' }
  ]
  for (const secret of secrets) {
    if (!secret.set) continue
    const mapping = secretMappings.find((candidate) => samePath(candidate.path, secret.path))
    if (mapping !== undefined && !fields.includes(mapping.field)) fields.push(mapping.field)
  }
  return fields
}

function normalizeDeepgramService(value: string): string {
  return value === 'recording-file' || value === 'realtime' ? value : DEFAULT_CLOUD_ASR_SETTINGS.deepgram.service
}

function normalizeTencentService(value: string): string {
  return value === 'recording-file' || value === 'realtime' ? value : DEFAULT_CLOUD_ASR_SETTINGS.tencent.service
}

function normalizeMimoService(value: string): string {
  return (MIMO_ASR_SERVICE_IDS as readonly string[]).includes(value) ? value : DEFAULT_CLOUD_ASR_SETTINGS.mimo.service
}

function normalizeMimoCluster(value: string): string {
  return (MIMO_ASR_CLUSTERS as readonly string[]).includes(value) ? value : DEFAULT_CLOUD_ASR_SETTINGS.mimo.cluster
}

function isCanonicalStoredSettings(record: Record<string, unknown>): boolean {
  return record.schemaVersion === EARS_SETTINGS_SCHEMA_VERSION
    && !hasPath(record, ['recognition', 'language'])
    && !hasPath(record, ['cloudAsr', 'custom'])
    && CURRENT_STORED_FIELD_MAPPINGS.every((mapping) => hasPath(record, mapping.path))
}

function hasLegacySettingKeys(record: Record<string, unknown>): boolean {
  const topLevel = [
    ...FLAT_SETTING_KEYS,
    'cloudAsrApiKey',
    'cloudAsrModel',
    'language',
    'groq',
    'deepgram',
    'customOpenAi',
    'custom',
    'bailian',
    'tencent',
    'mimo'
  ]
  if (topLevel.some((key) => Object.prototype.hasOwnProperty.call(record, key))) return true
  return hasPath(record, ['recognition', 'localWhisperModel'])
    || hasPath(record, ['recognition', 'localWhisperAcceleration'])
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

function hasPath(value: unknown, path: readonly string[]): boolean {
  let current = value
  for (const part of path) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, part)) return false
    current = current[part]
  }
  return true
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
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
