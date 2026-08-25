import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = join(root, 'package.json')
const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
const failures = []

function fail(message) {
  failures.push(message)
}

function requireFile(label, relativePath) {
  if (typeof relativePath !== 'string' || relativePath === '') {
    fail(`${label} must name a file`)
    return
  }
  const path = relativePath.replace(/^\.\//u, '')
  const absolutePath = join(root, path)
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    fail(`${label} is missing or is not a file: ${relativePath}`)
  }
}

function requireExport(target, condition) {
  const entry = manifest.exports?.[target]
  const value = entry !== null && typeof entry === 'object' && !Array.isArray(entry)
    ? entry[condition]
    : undefined
  requireFile(`exports[${JSON.stringify(target)}].${condition}`, value)
}

if (typeof manifest.name !== 'string' || manifest.name === '') fail('package name is missing')
if (typeof manifest.version !== 'string' || manifest.version === '') fail('package version is missing')
if (manifest.engines?.node !== '^22.19.0 || >=24.0.0') {
  fail('engines.node must match the supported Node range')
}

requireFile('main', manifest.main)
requireFile('types', manifest.types)
requireExport('.', 'default')
requireExport('.', 'types')
requireExport('./client', 'default')
requireExport('./client', 'types')
requireExport('./typert', 'default')
requireExport('./typert', 'types')
requireExport('./remote', 'default')
requireExport('./remote', 'types')

if (!Array.isArray(manifest.files) || !manifest.files.includes('lib')) {
  fail('files must include lib')
}
if (!Array.isArray(manifest.files) || !manifest.files.includes('cordis.patch.yml')) {
  fail('files must include cordis.patch.yml')
}

const patchPath = manifest.dsh?.bundle?.patch
if (patchPath !== './cordis.patch.yml') {
  fail('dsh.bundle.patch must point to ./cordis.patch.yml')
} else {
  requireFile('dsh.bundle.patch', patchPath)
  const patch = readFileSync(join(root, patchPath.slice(2)), 'utf8')
  const escapedName = manifest.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const row = new RegExp(
    `^[ \\t]+-[ \\t]+id:[ \\t]*${escapedName}[ \\t]*\\r?\\n^[ \\t]+name:[ \\t]*${escapedName}[ \\t]*$`,
    'mu',
  )
  if (!row.test(patch)) fail(`bundle patch must insert the ${manifest.name} package entry`)
}

if (manifest.dsh?.client?.platform !== 'web') fail('dsh.client.platform must be web')

if (failures.length > 0) {
  console.error('Package contract verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Package contract verified for ${manifest.name}@${manifest.version}`)
}
