import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ACTIVE_DIRECTORY = 'node_modules'
const MARKER_FILE = '.dsh-ears-platform'
const SUPPORTED_PLATFORMS = new Set(['win32', 'linux'])

export function platformDirectory(platform = process.platform) {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`Unsupported platform ${JSON.stringify(platform)}; use Windows or Linux/WSL.`)
  }
  return platform
}

async function inspect(path) {
  try {
    return await lstat(path)
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

function isMissing(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readMarker(directory) {
  try {
    const platform = (await readFile(join(directory, MARKER_FILE), 'utf8')).trim()
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      throw new Error(`Invalid ${MARKER_FILE} value in ${directory}`)
    }
    return platform
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

async function writeMarker(directory, platform) {
  await writeFile(join(directory, MARKER_FILE), `${platform}\n`, 'utf8')
}

async function assertManagedDirectory(path, expectedPlatform) {
  const info = await inspect(path)
  if (info === undefined || info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${path} is not a managed dependency directory`)
  }
  const platform = await readMarker(path)
  if (platform !== expectedPlatform) {
    throw new Error(`${path} is not marked for ${expectedPlatform}`)
  }
}

/**
 * Select the platform-specific dependency tree as the active node_modules
 * directory. Existing trees are moved aside rather than deleted, so switching
 * between Windows and WSL preserves each platform's native packages and
 * command shims.
 */
export async function selectNodeModules(root = process.cwd(), platform = process.platform) {
  const selectedPlatform = platformDirectory(platform)
  const projectRoot = resolve(root)
  const activePath = join(projectRoot, ACTIVE_DIRECTORY)
  const selectedPath = join(projectRoot, `${ACTIVE_DIRECTORY}.${selectedPlatform}`)
  const activeInfo = await inspect(activePath)

  if (activeInfo !== undefined && (activeInfo.isSymbolicLink() || !activeInfo.isDirectory())) {
    throw new Error(`${activePath} must be a real directory before platform selection`)
  }

  if (activeInfo === undefined) {
    const selectedInfo = await inspect(selectedPath)
    if (selectedInfo === undefined) {
      await mkdir(activePath, { recursive: true })
      await writeMarker(activePath, selectedPlatform)
      return { platform: selectedPlatform, changed: true, initialized: true }
    }
    await assertManagedDirectory(selectedPath, selectedPlatform)
    await rename(selectedPath, activePath)
    return { platform: selectedPlatform, changed: true, initialized: false }
  }

  const activePlatform = await readMarker(activePath)
  if (activePlatform === selectedPlatform) {
    return { platform: selectedPlatform, changed: false, initialized: false }
  }

  if (activePlatform === undefined) {
    if (await inspect(selectedPath) !== undefined) {
      throw new Error(`${activePath} is unmanaged and ${selectedPath} already exists; move the existing directories before selecting a platform`)
    }
    await writeMarker(activePath, selectedPlatform)
    return { platform: selectedPlatform, changed: true, initialized: false }
  }

  const previousPath = join(projectRoot, `${ACTIVE_DIRECTORY}.${activePlatform}`)
  if (await inspect(previousPath) !== undefined) {
    throw new Error(`${previousPath} already exists; resolve the platform directory before switching`)
  }

  await rename(activePath, previousPath)
  try {
    const selectedInfo = await inspect(selectedPath)
    if (selectedInfo !== undefined) {
      await assertManagedDirectory(selectedPath, selectedPlatform)
      await rename(selectedPath, activePath)
    } else {
      await mkdir(activePath, { recursive: true })
      await writeMarker(activePath, selectedPlatform)
    }
  } catch (error) {
    if (await inspect(activePath) === undefined) await rename(previousPath, activePath).catch(() => undefined)
    throw error
  }
  return { platform: selectedPlatform, changed: true, initialized: false }
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
const modulePath = resolve(fileURLToPath(import.meta.url))
if (invokedPath === modulePath) {
  try {
    const result = await selectNodeModules()
    console.log(result.changed ? `Selected ${result.platform} node_modules.` : `node_modules already selects ${result.platform}.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
