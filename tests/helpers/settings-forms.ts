import { vi } from 'vitest'
import { EarsSettingsSchema } from '../../src/config-schema.js'
import { DEFAULT_EARS_SETTINGS, SETTINGS_NAMESPACE, type EarsSettings } from '../../src/config.js'
import { CLOUD_ASR_PROVIDERS } from '../../src/asr/providers.js'
import { unflattenEarsSettings } from '../../src/settings-store.js'

/**
 * In-memory stand-in for the dsh 0.1.7 settings service.
 *
 * It resolves stored values through the real `EarsSettingsSchema`, so defaults,
 * `loose()` fallbacks, and `role('secret')` slots behave as they do on a Host,
 * and it enforces the same pieces of the write contract the plugin relies on:
 * writes are validated before they land, and a stale `expectedRevision` is
 * refused. Layer semantics match dsh: `value` is the resolved document, `user`
 * exists only once something was written.
 */
export type FakeSettingsForms = {
  readonly writable: boolean
  describe: (options?: { redactSecrets?: boolean }) => unknown[]
  update: ReturnType<typeof vi.fn>
  replace: ReturnType<typeof vi.fn>
  mutate: ReturnType<typeof vi.fn>
  /** Raw user layer, for assertions. */
  userSection: () => Record<string, unknown>
  /** Resolved document, for assertions. */
  resolvedSection: () => Record<string, unknown>
}

type FakeSettingsFormsOptions = {
  /** Stored settings; a flat `EarsSettings` object is converted to the stored shape. */
  stored?: unknown
  /** Whether the fake profile accepts writes. */
  writable?: boolean
  /** Reported user layer; derived from writes when omitted. */
  user?: unknown
  /** Whether `describe` reports the entry at all. */
  described?: boolean
}

const SECRET_PATHS: readonly (readonly string[])[] = CLOUD_ASR_PROVIDERS.map((provider) => {
  const definition = provider.fields.find((candidate) => candidate.field === provider.credentialField)
  return ['cloudAsr', provider.storageKey, definition?.storageKey ?? 'apiKey']
})

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

/** Resolve raw settings exactly as the settings service resolves an entry config. */
export function resolveStoredSettings(raw: unknown): Record<string, unknown> {
  const result = EarsSettingsSchema['~standard'].validate(raw)
  if (result.issues) throw new Error(`settings did not resolve: ${JSON.stringify(result.issues)}`)
  return plain(result.value) as Record<string, unknown>
}

function storedShape(settings: unknown): Record<string, unknown> {
  if (settings === undefined) return unflattenEarsSettings(DEFAULT_EARS_SETTINGS) as unknown as Record<string, unknown>
  const record = settings as Record<string, unknown>
  return 'schemaVersion' in record ? record : unflattenEarsSettings(settings as EarsSettings) as unknown as Record<string, unknown>
}

function merge(base: unknown, patch: unknown): unknown {
  if (!isRecord(base) || !isRecord(patch)) return patch
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
  let resolved = storedShape(options.stored)
  let user: unknown = options.user
  let revision = 0

  const describe = vi.fn((describeOptions?: { redactSecrets?: boolean }) => {
    if (!described) return []
    const redact = describeOptions?.redactSecrets === true
    const redacted = redact ? removeSecrets(resolved) : resolved
    return [{
      ns: SETTINGS_NAMESPACE,
      autoGenerate: false,
      schema: EarsSettingsSchema.toJSON(),
      value: redacted,
      ...(user === undefined ? {} : { user: redact ? removeSecrets(user) : user }),
      revision,
      applies: 'live',
      ...(redact
        ? { secrets: SECRET_PATHS.map((path) => ({ path: [...path], set: valueAt(resolved, path) !== undefined && valueAt(resolved, path) !== '' })) }
        : {})
    }]
  })

  const write = async (next: unknown, expectedRevision?: number): Promise<void> => {
    if (!writable) throw new Error('the profile is read-only')
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      throw new Error(`settings conflict: expected ${expectedRevision}, at ${revision}`)
    }
    // A Host resolves the entry config, so an invalid document is refused
    // before it is persisted.
    resolveStoredSettings(next)
    resolved = next as Record<string, unknown>
    revision += 1
  }

  const update = vi.fn(async (_ns: unknown, patch: object, expectedRevision?: number) => {
    const nextUser = merge(user === undefined ? resolved : user, patch)
    await write(merge(resolved, patch), expectedRevision)
    user = nextUser
  })

  const replace = vi.fn(async (_ns: unknown, section: object, expectedRevision?: number) => {
    await write(section, expectedRevision)
    user = section
  })

  const mutate = vi.fn(async (_ns: unknown, ops: readonly { op: string; path: string[] }[], expectedRevision?: number) => {
    let next: unknown = merge(undefined, user === undefined ? resolved : user)
    for (const op of ops) {
      const parent = op.path.slice(0, -1).reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), next)
      if (isRecord(parent)) {
        if (op.op === 'unset') delete parent[op.path[op.path.length - 1] as string]
        else parent[op.path[op.path.length - 1] as string] = (op as { value?: unknown }).value
      }
    }
    await write(merge(resolved, next), expectedRevision)
    user = next
  })

  return {
    writable,
    describe,
    update,
    replace,
    mutate,
    userSection: () => (user === undefined ? {} : user as Record<string, unknown>),
    resolvedSection: () => resolved
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
