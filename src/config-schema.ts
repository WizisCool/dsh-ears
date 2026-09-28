import s from '@deepseek-ai/schemastery'
import { EARS_SETTINGS_SCHEMA_VERSION } from './config.js'
import { DEFAULT_CLOUD_ASR_SETTINGS } from './settings/cloud-asr.js'
import { DEFAULT_GENERAL_SETTINGS } from './settings/general.js'
import { DEFAULT_POLISHING_SETTINGS } from './settings/polishing.js'
import { CLOUD_ASR_PROVIDER_IDS, DEFAULT_RECOGNITION_SETTINGS, DEEPGRAM_ASR_SERVICE_IDS, MIMO_ASR_CLUSTERS, MIMO_ASR_SERVICE_IDS, TENCENT_ASR_SERVICE_IDS, VOLCENGINE_ASR_SERVICE_IDS } from './settings/recognition.js'

/**
 * Host settings schema, exported as the plugin's Cordis `Config`.
 *
 * Every leaf is `.loose().volatile()`:
 *
 * - `volatile()` makes a settings write a live config commit. The loader
 *   re-resolves the entry config and publishes the new value into the running
 *   references instead of recomposing the plugin entry, so saving a field never
 *   tears down the service or the settings page that is writing it.
 * - `loose()` falls back to the field default instead of failing resolution, so
 *   one corrupt stored value cannot stop the whole plugin from loading. Writes
 *   are still validated before they are persisted.
 *
 * Groups stay plain objects: schemastery rejects a volatile field nested inside
 * a volatile one, and only leaves carry values.
 */
