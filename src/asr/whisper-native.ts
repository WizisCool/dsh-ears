import { createRequire } from 'node:module'
import type { LibVariant } from '@fugood/whisper.node'
import { EARS_ERROR_CODES, EarsError } from '../errors.js'

export const WHISPER_NATIVE_VARIANTS: readonly LibVariant[] = ['default', 'vulkan', 'cuda']

export interface WhisperAccelerationCapabilities {
  readonly available: readonly LibVariant[]
  readonly default: LibVariant
}

/** The only capability needed from a package resolver: resolution, never load. */
export interface WhisperPackageResolver {
  resolve(id: string): string
}

export const WHISPER_RESTART_REQUIRED_CODE = EARS_ERROR_CODES.whisperRestartRequired
export const WHISPER_NATIVE_UNAVAILABLE_CODE = EARS_ERROR_CODES.whisperNativeUnavailable

export class WhisperRestartRequiredError extends EarsError {
  readonly loadedVariant: LibVariant
  readonly requestedVariant: LibVariant

  constructor(loadedVariant: LibVariant, requestedVariant: LibVariant) {
    super(
      WHISPER_RESTART_REQUIRED_CODE,
      `Restart dsh to switch Local Whisper from "${loadedVariant}" to "${requestedVariant}"`,
      { loadedVariant, requestedVariant }
    )
    this.name = 'WhisperRestartRequiredError'
    this.loadedVariant = loadedVariant
    this.requestedVariant = requestedVariant
  }
}

export class WhisperNativeUnavailableError extends EarsError {
  readonly packageName: string

  constructor(packageName: string, cause: unknown) {
    super(
      WHISPER_NATIVE_UNAVAILABLE_CODE,
      `Whisper native package "${packageName}" is unavailable`,
      { packageName }
    )
    this.name = 'WhisperNativeUnavailableError'
    this.packageName = packageName
    Object.defineProperty(this, 'cause', {
      value: cause,
      configurable: true
    })
  }
}

const nativeRequire = createRequire(import.meta.url)

/**
 * Resolve platform packages from whisper.node's own dependency context. Under
 * pnpm's isolated layout the platform binary is an optional dependency of
 * whisper.node, not of dsh-ears, so resolving from this module would miss it.
 */
export function whisperNodeRequire(): NodeRequire {
  return createRequire(nativeRequire.resolve('@fugood/whisper.node'))
}

export function whisperNativePackageName(
  variant: LibVariant = 'default',
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  const suffix = variant === 'default' ? '' : `-${variant}`
  return `@fugood/node-whisper-${platform}-${arch}${suffix}`
}

/**
 * Return the native acceleration packages supported by the current platform
 * and installed dependency tree without initializing whisper.node. Resolution
 * deliberately stops at package presence: loading the addon in the Host is
 * what a fatal native assertion would take down with it.
 */
export function whisperAccelerationCapabilities(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
  resolver?: WhisperPackageResolver
): WhisperAccelerationCapabilities {
  const candidates = platformWhisperVariants(platform, arch)
  if (candidates.length === 0) return { available: [], default: 'default' }

  const available = candidates.filter((variant) => {
    try {
      resolveWhisperNativePackage(variant, resolver, platform, arch)
      return true
    } catch {
      return false
    }
  })
  return {
    available,
    default: available.includes('default') ? 'default' : available[0] ?? 'default'
  }
}

export function platformWhisperVariants(platform: NodeJS.Platform, arch: string): readonly LibVariant[] {
  if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) return ['default']
  if (platform === 'linux' && (arch === 'x64' || arch === 'arm64')) return WHISPER_NATIVE_VARIANTS
  if (platform === 'win32' && arch === 'x64') return WHISPER_NATIVE_VARIANTS
  if (platform === 'win32' && arch === 'arm64') return ['default', 'vulkan']
  return []
}

/**
 * Check exactly the platform package requested by whisper.node. The Host only
 * resolves it; the Whisper worker loads it and validates the binding API.
 */
export function resolveWhisperNativePackage(
  variant: LibVariant = 'default',
  resolver?: WhisperPackageResolver,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): string {
  const packageName = whisperNativePackageName(variant, platform, arch)
  try {
    ;(resolver ?? whisperNodeRequire()).resolve(packageName)
  } catch (error) {
    throw new WhisperNativeUnavailableError(packageName, error)
  }
  return packageName
}

/** Resolve, without loading, the platform package required by a variant. */
export function preflightWhisperNativePackage(variant: LibVariant = 'default', resolver?: WhisperPackageResolver): string {
  return resolveWhisperNativePackage(variant, resolver)
}

export function defaultWhisperUseGpu(
  variant: LibVariant = 'default',
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): boolean {
  if (variant !== 'default') return true
  return platform === 'darwin' && arch === 'arm64'
}
