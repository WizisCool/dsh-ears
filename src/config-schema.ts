import s from '@deepseek-ai/schemastery'
import { DEFAULT_EARS_SETTINGS } from './config.js'

/** Host-only dsh settings schema; keep schemastery out of the browser bundle. */
export const EarsSettingsSchema = s.object({
  asrBackend: s.string().default(DEFAULT_EARS_SETTINGS.asrBackend).description('Recognition backend: web-speech, local-whisper, or cloud-openai'),
  localWhisperModel: s.string().default(DEFAULT_EARS_SETTINGS.localWhisperModel).description('Local Whisper model id'),
  language: s.string().default(DEFAULT_EARS_SETTINGS.language).description('Recognition language'),
  maxRecordingSeconds: s.number().default(DEFAULT_EARS_SETTINGS.maxRecordingSeconds).description('Recording limit in seconds'),
  voiceShortcutEnabled: s.boolean().default(DEFAULT_EARS_SETTINGS.voiceShortcutEnabled).description('Enable the in-page voice shortcut'),
  voiceShortcut: s.string().default(DEFAULT_EARS_SETTINGS.voiceShortcut).description('In-page voice shortcut'),
  voiceSoundsEnabled: s.boolean().default(DEFAULT_EARS_SETTINGS.voiceSoundsEnabled).description('Play synthesized click and chime for voice input'),
  cloudAsrProvider: s.string().default(DEFAULT_EARS_SETTINGS.cloudAsrProvider).description('Active cloud ASR provider: groq, custom, or bailian'),
  groq: s.object({
    apiKey: s.string().role('secret').default('').description('Groq API key (Whisper)'),
    model: s.string().default('').description('Groq Whisper model id')
  }).description('Groq cloud ASR').collapse(),
  customOpenAi: s.object({
    apiKey: s.string().role('secret').default('').description('OpenAI-compatible ASR API key'),
    endpoint: s.string().default('').description('Full /audio/transcriptions URL'),
    model: s.string().default('').description('Transcription model, for example whisper-1')
  }).description('Custom OpenAI-compatible ASR').collapse(),
  bailian: s.object({
    apiKey: s.string().role('secret').default('').description('Alibaba Cloud Model Studio API key'),
    host: s.string().default('').description('HTTPS DashScope origin'),
    model: s.string().default('').description('Sync Flash model id')
  }).description('Alibaba Cloud Model Studio (Bailian) ASR').collapse(),
  polishingEnabled: s.boolean().default(DEFAULT_EARS_SETTINGS.polishingEnabled).description('Enable Host LLM polishing'),
  polishProvider: s.string().default(DEFAULT_EARS_SETTINGS.polishProvider).description('dsh polish provider id'),
  polishModel: s.string().default(DEFAULT_EARS_SETTINGS.polishModel).description('dsh polish model id'),
  polishReasoningEffort: s.string().default(DEFAULT_EARS_SETTINGS.polishReasoningEffort).description('Polish reasoning effort, empty for default'),
  polishPrompt: s.string().default(DEFAULT_EARS_SETTINGS.polishPrompt).description('Custom polish system prompt, empty for built-in')
})
