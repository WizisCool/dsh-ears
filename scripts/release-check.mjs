import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u
const CHANGELOG_HEADING = /^## \[([^\]]+)\](?:\s+-\s+[^\n]*)?$/gmu

/**
 * Validate release metadata without network access or repository mutation.
 * `tag` is optional for local development and required by the tagged publish
 * workflow through its explicit `--tag` argument.
 */
export function validateReleaseMetadata({ packageText, changelogText, tag } = {}) {
  if (typeof packageText !== 'string') throw new Error('package.json text is required')
  if (typeof changelogText !== 'string') throw new Error('CHANGELOG.md text is required')

  let manifest
  try {
    manifest = JSON.parse(packageText)
  } catch {
    throw new Error('package.json is not valid JSON')
  }

  const version = manifest?.version
  if (typeof version !== 'string' || !SEMVER.test(version) || /^0\.0\.0(?:-|$)/u.test(version)) {
    throw new Error(`package.json version must be a concrete semver value, got ${JSON.stringify(version)}`)
  }

  const headings = [...changelogText.matchAll(CHANGELOG_HEADING)]
  const latest = headings[0]?.[1]
  if (latest === undefined) throw new Error('CHANGELOG.md has no release heading')
  if (latest !== version) throw new Error(`latest changelog version ${latest} does not match package.json ${version}`)

  const latestHeadingEnd = headings[0].index + headings[0][0].length
  const nextHeadingStart = headings[1]?.index ?? changelogText.length
  const releaseBody = changelogText.slice(latestHeadingEnd, nextHeadingStart).trim()
  if (releaseBody === '') throw new Error(`changelog section for ${version} is empty`)

  if (tag !== undefined && tag !== null) {
    const normalizedTag = String(tag).trim()
    const tagVersion = normalizedTag.startsWith('v') ? normalizedTag.slice(1) : ''
    if (tagVersion !== version) throw new Error(`release tag ${JSON.stringify(normalizedTag)} does not match package.json ${version}`)
  }

  return { version, tag: tag === undefined || tag === null ? null : String(tag).trim() }
}

export async function checkReleaseMetadata({ root = ROOT, tag } = {}) {
  const [packageText, changelogText] = await Promise.all([
    readFile(join(root, 'package.json'), 'utf8'),
    readFile(join(root, 'CHANGELOG.md'), 'utf8')
  ])
  return validateReleaseMetadata({ packageText, changelogText, tag })
}

function printHelp() {
  console.log('Usage: node scripts/release-check.mjs [--tag vX.Y.Z]')
  console.log('Checks package.json and the latest CHANGELOG.md heading without network access.')
}

function cliTag(args) {
  let tag
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--tag') {
      const value = args[index + 1]
      if (value === undefined || value.startsWith('-')) throw new Error('--tag requires a value such as v0.1.6')
      if (tag !== undefined) throw new Error('--tag may only be provided once')
      tag = value
      index += 1
    } else if (argument.startsWith('--tag=')) {
      if (tag !== undefined) throw new Error('--tag may only be provided once')
      tag = argument.slice('--tag='.length)
      if (tag === '') throw new Error('--tag requires a value such as v0.1.6')
    } else {
      throw new Error(`unknown argument ${JSON.stringify(argument)}`)
    }
  }
  return tag
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
const modulePath = resolve(fileURLToPath(import.meta.url))
if (invokedPath === modulePath) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
  } else {
    try {
      const tag = cliTag(args) ?? (process.env.RELEASE_TAG || undefined)
      const result = await checkReleaseMetadata({ tag })
      console.log(`Release metadata verified for dsh-ears@${result.version}${result.tag === null ? '' : ` (${result.tag})`}`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}

export const releaseCheckModuleUrl = pathToFileURL(modulePath).href
