import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { delimiter, extname, isAbsolute, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const VERIFIED_DSH_SMOKE_VERSIONS = Object.freeze([
  '0.2.0-rc.1'
])

/**
 * Which settings document the smoke starts from.
 *
 * - `fresh`: an empty profile.
 * - `canonical`: the v4 section dsh-ears 0.3.x wrote, seeded into the legacy
 *   `settings.yaml` the Host imports into the profile entry config.
 * - `legacy`: the pre-0.3 flat section, which uses undeclared field names.
 */
export const SMOKE_SCENARIOS = Object.freeze(['fresh', 'canonical', 'legacy'])

/** A complete v4 document with placeholder credentials. */
function canonicalSettingsDocument() {
  return {
    schemaVersion: 4,
    general: {
      displayName: 'dsh-ears',
      shortcut: { enabled: true, value: 'ctrl+shift+space' },
      soundsEnabled: true
    },
    recognition: {
      backend: 'cloud-openai',
      webSpeech: { language: '' },
      localWhisper: { model: 'tiny', acceleration: 'default', language: '' },
      cloudProvider: 'groq',
      maxRecordingSeconds: 120
    },
    cloudAsr: {
      groq: { apiKey: 'gsk_canonical_fixture', model: 'whisper-large-v3-turbo', language: '' }
    },
    polishing: { enabled: true, provider: '', model: '', reasoningEffort: '', prompt: '' }
  }
}

/** The flat section a pre-0.3 dsh-ears stored. */
function legacySettingsDocument() {
  return {
    asrBackend: 'cloud-openai',
    cloudAsrProvider: 'groq',
    cloudAsrApiKey: 'gsk_legacy_fixture',
    cloudAsrModel: 'whisper-large-v3-turbo',
    maxRecordingSeconds: 120
  }
}

function resolveWindowsCommand(command) {
  if (isAbsolute(command)) return command
  if (command.includes('/') || command.includes('\\')) return resolve(command)

  const extensions = extname(command) === ''
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
    : ['']
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const normalizedDirectory = directory.replace(/^"|"$/gu, '')
    for (const extension of extensions) {
      const candidate = join(normalizedDirectory, `${command}${extension}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return command
}

function quoteWindowsCommandArgument(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function commandInvocation(command, args) {
  if (process.platform !== 'win32') return { command, args }

  const windowsCommand = resolveWindowsCommand(command)
  const commandLine = `"${[windowsCommand, ...args].map(quoteWindowsCommandArgument).join(' ')}"`
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', commandLine],
    windowsVerbatimArguments: true
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const invocation = commandInvocation(command, args)
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsVerbatimArguments: invocation.windowsVerbatimArguments
    })
    let output = ''
    const append = (chunk) => {
      output = `${output}${chunk}`.slice(-20_000)
      options.onOutput?.(String(chunk))
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', rejectCommand)
    child.once('exit', (code, signal) => {
      if (code === 0) resolveCommand(output)
      else rejectCommand(new Error(`${command} ${args.join(' ')} exited with ${signal ?? `code ${code}`}\n${output}`))
    })
  })
}

function startServer(dshBin, args, options) {
  const child = spawn(process.execPath, [dshBin, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  let settled = false
  let resolveReady
  let rejectReady
  const ready = new Promise((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise
    rejectReady = rejectPromise
  })
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    rejectReady(new Error(`dsh web did not announce a URL within ${options.timeoutMs}ms\n${output}`))
  }, options.timeoutMs)
  const append = (chunk) => {
    output = `${output}${chunk}`.slice(-20_000)
    const match = output.match(/dsh web:\s+(https?:\/\/[^\s]+)/u)
    if (match === null || settled) return
    settled = true
    clearTimeout(timer)
    resolveReady(match[1])
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.once('error', (error) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    rejectReady(error)
  })
  child.once('exit', (code, signal) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    rejectReady(new Error(`dsh web exited before readiness with ${signal ?? `code ${code}`}\n${output}`))
  })
  return { child, ready }
}

async function exchangeLaunchToken(baseUrl) {
  const response = await fetch(baseUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000)
  })
  if (response.status < 300 || response.status >= 400) {
    throw new Error(`dsh launch-token exchange returned HTTP ${response.status}`)
  }
  const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie')
  const cookie = setCookie?.split(';', 1)[0]
  if (cookie === undefined || cookie === '') throw new Error('dsh launch-token exchange did not set a browser-session cookie')
  return cookie
}

async function waitForHttp(url, path, init, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL(path, url), {
        ...init,
        signal: AbortSignal.timeout(2_000)
      })
      return response
    } catch (error) {
      lastError = error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
    }
  }
  throw new Error(`timed out waiting for ${url}${path}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolvePromise()
    })
  })
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
}

