import type { TypertCodec, TypertSchema } from '@deepseek-ai/dsh-typert-protocol'
import { aboutInfoSchema, audioBase64Schema, audioMimeTypeSchema, cloudAsrProviderSchema, cloudProviderModelsViewSchema, earsSettingsPatchSchema, earsSettingsViewSchema, listAsrBackendsResultSchema, listRoutesResultSchema, realtimeCancelledSchema, realtimeSessionSchema, realtimeTranscriptSchema, reasoningEffortsViewSchema, remoteTextResultSchema, textSchema, updateCheckResultSchema, whisperModelStateSchema } from './remote-contract.js'

/**
 * One strict wire codec over a zod v4 schema.
 *
 * The Typert strict contract carries its schema behind a `create()` factory so
 * the boundary materializes it on first use, rather than reading a `schema`
 * property. Every descriptor in this table builds its codecs here, which keeps
 * the factory present on all 36 codecs by construction.
 */
function strictCodec(typeSymbol: string, schema: TypertSchema): TypertCodec {
  return { mode: 'strict', typeSymbol, create: () => schema }
}

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
    result: strictCodec('dsh-ears#PolishRoute[]', listRoutesResultSchema)
  },
  {
    id: 'dsh-ears#dshEars/listAsrBackends',
    service: 'dshEarsPolish',
    namespace: 'dshEars',
    method: 'listAsrBackends',
    invocation: { kind: 'direct' },
    parameters: [],
    result: strictCodec('dsh-ears#AsrBackendInfo[]', listAsrBackendsResultSchema)
  },
  {
    id: 'dsh-ears#dshEars/getAbout',
    service: 'dshEarsPolish',
    namespace: 'dshEars',
    method: 'getAbout',
    invocation: { kind: 'direct' },
    parameters: [],
    result: strictCodec('dsh-ears#AboutInfo', aboutInfoSchema)
  },
  {
    id: 'dsh-ears#dshEars/checkForUpdate',
    service: 'dshEarsPolish',
    namespace: 'dshEars',
    method: 'checkForUpdate',
    invocation: { kind: 'direct' },
    parameters: [],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-ears#UpdateCheckResult', updateCheckResultSchema)
  },
  {
    id: 'dsh-ears#dshEars/getSettings',
    service: 'dshEarsPolish',
    namespace: 'dshEars',
    method: 'getSettings',
    invocation: { kind: 'direct' },
    parameters: [],
    result: strictCodec('dsh-ears#EarsSettingsView', earsSettingsViewSchema)
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
        codec: strictCodec('string', cloudAsrProviderSchema)
      }
    ],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-ears#CloudProviderModelsView', cloudProviderModelsViewSchema)
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
      codec: strictCodec('dsh-ears#EarsSettingsPatch', earsSettingsPatchSchema)
    }],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-ears#EarsSettingsView', earsSettingsViewSchema)
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
        codec: strictCodec('string', audioBase64Schema)
      },
      {
        name: 'mimeType',
        wire: 'mimeType',
        source: 'json',
        codec: strictCodec('string', audioMimeTypeSchema)
      }
    ],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-ears#RemoteTextResult', remoteTextResultSchema)
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
        codec: strictCodec('string', textSchema)
      },
      {
        name: 'model',
        wire: 'model',
        source: 'json',
        codec: strictCodec('string', textSchema)
      }
    ],
    result: strictCodec('dsh-ears#ReasoningEffortsView', reasoningEffortsViewSchema)
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
      codec: strictCodec('string', textSchema)
    }],
    result: strictCodec('dsh-ears#WhisperModelState', whisperModelStateSchema)
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
      codec: strictCodec('string', textSchema)
    }],
    result: strictCodec('dsh-ears#WhisperModelState', whisperModelStateSchema)
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
      codec: strictCodec('string', textSchema)
    }],
    result: strictCodec('dsh-ears#WhisperModelState', whisperModelStateSchema)
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
      codec: strictCodec('string', textSchema)
    }],
    result: strictCodec('dsh-ears#WhisperModelState', whisperModelStateSchema)
  },
  {
    id: 'dsh-ears#dshEars/startRealtime',
    service: 'dshEarsPolish',
    namespace: 'dshEars',
    method: 'startRealtime',
    invocation: { kind: 'direct' },
    parameters: [],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-ears#RealtimeSession', realtimeSessionSchema)
  },
  {
    id: 'dsh-ears#dshEars/sendRealtimeAudio',
    service: 'dshEarsPolish',
    namespace: 'dshEars',
    method: 'sendRealtimeAudio',
    invocation: { kind: 'direct' },
    parameters: [
      { name: 'sessionId', wire: 'sessionId', source: 'json', codec: strictCodec('string', textSchema) },
      { name: 'audioBase64', wire: 'audioBase64', source: 'json', codec: strictCodec('string', audioBase64Schema) }
    ],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-ears#RealtimeTranscript', realtimeTranscriptSchema)
  },
  {
    id: 'dsh-ears#dshEars/finishRealtime',
    service: 'dshEarsPolish',
    namespace: 'dshEars',
    method: 'finishRealtime',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: strictCodec('string', textSchema) }],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-ears#RemoteTextResult', remoteTextResultSchema)
  },
  {
    id: 'dsh-ears#dshEars/cancelRealtime',
    service: 'dshEarsPolish',
    namespace: 'dshEars',
    method: 'cancelRealtime',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'sessionId', wire: 'sessionId', source: 'json', codec: strictCodec('string', textSchema) }],
    result: strictCodec('dsh-ears#RealtimeCancelled', realtimeCancelledSchema)
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
        codec: strictCodec('string', textSchema)
      },
      {
        name: 'provider',
        wire: 'provider',
        source: 'json',
        codec: strictCodec('string', textSchema)
      },
      {
        name: 'model',
        wire: 'model',
        source: 'json',
        codec: strictCodec('string', textSchema)
      },
      {
        name: 'reasoningEffort',
        wire: 'reasoningEffort',
        source: 'json',
        codec: strictCodec('string', textSchema)
      }
    ],
    cancellation: { parameter: 'signal' },
    result: strictCodec('dsh-ears#RemoteTextResult', remoteTextResultSchema)
  }
] as const
