import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  PLUGIN_REPOSITORY_SLUG,
  PLUGIN_REPOSITORY_URL,
  UPDATE_COMMAND,
  checkForPluginUpdate,
  compareReleaseVersions,
  interpretUpdateCheck,
  readInstalledAboutInfo,
  repositorySlugFromUrl,
  repositoryUrlFromPackage
} from '../src/about.js'

describe('installed about info', () => {
  it('reads the package identity from package.json', () => {
    const about = readInstalledAboutInfo()
    expect(about.repository).toBe(PLUGIN_REPOSITORY_URL)
    expect(about.repositorySlug).toBe(PLUGIN_REPOSITORY_SLUG)
    expect(about.version).toBe('0.3.0')
    expect(about.license).toBe('MIT')
    expect(about.dshCompatibility).toBe('>=0.1.2-rc.1')
    expect(about.updateCommand).toBe(UPDATE_COMMAND)
  })

  it('normalizes a git repository URL into a GitHub slug', () => {
    expect(repositoryUrlFromPackage({ url: 'git+https://github.com/WizisCool/dsh-ears.git' })).toBe(PLUGIN_REPOSITORY_URL)
    expect(repositorySlugFromUrl(PLUGIN_REPOSITORY_URL)).toBe('@WizisCool/dsh-ears')
  })

  it('falls back when a package.json field is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-ears-about-'))
    const path = join(dir, 'package.json')
    await writeFile(path, '{}\n')
    expect(readInstalledAboutInfo(path)).toEqual({
      repository: PLUGIN_REPOSITORY_URL,
      repositorySlug: PLUGIN_REPOSITORY_SLUG,
      version: '0.0.0',
      license: 'MIT',
      dshCompatibility: '>=0.1.2-rc.1',
      updateCommand: UPDATE_COMMAND
    })
  })
})

describe('version compare', () => {
  it('orders dotted release versions', () => {
    expect(compareReleaseVersions('0.1.1', '0.1.0')).toBe(1)
    expect(compareReleaseVersions('0.1.0', '0.1.1')).toBe(-1)
    expect(compareReleaseVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareReleaseVersions('0.2', '0.1.9')).toBe(1)
    expect(compareReleaseVersions('1.0.0-rc.1', '0.9.9')).toBe(1)
    expect(compareReleaseVersions('not-a-version', '0.1.0')).toBeNull()
  })

  it('orders prereleases before the final release', () => {
    expect(compareReleaseVersions('0.2.0-beta.1', '0.2.0-beta.2')).toBe(-1)
    expect(compareReleaseVersions('0.2.0-beta.2', '0.2.0-rc.1')).toBe(-1)
    expect(compareReleaseVersions('0.2.0-rc.1', '0.2.0')).toBe(-1)
    expect(compareReleaseVersions('0.2.0+build.2', '0.2.0+build.1')).toBe(0)
    expect(compareReleaseVersions('0.2.0-01', '0.2.0')).toBeNull()
  })

  it('accepts alphanumeric prerelease identifiers beginning with zero', () => {
    expect(compareReleaseVersions('0.2.0-01a', '0.2.0-01b')).toBe(-1)
    expect(compareReleaseVersions('0.2.0-01-beta', '0.2.0')).toBe(-1)
  })

  it('treats a greater latest as an update and equal or older as current', () => {
    expect(interpretUpdateCheck('0.1.0', '0.1.1')).toBe('update-available')
    expect(interpretUpdateCheck('0.1.0', '0.1.0')).toBe('up-to-date')
    expect(interpretUpdateCheck('0.2.0', '0.1.9')).toBe('up-to-date')
    expect(interpretUpdateCheck('oops', '0.1.0')).toBeNull()
  })
})

describe('npm latest check', () => {
  it('honors an already-aborted update check before fetching', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled before update check'))
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version: '0.1.1' }), { status: 200 }))

    await expect(checkForPluginUpdate({
      installed: '0.1.0',
      fetchImpl: fetchMock,
      signal: controller.signal
    })).rejects.toThrow('cancelled before update check')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not accept a response produced after external cancellation', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => {
      controller.abort(new Error('cancelled during update check'))
      return new Response(JSON.stringify({ version: '9.9.9' }), { status: 200 })
    })

    await expect(checkForPluginUpdate({
      installed: '0.1.0',
      fetchImpl: fetchMock,
      signal: controller.signal
    })).rejects.toThrow('cancelled during update check')
  })

  it('reports unpublished on HTTP 404', async () => {
    const result = await checkForPluginUpdate({
      installed: '0.1.0',
      fetchImpl: async () => new Response('Not Found', { status: 404 })
    })
    expect(result).toEqual({
      status: 'unpublished',
      installed: '0.1.0',
      latest: null,
      updateCommand: UPDATE_COMMAND
    })
  })

  it('reports an available update from the latest document', async () => {
    const result = await checkForPluginUpdate({
      installed: '0.1.0',
      fetchImpl: async () => new Response(JSON.stringify({ version: '0.1.1' }), { status: 200 })
    })
    expect(result.status).toBe('update-available')
    expect(result.latest).toBe('0.1.1')
    expect(result.updateCommand).toBe(UPDATE_COMMAND)
  })

  it('reports up to date when latest matches the install', async () => {
    const result = await checkForPluginUpdate({
      installed: '0.1.0',
      fetchImpl: async () => new Response(JSON.stringify({ version: '0.1.0' }), { status: 200 })
    })
    expect(result.status).toBe('up-to-date')
    expect(result.latest).toBe('0.1.0')
  })

  it('does not pretend the install is current when the registry fails', async () => {
    const result = await checkForPluginUpdate({
      installed: '0.1.0',
      fetchImpl: async () => new Response('nope', { status: 500 })
    })
    expect(result.status).toBe('error')
    expect(result.latest).toBeNull()
  })
})