function peerDependencySpecs(manifest, dshVersion) {
  return Object.keys(manifest.peerDependencies ?? {}).map((name) => {
    if (name === '@deepseek-ai/cordis') return `${name}@4.0.4`
    if (name === '@deepseek-ai/schemastery') return `${name}@3.18.4`
    if (name.startsWith('@deepseek-ai/dsh-')) return `${name}@${dshVersion}`
    if (name === 'react') return `${name}@18.3.1`
    throw new Error(`compat smoke does not know how to pin peer dependency ${name}`)
  })
}

async function prepareSmokeProject({ projectRoot, smokeProject, dshVersion, pnpm, env }) {
  const manifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  console.log(`[compat] packing ${manifest.name}@${manifest.version}`)
  await writeFile(join(smokeProject, 'package.json'), JSON.stringify({
    name: 'dsh-ears-compat-smoke',
    version: '0.0.0',
    private: true
  }, null, 2) + '\n')
  // The dsh 0.1.7 cordis plugin family all peer `~4.0.4`, matching the pinned
  // Cordis above, so the resolver picks its own co-tested generation instead of
  // an override list.
  await writeFile(join(smokeProject, 'pnpm-workspace.yaml'), [
    'packages:',
    '  - .',
    ''
  ].join('\n'))

  const tarballName = `${String(manifest.name).replace(/^@/u, '').replaceAll('/', '-')}-${manifest.version}.tgz`
  await runCommand(pnpm, ['pack', '--pack-destination', smokeProject], { cwd: projectRoot, env })
  const tarball = join(smokeProject, tarballName)
  const allowedBuilds = [
    '@deepseek-ai/dsh-subprocess-local',
    '@fugood/whisper.node',
    '@google/genai',
    'koffi',
    'node-pty',
    'protobufjs'
  ]
  const specs = [
    `@deepseek-ai/dsh@${dshVersion}`,
    ...peerDependencySpecs(manifest, dshVersion),
    'react-dom@18.3.1',
    tarball
  ]
  console.log(`[compat] installing dsh ${dshVersion} in an isolated project`)
  await runCommand(pnpm, ['add', '--save-exact', ...allowedBuilds.map((name) => `--allow-build=${name}`), ...specs], { cwd: smokeProject, env })
  const pluginRoot = join(smokeProject, 'node_modules', manifest.name)
  const installedManifest = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'))
  if (installedManifest.version !== manifest.version) throw new Error(`compat smoke installed an unexpected plugin version: ${installedManifest.version}`)
  const dshRoot = join(smokeProject, 'node_modules', '@deepseek-ai', 'dsh')
  const dshManifest = JSON.parse(await readFile(join(dshRoot, 'package.json'), 'utf8'))
  const dshBinEntry = typeof dshManifest.bin === 'string' ? dshManifest.bin : dshManifest.bin?.dsh
  if (typeof dshBinEntry !== 'string' || dshBinEntry === '') throw new Error('installed dsh package does not declare bin.dsh')
  return { manifest, pluginRoot, dshBin: resolve(dshRoot, dshBinEntry) }
}

