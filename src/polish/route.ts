import type { EarsSettings } from '../config.js'

export interface PolishRouteSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

export type PolishRouteSource = 'requested' | 'stored' | 'agent-default'

export interface ResolvedPolishRoute extends PolishRouteSelection {
  source: PolishRouteSource
}

/** Resolve requested and stored routes as atomic pairs, then use the DSH Agent default when both are empty. */
export function resolvePolishRoute(
  settings: Pick<EarsSettings, 'polishingEnabled' | 'polishProvider' | 'polishModel'>,
  requestedProvider: string,
  requestedModel: string,
  defaultRoute?: PolishRouteSelection
): ResolvedPolishRoute | null {
  const requested = { provider: requestedProvider.trim(), model: requestedModel.trim() }
  const stored = { provider: settings.polishProvider.trim(), model: settings.polishModel.trim() }
  const requestedComplete = requested.provider !== '' && requested.model !== ''
  const requestedPartial = (requested.provider === '') !== (requested.model === '')
  const storedComplete = stored.provider !== '' && stored.model !== ''
  const storedPartial = (stored.provider === '') !== (stored.model === '')
  const enabled = settings.polishingEnabled || requestedComplete
  if (!enabled || requestedPartial) return null
  if (requestedComplete) return { source: 'requested', ...requested }
  if (storedPartial) return null
  if (storedComplete) return { source: 'stored', ...stored }
  if (defaultRoute === undefined) return null
  const provider = defaultRoute.provider.trim()
  const model = defaultRoute.model.trim()
  if (provider === '' || model === '') return null
  const reasoningEffort = defaultRoute.reasoningEffort?.trim()
  return {
    source: 'agent-default',
    provider,
    model,
    ...(reasoningEffort === undefined || reasoningEffort === '' ? {} : { reasoningEffort })
  }
}
