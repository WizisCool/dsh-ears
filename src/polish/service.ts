import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { LlmModelInfo, ReasoningEffortId, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ASR_BACKEND_IDS, DEFAULT_EARS_SETTINGS, SETTINGS_NAMESPACE, WHISPER_MODEL_IDS, validateEarsSettings, type AsrBackendId, type EarsSettings, type PolishRoute, type ReasoningEffortsView, type WhisperModelId } from '../config.js'
import { EarsSettingsSchema } from '../config-schema.js'
import { isWhisperAvailable, transcribeWithWhisper, validateWhisperTranscription } from '../asr/local-whisper.js'
import { WhisperModels } from '../asr/whisper-models.js'
import type { WhisperModelState } from '../asr/whisper-models.js'
import { transcribeOpenAICompatible } from '../asr/openai-compatible.js'
import { fetchCloudProviderModels } from '../asr/cloud-provider-models.js'
import { cloudAsrEndpointFor, cloudAsrModelFor, cloudProviderEntry, isCloudAsrReady } from '../asr/providers.js'
import type { AsrBackendInfo } from '../asr/types.js'
import type { CloudProviderModelsView, EarsSettingsPatch, EarsSettingsView } from '../remote-contract.js'
import { applySpokenEnumerationLayout } from './enumeration.js'
import { polishUserText, resolvePolishSystemPrompt } from './prompts.js'

const MAX_TRANSCRIPT_CHARACTERS = 12_000
const MAX_POLISHED_CHARACTERS = 24_000
const POLISH_TIMEOUT_MS = 20_000
const CLOUD_MODELS_FAILURE_TTL_MS = 30_000

export class PolishService extends TypertRemoteService {
  static inject = ['llm']
  private settings: SettingsScope<import('../config.js').EarsSettings> | undefined
  private whisperAvailability: { expiresAt: number; value: Promise<boolean> } | undefined
  private cloudModelsFailure: { expiresAt: number; message: string } | undefined
  private readonly whisperModels = new WhisperModels()

