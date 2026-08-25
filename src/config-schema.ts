import s from '@deepseek-ai/schemastery'
import { EARS_SETTINGS_SCHEMA_VERSION } from './config.js'
import { DEFAULT_CLOUD_ASR_SETTINGS } from './settings/cloud-asr.js'
import { DEFAULT_GENERAL_SETTINGS } from './settings/general.js'
import { DEFAULT_POLISHING_SETTINGS } from './settings/polishing.js'
import { DEFAULT_RECOGNITION_SETTINGS } from './settings/recognition.js'

/** Host-only dsh settings schema; keep schemastery out of the browser bundle. */
export const EarsSettingsSchema = s.object({
  schemaVersion: s.number().default(EARS_SETTINGS_SCHEMA_VERSION).description('dsh-ears Host settings schema version'),
  general: s.object({
    displayName: s.string().default(DEFAULT_GENERAL_SETTINGS.displayName).description('Settings page display name: dsh-ears or voice'),
    shortcut: s.object({
      enabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.shortcut.enabled).description('Enable the in-page voice shortcut'),
      value: s.string().default(DEFAULT_GENERAL_SETTINGS.shortcut.value).description('In-page voice shortcut')
    }).description('Voice shortcut').collapse(),
    soundsEnabled: s.boolean().default(DEFAULT_GENERAL_SETTINGS.soundsEnabled).description('Play a synthesized click for voice input')
  }).description('General dsh-ears presentation and input settings').collapse(),
  recognition: s.object({
    backend: s.string().default(DEFAULT_RECOGNITION_SETTINGS.backend).description('Recognition backend: web-speech, local-whisper, or cloud-openai'),
    localWhisper: s.object({
      model: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localWhisper.model).description('Local Whisper model id'),
      acceleration: s.string().default(DEFAULT_RECOGNITION_SETTINGS.localWhisper.acceleration).description('Local Whisper native acceleration: default, vulkan, or cuda')
    }).description('Local Whisper model and native acceleration').collapse(),
    cloudProvider: s.string().default(DEFAULT_RECOGNITION_SETTINGS.cloudProvider).description('Active cloud ASR provider: groq, custom, or bailian'),
    language: s.string().default(DEFAULT_RECOGNITION_SETTINGS.language).description('Recognition language'),
    maxRecordingSeconds: s.number().default(DEFAULT_RECOGNITION_SETTINGS.maxRecordingSeconds).description('Recording limit in seconds')
  }).description('Audio recognition routing and limits').collapse(),
  cloudAsr: s.object({
    groq: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.groq.apiKey).description('Groq API key (Whisper)'),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.groq.model).description('Groq Whisper model id')
    }).description('Groq cloud ASR').collapse(),
    customOpenAi: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.apiKey).description('OpenAI-compatible ASR API key'),
      endpoint: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.endpoint).description('Full /audio/transcriptions URL'),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.customOpenAi.model).description('Transcription model, for example whisper-1')
    }).description('Custom OpenAI-compatible ASR').collapse(),
    bailian: s.object({
      apiKey: s.string().role('secret').default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.apiKey).description('Alibaba Cloud Model Studio API key'),
      host: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.host).description('HTTPS DashScope origin'),
      model: s.string().default(DEFAULT_CLOUD_ASR_SETTINGS.bailian.model).description('Sync Flash model id')
    }).description('Alibaba Cloud Model Studio (Bailian) ASR').collapse()
  }).description('Cloud ASR provider credentials and models').collapse(),
  polishing: s.object({
    enabled: s.boolean().default(DEFAULT_POLISHING_SETTINGS.enabled).description('Enable LLM polishing'),
    provider: s.string().default(DEFAULT_POLISHING_SETTINGS.provider).description('dsh polish provider id'),
    model: s.string().default(DEFAULT_POLISHING_SETTINGS.model).description('dsh polish model id'),
    reasoningEffort: s.string().default(DEFAULT_POLISHING_SETTINGS.reasoningEffort).description('Polish reasoning effort, empty for default'),
    prompt: s.string().default(DEFAULT_POLISHING_SETTINGS.prompt).description('Custom polish system prompt, empty for built-in')
  }).description('LLM polishing route and prompt').collapse()
})
