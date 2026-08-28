import { EARS_REMOTE_DESCRIPTORS } from './remote-definitions.js'

export const TYPERT = {
  package: 'dsh-ears',
  face: 'host',
  schemas: [],
  invocations: EARS_REMOTE_DESCRIPTORS,
  model: {
    services: [
      {
        description: 'Host-side ASR, realtime recognition, dsh route discovery, and transcript polishing.',
        summary: 'Voice transcript polishing service.',
        tags: [],
        jsDoc: '/** Host-side dsh route discovery and text-only transcript polishing. */',
        key: 'dshEarsPolish',
        exportName: 'PolishService',
        members: [
          {
            kind: 'method',
            name: 'getAbout',
            signature: 'getAbout(): AboutInfo',
            summary: 'Report the installed plugin name, version, license, and compatibility.',
            jsDoc: '/** Report the installed plugin name, version, license, and compatibility. */'
          },
          {
            kind: 'method',
            name: 'checkForUpdate',
            signature: 'checkForUpdate(signal: AbortSignal): Promise<UpdateCheckResult>',
            summary: 'Compare the installed version with the npm latest dist-tag.',
            jsDoc: '/** Compare the installed version with the npm latest dist-tag. */'
          },
          {
            kind: 'method',
            name: 'listAsrBackends',
            signature: 'listAsrBackends(): Promise<AsrBackendInfo[]>',
            summary: 'List configured and locally available ASR backends.',
            jsDoc: '/** List configured and locally available ASR backends. */'
          },
          {
            kind: 'method',
            name: 'updateSettings',
            signature: 'updateSettings(patch: EarsSettingsPatch, signal: AbortSignal): Promise<EarsSettingsView>',
            summary: 'Update plugin settings when the request has not been cancelled.',
            jsDoc: '/** Update plugin settings when the request has not been cancelled. */'
          },
          {
            kind: 'method',
            name: 'listCloudProviderModels',
            signature: 'listCloudProviderModels(provider: string, signal: AbortSignal): Promise<CloudProviderModelsView>',
            summary: "List a cloud provider's transcription models from its live catalog.",
            jsDoc: "/** List a cloud provider's transcription models from its live catalog. */"
          },
          {
            kind: 'method',
            name: 'listRoutes',
            signature: 'listRoutes(): Promise<PolishRoute[]>',
            summary: 'List models already registered in dsh.',
            jsDoc: '/** List models already registered in dsh. */'
          },
          {
            kind: 'method',
            name: 'listReasoningEfforts',
            signature: 'listReasoningEfforts(provider: string, model: string): Promise<ReasoningEffortsView>',
            summary: 'List selectable reasoning efforts for one dsh route.',
            jsDoc: '/** List selectable reasoning efforts for one dsh route. */'
          },
          {
            kind: 'method',
            name: 'getWhisperModelState',
            signature: 'getWhisperModelState(model: string): Promise<WhisperModelState>',
            summary: 'Report one local Whisper model download state.',
            jsDoc: '/** Report one local Whisper model download state. */'
          },
          {
            kind: 'method',
            name: 'downloadWhisperModel',
            signature: 'downloadWhisperModel(model: string): Promise<WhisperModelState>',
            summary: 'Download one local Whisper model through the installed library.',
            jsDoc: '/** Download one local Whisper model through the installed library. */'
          },
          {
            kind: 'method',
            name: 'cancelWhisperModelDownload',
            signature: 'cancelWhisperModelDownload(model: string): Promise<WhisperModelState>',
            summary: 'Cancel the running Whisper model download.',
            jsDoc: '/** Cancel the running Whisper model download. */'
          },
          {
            kind: 'method',
            name: 'deleteWhisperModel',
            signature: 'deleteWhisperModel(model: string): Promise<WhisperModelState>',
            summary: 'Delete one downloaded Whisper model file.',
            jsDoc: '/** Delete one downloaded Whisper model file. */'
          },
          {
            kind: 'method',
            name: 'transcribe',
            signature: 'transcribe(audioBase64: string, mimeType: string, signal: AbortSignal): Promise<RemoteTextResult>',
            summary: 'Transcribe one recorded audio payload through the selected ASR backend.',
            jsDoc: '/** Transcribe one recorded audio payload through the selected ASR backend. */'
          },
          {
            kind: 'method',
            name: 'startRealtime',
            signature: 'startRealtime(signal: AbortSignal): Promise<RealtimeSession>',
            summary: 'Open a Host-owned cloud realtime recognition session.',
            jsDoc: '/** Open a Host-owned cloud realtime recognition session. */'
          },
          {
            kind: 'method',
            name: 'sendRealtimeAudio',
            signature: 'sendRealtimeAudio(sessionId: string, audioBase64: string, signal: AbortSignal): Promise<RealtimeTranscript>',
            summary: 'Send one PCM audio chunk to a realtime recognition session.',
            jsDoc: '/** Send one PCM audio chunk to a realtime recognition session. */'
          },
          {
            kind: 'method',
            name: 'finishRealtime',
            signature: 'finishRealtime(sessionId: string, signal: AbortSignal): Promise<RemoteTextResult>',
            summary: 'Finish a realtime recognition session and return its final transcript.',
            jsDoc: '/** Finish a realtime recognition session and return its final transcript. */'
          },
          {
            kind: 'method',
            name: 'cancelRealtime',
            signature: 'cancelRealtime(sessionId: string): Promise<RealtimeCancelled>',
            summary: 'Close a realtime recognition session without committing its transcript.',
            jsDoc: '/** Close a realtime recognition session without committing its transcript. */'
          },
          {
            kind: 'method',
            name: 'polish',
            signature: 'polish(transcript: string, provider: string, model: string, reasoningEffort: string, signal: AbortSignal): Promise<RemoteTextResult>',
            summary: 'Polish one transcript through a selected dsh route.',
            jsDoc: '/** Polish one transcript through a selected dsh route. */'
          }
        ],
        types: [
          {
            name: 'RemoteTextResult',
            declaration: "export type RemoteTextResult = { status: 'ok'; text: string } | { status: 'error'; code: string; message: string; params?: Record<string, string | number> }"
          },
          {
            name: 'EarsSettings',
            declaration: 'export interface EarsSettings { asrBackend: string; webSpeechLanguage: string; localWhisperModel: string; localWhisperAcceleration: string; localWhisperLanguage: string; cloudAsrProvider: string; cloudAsrGroqApiKey: string; cloudAsrGroqModel: string; cloudAsrGroqLanguage: string; cloudAsrDeepgramApiKey: string; cloudAsrDeepgramModel: string; cloudAsrDeepgramLanguage: string; cloudAsrDeepgramService: string; cloudAsrCustomApiKey: string; cloudAsrCustomEndpoint: string; cloudAsrCustomModel: string; cloudAsrCustomLanguage: string; cloudAsrBailianApiKey: string; cloudAsrBailianHost: string; cloudAsrBailianModel: string; cloudAsrBailianLanguage: string; cloudAsrTencentAppId: string; cloudAsrTencentSecretId: string; cloudAsrTencentSecretKey: string; cloudAsrTencentEngineType: string; cloudAsrTencentService: string; cloudAsrMimoApiKey: string; cloudAsrMimoService: string; cloudAsrMimoCluster: string; cloudAsrMimoModel: string; cloudAsrMimoLanguage: string; cloudAsrSiliconFlowApiKey: string; cloudAsrSiliconFlowModel: string; cloudAsrSiliconFlowLanguage: string; maxRecordingSeconds: number; voiceShortcutEnabled: boolean; voiceShortcut: string; voiceSoundsEnabled: boolean; settingsDisplayName: string; polishingEnabled: boolean; polishProvider: string; polishModel: string; polishReasoningEffort: string; polishPrompt: string }'
          },
          {
            name: 'EarsSettingsView',
            declaration: 'export interface EarsSettingsView { available: boolean; writable: boolean; settings: EarsSettings; cloudAsrGroqApiKeyConfigured: boolean; cloudAsrDeepgramApiKeyConfigured: boolean; cloudAsrCustomApiKeyConfigured: boolean; cloudAsrBailianApiKeyConfigured: boolean; cloudAsrTencentSecretKeyConfigured: boolean; cloudAsrMimoApiKeyConfigured: boolean; cloudAsrSiliconFlowApiKeyConfigured: boolean; defaultPolishRoute?: { provider: string; model: string; reasoningEffort?: string }; recoveredSettingsFields?: string[]; localWhisperAccelerations?: WhisperAccelerationId[]; overridden: string[] }'
          },
          {
            name: 'EarsSettingsPatch',
            declaration: 'export type EarsSettingsPatch = Partial<EarsSettings>'
          },
          {
            name: 'AsrBackendInfo',
            declaration: 'export interface AsrBackendInfo { id: AsrBackendId; name: string; available: boolean; detail: string; detailCode?: string; detailParams?: Record<string, string | number> }'
          },
          {
            name: 'PolishRoute',
            declaration: 'export interface PolishRoute { provider: string; providerName: string; model: string; modelName: string }'
          },
          {
            name: 'ReasoningEffortInfo',
            declaration: 'export interface ReasoningEffortInfo { id: string; name: string; description?: string }'
          },
          {
            name: 'ReasoningEffortsView',
            declaration: 'export interface ReasoningEffortsView { efforts: ReasoningEffortInfo[]; defaultEffort?: string }'
          },
          {
            name: 'WhisperAccelerationId',
            declaration: "export type WhisperAccelerationId = 'default' | 'vulkan' | 'cuda'"
          },
          {
            name: 'WhisperModelState',
            declaration: 'export interface WhisperModelState { runtimeAvailable: boolean; downloaded: boolean; downloading: boolean; progress: number | null; bytes: number | null; totalBytes: number | null; error: string | null; errorCode?: string; errorParams?: Record<string, string | number> }'
          },
          {
            name: 'CloudProviderModelsView',
            declaration: "export type CloudProviderModelsView = { status: 'ok' | 'no-key' | 'error' | 'unsupported'; models?: string[]; modelCapabilities?: Record<string, { batch?: boolean; streaming?: boolean; transport?: 'listen-v1' | 'listen-v2' }>; error?: string; errorCode?: string; errorParams?: Record<string, string | number> }"
          },
          {
            name: 'RealtimeSession',
            declaration: 'export interface RealtimeSession { sessionId: string }'
          },
          {
            name: 'RealtimeTranscript',
            declaration: 'export interface RealtimeTranscript { text: string; final: boolean }'
          },
          {
            name: 'RealtimeCancelled',
            declaration: 'export interface RealtimeCancelled { cancelled: true }'
          }
        ]
      }
    ],
    events: [],
    objects: []
  }
} as const

export default TYPERT
