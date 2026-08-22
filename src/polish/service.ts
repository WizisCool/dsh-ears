import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { TypertLookupFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { LlmModelInfo, ReasoningEffortId, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ASR_BACKEND_IDS, DEFAULT_EARS_SETTINGS, SETTINGS_NAMESPACE, WHISPER_MODEL_IDS, effectiveRecognitionLanguage, validateEarsSettings, type AsrBackendId, type EarsSettings, type PolishRoute, type ReasoningEffortsView, type WhisperModelId } from '../config.js'
import { EarsSettingsSchema } from '../config-schema.js'
import { isWhisperAvailable, transcribeWithWhisper, validateWhisperTranscription } from '../asr/local-whisper.js'
import { WhisperModels } from '../asr/whisper-models.js'
import type { WhisperModelState } from '../asr/whisper-models.js'
import { transcribeOpenAICompatible } from '../asr/openai-compatible.js'
import { fetchCloudProviderModels } from '../asr/cloud-provider-models.js'
import { transcribeDashScopeAsr } from '../asr/dashscope-asr.js'
import { cloudAsrCredentialFor, cloudAsrEndpointFor, cloudAsrModelFor, cloudProviderEntry, isCloudAsrReady } from '../asr/providers.js'
import type { AsrBackendInfo } from '../asr/types.js'
import { remoteTextFailure, remoteTextSuccess } from '../remote-contract.js'
import type { CloudProviderModelsView, EarsSettingsPatch, EarsSettingsView, RemoteTextResult } from '../remote-contract.js'
import { applySpokenEnumerationLayout } from './enumeration.js'
import { polishUserText, resolvePolishSystemPrompt } from './prompts.js'
import { resolvePolishRoute } from './route.js'
import { applyFlatSettingsPatch, flattenStoredSettings, storedSettingsNeedRewrite, unflattenEarsSettings } from '../settings-store.js'
import { checkForPluginUpdate, readInstalledAboutInfo } from '../about.js'
import { EARS_ERROR_CODES, EarsError, earsErrorCode, earsErrorParams, sanitizeEarsErrorParams, sanitizeEarsErrorText, type EarsErrorCode, type EarsErrorParams } from '../errors.js'
import type { AboutInfo, UpdateCheckResult } from '../remote-contract.js'

const MAX_TRANSCRIPT_CHARACTERS = 12_000
const MAX_POLISHED_CHARACTERS = 24_000
const POLISH_TIMEOUT_MS = 20_000
const CLOUD_MODELS_FAILURE_TTL_MS = 30_000

export class PolishService extends TypertRemoteService {
  static inject = ['llm']
  private settings: SettingsScope<Record<string, unknown>> | undefined
  private whisperAvailability: { expiresAt: number; value: Promise<boolean> } | undefined
  private cloudModelsFailure: { key: string; expiresAt: number; message: string; errorCode: EarsErrorCode; errorParams?: EarsErrorParams } | undefined
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
        cloudAsrGroqApiKeyConfigured: false,
        cloudAsrCustomApiKeyConfigured: false,
        cloudAsrBailianApiKeyConfigured: false,
        overridden: []
      }
    }

    const snapshot = flattenStoredSettings(this.settings.get())
    if (storedSettingsNeedRewrite(this.settings.get())) {
      void this.settings.update(unflattenEarsSettings(snapshot)).catch(() => undefined)
    }
    const provider = this.ctx.get('settings') as { describe?: (options: { redactSecrets: boolean }) => Array<{ ns: unknown; user?: unknown }>; writable?: boolean } | undefined
    const descriptor = provider?.describe?.({ redactSecrets: true })?.find((item) => String(item.ns) === SETTINGS_NAMESPACE)
    const user = descriptor?.user
    return {
      available: true,
      writable: provider?.writable ?? false,
      settings: {
        ...snapshot,
        cloudAsrGroqApiKey: '',
        cloudAsrCustomApiKey: '',
        cloudAsrBailianApiKey: ''
      },
      cloudAsrGroqApiKeyConfigured: snapshot.cloudAsrGroqApiKey.trim() !== '',
      cloudAsrCustomApiKeyConfigured: snapshot.cloudAsrCustomApiKey.trim() !== '',
      cloudAsrBailianApiKeyConfigured: snapshot.cloudAsrBailianApiKey.trim() !== '',
      overridden: isRecord(user) ? Object.keys(user) : []
    }
  }

  async updateSettings(patch: EarsSettingsPatch, signal: AbortSignal): Promise<EarsSettingsView> {
    if (this.settings === undefined) return this.getSettings()
    signal.throwIfAborted()
    await this.settings.update(applyFlatSettingsPatch(this.settings.get(), patch))
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
    const settings = this.settings === undefined ? DEFAULT_EARS_SETTINGS : flattenStoredSettings(this.settings.get())
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
        detail: localAvailable ? 'Whisper CLI detected on the dsh Host.' : 'Install openai-whisper and put whisper on PATH.',
        ...(localAvailable ? {} : { detailCode: EARS_ERROR_CODES.backendLocalUnavailable })
      },
      {
        id: 'cloud-openai',
        name: 'Cloud ASR',
        available: cloudAvailable,
        detail: cloudAvailable ? 'Cloud transcription is configured.' : 'Choose a cloud model and configure the API key.',
        ...(cloudAvailable ? {} : { detailCode: EARS_ERROR_CODES.backendCloudUnavailable })
      }
    ]
  }

  async listCloudProviderModels(signal: AbortSignal): Promise<CloudProviderModelsView> {
    const settings = this.settings === undefined ? DEFAULT_EARS_SETTINGS : flattenStoredSettings(this.settings.get())
    const entry = cloudProviderEntry(settings.cloudAsrProvider)
    if (entry === undefined || entry.baseUrl === undefined) return { status: 'unsupported' }
    const key = cloudAsrCredentialFor(settings)
    if (key === '') return { status: 'no-key' }
    signal.throwIfAborted()
    const now = Date.now()
    const cacheKey = `${entry.id}\0${key}`
    if (this.cloudModelsFailure !== undefined && this.cloudModelsFailure.key === cacheKey && this.cloudModelsFailure.expiresAt > now) {
      return {
        status: 'error',
        models: [],
        error: this.cloudModelsFailure.message,
        errorCode: this.cloudModelsFailure.errorCode,
        ...(this.cloudModelsFailure.errorParams === undefined ? {} : { errorParams: this.cloudModelsFailure.errorParams })
      }
    }
    try {
      const models = await fetchCloudProviderModels(entry, key, signal)
      this.cloudModelsFailure = undefined
      return { status: 'ok', models }
    } catch (error) {
      if (signal.aborted) throw error
      const message = sanitizeEarsErrorText(error instanceof Error && error.message.trim() !== '' ? error.message : 'Cloud model listing failed')
      const errorCode = earsErrorCode(error) ?? EARS_ERROR_CODES.cloudModelsListFailed
      const errorParams = sanitizeEarsErrorParams(earsErrorParams(error))
      this.cloudModelsFailure = { key: cacheKey, expiresAt: now + CLOUD_MODELS_FAILURE_TTL_MS, message, errorCode, ...(errorParams === undefined ? {} : { errorParams }) }
      return {
        status: 'error',
        models: [],
        error: message,
        errorCode,
        ...(errorParams === undefined ? {} : { errorParams })
      }
    }
  }

  async getWhisperModelState(model: string): Promise<WhisperModelState> {
    return sanitizeWhisperModelState(await this.whisperModels.getWhisperModelState(whisperModel(model), await this.whisperIsAvailable()))
  }

  async downloadWhisperModel(model: string): Promise<WhisperModelState> {
    return sanitizeWhisperModelState(await this.whisperModels.downloadWhisperModel(whisperModel(model), await this.whisperIsAvailable()))
  }

  async cancelWhisperModelDownload(model: string): Promise<WhisperModelState> {
    return sanitizeWhisperModelState(await this.whisperModels.cancelWhisperModelDownload(whisperModel(model), await this.whisperIsAvailable()))
  }

  async deleteWhisperModel(model: string): Promise<WhisperModelState> {
    return sanitizeWhisperModelState(await this.whisperModels.deleteWhisperModel(whisperModel(model), await this.whisperIsAvailable()))
  }

  getAbout(): AboutInfo {
    return readInstalledAboutInfo()
  }

  async checkForUpdate(signal: AbortSignal): Promise<UpdateCheckResult> {
    signal.throwIfAborted()
    return checkForPluginUpdate({ installed: readInstalledAboutInfo().version, signal })
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

  async transcribe(audioBase64: string, mimeType: string, signal: AbortSignal): Promise<RemoteTextResult> {
    try {
      signal.throwIfAborted()
      const settings = this.requireSettings()
      const audio = decodeAudio(audioBase64)
      const language = effectiveRecognitionLanguage(settings.language, hostUiLocale(this.ctx))
      const backend = asrBackend(settings.asrBackend)
      if (backend === 'web-speech') throw new EarsError(EARS_ERROR_CODES.asrUnsupportedBackend, 'Web Speech recordings are transcribed in the browser')
      if (backend === 'local-whisper') {
        const model = whisperModel(settings.localWhisperModel)
        const cliAvailable = await this.whisperIsAvailable()
        const state = await this.whisperModels.getWhisperModelState(model, cliAvailable)
        validateWhisperTranscription(state)
        const text = await transcribeWithWhisper({
          audio,
          mimeType,
          language,
          model,
          signal
        })
        signal.throwIfAborted()
        return remoteTextSuccess(text)
      }

      const endpoint = cloudAsrEndpointFor(settings)
      const model = cloudAsrModelFor(settings)
      if (model === '') throw new EarsError(EARS_ERROR_CODES.asrModelNotConfigured, 'The cloud ASR model is not configured')
      const providerEntry = cloudProviderEntry(settings.cloudAsrProvider)
      if (providerEntry === undefined) throw new EarsError(EARS_ERROR_CODES.asrProviderUnknown, `Unknown dsh-ears cloud ASR provider: ${settings.cloudAsrProvider}`, { provider: settings.cloudAsrProvider })
      const credential = cloudAsrCredentialFor(settings)
      if (providerEntry.apiKeyRequired && credential === '') throw new EarsError(EARS_ERROR_CODES.asrApiKeyNotConfigured, 'The cloud ASR API key is not configured')
      if (providerEntry.protocol === 'dashscope-asr') {
        const text = await transcribeDashScopeAsr({
          audio,
          mimeType,
          language,
          endpoint,
          model,
          credential,
          signal
        })
        signal.throwIfAborted()
        return remoteTextSuccess(text)
      }
      const text = await transcribeOpenAICompatible({
        audio,
        mimeType,
        language,
        endpoint,
        model,
        credential: credential === '' ? undefined : credential,
        signal
      })
      signal.throwIfAborted()
      return remoteTextSuccess(text)
    } catch (error) {
      return toRemoteTextFailure(error, signal, EARS_ERROR_CODES.asrUnexpected, 'The ASR request failed')
    }
  }

  async polish(transcript: string, provider: string, model: string, reasoningEffort: string, signal: AbortSignal): Promise<RemoteTextResult> {
    try {
      signal.throwIfAborted()
      const raw = transcript.trim()
      if (raw === '' || raw.length > MAX_TRANSCRIPT_CHARACTERS) return remoteTextSuccess(raw)
      const settings = this.settings === undefined ? DEFAULT_EARS_SETTINGS : flattenStoredSettings(this.settings.get())
      const storedPrompt = settings.polishPrompt
      const finish = (text: string): RemoteTextResult => remoteTextSuccess(storedPrompt.trim() === '' ? applySpokenEnumerationLayout(text) : text)
      const route = resolvePolishRoute(settings, provider, model)
      if (route === null) return finish(raw)
      const routeProvider = route.provider
      const routeModel = route.model

      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), POLISH_TIMEOUT_MS)
      const forwardAbort = () => timeout.abort(signal.reason)
      signal.addEventListener('abort', forwardAbort, { once: true })

      try {
        const effort = await this.resolveReasoningEffort(routeProvider, routeModel, reasoningEffort, timeout.signal)
        signal.throwIfAborted()
        if (timeout.signal.aborted) throw new EarsError(EARS_ERROR_CODES.polishTimedOut, 'The dsh LLM polishing request timed out')
        try {
          const first = await this.completePolish(routeProvider, routeModel, raw, storedPrompt, effort, timeout.signal)
          signal.throwIfAborted()
          if (effort !== undefined && first.trim() === raw && !timeout.signal.aborted && !signal.aborted) {
            try {
              const retry = await this.completePolish(routeProvider, routeModel, raw, storedPrompt, undefined, timeout.signal)
              signal.throwIfAborted()
              return finish(retry)
            } catch (error) {
              signal.throwIfAborted()
              if (error instanceof TypertLookupFailure) throw error
              return finish(first)
            }
          }
          return finish(first)
        } catch (error) {
          signal.throwIfAborted()
          if (timeout.signal.aborted) throw new EarsError(EARS_ERROR_CODES.polishTimedOut, 'The dsh LLM polishing request timed out')
          if (error instanceof TypertLookupFailure) throw error
          if (effort === undefined) throw error
          try {
            const retry = await this.completePolish(routeProvider, routeModel, raw, storedPrompt, undefined, timeout.signal)
            signal.throwIfAborted()
            return finish(retry)
          } catch (error) {
            signal.throwIfAborted()
            if (error instanceof TypertLookupFailure) throw error
            throw new EarsError(EARS_ERROR_CODES.polishRouteFailed, 'The dsh LLM route did not complete polishing')
          }
        }
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', forwardAbort)
      }
    } catch (error) {
      return toRemoteTextFailure(error, signal, EARS_ERROR_CODES.polishUnexpected, 'The dsh LLM polishing request failed')
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
    if (output === '') throw new EarsError(EARS_ERROR_CODES.polishNoText, 'The dsh LLM route returned no polished text')
    return output
  }

  private requireSettings() {
    if (this.settings === undefined) throw new EarsError(EARS_ERROR_CODES.polishSettingsUnavailable, 'dsh-ears settings are unavailable')
    return flattenStoredSettings(this.settings.get())
  }

  private async resolveReasoningEffort(provider: string, model: string, requested: string, signal: AbortSignal): Promise<string | undefined> {
    const effort = requested.trim()
    if (effort === '') return undefined
    try {
      const info = await this.ctx.llm.resolveModelInfo(provider, model, signal)
      const efforts = info.reasoning?.efforts ?? []
      return efforts.some((candidate) => candidate.id === effort) ? effort : undefined
    } catch (error) {
      if (error instanceof TypertLookupFailure) throw error
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

function toRemoteTextFailure(error: unknown, signal: AbortSignal, fallbackCode: EarsErrorCode, fallbackMessage: string): RemoteTextResult {
  if (signal.aborted) signal.throwIfAborted()
  if (error instanceof TypertLookupFailure) throw error
  const knownCode = earsErrorCode(error)
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const diagnostic = sanitizeEarsErrorText(rawMessage)
  const message = knownCode === undefined
    ? diagnostic === '' ? fallbackMessage : `${fallbackMessage}: ${diagnostic}`
    : diagnostic === '' ? fallbackMessage : diagnostic
  const params = sanitizeEarsErrorParams(earsErrorParams(error) ?? (knownCode === undefined && diagnostic !== '' ? { detail: diagnostic } : undefined))
  return remoteTextFailure(knownCode ?? fallbackCode, message, params)
}

function sanitizeWhisperModelState(state: WhisperModelState): WhisperModelState {
  const errorParams = sanitizeEarsErrorParams(state.errorParams)
  return errorParams === undefined ? state : { ...state, errorParams }
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
export function validateSettings(settings: unknown): void {
  validateEarsSettings(flattenStoredSettings(settings))
}

function decodeAudio(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'The recorded audio is not valid base64')
  const audio = Buffer.from(value, 'base64')
  if (audio.byteLength === 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The recorded audio is empty')
  if (audio.byteLength > 24 * 1024 * 1024) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, 'The recorded audio is too large')
  return new Uint8Array(audio)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hostUiLocale(ctx: Context): string {
  try {
    const provider = ctx.get('settings') as { get?: (ns: unknown) => unknown } | undefined
    const value = provider?.get?.(settingsNamespace('locale'))
    if (isRecord(value) && (value.preference === 'en' || value.preference === 'zh')) return value.preference
  } catch {
    // Tests and hosts without the locale namespace keep the Chinese fallback.
  }
  return 'zh'
}

async function collectText(stream: AsyncIterable<StreamChunk>, maxCharacters: number): Promise<string> {
  let text = ''
  let sawDelta = false

  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      text += chunk.text
      if (text.length > maxCharacters) throw new EarsError(EARS_ERROR_CODES.polishTooLarge, 'The dsh LLM polishing response is too large')
      sawDelta = true
      continue
    }

    if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
      throw new EarsError(EARS_ERROR_CODES.polishRouteFailed, 'The dsh LLM route did not complete polishing')
    }

    if (!sawDelta && chunk.type === 'block-end' && chunk.block.type === 'text') {
      text += chunk.block.text
      if (text.length > maxCharacters) throw new EarsError(EARS_ERROR_CODES.polishTooLarge, 'The dsh LLM polishing response is too large')
    }
  }

  return text.trim()
}
