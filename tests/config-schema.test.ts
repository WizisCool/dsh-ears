import { describe, expect, it } from 'vitest'
import { EarsSettingsSchema } from '../src/config-schema.js'
import { DSH_COMPATIBILITY } from '../src/about.js'
import { EARS_SETTINGS_SCHEMA_VERSION, DEFAULT_EARS_SETTINGS, SETTINGS_NAMESPACE } from '../src/config.js'
import { CLOUD_ASR_PROVIDERS } from '../src/asr/providers.js'
import { defaultStoredEarsSettings, flattenStoredSettings, unflattenEarsSettings } from '../src/settings-store.js'
import { findEarsSettingsForm, readEarsSettingsRaw, replaceEarsSettingsSection, updateEarsSettingsPatch } from '../src/settings/host-settings.js'
import { createFakeSettingsForms } from './helpers/settings-forms.js'

/**
 * dsh derives the plugin's settings form from the exported `Config`, and each
 * leaf's mode decides how a write is applied:
 *
 * - `volatile()` makes a write a live commit into the running references, so
 *   saving a field never recomposes the entry (dsh 0.1.7 loader behavior).
 * - `loose()` falls back to the default instead of failing resolution, so one
 *   corrupt stored value cannot stop the plugin from loading.
 */

type Leaf = { meta: { volatile?: boolean; loose?: boolean; role?: string; default?: unknown }; type: string; dict?: Record<string, Leaf> }

function walkLeaves(schema: Leaf, prefix: readonly string[] = []): Array<{ path: string[]; leaf: Leaf }> {
  const dict = schema.dict ?? {}
  const leaves: Array<{ path: string[]; leaf: Leaf }> = []
  for (const [key, child] of Object.entries(dict)) {
    if (child.type === 'object' && child.dict !== undefined) leaves.push(...walkLeaves(child, [...prefix, key]))
    else leaves.push({ path: [...prefix, key], leaf: child })
  }
  return leaves
}

const leaves = walkLeaves(EarsSettingsSchema as unknown as Leaf)

function resolve(raw: unknown): Record<string, unknown> {
  const result = EarsSettingsSchema['~standard'].validate(raw)
  if (result.issues) throw new Error(`settings did not resolve: ${JSON.stringify(result.issues)}`)
  return unpick(result.value) as Record<string, unknown>
}

function unpick(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unpick)
  if (value !== null && typeof value === 'object') {
    const getter = (value as { get?: unknown }).get
    if (typeof getter === 'function') return unpick((getter as () => unknown).call(value))
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, unpick(child)]))
  }
  return value
}

describe('exported plugin Config', () => {
  it('marks every leaf volatile and loose so writes stay live and corruption stays recoverable', () => {
    expect(leaves.length).toBeGreaterThan(0)
    for (const { path, leaf } of leaves) {
      expect(leaf.meta.volatile, path.join('.')).toBe(true)
      expect(leaf.meta.loose, path.join('.')).toBe(true)
      expect(leaf.meta.default, path.join('.')).toBeDefined()
    }
  })

  it('keeps the credential fields secret so dsh redacts them on the wire', () => {
    for (const provider of CLOUD_ASR_PROVIDERS) {
      const leaf = leaves.find((candidate) => candidate.path.join('.') === `cloudAsr.${provider.storageKey}.${provider.fields.find((field) => field.field === provider.credentialField)?.storageKey}`)
      expect(leaf?.leaf.meta.role, provider.id).toBe('secret')
    }
  })

  it('resolves the shipped defaults without a stored document', () => {
    expect(resolve({})).toEqual(unflattenEarsSettings(DEFAULT_EARS_SETTINGS))
    expect(resolve({}).schemaVersion).toBe(EARS_SETTINGS_SCHEMA_VERSION)
  })

  it('falls back to the field default instead of failing resolution on a corrupt stored value', () => {
    expect(resolve({ general: { displayName: 42 } }).general).toMatchObject({ displayName: DEFAULT_EARS_SETTINGS.settingsDisplayName })
  })

  it('preserves fields it does not declare', () => {
    // dsh imports a legacy settings document into the entry config; an
    // undeclared field must survive resolution rather than fail the load.
    expect(resolve({ someOtherToolField: 'keep me' })).toHaveProperty('someOtherToolField', 'keep me')
  })

  it('round-trips the stored shape the settings service persists', () => {
    expect(flattenStoredSettings(defaultStoredEarsSettings())).toEqual(DEFAULT_EARS_SETTINGS)
  })
})

describe('host settings access', () => {
  it('reads the resolved entry config and reports the user layer', () => {
    const stored = unflattenEarsSettings({ ...DEFAULT_EARS_SETTINGS, cloudAsrGroqApiKey: 'gsk_stored' })
    const provider = createFakeSettingsForms({ stored })
    expect(readEarsSettingsRaw(provider).userLayerAvailable).toBe(false)
    expect(flattenStoredSettings(readEarsSettingsRaw(provider).raw)).toMatchObject({ cloudAsrGroqApiKey: 'gsk_stored' })

    const withUser = createFakeSettingsForms({ stored, user: {} })
    expect(readEarsSettingsRaw(withUser).userLayerAvailable).toBe(true)
  })

  it('answers reads with defaults while the entry is not described', () => {
    const provider = createFakeSettingsForms({ described: false })
    expect(findEarsSettingsForm(provider, false)).toBeUndefined()
    expect(readEarsSettingsRaw(provider).revision).toBeUndefined()
    expect(flattenStoredSettings(readEarsSettingsRaw(provider).raw)).toEqual(DEFAULT_EARS_SETTINGS)
  })

  it('answers reads without a settings service at all', () => {
    expect(findEarsSettingsForm(undefined, true)).toBeUndefined()
    expect(readEarsSettingsRaw(undefined)).toEqual({ raw: {}, userLayerAvailable: false, revision: undefined })
  })

  it('merges a nested patch into the user layer at the entry id', async () => {
    const provider = createFakeSettingsForms()
    await updateEarsSettingsPatch(provider, { polishing: { enabled: false } }, readEarsSettingsRaw(provider).revision)
    expect(provider.update).toHaveBeenCalledWith(SETTINGS_NAMESPACE, { polishing: { enabled: false } }, 0)
    expect(provider.resolvedSection().polishing).toMatchObject({ enabled: false })
  })

  it('replaces the user layer wholesale', async () => {
    const provider = createFakeSettingsForms()
    const section = unflattenEarsSettings(DEFAULT_EARS_SETTINGS)
    await replaceEarsSettingsSection(provider, section, readEarsSettingsRaw(provider).revision)
    expect(provider.replace).toHaveBeenCalledWith(SETTINGS_NAMESPACE, section, 0)
  })

  it('refuses a write built from a snapshot whose revision moved', async () => {
    const provider = createFakeSettingsForms()
    const stale = readEarsSettingsRaw(provider).revision
    await updateEarsSettingsPatch(provider, { polishing: { enabled: false } }, readEarsSettingsRaw(provider).revision)
    await expect(updateEarsSettingsPatch(provider, { polishing: { enabled: true } }, stale)).rejects.toThrow('settings conflict')
  })

  it('reports the configured dsh range the About page shows', () => {
    expect(DSH_COMPATIBILITY).toBe('>=0.1.7-rc.2')
  })
})
