import { createRequire } from 'node:module'

const localRequire = createRequire(import.meta.url)

export interface SherpaPackageResolver {
  resolve(id: string): string
}

export function sherpaNodeRequire(): NodeRequire {
  return createRequire(localRequire.resolve('sherpa-onnx-node'))
}

export function sherpaNativePackageName(platform: NodeJS.Platform = process.platform, arch: string = process.arch): string | null {
  const os = platform === 'win32' ? 'win' : platform
  if ((os === 'win' || os === 'linux' || os === 'darwin') && (arch === 'x64' || arch === 'arm64')) {
    return `sherpa-onnx-${os}-${arch}`
  }
  if (os === 'win' && arch === 'ia32') return 'sherpa-onnx-win-ia32'
  return null
}

/** Resolve the native package only; the Host must never load the addon itself. */
export function resolveSherpaNativePackage(resolver: SherpaPackageResolver = sherpaNodeRequire()): string {
  const packageName = sherpaNativePackageName()
  if (packageName === null) throw new Error(`No sherpa-onnx native package exists for ${process.platform}-${process.arch}`)
  return resolver.resolve(`${packageName}/sherpa-onnx.node`)
}

export function isSenseVoiceRuntimeAvailable(): boolean {
  try {
    resolveSherpaNativePackage()
    return true
  } catch {
    return false
  }
}
