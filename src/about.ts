/** Plugin identity and update-check helpers. */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN_LICENSE = 'MIT'
export const PLUGIN_REPOSITORY_URL = 'https://github.com/WizisCool/dsh-ears'
export const PLUGIN_REPOSITORY_SLUG = '@WizisCool/dsh-ears'
export const DSH_COMPATIBILITY = '0.1.0-rc.6 - 0.1.1-rc.2'
/**
 * `add` re-resolves `latest` from the registry and rewrites the saved range,
 * so the one command works for first install, in-range updates, and crossings
 * that `pnpm update` clamps to the existing semver range.
 */
export const UPDATE_COMMAND = 'dsh plugin --profile web add dsh-ears'
export const NPM_LATEST_URL = 'https://registry.npmjs.org/dsh-ears/latest'

const CHECK_TIMEOUT_MS = 15_000
const MAX_REGISTRY_BYTES = 256 * 1024

export type AboutInfo = {
  readonly repository: string
  readonly repositorySlug: string
  readonly version: string
  readonly license: string
  readonly dshCompatibility: string
  readonly updateCommand: string
}

export type UpdateCheckStatus = 'up-to-date' | 'update-available' | 'unpublished' | 'error'

export type UpdateCheckResult = {
  readonly status: UpdateCheckStatus
  readonly installed: string
  readonly latest: string | null
  readonly updateCommand: string
}

export function readInstalledAboutInfo(packageJsonPath = resolvePackageJsonPath()): AboutInfo {
  const raw = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    version?: unknown
    license?: unknown
    repository?: unknown
  }
  const version = typeof raw.version === 'string' && raw.version.trim() !== '' ? raw.version.trim() : '0.0.0'
  const license = typeof raw.license === 'string' && raw.license.trim() !== '' ? raw.license.trim() : PLUGIN_LICENSE
  const repository = repositoryUrlFromPackage(raw.repository)
  return {
    repository,
    repositorySlug: repositorySlugFromUrl(repository),
    version,
    license,
    dshCompatibility: DSH_COMPATIBILITY,
    updateCommand: UPDATE_COMMAND
  }
}

export function repositoryUrlFromPackage(value: unknown): string {
  const raw = typeof value === 'string'
    ? value
    : value !== null && typeof value === 'object' && 'url' in value && typeof value.url === 'string'
      ? value.url
      : ''
  const url = raw.trim().replace(/^git\+/, '').replace(/\.git$/, '')
  return url !== '' ? url : PLUGIN_REPOSITORY_URL
}

export function repositorySlugFromUrl(url: string): string {
  const match = /github\.com\/([^/]+\/[^/]+)/i.exec(url)
  return match === null ? PLUGIN_REPOSITORY_SLUG : `@${match[1].replace(/\.git$/, '')}`
}

export function resolvePackageJsonPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
}

/**
 * Compare SemVer release identifiers. The historical `1.2` shorthand remains
 * accepted and is normalized to `1.2.0`; prerelease identifiers still follow
 * SemVer precedence and build metadata is ignored.
 */
export function compareReleaseVersions(left: string, right: string): number | null {
  const a = parseReleaseVersion(left)
  const b = parseReleaseVersion(right)
  if (a === null || b === null) return null
  const length = Math.max(a.core.length, b.core.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (a.core[index] ?? 0) - (b.core[index] ?? 0)
    if (delta > 0) return 1
    if (delta < 0) return -1
  }
  if (a.prerelease === undefined && b.prerelease !== undefined) return 1
  if (a.prerelease !== undefined && b.prerelease === undefined) return -1
  if (a.prerelease !== undefined && b.prerelease !== undefined) {
    const length = Math.max(a.prerelease.length, b.prerelease.length)
    for (let index = 0; index < length; index += 1) {
      const leftIdentifier = a.prerelease[index]
      const rightIdentifier = b.prerelease[index]
      if (leftIdentifier === undefined) return -1
      if (rightIdentifier === undefined) return 1
      if (leftIdentifier === rightIdentifier) continue
      const leftNumeric = /^\d+$/.test(leftIdentifier)
      const rightNumeric = /^\d+$/.test(rightIdentifier)
      if (leftNumeric && rightNumeric) {
        if (leftIdentifier.length !== rightIdentifier.length) return leftIdentifier.length > rightIdentifier.length ? 1 : -1
        return leftIdentifier > rightIdentifier ? 1 : -1
      }
      if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
      return leftIdentifier > rightIdentifier ? 1 : -1
    }
  }
  return 0
}

