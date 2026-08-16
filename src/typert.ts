import { audioBase64Schema, audioMimeTypeSchema, earsSettingsPatchSchema, earsSettingsViewSchema, listAsrBackendsResultSchema, listRoutesResultSchema, reasoningEffortsViewSchema, textSchema, transcribeResultSchema, whisperModelStateSchema } from './remote-contract.js'

export const TYPERT = {
  package: 'dsh-ears',
  face: 'host',
  schemas: [],
  invocations: [
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
      id: 'dsh-ears#dshEars/getSettings',
      service: 'dshEarsPolish',
      namespace: 'dshEars',
      method: 'getSettings',
      invocation: { kind: 'direct' },
      parameters: [],
      result: { mode: 'strict', typeSymbol: 'dsh-ears#EarsSettingsView', schema: earsSettingsViewSchema }
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
      result: { mode: 'strict', typeSymbol: 'string', schema: transcribeResultSchema }
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
          codec: {
            mode: 'strict',
            typeSymbol: 'string',
            schema: textSchema
          }
        },
        {
          name: 'provider',
          wire: 'provider',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'string',
            schema: textSchema
          }
        },
        {
          name: 'model',
          wire: 'model',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'string',
            schema: textSchema
          }
        },
        {
          name: 'reasoningEffort',
          wire: 'reasoningEffort',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'string',
            schema: textSchema
          }
        }
      ],
      cancellation: { parameter: 'signal' },
      result: {
        mode: 'strict',
        typeSymbol: 'string',
        schema: textSchema
      }
    }
  ],
  model: {
    services: [
      {
        description: 'Host-side dsh route discovery and text-only transcript polishing.',
        summary: 'Voice transcript polishing service.',
        tags: [],
        jsDoc: '/** Host-side dsh route discovery and text-only transcript polishing. */',
        key: 'dshEarsPolish',
        exportName: 'PolishService',
        members: [
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
            signature: 'transcribe(audioBase64: string, mimeType: string, signal: AbortSignal): Promise<string>',
            summary: 'Transcribe one recorded audio payload through the selected ASR backend.',
            jsDoc: '/** Transcribe one recorded audio payload through the selected ASR backend. */'
          },
          {
            kind: 'method',
            name: 'polish',
            signature: 'polish(transcript: string, provider: string, model: string, reasoningEffort: string, signal: AbortSignal): Promise<string>',
            summary: 'Polish one transcript through a selected dsh route.',
            jsDoc: '/** Polish one transcript through a selected dsh route. */'
          }
        ],
        types: [
          {
            name: 'EarsSettingsView',
            declaration: 'export interface EarsSettingsView { available: boolean; writable: boolean; settings: EarsSettings; overridden: string[] }'
          },
          {
            name: 'EarsSettingsPatch',
            declaration: 'export type EarsSettingsPatch = Partial<EarsSettings>'
          },
          {
            name: 'AsrBackendInfo',
            declaration: 'export interface AsrBackendInfo { id: AsrBackendId; name: string; available: boolean; detail: string }'
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
            name: 'WhisperModelState',
            declaration: 'export interface WhisperModelState { cliAvailable: boolean; downloaded: boolean; downloading: boolean; progress: number | null; bytes: number | null; totalBytes: number | null; error: string | null }'
          }
        ]
      }
    ],
    events: [],
    objects: []
  }
} as const

export default TYPERT