export const EarsSettingsSchema = s.object({
  schemaVersion: s.number().default(EARS_SETTINGS_SCHEMA_VERSION).description('Settings schema version').loose().volatile(),
  general: s.object({
    displayName: s.string().default(DEFAULT_GENERAL_SETTINGS.displayName).description('Settings page display name: dsh-ears or voice').loose().volatile(),
    shortcut: s.object({
      enabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.shortcut.enabled).description('Enable the in-page voice shortcut').loose().volatile(),
      value: s.string().default(DEFAULT_GENERAL_SETTINGS.shortcut.value).description('In-page voice shortcut').loose().volatile()
    }).description('Voice shortcut').collapse(),
    soundsEnabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.soundsEnabled).description('Play a synthesized click for voice input').loose().volatile()
  }).description('General dsh-ears presentation and input settings').collapse(),
  recognition: s.object({
    backend: s.string().default(DEFAULT_RECOGNITION_SETTINGS.backend).description('Recognition backend; Web Speech is the default: web-speech, local-whisper, or cloud-openai').loose().volatile(),
    webSpeech: s.object({
      language: s.string().default(DEFAULT_RECOGNITION_SETTINGS.webSpeech.language).description('Web Speech recognition language; leave empty to follow the dsh interface locale').loose().volatile()
    }).description('Web Speech live recognition').collapse(),
    localWhisper: s.object({
      model: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localWhisper.model).description('Local Whisper model id').loose().volatile(),
      acceleration: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localWhisper.acceleration).description('Local Whisper native acceleration; default selects an available variant automatically').loose().volatile(),
      language: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localWhisper.language).description('Transcription language; leave empty for automatic detection').loose().volatile()
    }).description('Local Whisper model and native acceleration').collapse(),
    cloudProvider: s.string().default(DEFAULT_RECOGNITION_SETTINGS.cloudProvider).description(`Active cloud ASR provider: ${CLOUD_ASR_PROVIDER_IDS.join(', ')}`).loose().volatile(),
    maxRecordingSeconds: s.number().default(DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds).description('Recording limit in seconds').loose().volatile()
  }).description('Audio recognition routing and limits').collapse(),
  cloudAsr: s.object({
    groq: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.groq.apiKey).description('Groq API key (Whisper)').loose().volatile(),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.groq.model).description('Groq Whisper model id').loose().volatile(),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.groq.language).description('Transcription language; leave empty for automatic detection').loose().volatile()
    }).description('Groq cloud ASR').collapse(),
    deepgram: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.deepgram.apiKey).description('Deepgram API key').loose().volatile(),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.deepgram.model).description('Deepgram ASR model, for example nova-3').loose().volatile(),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.deepgram.language).description('Transcription language; leave empty for automatic detection').loose().volatile(),
      service: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.deepgram.service).description(`Deepgram ASR service: ${DEEPGRAM_ASR_SERVICE_IDS.join(', ')}`).loose().volatile()
    }).description('Deepgram cloud ASR').collapse(),
    customOpenAi: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.apiKey).description('OpenAI-compatible ASR API key').loose().volatile(),
      endpoint: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.endpoint).description('Transcription endpoint URL').loose().volatile(),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.model).description('Transcription model, for example whisper-1').loose().volatile(),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.language).description('Transcription language; leave empty for automatic detection').loose().volatile()
    }).description('Custom OpenAI-compatible ASR').collapse(),
    bailian: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.apiKey).description('Alibaba Cloud Model Studio API key').loose().volatile(),
      host: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.host).description('HTTPS DashScope origin').loose().volatile(),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.model).description('Synchronous transcription model id').loose().volatile(),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.language).description('Transcription language; leave empty for automatic detection').loose().volatile()
    }).description('Alibaba Cloud Model Studio (Bailian) ASR').collapse(),
    tencent: s.object({
      appId: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.appId).description('Tencent Cloud AppID').loose().volatile(),
      secretId: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.secretId).description('Tencent Cloud SecretID').loose().volatile(),
      secretKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.secretKey).description('Tencent Cloud SecretKey').loose().volatile(),
      engineType: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.engineType).description('Tencent Cloud ASR engine type').loose().volatile(),
      service: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.service).description(`Tencent Cloud ASR service: ${TENCENT_ASR_SERVICE_IDS.join(', ')}`).loose().volatile()
    }).description('Tencent Cloud ASR services').collapse(),
    mimo: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.apiKey).description('Xiaomi MiMo API key (API: sk-..., Token Plan: tp-...)').loose().volatile(),
      service: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.service).description(`MiMo ASR access method: ${MIMO_ASR_SERVICE_IDS.join(', ')}`).loose().volatile(),
      cluster: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.cluster).description(`MiMo Token Plan cluster: ${MIMO_ASR_CLUSTERS.join(', ')}`).loose().volatile(),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.model).description('MiMo ASR model, for example mimo-v2.5-asr').loose().volatile(),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.language).description('Transcription language; leave empty for automatic detection').loose().volatile()
    }).description('Xiaomi MiMo cloud ASR').collapse(),
    siliconflow: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.siliconflow.apiKey).description('SiliconFlow API key').loose().volatile(),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.siliconflow.model).description('SiliconFlow ASR model, for example FunAudioLLM/SenseVoiceSmall').loose().volatile(),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.siliconflow.language).description('Transcription language; leave empty for automatic detection').loose().volatile()
    }).description('SiliconFlow cloud ASR').collapse(),
    volcengine: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.volcengine.apiKey).description('Volcengine speech API key (X-Api-Key)').loose().volatile(),
      service: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.volcengine.service).description(`Volcengine ASR service: ${VOLCENGINE_ASR_SERVICE_IDS.join(', ')}`).loose().volatile(),
      realtimeModel: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.volcengine.realtimeModel).description('One-way streaming resource id, for example volc.seedasr.sauc.duration').loose().volatile(),
      recordingModel: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.volcengine.recordingModel).description('Recording file recognition resource id, for example volc.seedasr.auc').loose().volatile(),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.volcengine.language).description('Recognition language; leave empty for the default Chinese/English recognition').loose().volatile()
    }).description('Volcengine cloud ASR').collapse()
  }).description('Cloud ASR provider credentials and models').collapse(),
  polishing: s.object({
    enabled: s.boolean().default(DEFAULT_POLISHING_SETTINGS.enabled).description('Enable LLM polishing by default').loose().volatile(),
    provider: s.string().default(DEFAULT_POLISHING_SETTINGS.provider).description('dsh polish provider id; leave empty to use the dsh Agent default').loose().volatile(),
    model: s.string().default(DEFAULT_POLISHING_SETTINGS.model).description('dsh polish model id; leave empty to use the dsh Agent default').loose().volatile(),
    reasoningEffort: s.string().default(DEFAULT_POLISHING_SETTINGS.reasoningEffort).description('Polish reasoning effort; empty uses the selected route default').loose().volatile(),
    prompt: s.string().default(DEFAULT_POLISHING_SETTINGS.prompt).description('Custom polish system prompt, empty for built-in').loose().volatile()
  }).description('LLM polishing route and prompt').collapse()
})
