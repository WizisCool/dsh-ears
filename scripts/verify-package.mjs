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

function requireManifestValue(label, actual, expected) {
  if (actual !== expected) fail(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
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
const clientInject = manifest.dsh?.client?.inject
if (!Array.isArray(clientInject)) fail('dsh.client.inject must be an array')
else if (clientInject.includes('@deepseek-ai/dsh-client-runtime')) fail('dsh.client.inject must not include dsh-client-runtime')
if (Object.hasOwn(manifest.peerDependencies ?? {}, '@deepseek-ai/dsh-client-runtime')) fail('peerDependencies must not include dsh-client-runtime')

requireManifestValue('version', manifest.version, '0.3.0')
requireManifestValue('peerDependencies[@deepseek-ai/cordis]', manifest.peerDependencies?.['@deepseek-ai/cordis'], '^4.0.2')
requireManifestValue('peerDependencies[@deepseek-ai/schemastery]', manifest.peerDependencies?.['@deepseek-ai/schemastery'], '^3.18.2')
const expectedDshPeers = [
  '@deepseek-ai/dsh-api-remotes',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-settings-plugins',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-typert-protocol'
]
for (const name of expectedDshPeers) requireManifestValue(`peerDependencies[${name}]`, manifest.peerDependencies?.[name], '^0.1.2-rc.1')
requireManifestValue('dependencies[@deepseek-ai/dsh-client-store]', manifest.dependencies?.['@deepseek-ai/dsh-client-store'], '0.1.2-rc.1')
if (Object.hasOwn(manifest.peerDependencies ?? {}, '@deepseek-ai/dsh-client-store')) fail('dsh-client-store must be an implementation dependency, not a peer')
if (clientInject?.includes('@deepseek-ai/dsh-client-store')) fail('dsh.client.inject must not include bundled dsh-client-store')

const hostBundle = existsSync(join(root, 'lib', 'index.js')) ? readFileSync(join(root, 'lib', 'index.js'), 'utf8') : ''
if (hostBundle.includes('TypertLookupFailure')) fail('lib/index.js must not reference TypertLookupFailure')
const clientBundle = existsSync(join(root, 'lib', 'client.js')) ? readFileSync(join(root, 'lib', 'client.js'), 'utf8') : ''
for (const name of ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-store', 'zustand', 'immer']) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const runtimeImport = new RegExp(`(?:require\\(\\s*|from\\s+|import\\(\\s*)[\"']${escaped}(?:/[^\"']*)?[\"']`, 'u')
  if (runtimeImport.test(clientBundle)) fail(`lib/client.js must bundle ${name} instead of loading it at runtime`)
}
if (/\bprocess\.env\b/u.test(clientBundle)) fail('lib/client.js must not contain unresolved process.env reads')
if (!clientBundle.includes('function createSnapshotStore')) fail('lib/client.js must contain the bundled snapshot-store implementation')

if (failures.length > 0) {
  console.error('Package contract verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Package contract verified for ${manifest.name}@${manifest.version}`)
}
