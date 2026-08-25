import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { TypertLookupFailure, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { LlmModelInfo, ReasoningEffortId, StreamChunk } from '@deepseek-ai/dsh-llm'
import { ASR_BACKEND_IDS, DEFAULT_EARS_SETTINGS, SETTINGS_NAMESPACE, WHISPER_ACCELERATION_IDS, WHISPER_MODEL_IDS, effectiveRecognitionLanguage, validateEarsSettings, type AsrBackendId, type EarsSettings, type PolishRoute, type ReasoningEffortsView, type WhisperAccelerationId, type WhisperModelId } from '../config.js'
import { EarsSettingsSchema } from '../config-schema.js'
import { disposeWhisperRuntime, isWhisperAvailable, releaseWhisperModelContext, transcribeWithWhisper, validateWhisperTranscription, whisperAccelerationCapabilities, WhisperRestartRequiredError, type WhisperAccelerationCapabilities } from '../asr/local-whisper.js'
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
import { applyFlatSettingsPatch, flattenOverriddenSettings, flattenStoredSettings, normalizeStoredEarsSettings, storedSettingsNeedRewrite, unflattenEarsSettings } from '../settings-store.js'
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
  private settingsMigrationAttempted = false
  private readonly whisperCapabilities: WhisperAccelerationCapabilities
  private whisperAvailability: { variant: WhisperAccelerationId; expiresAt: number; value: Promise<boolean> } | undefined
  private cloudModelsFailure: { key: string; expiresAt: number; message: string; errorCode: EarsErrorCode; errorParams?: EarsErrorParams } | undefined
  private readonly whisperModels = new WhisperModels()

  constructor(ctx: Context) {
    super(ctx, 'dshEarsPolish', { namespace: 'dshEars' })
    this.whisperCapabilities = whisperAccelerationCapabilities()
    ctx.effect(() => async () => {
      this.whisperModels.dispose()
      await disposeWhisperRuntime()
    }, 'dsh-ears whisper runtime lifecycle')
    ctx.inject(['settings'], (settingsCtx) => {
      this.settings = settingsCtx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), EarsSettingsSchema, {
        validate: validateSettings
      })
      this.settingsMigrationAttempted = false
      this.whisperAvailability = undefined
      settingsCtx.effect(() => () => {
        this.settings = undefined
        this.settingsMigrationAttempted = false
        this.whisperAvailability = undefined
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
        localWhisperAccelerations: [...this.whisperCapabilities.available],
        overridden: []
      }
    }

    const snapshot = this.readSettingsSnapshot().settings
    const provider = this.ctx.get('settings') as { describe?: (options: { redactSecrets: boolean }) => Array<{ ns: unknown; user?: unknown; secrets?: Array<{ path: string[]; set: boolean }> }>; writable?: boolean } | undefined
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
      localWhisperAccelerations: [...this.whisperCapabilities.available],
      overridden: flattenOverriddenSettings(user, descriptor?.secrets)
    }
  }

  async updateSettings(patch: EarsSettingsPatch, signal: AbortSignal): Promise<EarsSettingsView> {
    if (this.settings === undefined) return this.getSettings()
    signal.throwIfAborted()
    const current = this.readSettingsSnapshot()
    const next = normalizeWhisperStoredSettings(applyFlatSettingsPatch(current.raw, patch), this.whisperCapabilities)
    await this.replaceSettings(next)
    // A successful acceleration write establishes a new availability context.
    // Unrelated settings writes keep the short-lived native availability cache.
    if (patch.localWhisperAcceleration !== undefined) this.whisperAvailability = undefined
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
    const settings = this.settings === undefined ? DEFAULT_EARS_SETTINGS : this.readSettingsSnapshot().settings
    const acceleration = whisperAcceleration(settings.localWhisperAcceleration)
    let localAvailable = false
    let localRestart: WhisperRestartRequiredError | undefined
    try {
      localAvailable = await this.whisperIsAvailable(acceleration)
    } catch (error) {
      if (!isWhisperRestartRequiredError(error)) throw error
      localRestart = error
    }
    const cloudAvailable = await this.cloudAsrIsAvailable(settings)
    const localDetail = localRestart === undefined
      ? localAvailable ? 'The whisper.node native runtime is available' : 'The selected Local Whisper native runtime is unavailable'
      : whisperRestartMessage(localRestart)
    return [
      {
        id: 'web-speech',
        name: 'Web Speech',
        available: true,
        detail: 'Browser-provided live recognition; availability depends on the browser'
      },
      {
        id: 'local-whisper',
        name: 'Local Whisper',
        available: localRestart === undefined && localAvailable,
        detail: localDetail,
        ...(localRestart === undefined
          ? localAvailable ? {} : { detailCode: EARS_ERROR_CODES.backendLocalUnavailable }
          : { detailCode: EARS_ERROR_CODES.whisperRestartRequired, detailParams: whisperRestartParams(localRestart) })
      },
      {
        id: 'cloud-openai',
        name: 'Cloud ASR',
        available: cloudAvailable,
        detail: cloudAvailable ? 'Cloud transcription is configured' : 'Choose a cloud model and configure the API key',
        ...(cloudAvailable ? {} : { detailCode: EARS_ERROR_CODES.backendCloudUnavailable })
      }
    ]
  }

  async listCloudProviderModels(signal: AbortSignal): Promise<CloudProviderModelsView> {
    const settings = this.settings === undefined ? DEFAULT_EARS_SETTINGS : this.readSettingsSnapshot().settings
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
    return this.withWhisperModelState(model, (id, runtimeAvailable) => this.whisperModels.getWhisperModelState(id, runtimeAvailable))
  }

  async downloadWhisperModel(model: string): Promise<WhisperModelState> {
    return this.withWhisperModelState(model, (id, runtimeAvailable) => this.whisperModels.downloadWhisperModel(id, runtimeAvailable))
  }

  async cancelWhisperModelDownload(model: string): Promise<WhisperModelState> {
    return this.withWhisperModelState(model, (id, runtimeAvailable) => this.whisperModels.cancelWhisperModelDownload(id, runtimeAvailable))
  }

  async deleteWhisperModel(model: string): Promise<WhisperModelState> {
    return this.withWhisperModelState(model, async (id, runtimeAvailable) => {
      await releaseWhisperModelContext()
      return this.whisperModels.deleteWhisperModel(id, runtimeAvailable)
    })
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
        const acceleration = whisperAcceleration(settings.localWhisperAcceleration)
        const runtimeAvailable = await this.whisperIsAvailable(acceleration)
        const state = await this.whisperModels.getWhisperModelState(model, runtimeAvailable)
        validateWhisperTranscription(state)
        const text = await transcribeWithWhisper({
          audio,
          mimeType,
          language,
          model,
          variant: acceleration,
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
      const settings = this.settings === undefined ? DEFAULT_EARS_SETTINGS : this.readSettingsSnapshot().settings
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
    return this.readSettingsSnapshot().settings
  }

  private readSettingsSnapshot(): { raw: unknown; settings: EarsSettings } {
    const scope = this.settings
    if (scope === undefined) throw new EarsError(EARS_ERROR_CODES.polishSettingsUnavailable, 'dsh-ears settings are unavailable')
    const raw = this.readRawSettings(scope)
    const canonical = normalizeStoredEarsSettings(raw)
    const normalized = normalizeWhisperStoredSettings(canonical, this.whisperCapabilities)
    const settings = flattenStoredSettings(normalized)
    if (!this.settingsMigrationAttempted && (storedSettingsNeedRewrite(raw) || normalized !== canonical)) {
      // Mark before starting the write. A read-only provider or a rejected
      // migration must not turn every runtime read into another write attempt.
      this.settingsMigrationAttempted = true
      void this.replaceSettings(normalized).catch(() => undefined)
    }
    return { raw, settings }
  }

  private readRawSettings(scope: SettingsScope<Record<string, unknown>>): unknown {
    const provider = this.ctx.get('settings') as {
      describe?: (options: { redactSecrets: boolean }) => Array<{ ns: unknown; user?: unknown }>
    } | undefined
    try {
      const descriptor = provider?.describe?.({ redactSecrets: false })?.find((item) => String(item.ns) === SETTINGS_NAMESPACE)
      if (descriptor?.user !== undefined) return descriptor.user
    } catch {
      // A provider without same-process raw inspection still has a resolved scope.
    }
    return scope.get()
  }

  private replaceSettings(next: Record<string, unknown>): Promise<void> {
    const scope = this.settings
    if (scope === undefined) return Promise.resolve()
    // Replace is deliberate: merging a canonical V2 document would leave
    // legacy flat keys in the persisted namespace.
    return scope.replace(next)
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

  private currentWhisperAcceleration(): WhisperAccelerationId {
    const settings = this.settings === undefined ? DEFAULT_EARS_SETTINGS : this.readSettingsSnapshot().settings
    return whisperAcceleration(settings.localWhisperAcceleration)
  }

  private async whisperIsAvailable(variant: WhisperAccelerationId): Promise<boolean> {
    const now = Date.now()
    if (this.whisperAvailability !== undefined && this.whisperAvailability.variant === variant && this.whisperAvailability.expiresAt > now) {
      return this.whisperAvailability.value
    }

    const value = isWhisperAvailable(variant)
    this.whisperAvailability = { variant, expiresAt: now + 30_000, value }
    try {
      return await value
    } catch (error) {
      // A restart-required result is derived from process state, not a stable
      // availability result. Do not retain a rejected Promise that can outlive
      // an in-flight first load or a later settings write.
      if (this.whisperAvailability?.value === value) this.whisperAvailability = undefined
      throw error
    }
  }

  private async withWhisperModelState(
    model: string,
    operation: (model: WhisperModelId, runtimeAvailable: boolean) => Promise<WhisperModelState>
  ): Promise<WhisperModelState> {
    const id = whisperModel(model)
    let restart: WhisperRestartRequiredError | undefined
    let runtimeAvailable = false
    try {
      runtimeAvailable = await this.whisperIsAvailable(this.currentWhisperAcceleration())
    } catch (error) {
      if (!isWhisperRestartRequiredError(error)) throw error
      restart = error
    }

    const state = await operation(id, runtimeAvailable)
    if (restart === undefined) return sanitizeWhisperModelState(state)
    return sanitizeWhisperModelState({
      ...state,
      runtimeAvailable: false,
      error: whisperRestartMessage(restart),
      errorCode: EARS_ERROR_CODES.whisperRestartRequired,
      errorParams: whisperRestartParams(restart)
    })
  }

  private async cloudAsrIsAvailable(settings: EarsSettings): Promise<boolean> {
    return isCloudAsrReady(settings)
  }
}

function toRemoteTextFailure(error: unknown, signal: AbortSignal, fallbackCode: EarsErrorCode, fallbackMessage: string): RemoteTextResult {
  if (signal.aborted) signal.throwIfAborted()
  if (error instanceof TypertLookupFailure) throw error
  if (isWhisperRestartRequiredError(error)) {
    return remoteTextFailure(EARS_ERROR_CODES.whisperRestartRequired, whisperRestartMessage(error), whisperRestartParams(error))
  }
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
  const error = state.error === null || state.error === undefined ? null : sanitizeEarsErrorText(state.error)
  const errorParams = sanitizeJsonErrorParams(state.errorParams)
  return {
    runtimeAvailable: state.runtimeAvailable === true,
    downloaded: state.downloaded === true,
    downloading: state.downloading === true,
    progress: finiteNumberOrNull(state.progress),
    bytes: finiteNumberOrNull(state.bytes),
    totalBytes: finiteNumberOrNull(state.totalBytes),
    error,
    ...(typeof state.errorCode === 'string' ? { errorCode: state.errorCode } : {}),
    ...(errorParams === undefined ? {} : { errorParams })
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

function whisperAcceleration(value: string): WhisperAccelerationId {
  if ((WHISPER_ACCELERATION_IDS as readonly string[]).includes(value)) return value as WhisperAccelerationId
  throw new Error(`Unknown dsh-ears Whisper acceleration: ${value}`)
}

function normalizeWhisperStoredSettings(
  stored: ReturnType<typeof normalizeStoredEarsSettings>,
  capabilities: WhisperAccelerationCapabilities
): ReturnType<typeof normalizeStoredEarsSettings> {
  const settings = flattenStoredSettings(stored)
  const acceleration = (capabilities.available as readonly string[]).includes(settings.localWhisperAcceleration)
    ? settings.localWhisperAcceleration as WhisperAccelerationId
    : capabilities.default
  return acceleration === settings.localWhisperAcceleration ? stored : unflattenEarsSettings(settings, acceleration)
}

function isWhisperRestartRequiredError(error: unknown): error is WhisperRestartRequiredError {
  return error instanceof WhisperRestartRequiredError
}

function whisperRestartMessage(error: WhisperRestartRequiredError): string {
  return `Restart dsh to switch Local Whisper acceleration from "${error.loadedVariant}" to "${error.requestedVariant}"`
}

function whisperRestartParams(error: WhisperRestartRequiredError): EarsErrorParams {
  return {
    loadedVariant: error.loadedVariant,
    requestedVariant: error.requestedVariant
  }
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function sanitizeJsonErrorParams(params: EarsErrorParams | undefined): EarsErrorParams | undefined {
  const sanitized = sanitizeEarsErrorParams(params)
  if (sanitized === undefined) return undefined
  return Object.fromEntries(Object.entries(sanitized).filter(([, value]) => typeof value === 'string' || Number.isFinite(value))) as EarsErrorParams
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
