import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ASR_BACKEND_IDS, DEFAULT_EARS_SETTINGS, EarsSettingsSchema, SETTINGS_NAMESPACE, WHISPER_MODEL_IDS, type AsrBackendId, type EarsSettings, type PolishRoute, type WhisperModelId } from '../config.js'
import { isWhisperAvailable, transcribeWithWhisper } from '../asr/local-whisper.js'
import { transcribeOpenAICompatible } from '../asr/openai-compatible.js'
import type { AsrBackendInfo } from '../asr/types.js'
import type { EarsSettingsPatch, EarsSettingsView } from '../remote-contract.js'
import { POLISH_SYSTEM_PROMPT, polishUserText } from './prompts.js'

const MAX_TRANSCRIPT_CHARACTERS = 12_000
const POLISH_TIMEOUT_MS = 20_000

export class PolishService extends TypertRemoteService {
  static inject = ['llm']
  private settings: SettingsScope<import('../config.js').EarsSettings> | undefined
  private resolveCredential: ((reference: string) => Promise<string | undefined>) | undefined
  private describeCredential: ((reference: string) => Promise<boolean>) | undefined
  private whisperAvailability: { expiresAt: number; value: Promise<boolean> } | undefined

  constructor(ctx: Context) {
    super(ctx, 'dshEarsPolish', { namespace: 'dshEars' })
    ctx.inject(['settings'], (settingsCtx) => {
      this.settings = settingsCtx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), EarsSettingsSchema, {
        validate: validateSettings
      })
      settingsCtx.effect(() => () => {
        this.settings = undefined
      }, 'dsh-ears settings lifecycle')
    })
    ctx.inject(['credentials'], (credentialsCtx) => {
      this.resolveCredential = async (reference) => {
        const hit = await credentialsCtx.credentials.resolve(credentialRef(reference))
        return hit?.value
      }
      this.describeCredential = async (reference) => {
        const description = await credentialsCtx.credentials.describe(credentialRef(reference))
        return description.configured
      }
      credentialsCtx.effect(() => () => {
        this.resolveCredential = undefined
        this.describeCredential = undefined
      }, 'dsh-ears credentials lifecycle')
    })
  }

  getSettings(): EarsSettingsView {
    if (this.settings === undefined) {
      return {
        available: false,
        writable: false,
        settings: DEFAULT_EARS_SETTINGS,
        overridden: []
      }
    }

    const snapshot = this.settings.get()
    const provider = this.ctx.get('settings')
    const descriptor = provider?.describe({ redactSecrets: true }).find((item) => String(item.ns) === SETTINGS_NAMESPACE)
    const user = descriptor?.user
    return {
      available: true,
      writable: provider?.writable ?? false,
      settings: snapshot,
      overridden: isRecord(user) ? Object.keys(user) : []
    }
  }

  async updateSettings(patch: EarsSettingsPatch): Promise<EarsSettingsView> {
    if (this.settings === undefined) return this.getSettings()
    await this.settings.update(patch)
    return this.getSettings()
  }

  async listRoutes(): Promise<PolishRoute[]> {
    const routes: PolishRoute[] = []

    for (const provider of this.ctx.llm.listProviders()) {
      let models: LlmModelInfo[]
      try {
        models = await this.ctx.llm.listModels(provider.id)
      } catch {
        continue
      }

      for (const model of models) {
        routes.push({
          provider: provider.id,
          providerName: provider.name,
          model: model.id,
          modelName: model.name
        })
      }
    }

    return routes
  }

  async listAsrBackends(): Promise<AsrBackendInfo[]> {
    const settings = this.settings?.get() ?? DEFAULT_EARS_SETTINGS
    const localAvailable = await this.whisperIsAvailable()
    const cloudAvailable = await this.cloudAsrIsAvailable(settings)
    return [
      {
        id: 'web-speech',
        name: 'Web Speech',
        available: true,
        detail: 'Browser-provided live recognition; availability depends on the browser.'
      },
      {
        id: 'local-whisper',
        name: 'Local Whisper',
        available: localAvailable,
        detail: localAvailable ? 'Whisper CLI detected on the dsh Host.' : 'Install openai-whisper and put whisper on PATH.'
      },
      {
        id: 'cloud-openai',
        name: 'OpenAI-compatible cloud ASR',
        available: cloudAvailable,
        detail: cloudAvailable ? 'Configured transcription endpoint and credential reference.' : 'Configure an endpoint and an optional dsh credential reference.'
      }
    ]
  }

  async transcribe(audioBase64: string, mimeType: string, signal: AbortSignal): Promise<string> {
    const settings = this.requireSettings()
    const audio = decodeAudio(audioBase64)
    const backend = asrBackend(settings.asrBackend)
    if (backend === 'web-speech') throw new Error('Web Speech recordings are transcribed in the browser')
    if (backend === 'local-whisper') {
      return transcribeWithWhisper({
        audio,
        mimeType,
        language: settings.language,
        model: whisperModel(settings.localWhisperModel),
        signal
      })
    }

    const credential = await this.resolveCloudCredential(settings)
    return transcribeOpenAICompatible({
      audio,
      mimeType,
      language: settings.language,
      endpoint: settings.cloudAsrEndpoint,
      model: settings.cloudAsrModel,
      credential,
      signal
    })
  }

  async polish(transcript: string, provider: string, model: string, signal: AbortSignal): Promise<string> {
    const raw = transcript.trim()
    if (raw === '' || provider.trim() === '' || model.trim() === '') return raw
    if (raw.length > MAX_TRANSCRIPT_CHARACTERS) return raw

    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), POLISH_TIMEOUT_MS)
    const forwardAbort = () => timeout.abort(signal.reason)
    signal.addEventListener('abort', forwardAbort, { once: true })

    try {
      const prepared = await this.ctx.llm.prepareCall({
        provider,
        model
      }, timeout.signal)
      const message = createUserMessage({
        content: [{ type: 'text', text: polishUserText(raw) }],
        source: { kind: 'user' }
      })
      const output = await collectText(prepared.stream({
        ...prepared.config,
        messages: [message],
        system: POLISH_SYSTEM_PROMPT,
        signal: timeout.signal
      }))

      return output === '' ? raw : output
    } catch {
      return raw
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', forwardAbort)
    }
  }

  private requireSettings() {
    if (this.settings === undefined) throw new Error('dsh-ears settings are unavailable')
    return this.settings.get()
  }

  private async whisperIsAvailable(): Promise<boolean> {
    const now = Date.now()
    if (this.whisperAvailability !== undefined && this.whisperAvailability.expiresAt > now) return this.whisperAvailability.value
    const value = isWhisperAvailable()
    this.whisperAvailability = { expiresAt: now + 30_000, value }
    return value
  }

  private async cloudAsrIsAvailable(settings: EarsSettings): Promise<boolean> {
    if (settings.cloudAsrEndpoint.trim() === '') return false
    if (settings.cloudAsrCredentialRef.trim() === '') return true
    if (this.describeCredential === undefined || !credentialReferenceIsValid(settings.cloudAsrCredentialRef)) return false
    try {
      return await this.describeCredential(settings.cloudAsrCredentialRef)
    } catch {
      return false
    }
  }

  private async resolveCloudCredential(settings: EarsSettings): Promise<string | undefined> {
    const reference = settings.cloudAsrCredentialRef.trim()
    if (reference === '') return undefined
    if (!credentialReferenceIsValid(reference) || this.resolveCredential === undefined) throw new Error('The dsh credential reference is unavailable')
    const value = await this.resolveCredential(reference)
    if (value === undefined) throw new Error('The dsh credential reference is not configured')
    return value
  }
}

