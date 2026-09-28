import { vi } from 'vitest'
import { EarsSettingsSchema } from '../../src/config-schema.js'
import { DEFAULT_EARS_SETTINGS, SETTINGS_NAMESPACE, type EarsSettings } from '../../src/config.js'
import { CLOUD_ASR_PROVIDERS } from '../../src/asr/providers.js'
import { unflattenEarsSettings } from '../../src/settings-store.js'

/**
 * In-memory stand-in for the dsh 0.1.7 settings service.
 *
 * It resolves through the real `EarsSettingsSchema` and projects the result the
 * way dsh does: `value` is the resolved entry config with undeclared fields
 * removed, and `user` is the override layer. Writes resolve the candidate before
 * they land (an unresolvable document is refused, as the Host refuses it) and a
 * stale `expectedRevision` is refused. Only the surface the plugin uses is
 * modelled — `describe`, `update`, and `replace`.
 */
export type FakeSettingsForms = {
  readonly writable: boolean
  describe: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  replace: ReturnType<typeof vi.fn>
  /** Raw override layer, for assertions. */
  userSection: () => Record<string, unknown>
  /** Projected resolved document, as `describe().value` reports it. */
  resolvedSection: () => Record<string, unknown>
}

type FakeSettingsFormsOptions = {
  /** Raw profile document (stored shape, or any legacy shape). */
  stored?: unknown
  /** Whether the fake profile accepts writes. */
  writable?: boolean
  /** Reported override layer; derived from writes when omitted. */
  user?: unknown
  /** Whether `describe` reports the entry at all. */
  described?: boolean
}

const SECRET_PATHS: readonly (readonly string[])[] = CLOUD_ASR_PROVIDERS.map((provider) => {
  const definition = provider.fields.find((candidate) => candidate.field === provider.credentialField)
  return ['cloudAsr', provider.storageKey, definition?.storageKey ?? 'apiKey']
})

/** A profile document for settings that are already in their canonical flat form. */
export function settingsDocument(settings: EarsSettings | Record<string, unknown>): Record<string, unknown> {
  return unflattenEarsSettings(settings as EarsSettings) as unknown as Record<string, unknown>
}

/** Unwrap the volatile references schemastery produces for volatile fields. */
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain)
  if (value !== null && typeof value === 'object') {
    // A volatile field resolves to a reference whose only member is `get`.
    const getter = (value as { get?: unknown }).get
    if (typeof getter === 'function') return plain((getter as () => unknown).call(value))
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, plain(child)]))
  }
  return value
}

/** Resolve a raw document through the real schema, the way the Host resolves an entry config. */
function resolveDocument(raw: unknown): Record<string, unknown> {
  const result = EarsSettingsSchema['~standard'].validate(raw)
  if (result.issues) throw new Error(`settings did not resolve: ${JSON.stringify(result.issues)}`)
  return plain(result.value) as Record<string, unknown>
}

/**
 * Keep only the fields the form declares.
 *
 * dsh projects an entry config onto its Config schema before a settings caller
 * sees it, so an undeclared stored field — every pre-0.3 flat key, for example —
 * is invisible through this service.
 */
function project(schema: unknown, value: unknown): unknown {
  if (!isRecord(value)) return value
  const dict = (schema as { dict?: Record<string, unknown> }).dict
  if (dict === undefined) return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(dict)) {
    if (!(key in value)) continue
    result[key] = project(child, value[key])
  }
  return result
}

function projectDocument(raw: unknown): Record<string, unknown> {
  return project(EarsSettingsSchema, resolveDocument(raw)) as Record<string, unknown>
}

function merge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return structuredClone(patch)
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) result[key] = merge(result[key], value)
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueAt(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const segment of path) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }
  return current
}

export function createFakeSettingsForms(options: FakeSettingsFormsOptions = {}): FakeSettingsForms {
  const writable = options.writable ?? true
  const described = options.described ?? true
  let config: unknown = options.stored ?? {}
  let user: unknown = options.user
  let revision = 0

  const describe = vi.fn((describeOptions?: { redactSecrets?: boolean }) => {
    if (!described) return []
    const redact = describeOptions?.redactSecrets === true
    const value = projectDocument(config)
    const userLayer = user === undefined ? undefined : projectDocument(user)
    return [{
      ns: SETTINGS_NAMESPACE,
      autoGenerate: false,
      schema: EarsSettingsSchema.toJSON(),
      value: redact ? removeSecrets(value) : value,
      ...(userLayer === undefined ? {} : { user: redact ? removeSecrets(userLayer) : userLayer }),
      revision,
      applies: 'live',
      ...(redact
        ? { secrets: SECRET_PATHS.map((path) => ({ path: [...path], set: valueAt(value, path) !== undefined && valueAt(value, path) !== '' })) }
        : {})
    }]
  })

  const write = async (nextConfig: unknown, expectedRevision?: number): Promise<void> => {
    if (!writable) throw new Error('the profile is read-only')
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      throw new Error(`settings conflict: expected ${expectedRevision}, at ${revision}`)
    }
    // An unresolvable document is refused before it is persisted, as the Host does.
    resolveDocument(nextConfig)
    config = nextConfig
    revision += 1
  }

  const update = vi.fn(async (_ns: unknown, patch: object, expectedRevision?: number) => {
    // The override layer holds explicit fields only, so it starts empty.
    const nextUser = merge(user ?? {}, patch)
    await write(merge(config, patch), expectedRevision)
    user = nextUser
  })

  const replace = vi.fn(async (_ns: unknown, section: object, expectedRevision?: number) => {
    await write(structuredClone(section), expectedRevision)
    user = structuredClone(section)
  })

  return {
    writable,
    describe,
    update,
    replace,
    userSection: () => (user === undefined ? {} : (user as Record<string, unknown>)),
    resolvedSection: () => projectDocument(config)
  }
}

function removeSecrets(value: unknown): unknown {
  if (!isRecord(value)) return value
  const result: Record<string, unknown> = { ...value }
  for (const path of SECRET_PATHS) {
    if (path.length === 1) {
      delete result[path[0] as string]
      continue
    }
    const [head, ...rest] = path
    const branch = result[head as string]
    if (!isRecord(branch)) continue
    const slot = { ...branch }
    let cursor: Record<string, unknown> = slot
    for (const segment of rest.slice(0, -1)) {
      const child = cursor[segment]
      if (!isRecord(child)) break
      cursor[segment] = { ...child }
      cursor = cursor[segment] as Record<string, unknown>
    }
    delete cursor[rest[rest.length - 1] as string]
    result[head as string] = slot
  }
  return result
}
