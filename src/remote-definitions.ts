import { aboutInfoSchema, audioBase64Schema, audioMimeTypeSchema, cloudAsrProviderSchema, cloudProviderModelsViewSchema, earsSettingsPatchSchema, earsSettingsViewSchema, listAsrBackendsResultSchema, listRoutesResultSchema, realtimeCancelledSchema, realtimeSessionSchema, realtimeTranscriptSchema, reasoningEffortsViewSchema, remoteTextResultSchema, textSchema, updateCheckResultSchema, whisperModelStateSchema } from './remote-contract.js'

/**
 * The one wire-level descriptor table used by both the Host manifest and the
 * browser Remote contribution. Keeping the schemas and cancellation metadata
 * in one value prevents the two package faces from drifting apart.
 */
export const EARS_REMOTE_DESCRIPTORS = [
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
    parameters: [
      {
        name: 'provider',
        wire: 'provider',
        source: 'json',
        codec: { mode: 'strict', typeSymbol: 'string', schema: cloudAsrProviderSchema }
      }
    ],
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
] as const