  constructor(ctx: Context) {
    super(ctx, 'dshEarsPolish', { namespace: 'dshEars' })
    ctx.effect(() => () => {
      this.whisperModels.dispose()
    }, 'dsh-ears whisper models lifecycle')
    ctx.inject(['settings'], (settingsCtx) => {
      this.settings = settingsCtx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), EarsSettingsSchema, {
        validate: validateSettings
      })
      settingsCtx.effect(() => () => {
        this.settings = undefined
      }, 'dsh-ears settings lifecycle')
    })
  }

  getSettings(): EarsSettingsView {
    if (this.settings === undefined) {
      return {
        available: false,
        writable: false,
        settings: DEFAULT_EARS_SETTINGS,
        cloudAsrApiKeyConfigured: false,
        overridden: []
      }
    }

    const snapshot = this.settings.get()
    const provider = this.ctx.get('settings') as { describe?: (options: { redactSecrets: boolean }) => Array<{ ns: unknown; user?: unknown }>; writable?: boolean } | undefined
    const descriptor = provider?.describe?.({ redactSecrets: true })?.find((item) => String(item.ns) === SETTINGS_NAMESPACE)
    const user = descriptor?.user
    return {
      available: true,
      writable: provider?.writable ?? false,
      settings: { ...snapshot, cloudAsrApiKey: '' },
      cloudAsrApiKeyConfigured: snapshot.cloudAsrApiKey.trim() !== '',
      overridden: isRecord(user) ? Object.keys(user) : []
    }
  }

  async updateSettings(patch: EarsSettingsPatch, signal: AbortSignal): Promise<EarsSettingsView> {
    if (this.settings === undefined) return this.getSettings()
    signal.throwIfAborted()
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
        name: 'Cloud ASR',
        available: cloudAvailable,
        detail: cloudAvailable ? 'Cloud transcription is configured.' : 'Choose a cloud model and configure the API key.'
      }
    ]
  }

  async listCloudProviderModels(signal: AbortSignal): Promise<CloudProviderModelsView> {
    const settings = this.settings?.get() ?? DEFAULT_EARS_SETTINGS
    const entry = cloudProviderEntry(settings.cloudAsrProvider)
    if (entry === undefined || entry.baseUrl === undefined) return { status: 'unsupported' }
    const key = settings.cloudAsrApiKey.trim()
    if (key === '') return { status: 'no-key' }
    signal.throwIfAborted()
    const now = Date.now()
    if (this.cloudModelsFailure !== undefined && this.cloudModelsFailure.expiresAt > now) {
      return { status: 'error', models: [], error: this.cloudModelsFailure.message }
    }
    try {
      const models = await fetchCloudProviderModels(entry, key, signal)
      return { status: 'ok', models }
    } catch (error) {
      if (signal.aborted) throw error
      const message = error instanceof Error && error.message.trim() !== '' ? error.message : 'Cloud model listing failed'
      this.cloudModelsFailure = { expiresAt: now + CLOUD_MODELS_FAILURE_TTL_MS, message }
      return { status: 'error', models: [], error: message }
    }
  }

  async getWhisperModelState(model: string): Promise<WhisperModelState> {
    return this.whisperModels.getWhisperModelState(whisperModel(model), await this.whisperIsAvailable())
  }

  async downloadWhisperModel(model: string): Promise<WhisperModelState> {
    return this.whisperModels.downloadWhisperModel(whisperModel(model), await this.whisperIsAvailable())
  }

  async cancelWhisperModelDownload(model: string): Promise<WhisperModelState> {
    return this.whisperModels.cancelWhisperModelDownload(whisperModel(model), await this.whisperIsAvailable())
  }

  async deleteWhisperModel(model: string): Promise<WhisperModelState> {
    return this.whisperModels.deleteWhisperModel(whisperModel(model), await this.whisperIsAvailable())
  }

  async listReasoningEfforts(provider: string, model: string): Promise<ReasoningEffortsView> {
    if (provider.trim() === '' || model.trim() === '') return { efforts: [] }
    try {
      const info = await this.ctx.llm.resolveModelInfo(provider, model)
      if (info.reasoning === undefined) return { efforts: [] }
      const efforts = info.reasoning.efforts.map((effort) => ({
        id: effort.id,
        name: effort.name,
        ...(effort.description === undefined ? {} : { description: effort.description })
      }))
      return {
        efforts,
        ...(info.reasoning.defaultEffort === undefined ? {} : { defaultEffort: info.reasoning.defaultEffort })
      }
    } catch {
      return { efforts: [] }
    }
  }

  async transcribe(audioBase64: string, mimeType: string, signal: AbortSignal): Promise<string> {
    const settings = this.requireSettings()
    signal.throwIfAborted()
    const audio = decodeAudio(audioBase64)
    const backend = asrBackend(settings.asrBackend)
    if (backend === 'web-speech') throw new Error('Web Speech recordings are transcribed in the browser')
    if (backend === 'local-whisper') {
      const model = whisperModel(settings.localWhisperModel)
      const cliAvailable = await this.whisperIsAvailable()
      const state = await this.whisperModels.getWhisperModelState(model, cliAvailable)
      validateWhisperTranscription(state)
      return transcribeWithWhisper({
        audio,
        mimeType,
        language: settings.language,
        model,
        signal
      })
    }

    const endpoint = cloudAsrEndpointFor(settings)
    const model = cloudAsrModelFor(settings)
    if (model === '') throw new Error('The cloud ASR model is not configured')
    const providerEntry = cloudProviderEntry(settings.cloudAsrProvider)
    if (providerEntry === undefined) throw new Error(`Unknown dsh-ears cloud ASR provider: ${settings.cloudAsrProvider}`)
    const credential = settings.cloudAsrApiKey.trim()
    if (providerEntry.apiKeyRequired && credential === '') throw new Error('The cloud ASR API key is not configured')
    return transcribeOpenAICompatible({
      audio,
      mimeType,
      language: settings.language,
      endpoint,
      model,
      credential: credential === '' ? undefined : credential,
      signal
    })
  }

  async polish(transcript: string, provider: string, model: string, reasoningEffort: string, signal: AbortSignal): Promise<string> {
    const raw = transcript.trim()
    if (raw === '' || raw.length > MAX_TRANSCRIPT_CHARACTERS || signal.aborted) return raw
    const settings = this.settings?.get() ?? DEFAULT_EARS_SETTINGS
    const storedPrompt = settings.polishPrompt
    const finish = (text: string): string => storedPrompt.trim() === '' ? applySpokenEnumerationLayout(text) : text
    const requestedProvider = provider.trim()
    const requestedModel = model.trim()
    const routeProvider = requestedProvider || settings.polishProvider.trim()
    const routeModel = requestedModel || settings.polishModel.trim()
    const enabled = settings.polishingEnabled || (requestedProvider !== '' && requestedModel !== '')
    if (!enabled || routeProvider === '' || routeModel === '') return finish(raw)

    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), POLISH_TIMEOUT_MS)
    const forwardAbort = () => timeout.abort(signal.reason)
    signal.addEventListener('abort', forwardAbort, { once: true })

    const effort = await this.resolveReasoningEffort(routeProvider, routeModel, reasoningEffort, timeout.signal)
    if (signal.aborted) return finish(raw)
    if (timeout.signal.aborted) throw new Error('The dsh LLM polishing request timed out')
    try {
      const first = await this.completePolish(routeProvider, routeModel, raw, storedPrompt, effort, timeout.signal)
      if (effort !== undefined && first.trim() === raw && !timeout.signal.aborted && !signal.aborted) {
        try {
          return finish(await this.completePolish(routeProvider, routeModel, raw, storedPrompt, undefined, timeout.signal))
        } catch {
          if (signal.aborted) return finish(raw)
          return finish(first)
        }
      }
      return finish(first)
    } catch (error) {
      if (signal.aborted) return finish(raw)
      if (timeout.signal.aborted) throw new Error('The dsh LLM polishing request timed out')
      if (effort === undefined) {
        throw error instanceof Error ? error : new Error('The dsh LLM route did not complete polishing')
      }
      try {
        return finish(await this.completePolish(routeProvider, routeModel, raw, storedPrompt, undefined, timeout.signal))
      } catch {
        if (signal.aborted) return finish(raw)
        throw new Error('The dsh LLM route did not complete polishing')
      }
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', forwardAbort)
    }
  }

  private async completePolish(
    provider: string,
    model: string,
    raw: string,
    storedPrompt: string,
    effort: string | undefined,
    signal: AbortSignal
  ): Promise<string> {
    const prepared = await this.ctx.llm.prepareCall({ provider, model }, signal)
    const message = createUserMessage({
      content: [{ type: 'text', text: polishUserText(raw) }],
      source: { kind: 'user' }
    })
    const output = await collectText(prepared.stream({
      ...prepared.config,
      ...(effort === undefined ? {} : { reasoningEffort: effort as ReasoningEffortId }),
      messages: [message],
      system: resolvePolishSystemPrompt(storedPrompt),
      signal
    }), MAX_POLISHED_CHARACTERS)
    if (output === '') throw new Error('The dsh LLM route returned no polished text')
    return output
  }

  private requireSettings() {
    if (this.settings === undefined) throw new Error('dsh-ears settings are unavailable')
    return this.settings.get()
  }

  private async resolveReasoningEffort(provider: string, model: string, requested: string, signal: AbortSignal): Promise<string | undefined> {
    const effort = requested.trim()
    if (effort === '') return undefined
    try {
      const info = await this.ctx.llm.resolveModelInfo(provider, model, signal)
      const efforts = info.reasoning?.efforts ?? []
      return efforts.some((candidate) => candidate.id === effort) ? effort : undefined
    } catch {
      return undefined
    }
  }

  private async whisperIsAvailable(): Promise<boolean> {
    const now = Date.now()
    if (this.whisperAvailability !== undefined && this.whisperAvailability.expiresAt > now) return this.whisperAvailability.value
    const value = isWhisperAvailable()
    this.whisperAvailability = { expiresAt: now + 30_000, value }
    return value
  }

  private async cloudAsrIsAvailable(settings: EarsSettings): Promise<boolean> {
    return isCloudAsrReady(settings)
  }
}