export function interpretUpdateCheck(installed: string, latest: string): Exclude<UpdateCheckStatus, 'unpublished' | 'error'> | null {
  const order = compareReleaseVersions(latest, installed)
  if (order === null) return null
  return order > 0 ? 'update-available' : 'up-to-date'
}

export async function fetchLatestPublishedVersion(options: {
  readonly fetchImpl?: typeof fetch
  readonly signal?: AbortSignal
} = {}): Promise<{ status: 'ok'; version: string } | { status: 'unpublished' } | { status: 'error'; message: string }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(new Error('Update check timed out')), CHECK_TIMEOUT_MS)
  const forwardAbort = () => timeout.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', forwardAbort, { once: true })
  try {
    options.signal?.throwIfAborted()
    const response = await fetchImpl(NPM_LATEST_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: timeout.signal
    })
    options.signal?.throwIfAborted()
    timeout.signal.throwIfAborted()
    if (response.status === 404) {
      await cancelResponseBody(response)
      return { status: 'unpublished' }
    }
    const body = await readBoundedText(response, timeout.signal)
    options.signal?.throwIfAborted()
    if (!response.ok) return { status: 'error', message: `npm registry returned HTTP ${response.status}` }
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return { status: 'error', message: 'npm registry returned invalid JSON' }
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { status: 'error', message: 'npm registry returned no version' }
    }
    const version = (parsed as { version?: unknown }).version
    if (typeof version !== 'string' || version.trim() === '') return { status: 'error', message: 'npm registry returned no version' }
    return { status: 'ok', version: version.trim() }
  } catch (error) {
    if (options.signal?.aborted) throw error
    const message = error instanceof Error && error.message.trim() !== '' ? error.message : 'Update check failed'
    return { status: 'error', message }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', forwardAbort)
  }
}

export async function checkForPluginUpdate(options: {
  readonly installed: string
  readonly fetchImpl?: typeof fetch
  readonly signal?: AbortSignal
} = { installed: '' }): Promise<UpdateCheckResult> {
  const installed = options.installed
  const updateCommand = UPDATE_COMMAND
  const latest = await fetchLatestPublishedVersion(options)
  if (latest.status === 'unpublished') return { status: 'unpublished', installed, latest: null, updateCommand }
  if (latest.status === 'error') return { status: 'error', installed, latest: null, updateCommand }
  const status = interpretUpdateCheck(installed, latest.version)
  if (status === null) return { status: 'error', installed, latest: latest.version, updateCommand }
  return { status, installed, latest: latest.version, updateCommand }
}

function parseReleaseVersion(value: string): { core: number[]; prerelease?: string[] } | null {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value.trim())
  if (match === null) return null
  const coreParts = match.slice(1, 4).filter((part): part is string => part !== undefined)
  if (coreParts.some((part) => part.length > 1 && part.startsWith('0'))) return null
  const core = coreParts.map((part) => Number(part))
  if (core.some((part) => !Number.isSafeInteger(part))) return null
  const prerelease = match[4]?.split('.')
  if (prerelease?.some((part) => part.length > 1 && /^0\d+$/.test(part))) return null
  return prerelease === undefined ? { core } : { core, prerelease }
}

async function readBoundedText(response: Response, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > MAX_REGISTRY_BYTES) {
    await cancelResponseBody(response)
    throw new Error('npm registry response is too large')
  }
  if (response.body === null) {
    const body = await response.text()
    signal?.throwIfAborted()
    if (new TextEncoder().encode(body).byteLength > MAX_REGISTRY_BYTES) throw new Error('npm registry response is too large')
    return body
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const cancelOnAbort = () => {
    try {
      void reader.cancel(signal?.reason).catch(() => undefined)
    } catch {
      // The abort itself remains authoritative even if a custom reader cannot cancel.
    }
  }
  signal?.addEventListener('abort', cancelOnAbort, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      const next = await reader.read()
      signal?.throwIfAborted()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_REGISTRY_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // Preserve the size-limit error when transport cleanup also fails.
        }
        throw new Error('npm registry response is too large')
      }
      chunks.push(next.value)
    }
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel()
  } catch {
    // The caller's response handling remains authoritative when cleanup fails.
  }
}