function asrBackend(value: string): AsrBackendId {
  if ((ASR_BACKEND_IDS as readonly string[]).includes(value)) return value as AsrBackendId
  return 'web-speech'
}

function whisperModel(value: string): WhisperModelId {
  if ((WHISPER_MODEL_IDS as readonly string[]).includes(value)) return value as WhisperModelId
  return 'tiny'
}

function credentialReferenceIsValid(value: string): boolean {
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(value)
}

function validateSettings(settings: EarsSettings): void {
  if (!(ASR_BACKEND_IDS as readonly string[]).includes(settings.asrBackend)) throw new Error('Unknown dsh-ears ASR backend')
  if (!(WHISPER_MODEL_IDS as readonly string[]).includes(settings.localWhisperModel)) throw new Error('Unknown dsh-ears Whisper model')
  if (settings.cloudAsrCredentialRef.trim() !== '' && !credentialReferenceIsValid(settings.cloudAsrCredentialRef.trim())) {
    throw new Error('Invalid dsh credential reference')
  }
  if (settings.asrBackend !== 'cloud-openai') return
  const endpoint = new URL(settings.cloudAsrEndpoint.trim())
  if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') throw new Error('Cloud ASR endpoint must use HTTP or HTTPS')
  if (endpoint.username !== '' || endpoint.password !== '') throw new Error('Cloud ASR endpoint must not contain credentials')
  if (settings.cloudAsrModel.trim() === '') throw new Error('Cloud ASR model is required')
}

function decodeAudio(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error('The recorded audio is not valid base64')
  const audio = Buffer.from(value, 'base64')
  if (audio.byteLength === 0) throw new Error('The recorded audio is empty')
  if (audio.byteLength > 24 * 1024 * 1024) throw new Error('The recorded audio is too large')
  return new Uint8Array(audio)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function collectText(stream: AsyncIterable<StreamChunk>): Promise<string> {
  let text = ''
  let sawDelta = false

  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      text += chunk.text
      sawDelta = true
      continue
    }

    if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
      throw new Error('The dsh LLM route did not complete polishing')
    }

    if (!sawDelta && chunk.type === 'block-end' && chunk.block.type === 'text') {
      text += chunk.block.text
    }
  }

  return text.trim()
}
