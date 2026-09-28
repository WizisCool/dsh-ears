import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

/** Load the descriptor table from the built Host Remote entry. */
async function loadBuiltRemoteDescriptors() {
  const entry = join(root, 'lib', 'remote.js')
  if (!existsSync(entry)) return undefined
  try {
    const module = await import(pathToFileURL(entry).href)
    return module.TYPERT_REMOTE?.descriptors ?? module.default?.descriptors
  } catch (error) {
    fail(`lib/remote.js could not be loaded: ${String(error)}`)
    return undefined
  }
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
if (!Array.isArray(manifest.files) || !manifest.files.includes('locale/*.json')) {
  fail('files must include locale/*.json')
}

// dsh reads a plugin's display metadata from package.json (`icon`, `description`)
// and from `locale/<language>.json` entries resolved through the package export
// map, so the settings and plugin surfaces can show a title, summary, and icon.
requireFile('icon', manifest.icon)
if (manifest.exports?.['./locale/*.json'] !== './locale/*.json') {
  fail('exports must expose ./locale/*.json for plugin display metadata')
}
if (typeof manifest.description !== 'string' || manifest.description.trim() === '') {
  fail('description must be a non-empty plugin summary')
}
for (const language of ['en', 'zh']) {
  const localePath = join(root, 'locale', `${language}.json`)
  if (!existsSync(localePath)) {
    fail(`locale/${language}.json is missing`)
    continue
  }
  let dictionary
  try {
    dictionary = JSON.parse(readFileSync(localePath, 'utf8'))
  } catch (error) {
    fail(`locale/${language}.json is not valid JSON: ${String(error)}`)
    continue
  }
  for (const field of ['title', 'description']) {
    const value = dictionary?.meta?.[field]
    if (typeof value !== 'string' || value.trim() === '') fail(`locale/${language}.json must declare a non-empty meta.${field}`)
  }
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

requireManifestValue('version', manifest.version, '0.4.1')
requireManifestValue('peerDependencies[@deepseek-ai/cordis]', manifest.peerDependencies?.['@deepseek-ai/cordis'], '^4.0.4')
requireManifestValue('peerDependencies[@deepseek-ai/schemastery]', manifest.peerDependencies?.['@deepseek-ai/schemastery'], '^3.18.4')
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
for (const name of expectedDshPeers) requireManifestValue(`peerDependencies[${name}]`, manifest.peerDependencies?.[name], '>=0.2.0-rc.1')
requireManifestValue('dependencies[@deepseek-ai/dsh-client-store]', manifest.dependencies?.['@deepseek-ai/dsh-client-store'], '0.2.0-rc.1')
if (Object.hasOwn(manifest.peerDependencies ?? {}, '@deepseek-ai/dsh-client-store')) fail('dsh-client-store must be an implementation dependency, not a peer')
if (clientInject?.includes('@deepseek-ai/dsh-client-store')) fail('dsh.client.inject must not include bundled dsh-client-store')

const hostBundle = existsSync(join(root, 'lib', 'index.js')) ? readFileSync(join(root, 'lib', 'index.js'), 'utf8') : ''
if (hostBundle.includes('TypertLookupFailure')) fail('lib/index.js must not reference TypertLookupFailure')
if (/settings\s*\.\s*register\s*\(/u.test(hostBundle)) fail('lib/index.js must not call the removed settings.register API')
const clientBundle = existsSync(join(root, 'lib', 'client.js')) ? readFileSync(join(root, 'lib', 'client.js'), 'utf8') : ''
for (const name of ['@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-store', 'zustand', 'immer']) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const runtimeImport = new RegExp(`(?:require\\(\\s*|from\\s+|import\\(\\s*)[\"']${escaped}(?:/[^\"']*)?[\"']`, 'u')
  if (runtimeImport.test(clientBundle)) fail(`lib/client.js must bundle ${name} instead of loading it at runtime`)
}
if (/\bprocess\.env\b/u.test(clientBundle)) fail('lib/client.js must not contain unresolved process.env reads')
if (!clientBundle.includes('function createSnapshotStore')) fail('lib/client.js must contain the bundled snapshot-store implementation')

// dsh 0.1.7 renamed the icon exports from size-suffixed to weight-suffixed
// names. A stale name renders as an undefined element and fails the whole
// renderer boot (React #130), so the shipped bundle is checked, not just source.
for (const removed of ['IconChevronDownOutline14', 'IconLoadingOutline16', 'IconStopFill16', 'IconTrashOutline16']) {
  if (clientBundle.includes(removed)) fail(`lib/client.js must not reference the removed icon ${removed}`)
}
for (const icon of ['IconChevronDownOutlineRegular', 'IconLoadingOutlineRegular', 'IconStopFillRegular', 'IconTrashOutlineRegular']) {
  if (!clientBundle.includes(icon)) fail(`lib/client.js must reference the current icon ${icon}`)
}

// dsh 0.1.7 rejects a strict codec without a create() factory, and the client
// bundle carries its own inlined copy of the descriptor table, so the built
// table is executed here and the client copy is checked for every endpoint.
const descriptors = await loadBuiltRemoteDescriptors()
if (descriptors === undefined) {
  fail('lib/remote.js must export the built Remote descriptor table')
} else {
  const codecs = []
  for (const descriptor of descriptors) {
    for (const parameter of descriptor.parameters ?? []) codecs.push({ subject: `${descriptor.id} parameter ${parameter.name}`, codec: parameter.codec })
    codecs.push({ subject: `${descriptor.id} result`, codec: descriptor.result })
    if (!clientBundle.includes(descriptor.id)) fail(`lib/client.js must inline the ${descriptor.id} descriptor`)
  }
  if (codecs.length !== 36) fail(`the built descriptor table must carry 36 codecs, found ${codecs.length}`)
  for (const { subject, codec } of codecs) {
    if (codec?.mode !== 'strict') fail(`${subject} must use a strict codec`)
    if (typeof codec?.create !== 'function') fail(`${subject} must provide a create() factory`)
    else if (typeof codec.create()?.parse !== 'function') fail(`${subject} create() must return a parseable schema`)
  }
}

if (failures.length > 0) {
  console.error('Package contract verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Package contract verified for ${manifest.name}@${manifest.version}`)
}
