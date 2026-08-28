import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { EARS_REMOTE_DESCRIPTORS } from './remote-definitions.js'
import type { AboutInfo, AsrBackendInfo, CloudProviderModelsView, EarsSettingsPatch, EarsSettingsView, PolishRoute, ReasoningEffortsView, RealtimeSession, RealtimeTranscript, RemoteTextResult, UpdateCheckResult, WhisperModelState } from './remote-contract.js'

export type EarsRemote = ClientRemote['dshEars']

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$dshEars {
    getAbout: () => Promise<RemoteResult<AboutInfo>>
    checkForUpdate: (signal?: AbortSignal) => Promise<RemoteResult<UpdateCheckResult>>
    getSettings: () => Promise<RemoteResult<EarsSettingsView>>
    updateSettings: (patch: EarsSettingsPatch, signal?: AbortSignal) => Promise<RemoteResult<EarsSettingsView>>
    listCloudProviderModels: (provider: string, signal?: AbortSignal) => Promise<RemoteResult<CloudProviderModelsView>>
    listRoutes: () => Promise<RemoteResult<PolishRoute[]>>
    listAsrBackends: () => Promise<RemoteResult<AsrBackendInfo[]>>
    listReasoningEfforts: (provider: string, model: string) => Promise<RemoteResult<ReasoningEffortsView>>
    getWhisperModelState: (model: string) => Promise<RemoteResult<WhisperModelState>>
    downloadWhisperModel: (model: string) => Promise<RemoteResult<WhisperModelState>>
    cancelWhisperModelDownload: (model: string) => Promise<RemoteResult<WhisperModelState>>
    deleteWhisperModel: (model: string) => Promise<RemoteResult<WhisperModelState>>
    transcribe: (audioBase64: string, mimeType: string, signal?: AbortSignal) => Promise<RemoteResult<RemoteTextResult>>
    startRealtime: (signal?: AbortSignal) => Promise<RemoteResult<RealtimeSession>>
    sendRealtimeAudio: (sessionId: string, audioBase64: string, signal?: AbortSignal) => Promise<RemoteResult<RealtimeTranscript>>
    finishRealtime: (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<RemoteTextResult>>
    cancelRealtime: (sessionId: string) => Promise<RemoteResult<{ cancelled: true }>>
    polish: (transcript: string, provider: string, model: string, reasoningEffort: string, signal?: AbortSignal) => Promise<RemoteResult<RemoteTextResult>>
  }

  interface TypertRemoteMap {
    'dshEars/getAbout': () => Promise<RemoteResult<AboutInfo>>
    'dshEars/checkForUpdate': (signal?: AbortSignal) => Promise<RemoteResult<UpdateCheckResult>>
    'dshEars/getSettings': () => Promise<RemoteResult<EarsSettingsView>>
    'dshEars/updateSettings': (patch: EarsSettingsPatch, signal?: AbortSignal) => Promise<RemoteResult<EarsSettingsView>>
    'dshEars/listCloudProviderModels': (provider: string, signal?: AbortSignal) => Promise<RemoteResult<CloudProviderModelsView>>
    'dshEars/listRoutes': () => Promise<RemoteResult<PolishRoute[]>>
    'dshEars/listAsrBackends': () => Promise<RemoteResult<AsrBackendInfo[]>>
    'dshEars/listReasoningEfforts': (provider: string, model: string) => Promise<RemoteResult<ReasoningEffortsView>>
    'dshEars/getWhisperModelState': (model: string) => Promise<RemoteResult<WhisperModelState>>
    'dshEars/downloadWhisperModel': (model: string) => Promise<RemoteResult<WhisperModelState>>
    'dshEars/cancelWhisperModelDownload': (model: string) => Promise<RemoteResult<WhisperModelState>>
    'dshEars/deleteWhisperModel': (model: string) => Promise<RemoteResult<WhisperModelState>>
    'dshEars/transcribe': (audioBase64: string, mimeType: string, signal?: AbortSignal) => Promise<RemoteResult<RemoteTextResult>>
    'dshEars/startRealtime': (signal?: AbortSignal) => Promise<RemoteResult<RealtimeSession>>
    'dshEars/sendRealtimeAudio': (sessionId: string, audioBase64: string, signal?: AbortSignal) => Promise<RemoteResult<RealtimeTranscript>>
    'dshEars/finishRealtime': (sessionId: string, signal?: AbortSignal) => Promise<RemoteResult<RemoteTextResult>>
    'dshEars/cancelRealtime': (sessionId: string) => Promise<RemoteResult<{ cancelled: true }>>
    'dshEars/polish': (transcript: string, provider: string, model: string, reasoningEffort: string, signal?: AbortSignal) => Promise<RemoteResult<RemoteTextResult>>
  }

  interface TypertRemoteNamespaceMap {
    dshEars: TypertRemoteNamespace$dshEars
  }
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-ears',
  descriptors: EARS_REMOTE_DESCRIPTORS
}

export default TYPERT_REMOTE
