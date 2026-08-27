import { DEFAULT_CLOUD_ASR_SETTINGS } from './cloud-asr.js'
import { DEFAULT_GENERAL_SETTINGS } from './general.js'
import { DEFAULT_POLISHING_SETTINGS } from './polishing.js'
import { DEFAULT_RECOGNITION_SETTINGS, MIMO_ASR_DEFAULT_CLUSTER, MIMO_ASR_DEFAULT_SERVICE } from './recognition.js'

/** A migration stage is deliberately JSON-like so it can be unit-tested offline. */
export type SettingsMigrationRecord = Record<string, unknown>

/**
 * The first persisted settings shape had no schemaVersion. It was the flat
 * config shape, followed by a short-lived grouped shape at the top level.
 */
export function migrateV1ToV2(raw: unknown): SettingsMigrationRecord {
  const source = asRecord(raw)
  const provider = firstNonEmpty(
    textAt(source, ['recognition', 'cloudProvider']),
    textAt(source, ['cloudAsrProvider']),
    DEFAULT_RECOGNITION_SETTINGS.cloudProvider
  )
  const legacyModel = textAt(source, ['cloudAsrModel'])
  const recognition = asRecord(source.recognition)
  const localWhisper = firstRecord(recognition?.localWhisper, source.localWhisper)
  const webSpeech = firstRecord(recognition?.webSpeech, source.webSpeech)
  const cloudAsr = asRecord(source.cloudAsr)
  const groq = firstRecord(cloudAsr?.groq, source.groq)
  const deepgram = firstRecord(cloudAsr?.deepgram, source.deepgram)
  const customOpenAi = firstRecord(cloudAsr?.customOpenAi, cloudAsr?.custom, source.customOpenAi, source.custom)
  const bailian = firstRecord(cloudAsr?.bailian, source.bailian)
  const mimo = firstRecord(cloudAsr?.mimo, source.mimo)

  return {
    ...source,
    schemaVersion: 2,
    general: {
      displayName: firstNonEmpty(textAt(source, ['general', 'displayName']), textAt(source, ['settingsDisplayName']), DEFAULT_GENERAL_SETTINGS.displayName),
      shortcut: {
        enabled: firstDefinedBoolean(
          booleanAt(source, ['general', 'shortcut', 'enabled']),
          booleanAt(source, ['voiceShortcutEnabled']),
          DEFAULT_GENERAL_SETTINGS.shortcut.enabled
        ),
        value: firstNonEmpty(textAt(source, ['general', 'shortcut', 'value']), textAt(source, ['voiceShortcut']), DEFAULT_GENERAL_SETTINGS.shortcut.value)
      },
      soundsEnabled: firstDefinedBoolean(
        booleanAt(source, ['general', 'soundsEnabled']),
        booleanAt(source, ['voiceSoundsEnabled']),
        DEFAULT_GENERAL_SETTINGS.soundsEnabled
      )
    },
    recognition: {
      ...recognition,
      backend: firstNonEmpty(textAt(source, ['recognition', 'backend']), textAt(source, ['asrBackend']), DEFAULT_RECOGNITION_SETTINGS.backend),
      localWhisper: {
        ...localWhisper,
        model: firstNonEmpty(textAt(source, ['recognition', 'localWhisper', 'model']), textAt(source, ['localWhisperModel']), DEFAULT_RECOGNITION_SETTINGS.localWhisper.model),
        acceleration: firstNonEmpty(textAt(source, ['recognition', 'localWhisper', 'acceleration']), textAt(source, ['localWhisperAcceleration']), DEFAULT_RECOGNITION_SETTINGS.localWhisper.acceleration)
      },
      cloudProvider: provider,
      webSpeech: {
        ...webSpeech
      },
      language: firstDefinedText(textAt(source, ['recognition', 'language']), textAt(source, ['language'])) ?? '',
      maxRecordingSeconds: firstDefinedNumber(
        numberAt(source, ['recognition', 'maxRecordingSeconds']),
        numberAt(source, ['maxRecordingSeconds']),
        DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds
      )
    },
    cloudAsr: {
      ...cloudAsr,
      groq: {
        ...groq,
        apiKey: firstDefinedText(
          textAt(groq, ['apiKey']),
          textAt(source, ['cloudAsrApiKey']),
          textAt(source, ['cloudAsrGroqApiKey'])
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.groq.apiKey,
        model: firstDefinedText(textAt(groq, ['model']), textAt(source, ['cloudAsrGroqModel'])) ?? (provider === 'groq' ? legacyModel ?? '' : '')
      },
      deepgram: {
        ...deepgram,
        apiKey: firstDefinedText(textAt(deepgram, ['apiKey']), textAt(source, ['cloudAsrDeepgramApiKey'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.apiKey,
        model: firstDefinedText(textAt(deepgram, ['model']), textAt(source, ['cloudAsrDeepgramModel'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.model,
        service: firstDefinedText(textAt(deepgram, ['service']), textAt(source, ['cloudAsrDeepgramService'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.service
      },
      customOpenAi: {
        ...customOpenAi,
        apiKey: firstDefinedText(textAt(customOpenAi, ['apiKey']), textAt(source, ['cloudAsrCustomApiKey'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.apiKey,
        endpoint: firstDefinedText(
          textAt(customOpenAi, ['endpoint']),
          textAt(source, ['cloudAsrEndpoint']),
          textAt(source, ['cloudAsrCustomEndpoint'])
        ) ?? DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.endpoint,
        model: firstDefinedText(textAt(customOpenAi, ['model']), textAt(source, ['cloudAsrCustomModel'])) ?? (provider === 'custom' ? legacyModel ?? '' : '')
      },
      bailian: {
        ...bailian,
        apiKey: firstDefinedText(textAt(bailian, ['apiKey']), textAt(source, ['cloudAsrBailianApiKey'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.bailian.apiKey,
        host: firstDefinedText(textAt(bailian, ['host']), textAt(source, ['cloudAsrBailianHost'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.bailian.host,
        model: firstDefinedText(textAt(bailian, ['model']), textAt(source, ['cloudAsrBailianModel'])) ?? (provider === 'bailian' ? legacyModel ?? '' : '')
      },
      mimo: {
        ...mimo,
        apiKey: firstDefinedText(textAt(mimo, ['apiKey']), textAt(source, ['cloudAsrMimoApiKey'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.apiKey,
        service: firstDefinedText(textAt(mimo, ['service']), textAt(source, ['cloudAsrMimoService'])) ?? MIMO_ASR_DEFAULT_SERVICE,
        cluster: firstDefinedText(textAt(mimo, ['cluster']), textAt(source, ['cloudAsrMimoCluster'])) ?? MIMO_ASR_DEFAULT_CLUSTER,
        model: firstDefinedText(textAt(mimo, ['model']), textAt(source, ['cloudAsrMimoModel'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.model
      }
    },
    polishing: {
      enabled: firstDefinedBoolean(
        booleanAt(source, ['polishing', 'enabled']),
        booleanAt(source, ['polishingEnabled']),
        DEFAULT_POLISHING_SETTINGS.enabled
      ),
      provider: firstDefinedText(textAt(source, ['polishing', 'provider']), textAt(source, ['polishProvider'])) ?? DEFAULT_POLISHING_SETTINGS.provider,
      model: firstDefinedText(textAt(source, ['polishing', 'model']), textAt(source, ['polishModel'])) ?? DEFAULT_POLISHING_SETTINGS.model,
      reasoningEffort: firstDefinedText(textAt(source, ['polishing', 'reasoningEffort']), textAt(source, ['polishReasoningEffort'])) ?? DEFAULT_POLISHING_SETTINGS.reasoningEffort,
      prompt: firstDefinedText(textAt(source, ['polishing', 'prompt']), textAt(source, ['polishPrompt'])) ?? DEFAULT_POLISHING_SETTINGS.prompt
    }
  }
}

/** V3 added the fixed Tencent Cloud slot while retaining the V2 language field. */
export function migrateV2ToV3(raw: unknown): SettingsMigrationRecord {
  const source = asRecord(raw)
  const cloudAsr = asRecord(source.cloudAsr)
  const tencent = firstRecord(cloudAsr?.tencent, source.tencent)
  return {
    ...source,
    schemaVersion: 3,
    cloudAsr: {
      ...cloudAsr,
      tencent: {
        appId: firstDefinedText(textAt(tencent, ['appId']), textAt(source, ['cloudAsrTencentAppId'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.appId,
        secretId: firstDefinedText(textAt(tencent, ['secretId']), textAt(source, ['cloudAsrTencentSecretId'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.secretId,
        secretKey: firstDefinedText(textAt(tencent, ['secretKey']), textAt(source, ['cloudAsrTencentSecretKey'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.secretKey,
        engineType: firstDefinedText(textAt(tencent, ['engineType']), textAt(source, ['cloudAsrTencentEngineType'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.engineType,
        service: firstDefinedText(textAt(tencent, ['service']), textAt(source, ['cloudAsrTencentService'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.tencent.service
      }
    }
  }
}

/**
 * V4 split the global language into browser/local/provider fields. The old
 * global value is intentionally discarded, as recorded by D-042.
 */
export function migrateV3ToV4(raw: unknown): SettingsMigrationRecord {
  const source = asRecord(raw)
  const recognition = asRecord(source.recognition)
  const localWhisper = asRecord(recognition?.localWhisper)
  const webSpeech = asRecord(recognition?.webSpeech)
  const cloudAsr = asRecord(source.cloudAsr)
  const groq = firstRecord(cloudAsr?.groq, source.groq)
  const deepgram = firstRecord(cloudAsr?.deepgram, source.deepgram)
  const customOpenAi = firstRecord(cloudAsr?.customOpenAi, cloudAsr?.custom, source.customOpenAi, source.custom)
  const bailian = firstRecord(cloudAsr?.bailian, source.bailian)
  const tencent = firstRecord(cloudAsr?.tencent, source.tencent)
  const mimo = firstRecord(cloudAsr?.mimo, source.mimo)
  const { language: _legacyLanguage, ...recognitionWithoutLanguage } = recognition ?? {}

  return {
    ...source,
    schemaVersion: 4,
    recognition: {
      ...recognitionWithoutLanguage,
      webSpeech: {
        language: firstDefinedText(textAt(webSpeech, ['language']), textAt(source, ['webSpeechLanguage'])) ?? ''
      },
      localWhisper: {
        ...localWhisper,
        language: firstDefinedText(textAt(localWhisper, ['language']), textAt(source, ['localWhisperLanguage'])) ?? ''
      }
    },
    cloudAsr: {
      ...cloudAsr,
      groq: {
        ...groq,
        language: firstDefinedText(textAt(groq, ['language']), textAt(source, ['cloudAsrGroqLanguage'])) ?? ''
      },
      deepgram: {
        ...deepgram,
        apiKey: firstDefinedText(textAt(deepgram, ['apiKey']), textAt(source, ['cloudAsrDeepgramApiKey'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.apiKey,
        model: firstDefinedText(textAt(deepgram, ['model']), textAt(source, ['cloudAsrDeepgramModel'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.model,
        language: firstDefinedText(textAt(deepgram, ['language']), textAt(source, ['cloudAsrDeepgramLanguage'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.language,
        service: firstDefinedText(textAt(deepgram, ['service']), textAt(source, ['cloudAsrDeepgramService'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.deepgram.service
      },
      customOpenAi: {
        ...customOpenAi,
        language: firstDefinedText(textAt(customOpenAi, ['language']), textAt(source, ['cloudAsrCustomLanguage'])) ?? ''
      },
      bailian: {
        ...bailian,
        language: firstDefinedText(textAt(bailian, ['language']), textAt(source, ['cloudAsrBailianLanguage'])) ?? ''
      },
      tencent: {
        ...tencent
      },
      mimo: {
        ...mimo,
        apiKey: firstDefinedText(textAt(mimo, ['apiKey']), textAt(source, ['cloudAsrMimoApiKey'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.apiKey,
        service: firstDefinedText(textAt(mimo, ['service']), textAt(source, ['cloudAsrMimoService'])) ?? MIMO_ASR_DEFAULT_SERVICE,
        cluster: firstDefinedText(textAt(mimo, ['cluster']), textAt(source, ['cloudAsrMimoCluster'])) ?? MIMO_ASR_DEFAULT_CLUSTER,
        model: firstDefinedText(textAt(mimo, ['model']), textAt(source, ['cloudAsrMimoModel'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.model,
        language: firstDefinedText(textAt(mimo, ['language']), textAt(source, ['cloudAsrMimoLanguage'])) ?? DEFAULT_CLOUD_ASR_SETTINGS.mimo.language
      }
    }
  }
}

/** Apply only the migrations known by this package; future versions are normalized conservatively. */
export function migrateSettingsToCurrent(raw: unknown): SettingsMigrationRecord {
  const source = asRecord(raw)
  const version = typeof source.schemaVersion === 'number' && Number.isInteger(source.schemaVersion)
    ? source.schemaVersion
    : 1
  if (version > 4) return { ...source }

  let current = version < 2 ? migrateV1ToV2(source) : { ...source }
  const currentVersion = typeof current.schemaVersion === 'number' ? current.schemaVersion : 1
  if (currentVersion < 3) current = migrateV2ToV3(current)
  const afterV3 = typeof current.schemaVersion === 'number' ? current.schemaVersion : 1
  if (afterV3 < 4) current = migrateV3ToV4(current)
  return current
}

function firstRecord(...values: Array<unknown>): Record<string, unknown> | undefined {
  return values.find(isRecord)
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  return values.find((value) => value !== undefined && value !== '') ?? ''
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

function textAt(record: Record<string, unknown> | undefined, path: string[]): string | undefined {
  const value = valueAt(record, path)
  return typeof value === 'string' ? value : undefined
}

function booleanAt(record: Record<string, unknown> | undefined, path: string[]): boolean | undefined {
  const value = valueAt(record, path)
  return typeof value === 'boolean' ? value : undefined
}

function numberAt(record: Record<string, unknown> | undefined, path: string[]): number | undefined {
  const value = valueAt(record, path)
  return typeof value === 'number' ? value : undefined
}

function valueAt(record: Record<string, unknown> | undefined, path: string[]): unknown {
  let current: unknown = record
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

function asRecord(value: unknown): SettingsMigrationRecord {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is SettingsMigrationRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
