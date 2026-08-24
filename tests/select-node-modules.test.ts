import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { selectNodeModules } from '../scripts/select-node-modules.mjs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function testRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ears-node-modules-'))
  roots.push(root)
  return root
}

describe('platform-specific node_modules selection', () => {
  it('marks an existing install for the current platform', async () => {
    const root = await testRoot()
    await mkdir(join(root, 'node_modules'), { recursive: true })
    await writeFile(join(root, 'node_modules', 'sentinel'), 'windows')

    const result = await selectNodeModules(root, 'win32')

    expect(result).toMatchObject({ platform: 'win32', changed: true })
    await expect(readFile(join(root, 'node_modules', '.dsh-ears-platform'), 'utf8')).resolves.toBe('win32\n')
    await expect(readFile(join(root, 'node_modules', 'sentinel'), 'utf8')).resolves.toBe('windows')
  })

  it('preserves each platform tree while switching the active directory', async () => {
    const root = await testRoot()
    await selectNodeModules(root, 'win32')
    await writeFile(join(root, 'node_modules', 'sentinel'), 'windows')

    await selectNodeModules(root, 'linux')
    await writeFile(join(root, 'node_modules', 'sentinel'), 'linux')
    expect(await readFile(join(root, 'node_modules.win32', 'sentinel'), 'utf8')).toBe('windows')

    await selectNodeModules(root, 'win32')
    await expect(readFile(join(root, 'node_modules', 'sentinel'), 'utf8')).resolves.toBe('windows')
    await expect(readFile(join(root, 'node_modules.linux', 'sentinel'), 'utf8')).resolves.toBe('linux')
  })

  it('initializes a platform tree on a fresh checkout', async () => {
    const root = await testRoot()

    const result = await selectNodeModules(root, 'linux')

    expect(result).toMatchObject({ platform: 'linux', initialized: true })
    await expect(readFile(join(root, 'node_modules', '.dsh-ears-platform'), 'utf8')).resolves.toBe('linux\n')
  })
})