const REMOTE_CALL_TIMEOUT_MS = 30_000

/** Invoke one strict Remote endpoint through the browser session cookie. */
async function callRemote(baseUrl, cookie, method, args) {
  const response = await fetch(new URL(`/api/${method}`, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
    signal: AbortSignal.timeout(REMOTE_CALL_TIMEOUT_MS)
  })
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`)
  const rpc = await response.json()
  if (rpc?.result?.ok !== true) throw new Error(`${method} failed: ${JSON.stringify(rpc?.result?.error ?? rpc)}`)
  return rpc.result.value
}

const SETTINGS_SETTLE_TIMEOUT_MS = 20_000
const SETTINGS_POLL_INTERVAL_MS = 250

/**
 * Read the settings view until `predicate` holds, then return that view.
 *
 * The Host imports a legacy `settings.yaml` only after the Loader has settled
 * every entry, so the first read after boot can precede the imported values.
 * Measured on dsh `0.2.0-rc.1`: the seeded canonical model, credential, and
 * backend were all live 2 s after the first read that still showed the
 * defaults. Polling keeps the canonical assertions strict without making them
 * depend on how fast one host finishes that import.
 */
async function waitForSettingsValue(baseUrl, cookie, predicate, description) {
  const deadline = Date.now() + SETTINGS_SETTLE_TIMEOUT_MS
  let value = await callRemote(baseUrl, cookie, 'dshEars/getSettings', {})
  while (!predicate(value)) {
    if (Date.now() >= deadline) {
      throw new Error(`settings did not reach ${description} within ${SETTINGS_SETTLE_TIMEOUT_MS}ms: ${JSON.stringify({ model: value?.settings?.cloudAsrGroqModel, backend: value?.settings?.asrBackend, credential: value?.cloudAsrGroqApiKeyConfigured })}`)
    }
    await new Promise((resolve) => setTimeout(resolve, SETTINGS_POLL_INTERVAL_MS))
    value = await callRemote(baseUrl, cookie, 'dshEars/getSettings', {})
  }
  return value
}

/** Start dsh web and return its base URL with a browser session cookie. */
async function bootWeb({ dshBin, projectRoot, env }) {
  const server = startServer(dshBin, ['web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
    cwd: projectRoot,
    env,
    timeoutMs: 90_000
  })
  try {
    const baseUrl = await server.ready
    const cookie = await exchangeLaunchToken(baseUrl)
    return { server, baseUrl, cookie }
  } catch (error) {
    // Ownership of the child passes to the caller only on success, so a failed
    // boot must release it here instead of leaving the Host running.
    await stopServer(server.child)
    throw error
  }
}

/**
 * Exercise the real dsh CLI against a temporary package project: pack this
 * local package, install the target DSH peer family, boot the web Host, fetch
 * the Client contribution, and invoke the strict getSettings Remote endpoint.
 * This is intentionally not called an end-to-end ASR test; it does not contact
 * an ASR provider or an LLM.
 */
export async function runCompatibilitySmoke({ projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url))), dshVersion, scenario = 'fresh', pnpm = 'pnpm' } = {}) {
  if (!VERIFIED_DSH_SMOKE_VERSIONS.includes(dshVersion)) {
    throw new Error(`compat smoke requires one of the verified DSH versions: ${VERIFIED_DSH_SMOKE_VERSIONS.join(', ')}`)
  }
  if (!SMOKE_SCENARIOS.includes(scenario)) {
    throw new Error(`compat smoke requires one of the scenarios: ${SMOKE_SCENARIOS.join(', ')}`)
  }

  const smokeHome = await mkdtemp(join(tmpdir(), 'dsh-ears-compat-'))
  const smokeProject = await mkdtemp(join(tmpdir(), 'dsh-ears-compat-project-'))
  const env = { ...process.env, DSH_HOME: smokeHome, CI: 'true' }
  let server
  try {
    const prepared = await prepareSmokeProject({ projectRoot, smokeProject, dshVersion, pnpm, env })
    console.log('[compat] registering the packed plugin')
    await runCommand(pnpm, ['exec', 'dsh', 'plugin', '--profile', 'web', 'add', prepared.pluginRoot], { cwd: smokeProject, env })
    if (scenario !== 'fresh') {
      // The Host imports the removed settings.yaml into the profile entry config
      // once the composition settles. JSON is valid YAML, so no emitter is needed.
      const section = scenario === 'canonical' ? canonicalSettingsDocument() : legacySettingsDocument()
      await writeFile(join(smokeHome, 'settings.yaml'), `${JSON.stringify({ 'dsh-ears': section }, null, 2)}\n`)
      console.log(`[compat] seeded a ${scenario} settings.yaml`)
    }
    console.log('[compat] starting dsh web')
    const first = await bootWeb({ dshBin: prepared.dshBin, projectRoot: smokeProject, env })
    server = first.server
    const baseUrl = first.baseUrl
    const cookie = first.cookie
    console.log('[compat] checking Client assets and Remote')
    const rootResponse = await waitForHttp(baseUrl, '/', { headers: { cookie } })
    if (!rootResponse.ok) throw new Error(`dsh web root returned HTTP ${rootResponse.status}`)
    const html = await rootResponse.text()
    const clientEntry = html.match(/\{"id":"dsh-ears","url":"([^"]+)"/u)
    if (clientEntry === null) throw new Error('dsh web boot manifest does not contain the dsh-ears Client contribution')

    const clientResponse = await waitForHttp(baseUrl, clientEntry[1], undefined)
    if (!clientResponse.ok) throw new Error(`dsh-ears Client bundle returned HTTP ${clientResponse.status}`)

    const value = await callRemote(baseUrl, cookie, 'dshEars/getSettings', {})
    if (value?.available !== true || typeof value?.settings?.asrBackend !== 'string') throw new Error('getSettings returned an invalid settings view')
    for (const field of ['cloudAsrGroqApiKey', 'cloudAsrDeepgramApiKey', 'cloudAsrCustomApiKey', 'cloudAsrBailianApiKey', 'cloudAsrTencentSecretKey', 'cloudAsrMimoApiKey', 'cloudAsrSiliconFlowApiKey', 'cloudAsrVolcengineApiKey']) {
      if (value.settings[field] !== '') throw new Error(`getSettings exposed the write-only field ${field}`)
    }
    if (value.settings.webSpeechLanguage === 'en-US') throw new Error('the smoke project already stores its probe value')

    console.log(`[compat] checking the ${scenario} settings document`)
    if (scenario === 'canonical') {
      // The legacy document is renamed before the Host writes anything, so it is
      // consumed even when the section cannot be mapped.
      if (!existsSync(join(smokeHome, 'settings.yaml.imported'))) throw new Error('the legacy settings document was not renamed after import')
      if (existsSync(join(smokeHome, 'settings.yaml'))) throw new Error('the legacy settings document was not consumed')
      // The v4 section dsh-ears 0.3.x wrote must be imported into the profile
      // entry config, read live, and keep its secret Host-side only.
      const imported = await waitForSettingsValue(baseUrl, cookie, (candidate) => candidate?.settings?.cloudAsrGroqModel === 'whisper-large-v3-turbo', 'the seeded canonical model')
      if (imported.cloudAsrGroqApiKeyConfigured !== true) throw new Error('the seeded canonical credential did not reach the Host')
    }
    if (scenario === 'legacy') {
      // Diagnostic until the observed behavior is codified: the pre-0.3 section
      // uses undeclared field names, which the Host refuses to import.
      console.log(`[compat] legacy model=${JSON.stringify(value.settings.cloudAsrGroqModel)} credential=${value.cloudAsrGroqApiKeyConfigured} imported=${existsSync(join(smokeHome, 'settings.yaml.imported'))}`)
    }

    // The 0.1.7 settings model derives the form from the exported Config and
    // writes into the profile entry config. The write must apply live and
    // survive a restart, not only live in a registered namespace.
    console.log('[compat] writing a settings field through the strict Remote')
    const written = await callRemote(baseUrl, cookie, 'dshEars/updateSettings', { patch: { webSpeechLanguage: 'en-US' } })
    if (written?.available !== true || written.settings.webSpeechLanguage !== 'en-US') {
      throw new Error(`updateSettings did not apply the write: ${JSON.stringify(written?.settings?.webSpeechLanguage)}`)
    }

    console.log('[compat] restarting dsh web to read the write back')
    await stopServer(server.child)
    const second = await bootWeb({ dshBin: prepared.dshBin, projectRoot: smokeProject, env })
    server = second.server
    const restartedRoot = await waitForHttp(second.baseUrl, '/', { headers: { cookie: second.cookie } })
    if (!restartedRoot.ok) throw new Error(`dsh web root returned HTTP ${restartedRoot.status} after the restart`)
    const restarted = await callRemote(second.baseUrl, second.cookie, 'dshEars/getSettings', {})
    if (restarted?.settings?.webSpeechLanguage !== 'en-US') {
      throw new Error('the settings write did not survive a dsh web restart')
    }
    if (scenario === 'canonical') {
      // An unrelated save and a restart must not disturb the imported section.
      const reimported = await waitForSettingsValue(second.baseUrl, second.cookie, (candidate) => candidate?.settings?.cloudAsrGroqModel === 'whisper-large-v3-turbo', 'the imported canonical model after the restart')
      if (reimported.cloudAsrGroqApiKeyConfigured !== true) throw new Error('the imported credential did not survive the write and restart')
    }
    if (scenario === 'legacy') {
      console.log(`[compat] legacy after write model=${JSON.stringify(restarted.settings.cloudAsrGroqModel)} credential=${restarted.cloudAsrGroqApiKeyConfigured}`)
    }

    return { dshVersion, scenario, baseUrl, clientServed: true, settingsLoaded: true, settingsPersisted: true }
  } finally {
    console.log('[compat] stopping dsh web and cleaning temporary projects')
    if (server !== undefined) await stopServer(server.child)
    const cleanup = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }
    await rm(smokeProject, cleanup)
    await rm(smokeHome, cleanup)
  }
}

function printHelp() {
  console.log('Usage: node scripts/compat-smoke.mjs --dsh-version <version> [--scenario fresh|canonical|legacy]')
  console.log(`Verified versions: ${VERIFIED_DSH_SMOKE_VERSIONS.join(', ')}`)
  console.log(`Scenarios: ${SMOKE_SCENARIOS.join(', ')} (default: every scenario, one isolated profile each)`)
  console.log('Boots a temporary dsh web profile with the local plugin, calls getSettings, writes a settings field, restarts, and reads it back.')
}

const invokedPath = process.argv[1] === undefined ? undefined : resolve(process.argv[1])
const modulePath = resolve(fileURLToPath(import.meta.url))
if (invokedPath === modulePath) {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
  } else {
    const index = args.indexOf('--dsh-version')
    const dshVersion = index >= 0 ? args[index + 1] : undefined
    const scenarioIndex = args.indexOf('--scenario')
    const scenario = scenarioIndex >= 0 ? args[scenarioIndex + 1] : undefined
    // Every scenario runs by default so a certification pass covers the fresh
    // install and both upgrade documents instead of only the first one.
    const scenarios = scenario === undefined ? SMOKE_SCENARIOS : [scenario]
    try {
      for (const selected of scenarios) {
        const result = await runCompatibilitySmoke({ dshVersion, scenario: selected })
        console.log(`Compatibility smoke passed for dsh ${result.dshVersion} (${result.scenario}): Client asset served, getSettings returned a redacted view, and a settings write survived a restart`)
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