function asrBackend(value: string): AsrBackendId {
  if ((ASR_BACKEND_IDS as readonly string[]).includes(value)) return value as AsrBackendId
  throw new Error(`Unknown dsh-ears ASR backend: ${value}`)
}

function whisperModel(value: string): WhisperModelId {
  if ((WHISPER_MODEL_IDS as readonly string[]).includes(value)) return value as WhisperModelId
  throw new Error(`Unknown dsh-ears Whisper model: ${value}`)
}

/** Host registration validate: field-level integrity only; no cross-field completeness gates (D-024). */
export function validateSettings(settings: EarsSettings): void {
  validateEarsSettings(settings)
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

async function collectText(stream: AsyncIterable<StreamChunk>, maxCharacters: number): Promise<string> {
  let text = ''
  let sawDelta = false

  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      text += chunk.text
      if (text.length > maxCharacters) throw new Error('The dsh LLM polishing response is too large')
      sawDelta = true
      continue
    }

    if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
      throw new Error('The dsh LLM route did not complete polishing')
    }

    if (!sawDelta && chunk.type === 'block-end' && chunk.block.type === 'text') {
      text += chunk.block.text
      if (text.length > maxCharacters) throw new Error('The dsh LLM polishing response is too large')
    }
  }

  return text.trim()
}
