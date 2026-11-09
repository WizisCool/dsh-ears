import { describe, expect, it } from 'vitest'
import { whisperAccelerationCapabilities, whisperNativePackageName, type WhisperPackageResolver } from '../src/asr/local-whisper.js'

function resolverPackages(available: readonly string[]): WhisperPackageResolver {
  const names = new Set(available)
  return {
    resolve(name: string) {
      if (!names.has(name)) throw new Error(`Missing test package: ${name}`)
      return name
    }
  }
}

describe('Local Whisper acceleration defaults', () => {
  it('uses the platform default variant when it is installed', () => {
    const resolver = resolverPackages([
      whisperNativePackageName('default', 'win32', 'x64'),
      whisperNativePackageName('vulkan', 'win32', 'x64'),
      whisperNativePackageName('cuda', 'win32', 'x64')
    ])

    expect(whisperAccelerationCapabilities('win32', 'x64', resolver)).toEqual({
      available: ['default', 'vulkan', 'cuda'],
      default: 'default'
    })
  })

  it('falls back to an installed platform variant when the default is unavailable', () => {
    const resolver = resolverPackages([whisperNativePackageName('vulkan', 'win32', 'x64')])

    expect(whisperAccelerationCapabilities('win32', 'x64', resolver)).toEqual({
      available: ['vulkan'],
      default: 'vulkan'
    })
  })

  it('uses default when the platform has no supported native package', () => {
    expect(whisperAccelerationCapabilities('freebsd', 'x64', resolverPackages([]))).toEqual({
      available: [],
      default: 'default'
    })
  })
})
