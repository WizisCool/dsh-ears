import { z } from 'zod'
import { earsSettingsPatchSchema, earsSettingsViewSchema, listRoutesResultSchema, polishResultSchema } from './remote-contract.js'
const polishTranscriptSchema = z.string()
const polishProviderSchema = z.string()
const polishModelSchema = z.string()

export const TYPERT = {
  package: 'dsh-ears',
  face: 'host',
  schemas: [],
  invocations: [
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
            schema: polishTranscriptSchema
          }
        },
        {
          name: 'provider',
          wire: 'provider',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'string',
            schema: polishProviderSchema
          }
        },
        {
          name: 'model',
          wire: 'model',
          source: 'json',
          codec: {
            mode: 'strict',
            typeSymbol: 'string',
            schema: polishModelSchema
          }
        }
      ],
      cancellation: { parameter: 'signal' },
      result: {
        mode: 'strict',
        typeSymbol: 'string',
        schema: polishResultSchema
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
            name: 'listRoutes',
            signature: 'listRoutes(): Promise<PolishRoute[]>',
            summary: 'List models already registered in dsh.',
            jsDoc: '/** List models already registered in dsh. */'
          },
          {
            kind: 'method',
            name: 'polish',
            signature: 'polish(transcript: string, provider: string, model: string, signal: AbortSignal): Promise<string>',
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
            name: 'PolishRoute',
            declaration: 'export interface PolishRoute { provider: string; providerName: string; model: string; modelName: string }'
          }
        ]
      }
    ],
    events: [],
    objects: []
  }
} as const

export default TYPERT
