import type { SettingsDescriptor, SettingsForms } from '@deepseek-ai/dsh-settings'
import { SETTINGS_NAMESPACE } from '../config.js'

/**
 * The dsh settings service surface this plugin uses.
 *
 * dsh 0.1.7 replaced the namespace `register()`/scope model with profile-entry
 * forms: the service derives a form from the plugin entry's exported `Config`,
 * `describe()` reads the resolved entry config, and `update()`/`replace()` write
 * it back. The plugin declares its own `Config`, so the entry config *is* the
 * dsh-ears settings document and this module is the only place that talks to
 * that service.
 */
export type EarsSettingsProvider = SettingsForms

/** Read one resolved dsh-ears entry form, or undefined while it is unavailable. */
export function findEarsSettingsForm(
  provider: EarsSettingsProvider | undefined,
  redactSecrets: boolean
): SettingsDescriptor | undefined {
  if (provider === undefined) return undefined
  try {
    return provider.describe({ redactSecrets }).find((item) => String(item.ns) === SETTINGS_NAMESPACE)
  } catch {
    // A service without a settled composition still answers settings reads with
    // safe defaults instead of failing every voice request.
    return undefined
  }
}

/**
 * Read the resolved settings the plugin acts on.
 *
 * The resolved entry config carries schema defaults, the composition base layer,
 * and the user layer, with `role('secret')` values intact. `userLayerAvailable`
 * reports whether the profile holds an explicit user override, which decides
 * whether a canonicalizing migration may rewrite the entry config.
 */
export function readEarsSettingsRaw(provider: EarsSettingsProvider | undefined): { raw: unknown; userLayerAvailable: boolean } {
  const form = findEarsSettingsForm(provider, false)
  if (form === undefined || form.value === undefined) return { raw: {}, userLayerAvailable: false }
  return { raw: form.value, userLayerAvailable: form.user !== undefined }
}

/**
 * The revision a write must still be standing on.
 *
 * dsh refuses a write whose `expectedRevision` moved, so reading it immediately
 * before the write turns a concurrent settings change into a rejection instead
 * of a silent overwrite.
 */
export function earsSettingsRevision(provider: EarsSettingsProvider | undefined): number | undefined {
  return findEarsSettingsForm(provider, true)?.revision
}

/** Merge one nested settings patch into the profile's user layer. */
export async function updateEarsSettingsPatch(provider: EarsSettingsProvider | undefined, patch: object): Promise<void> {
  if (provider === undefined) return
  await provider.update(SETTINGS_NAMESPACE, patch, earsSettingsRevision(provider))
}

/** Replace the profile's user layer with one complete nested settings section. */
export async function replaceEarsSettingsSection(provider: EarsSettingsProvider | undefined, section: object): Promise<void> {
  if (provider === undefined) return
  await provider.replace(SETTINGS_NAMESPACE, section, earsSettingsRevision(provider))
}
