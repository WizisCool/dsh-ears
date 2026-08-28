import s from '@deepseek-ai/schemastery'
import { EARS_SETTINGS_SCHEMA_VERSION } from './config.js'
import { DEFAULT_CLOUD_ASR_SETTINGS } from './settings/cloud-asr.js'
import { DEFAULT_GENERAL_SETTINGS } from './settings/general.js'
import { DEFAULT_POLISHING_SETTINGS } from './settings/polishing.js'
import { CLOUD_ASR_PROVIDER_IDS, DEFAULT_RECOGNITION_SETTINGS, DEEPGRAM_ASR_SERVICE_IDS, MIMO_ASR_CLUSTERS, MIMO_ASR_SERVICE_IDS, TENCENT_ASR_SERVICE_IDS } from './settings/recognition.js'

/** Host settings schema. */
export const EarsSettingsSchema = s.object({
  schemaVersion: s.number().default(EARS_SETTINGS_SCHEMA_VERSION).description('Settings schema version'),
  general: s.object({
    displayName: s.string().default(DEFAULT_GENERAL_SETTINGS.displayName).description('Settings page display name: dsh-ears or voice'),
    shortcut: s.object({
      enabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.shortcut.enabled).description('Enable the in-page voice shortcut'),
      value: s.string().default(DEFAULT_GENERAL_SETTINGS.shortcut.value).description('In-page voice shortcut')
    }).description('Voice shortcut').collapse(),
    soundsEnabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.soundsEnabled).description('Play a synthesized click for voice input')
  }).description('General dsh-ears presentation and input settings').collapse(),
  recognition: s.object({
    backend: s.string().default(DEFAULT_RECOGNITION_SETTINGS.backend).description('Recognition backend; Web Speech is the default: web-speech, local-whisper, or cloud-openai'),
    webSpeech: s.object({
      language: s.string().default(DEFAULT_RECOGNITION_SETTINGS.webSpeech.language).description('Web Speech recognition language; leave empty to follow the dsh interface locale')
    }).description('Web Speech live recognition').collapse(),
    localWhisper: s.object({
      model: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localWhisper.model).description('Local Whisper model id'),
      acceleration: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localWhisper.acceleration).description('Local Whisper native acceleration; default selects an available variant automatically'),
      language: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localWhisper.language).description('Transcription language; leave empty for automatic detection')
    }).description('Local Whisper model and native acceleration').collapse(),
    cloudProvider: s.string().default(DEFAULT_RECOGNITION_SETTINGS.cloudProvider).description(`Active cloud ASR provider: ${CLOUD_ASR_PROVIDER_IDS.join(', ')}`),
    maxRecordingSeconds: s.number().default(DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds).description('Recording limit in seconds')
  }).description('Audio recognition routing and limits').collapse(),
  cloudAsr: s.object({
    groq: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.groq.apiKey).description('Groq API key (Whisper)'),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.groq.model).description('Groq Whisper model id'),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.groq.language).description('Transcription language; leave empty for automatic detection')
    }).description('Groq cloud ASR').collapse(),
    deepgram: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.deepgram.apiKey).description('Deepgram API key'),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.deepgram.model).description('Deepgram ASR model, for example nova-3'),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.deepgram.language).description('Transcription language; leave empty for automatic detection'),
      service: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.deepgram.service).description(`Deepgram ASR service: ${DEEPGRAM_ASR_SERVICE_IDS.join(', ')}`)
    }).description('Deepgram cloud ASR').collapse(),
    customOpenAi: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.apiKey).description('OpenAI-compatible ASR API key'),
      endpoint: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.endpoint).description('Transcription endpoint URL'),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.model).description('Transcription model, for example whisper-1'),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.language).description('Transcription language; leave empty for automatic detection')
    }).description('Custom OpenAI-compatible ASR').collapse(),
    bailian: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.apiKey).description('Alibaba Cloud Model Studio API key'),
      host: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.host).description('HTTPS DashScope origin'),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.model).description('Synchronous transcription model id'),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.language).description('Transcription language; leave empty for automatic detection')
    }).description('Alibaba Cloud Model Studio (Bailian) ASR').collapse(),
    tencent: s.object({
      appId: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.appId).description('Tencent Cloud AppID'),
      secretId: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.secretId).description('Tencent Cloud SecretID'),
      secretKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.secretKey).description('Tencent Cloud SecretKey'),
      engineType: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.engineType).description('Tencent Cloud ASR engine type'),
      service: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.tencent.service).description(`Tencent Cloud ASR service: ${TENCENT_ASR_SERVICE_IDS.join(', ')}`)
    }).description('Tencent Cloud ASR services').collapse(),
    mimo: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.apiKey).description('Xiaomi MiMo API key (API: sk-..., Token Plan: tp-...)'),
      service: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.service).description(`MiMo ASR access method: ${MIMO_ASR_SERVICE_IDS.join(', ')}`),
      cluster: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.cluster).description(`MiMo Token Plan cluster: ${MIMO_ASR_CLUSTERS.join(', ')}`),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.model).description('MiMo ASR model, for example mimo-v2.5-asr'),
      language: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.mimo.language).description('Transcription language; leave empty for automatic detection')
    }).description('Xiaomi MiMo cloud ASR').collapse()
  }).description('Cloud ASR provider credentials and models').collapse(),
  polishing: s.object({
    enabled: s.boolean().default(DEFAULT_POLISHING_SETTINGS.enabled).description('Enable LLM polishing by default'),
    provider: s.string().default(DEFAULT_POLISHING_SETTINGS.provider).description('dsh polish provider id; leave empty to use the dsh Agent default'),
    model: s.string().default(DEFAULT_POLISHING_SETTINGS.model).description('dsh polish model id; leave empty to use the dsh Agent default'),
    reasoningEffort: s.string().default(DEFAULT_POLISHING_SETTINGS.reasoningEffort).description('Polish reasoning effort; empty uses the selected route default'),
    prompt: s.string().default(DEFAULT_POLISHING_SETTINGS.prompt).description('Custom polish system prompt, empty for built-in')
  }).description('LLM polishing route and prompt').collapse()
})
