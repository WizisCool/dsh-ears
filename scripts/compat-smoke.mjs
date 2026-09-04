import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const VERIFIED_DSH_SMOKE_VERSIONS = Object.freeze([
  '0.1.2-rc.1'
])

function commandInvocation(args) {
  return process.platform === 'win32'
    ? { command: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', 'pnpm.cmd', ...args] }
    : { command: 'pnpm', args }
}

function runCommand(_command, args, options = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const invocation = commandInvocation(args)
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
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
      else rejectCommand(new Error(`pnpm ${args.join(' ')} exited with ${signal ?? `code ${code}`}\n${output}`))
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
    if (name === '@deepseek-ai/cordis') return `${name}@4.0.2`
    if (name === '@deepseek-ai/schemastery') return `${name}@3.18.2`
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
  await runCommand(pnpm, ['add', '--ignore-workspace', '--save-exact', ...allowedBuilds.map((name) => `--allow-build=${name}`), ...specs], { cwd: smokeProject, env })
  const pluginRoot = join(smokeProject, 'node_modules', manifest.name)
  const installedManifest = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'))
  if (installedManifest.version !== manifest.version) throw new Error(`compat smoke installed an unexpected plugin version: ${installedManifest.version}`)
  const dshRoot = join(smokeProject, 'node_modules', '@deepseek-ai', 'dsh')
  const dshManifest = JSON.parse(await readFile(join(dshRoot, 'package.json'), 'utf8'))
  const dshBinEntry = typeof dshManifest.bin === 'string' ? dshManifest.bin : dshManifest.bin?.dsh
  if (typeof dshBinEntry !== 'string' || dshBinEntry === '') throw new Error('installed dsh package does not declare bin.dsh')
  return { manifest, pluginRoot, dshBin: resolve(dshRoot, dshBinEntry) }
}

/**
 * Exercise the real dsh CLI against a temporary package project: pack this
 * local package, install the target DSH peer family, boot the web Host, fetch
 * the Client contribution, and invoke the strict getSettings Remote endpoint.
 * This is intentionally not called an end-to-end ASR test; it does not contact
 * an ASR provider or an LLM.
 */
export async function runCompatibilitySmoke({ projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url))), dshVersion, pnpm = 'pnpm' } = {}) {
  if (!VERIFIED_DSH_SMOKE_VERSIONS.includes(dshVersion)) {
    throw new Error(`compat smoke requires one of the verified DSH versions: ${VERIFIED_DSH_SMOKE_VERSIONS.join(', ')}`)
  }

  const smokeHome = await mkdtemp(join(tmpdir(), 'dsh-ears-compat-'))
  const smokeProject = await mkdtemp(join(tmpdir(), 'dsh-ears-compat-project-'))
  const env = { ...process.env, DSH_HOME: smokeHome, CI: 'true' }
  let server
  try {
    const prepared = await prepareSmokeProject({ projectRoot, smokeProject, dshVersion, pnpm, env })
    console.log('[compat] registering the packed plugin')
    await runCommand(pnpm, ['exec', 'dsh', 'plugin', '--profile', 'web', 'add', prepared.pluginRoot], { cwd: smokeProject, env })
    console.log('[compat] starting dsh web')
    server = startServer(prepared.dshBin, ['web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
      cwd: smokeProject,
      env,
      timeoutMs: 90_000
    })
    const baseUrl = await server.ready
    console.log(`[compat] exchanging the browser launch token at ${baseUrl}`)
    const cookie = await exchangeLaunchToken(baseUrl)
    console.log('[compat] checking Client assets and Remote')
    const rootResponse = await waitForHttp(baseUrl, '/', { headers: { cookie } })
    if (!rootResponse.ok) throw new Error(`dsh web root returned HTTP ${rootResponse.status}`)
    const html = await rootResponse.text()
    const clientEntry = html.match(/\{"id":"dsh-ears","url":"([^"]+)"/u)
    if (clientEntry === null) throw new Error('dsh web boot manifest does not contain the dsh-ears Client contribution')

    const clientResponse = await waitForHttp(baseUrl, clientEntry[1], undefined)
    if (!clientResponse.ok) throw new Error(`dsh-ears Client bundle returned HTTP ${clientResponse.status}`)

    const rpcResponse = await waitForHttp(baseUrl, '/api/dshEars/getSettings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: randomUUID(),
        method: 'dshEars/getSettings',
        payload: { args: {} }
      })
    })
    if (!rpcResponse.ok) throw new Error(`getSettings returned HTTP ${rpcResponse.status}`)
    const rpc = await rpcResponse.json()
    if (rpc?.result?.ok !== true) throw new Error(`getSettings failed: ${JSON.stringify(rpc?.result?.error ?? rpc)}`)
    const value = rpc.result.value
    if (value?.available !== true || typeof value?.settings?.asrBackend !== 'string') throw new Error('getSettings returned an invalid settings view')
    for (const field of ['cloudAsrGroqApiKey', 'cloudAsrDeepgramApiKey', 'cloudAsrCustomApiKey', 'cloudAsrBailianApiKey', 'cloudAsrTencentSecretKey', 'cloudAsrMimoApiKey', 'cloudAsrSiliconFlowApiKey', 'cloudAsrVolcengineApiKey']) {
      if (value.settings[field] !== '') throw new Error(`getSettings exposed the write-only field ${field}`)
    }

    return { dshVersion, baseUrl, clientServed: true, settingsLoaded: true }
  } finally {
    console.log('[compat] stopping dsh web and cleaning temporary projects')
    if (server !== undefined) await stopServer(server.child)
    const cleanup = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }
    await rm(smokeProject, cleanup)
    await rm(smokeHome, cleanup)
  }
}

function printHelp() {
  console.log('Usage: node scripts/compat-smoke.mjs --dsh-version <version>')
  console.log(`Verified versions: ${VERIFIED_DSH_SMOKE_VERSIONS.join(', ')}`)
  console.log('Boots a temporary dsh web profile with the local plugin and calls getSettings.')
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
    try {
      const result = await runCompatibilitySmoke({ dshVersion })
      console.log(`Compatibility smoke passed for dsh ${result.dshVersion}: Client asset served and getSettings returned a redacted view`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
