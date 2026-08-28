import { describe, expect, it } from 'vitest'
import { whisperAccelerationCapabilities, whisperNativePackageName } from '../src/asr/local-whisper.js'

function requirePackages(available: readonly string[]): NodeRequire {
  const names = new Set(available)
  return ((name: string) => {
    if (!names.has(name)) throw new Error(`Missing test package: ${name}`)
    return { WhisperContext: class {} }
  }) as NodeRequire
}

describe('Local Whisper acceleration defaults', () => {
  it('uses the platform default variant when it is installed', () => {
    const requirePackage = requirePackages([
      whisperNativePackageName('default', 'win32', 'x64'),
      whisperNativePackageName('vulkan', 'win32', 'x64'),
      whisperNativePackageName('cuda', 'win32', 'x64')
    ])

    expect(whisperAccelerationCapabilities('win32', 'x64', requirePackage)).toEqual({
      available: ['default', 'vulkan', 'cuda'],
      default: 'default'
    })
  })

  it('falls back to an installed platform variant when the default is unavailable', () => {
    const requirePackage = requirePackages([whisperNativePackageName('vulkan', 'win32', 'x64')])

    expect(whisperAccelerationCapabilities('win32', 'x64', requirePackage)).toEqual({
      available: ['vulkan'],
      default: 'vulkan'
    })
  })

  it('uses default when the platform has no supported native package', () => {
    expect(whisperAccelerationCapabilities('freebsd', 'x64', requirePackages([]))).toEqual({
      available: [],
      default: 'default'
    })
  })
})
