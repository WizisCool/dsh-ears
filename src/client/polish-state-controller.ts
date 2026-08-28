import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { PolishRoute, ReasoningEffortInfo } from '../config.js'
import type { EarsRemote } from '../remote.js'

export interface RouteState {
  status: 'loading' | 'ready'
  routes: readonly PolishRoute[]
}

export interface ReasoningEffortsState {
  status: 'loading' | 'ready'
  efforts: readonly ReasoningEffortInfo[]
  defaultEffort?: string
}

/** Owns polish route/reasoning loading and the selection memories used by the editor. */
export class PolishStateController {
  private readonly routeStore: SnapshotStore<RouteState>
  private readonly reasoningStore: SnapshotStore<ReasoningEffortsState>
  private readonly models = new Map<string, string>()
  private readonly reasoningEfforts = new Map<string, string>()
  private routeState: RouteState = { status: 'loading', routes: [] }
  private reasoningState: ReasoningEffortsState = { status: 'loading', efforts: [] }
  private routeRequest = 0
  private reasoningRequest = 0
  private disposed = false

  constructor() {
    this.routeStore = createSnapshotStore(this.routeState)
    this.reasoningStore = createSnapshotStore(this.reasoningState)
  }

  getRouteStore(): SnapshotStore<RouteState> {
    return this.routeStore
  }

  getReasoningStore(): SnapshotStore<ReasoningEffortsState> {
    return this.reasoningStore
  }

  async refreshRoutes(remote: EarsRemote, silent = this.routeState.routes.length > 0): Promise<void> {
    if (this.disposed) return
    const request = ++this.routeRequest
    if (!silent) {
      this.routeState = { status: 'loading', routes: this.routeState.routes }
      this.routeStore.set(this.routeState)
    }

    let nextState: RouteState
    try {
      const result = await remote.listRoutes()
      nextState = result.ok ? { status: 'ready', routes: result.value } : { status: 'ready', routes: this.routeState.routes }
    } catch {
      nextState = { status: 'ready', routes: this.routeState.routes }
    }
    if (!this.isCurrentRouteRequest(request)) return
    this.routeState = nextState
    this.routeStore.set(this.routeState)
  }

  async refreshReasoningEfforts(remote: EarsRemote, provider: string, model: string): Promise<void> {
    if (this.disposed) return
    const request = ++this.reasoningRequest
    this.reasoningState = { status: 'loading', efforts: [] }
    this.reasoningStore.set(this.reasoningState)
    const normalizedProvider = provider.trim()
    const normalizedModel = model.trim()
    if (normalizedProvider === '' || normalizedModel === '') {
      if (!this.isCurrentReasoningRequest(request)) return
      this.reasoningState = { status: 'ready', efforts: [] }
      this.reasoningStore.set(this.reasoningState)
      return
    }

    let nextState: ReasoningEffortsState
    try {
      const result = await remote.listReasoningEfforts(normalizedProvider, normalizedModel)
      nextState = result.ok
        ? { status: 'ready', efforts: result.value.efforts, ...(result.value.defaultEffort === undefined ? {} : { defaultEffort: result.value.defaultEffort }) }
        : { status: 'ready', efforts: [] }
    } catch {
      nextState = { status: 'ready', efforts: [] }
    }
    if (!this.isCurrentReasoningRequest(request)) return
    this.reasoningState = nextState
    this.reasoningStore.set(this.reasoningState)
  }

  rememberSelection(provider: string, model: string, reasoningEffort: string): void {
    const normalizedProvider = provider.trim()
    const normalizedModel = model.trim()
    if (normalizedProvider === '') return
    this.models.set(normalizedProvider, normalizedModel)
    this.reasoningEfforts.set(this.reasoningKey(normalizedProvider, normalizedModel), reasoningEffort.trim())
  }

  modelFor(provider: string): string {
    return this.models.get(provider) ?? ''
  }

  reasoningEffortFor(provider: string, model: string): string {
    return this.reasoningEfforts.get(this.reasoningKey(provider, model)) ?? ''
  }

  resetSelections(provider: string, model: string, reasoningEffort: string): void {
    this.models.clear()
    this.reasoningEfforts.clear()
    this.rememberSelection(provider, model, reasoningEffort)
  }

  dispose(): void {
    this.disposed = true
    this.routeRequest += 1
    this.reasoningRequest += 1
  }

  private reasoningKey(provider: string, model: string): string {
    return `${provider}\u0000${model}`
  }

  private isCurrentRouteRequest(request: number): boolean {
    return !this.disposed && request === this.routeRequest
  }

  private isCurrentReasoningRequest(request: number): boolean {
    return !this.disposed && request === this.reasoningRequest
  }
}
