import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { audioBase64Schema, audioMimeTypeSchema, earsSettingsPatchSchema, earsSettingsViewSchema, listAsrBackendsResultSchema, listRoutesResultSchema, polishResultSchema, transcribeResultSchema } from './remote-contract.js'
import type { AsrBackendInfo, EarsSettingsPatch, EarsSettingsView, PolishRoute } from './remote-contract.js'

export type EarsRemote = ClientRemote['dshEars']

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$dshEars {
    getSettings: () => Promise<RemoteResult<EarsSettingsView>>
    updateSettings: (patch: EarsSettingsPatch, signal?: AbortSignal) => Promise<RemoteResult<EarsSettingsView>>
    listRoutes: () => Promise<RemoteResult<PolishRoute[]>>
    listAsrBackends: () => Promise<RemoteResult<AsrBackendInfo[]>>
    transcribe: (audioBase64: string, mimeType: string, signal?: AbortSignal) => Promise<RemoteResult<string>>
    polish: (transcript: string, provider: string, model: string, signal?: AbortSignal) => Promise<RemoteResult<string>>
  }

  interface TypertRemoteMap {
    'dshEars/getSettings': () => Promise<RemoteResult<EarsSettingsView>>
    'dshEars/updateSettings': (patch: EarsSettingsPatch, signal?: AbortSignal) => Promise<RemoteResult<EarsSettingsView>>
    'dshEars/listRoutes': () => Promise<RemoteResult<PolishRoute[]>>
    'dshEars/listAsrBackends': () => Promise<RemoteResult<AsrBackendInfo[]>>
    'dshEars/transcribe': (audioBase64: string, mimeType: string, signal?: AbortSignal) => Promise<RemoteResult<string>>
    'dshEars/polish': (transcript: string, provider: string, model: string, signal?: AbortSignal) => Promise<RemoteResult<string>>
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
          codec: { mode: 'strict', typeSymbol: 'string', schema: { parse(value: unknown) { return String(value) } } }
        },
        {
          name: 'provider',
          wire: 'provider',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: { parse(value: unknown) { return String(value) } } }
        },
        {
          name: 'model',
          wire: 'model',
          source: 'json',
          codec: { mode: 'strict', typeSymbol: 'string', schema: { parse(value: unknown) { return String(value) } } }
        }
      ],
      cancellation: { parameter: 'signal' },
      result: {
        mode: 'strict',
        typeSymbol: 'string',
        schema: { parse(value: unknown) { return String(value) } }
      }
    }
  ]
}

export default TYPERT_REMOTE
