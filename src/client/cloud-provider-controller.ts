import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { CLOUD_ASR_PROVIDERS, cloudAsrModelField, cloudAsrModelSupportsService, supportsModelListing, type CloudAsrModelField } from '../asr/providers.js'
import type { EarsSettings } from '../config.js'
import { EARS_ERROR_CODES, isEarsErrorCode } from '../errors.js'
import type { CloudProviderModelsView } from '../remote-contract.js'
import type { EarsRemote } from '../remote.js'

export interface CloudModelsView {
  status: 'loading' | 'ready'
  view: CloudProviderModelsView
}

export const EMPTY_CLOUD_MODELS_VIEW: CloudModelsView = Object.freeze({
  status: 'ready',
  view: Object.freeze({ status: 'unsupported' })
})

/** Owns provider-specific model memory and the stale-response guard for model loading. */
export class CloudProviderController {
  private readonly store: SnapshotStore<CloudModelsView>
  private readonly models = new Map<string, string>()
  private request = 0
  private disposed = false
  private listingAbort: AbortController | undefined
  private view: CloudModelsView = { status: 'loading', view: { status: 'unsupported' } }

  constructor() {
    this.store = createSnapshotStore(this.view)
  }

  getStore(): SnapshotStore<CloudModelsView> {
    return this.store
  }

  remember(provider: string, model: string): void {
    const normalized = provider.trim()
    if (normalized === '') return
    this.models.set(normalized, model.trim())
  }

  rememberSettings(settings: EarsSettings): void {
    for (const provider of CLOUD_ASR_PROVIDERS) {
      this.remember(provider.id, settings[provider.modelField])
    }
  }

  reset(settings: EarsSettings): void {
    this.models.clear()
    this.rememberSettings(settings)
    this.invalidate()
  }

  /** Invalidate a catalog whose credentials or selected settings no longer match the request. */
  invalidate(): void {
    if (this.disposed) return
    this.request += 1
    this.listingAbort?.abort()
    this.listingAbort = undefined
    this.setView({ status: 'ready', view: { status: 'unsupported' } })
  }

  modelFor(provider: string, settings: EarsSettings, drafts: ReadonlyMap<string, string>): string {
    const normalizedProvider = provider.trim()
    const field = this.fieldFor(normalizedProvider)
    const selected = drafts.get(field) ?? settings[field]
    const normalizedSelected = selected.trim()
    return normalizedSelected === '' ? this.models.get(normalizedProvider) ?? '' : normalizedSelected
  }

  fieldFor(provider: string): CloudAsrModelField {
    return cloudAsrModelField(provider) ?? 'cloudAsrGroqModel'
  }

  async refresh(remote: EarsRemote, provider: string, service = ''): Promise<void> {
    if (this.disposed) return
    const request = ++this.request
    this.listingAbort?.abort()
    const listingAbort = new AbortController()
    this.listingAbort = listingAbort
    if (!this.isListable(provider)) {
      this.setView({ status: 'ready', view: { status: 'unsupported' } })
      this.listingAbort = undefined
      return
    }
    this.setView({ status: 'loading', view: { status: 'unsupported' } })
    try {
      // The provider is captured at call time so a staged switch cannot make
      // a late response resolve credentials for a different provider.
      const result = await remote.listCloudProviderModels(provider, listingAbort.signal)
      if (!this.isCurrent(request)) return
      const view: CloudProviderModelsView = result.ok
        ? projectCloudProviderModels(provider, service, result.value)
        : {
            status: 'error',
            models: [],
            error: result.error.message,
            errorCode: isEarsErrorCode(result.error.code) ? result.error.code : EARS_ERROR_CODES.cloudModelsListFailed,
            errorParams: { detail: result.error.message }
          }
      this.setView({ status: 'ready', view })
    } catch {
      if (!this.isCurrent(request)) return
      this.setView({ status: 'ready', view: { status: 'error', models: [], error: 'Could not fetch the model list', errorCode: EARS_ERROR_CODES.cloudModelsListFailed, errorParams: { detail: 'Could not fetch the model list' } } })
    } finally {
      if (this.listingAbort === listingAbort) this.listingAbort = undefined
    }
  }

  dispose(): void {
    this.disposed = true
    this.request += 1
    this.listingAbort?.abort()
    this.listingAbort = undefined
  }

  private isListable(provider: string): boolean {
    return supportsModelListing(provider)
  }

  private isCurrent(request: number): boolean {
    return !this.disposed && request === this.request
  }

  private setView(view: CloudModelsView): void {
    this.view = view
    this.store.set(view)
  }
}

function projectCloudProviderModels(provider: string, service: string, view: CloudProviderModelsView): CloudProviderModelsView {
  // Older Hosts/catalog endpoints do not carry capability metadata. Preserve
  // their model list for compatibility; an explicitly supplied capability map
  // is the point at which service filtering becomes authoritative.
  if (view.models === undefined || view.modelCapabilities === undefined) return view
  return {
    ...view,
    models: view.models.filter((model) => cloudAsrModelSupportsService(provider, service, view.modelCapabilities?.[model]))
  }
}
