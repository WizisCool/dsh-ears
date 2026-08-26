import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { aboutInfoSchema, audioBase64Schema, audioMimeTypeSchema, cloudProviderModelsViewSchema, earsSettingsPatchSchema, earsSettingsViewSchema, listAsrBackendsResultSchema, listRoutesResultSchema, reasoningEffortsViewSchema, realtimeCancelledSchema, realtimeSessionSchema, realtimeTranscriptSchema, remoteTextResultSchema, textSchema, updateCheckResultSchema, whisperModelStateSchema } from './remote-contract.js'
import type { AboutInfo, AsrBackendInfo, CloudProviderModelsView, EarsSettingsPatch, EarsSettingsView, PolishRoute, ReasoningEffortsView, RealtimeSession, RealtimeTranscript, RemoteTextResult, UpdateCheckResult, WhisperModelState } from './remote-contract.js'

export type EarsRemote = ClientRemote['dshEars']

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$dshEars {
    getAbout: () => Promise<RemoteResult<AboutInfo>>
    checkForUpdate: (signal?: AbortSignal) => Promise<RemoteResult<UpdateCheckResult>>
    getSettings: () => Promise<RemoteResult<EarsSettingsView>>
    updateSettings: (patch: EarsSettingsPatch, signal?: AbortSignal) => Promise<RemoteResult<EarsSettingsView>>
    listCloudProviderModels: (signal?: AbortSignal) => Promise<RemoteResult<CloudProviderModelsView>>
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
    'dshEars/listCloudProviderModels': (signal?: AbortSignal) => Promise<RemoteResult<CloudProviderModelsView>>
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
  descriptors: [
    {
      id: 'dsh-ears#dshEars/listRoutes',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'listRoutes',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ears#PolishRoute[]',
        schema: listRoutesResultSchema
      }
    },
    {
      id: 'dsh-ears#dshEars/listAsrBackends',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'listAsrBackends',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ears#AsrBackendInfo[]',
        schema: listAsrBackendsResultSchema
      }
    },
    {
      id: 'dsh-ears#dshEars/getAbout',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'getAbout',
      invocation: { kind: 'direct' },
      parameters: [],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#AboutInfo', schema: aboutInfoSchema }
    },
    {
      id: 'dsh-ears#dshEars/checkForUpdate',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'checkForUpdate',
      invocation: { kind: 'direct' },
      parameters: [],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: 'dsh-ears#UpdateCheckResult', schema: updateCheckResultSchema }
    },
    {
      id: 'dsh-ears#dshEars/getSettings',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'getSettings',
      invocation: { kind: 'direct' },
      parameters: [],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#EarsSettingsView', schema: earsSettingsViewSchema }
    },
    {
      id: 'dsh-ears#dshEars/listCloudProviderModels',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'listCloudProviderModels',
      invocation: { kind: 'direct' },
      parameters: [],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: 'dsh-ears#CloudProviderModelsView', schema: cloudProviderModelsViewSchema }
    },
    {
      id: 'dsh-ears#dshEars/updateSettings',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'updateSettings',
      invocation: { kind: 'direct' },
      parameters: [{
        name: 'patch',
        wire: 'patch',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'dsh-ears#EarsSettingsPatch', schema: earsSettingsPatchSchema }
      }],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: 'dsh-ears#EarsSettingsView', schema: earsSettingsViewSchema }
    },
    {
      id: 'dsh-ears#dshEars/transcribe',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'transcribe',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'audioBase64',
          wire: 'audioBase64',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: audioBase64Schema }
        },
        {
          name: 'mimeType',
          wire: 'mimeType',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: audioMimeTypeSchema }
        }
      ],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: 'dsh-ears#RemoteTextResult', schema: remoteTextResultSchema }
    },
    {
      id: 'dsh-ears#dshEars/listReasoningEfforts',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'listReasoningEfforts',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'provider',
          wire: 'provider',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
        },
        {
          name: 'model',
          wire: 'model',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
        }
      ],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#ReasoningEffortsView', schema: reasoningEffortsViewSchema }
    },
    {
      id: 'dsh-ears#dshEars/getWhisperModelState',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'getWhisperModelState',
      invocation: { kind: 'direct' },
      parameters: [{
        name: 'model',
        wire: 'model',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
      }],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#WhisperModelState', schema: whisperModelStateSchema }
    },
    {
      id: 'dsh-ears#dshEars/downloadWhisperModel',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'downloadWhisperModel',
      invocation: { kind: 'direct' },
      parameters: [{
        name: 'model',
        wire: 'model',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
      }],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#WhisperModelState', schema: whisperModelStateSchema }
    },
    {
      id: 'dsh-ears#dshEars/deleteWhisperModel',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'deleteWhisperModel',
      invocation: { kind: 'direct' },
      parameters: [{
        name: 'model',
        wire: 'model',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
      }],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#WhisperModelState', schema: whisperModelStateSchema }
    },
    {
      id: 'dsh-ears#dshEars/cancelWhisperModelDownload',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'cancelWhisperModelDownload',
      invocation: { kind: 'direct' },
      parameters: [{
        name: 'model',
        wire: 'model',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
      }],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#WhisperModelState', schema: whisperModelStateSchema }
    },
    {
      id: 'dsh-ears#dshEars/startRealtime',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'startRealtime',
      invocation: { kind: 'direct' },
      parameters: [],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: 'dsh-ears#RealtimeSession', schema: realtimeSessionSchema }
    },
    {
      id: 'dsh-ears#dshEars/sendRealtimeAudio',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'sendRealtimeAudio',
      invocation: { kind: 'direct' },
      parameters: [
        { name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema } },
        { name: 'audioBase64', wire: 'audioBase64', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: audioBase64Schema } }
      ],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: 'dsh-ears#RealtimeTranscript', schema: realtimeTranscriptSchema }
    },
    {
      id: 'dsh-ears#dshEars/finishRealtime',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'finishRealtime',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema } }],
      cancellation: { parameter: 'signal' },
      result: { mode: 'strict', typeSymbol: 'dsh-ears#RemoteTextResult', schema: remoteTextResultSchema }
    },
    {
      id: 'dsh-ears#dshEars/cancelRealtime',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'cancelRealtime',
      invocation: { kind: 'direct' },
      parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema } }],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#RealtimeCancelled', schema: realtimeCancelledSchema }
    },
    {
      id: 'dsh-ears#dshEars/polish',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'polish',
      invocation: { kind: 'direct' },
      parameters: [
        {
          name: 'transcript',
          wire: 'transcript',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
        },
        {
          name: 'provider',
          wire: 'provider',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
        },
        {
          name: 'model',
          wire: 'model',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
        },
        {
          name: 'reasoningEffort',
          wire: 'reasoningEffort',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: textSchema }
        }
      ],
      cancellation: { parameter: 'signal' },
      result: {
        mode: 'strict',
        typeSymbol: 'dsh-ears#RemoteTextResult',
        schema: remoteTextResultSchema
      }
    }
  ]
}

export default TYPERT_REMOTE
