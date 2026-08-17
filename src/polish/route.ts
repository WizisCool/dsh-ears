import type { EarsSettings } from '../config.js'

/** Host polish is on, or the client sent an explicit route that overrides a dormant pair. */
export function resolvePolishRoute(
  settings: Pick<EarsSettings, 'polishingEnabled' | 'polishProvider' | 'polishModel'>,
  requestedProvider: string,
  requestedModel: string
): { provider: string; model: string } | null {
  const requested = { provider: requestedProvider.trim(), model: requestedModel.trim() }
  const provider = requested.provider || settings.polishProvider.trim()
  const model = requested.model || settings.polishModel.trim()
  const enabled = settings.polishingEnabled || (requested.provider !== '' && requested.model !== '')
  if (!enabled || provider === '' || model === '') return null
  return { provider, model }
}
