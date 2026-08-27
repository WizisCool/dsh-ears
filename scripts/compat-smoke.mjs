import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const VERIFIED_DSH_SMOKE_VERSIONS = Object.freeze([
  '0.1.0-rc.6',
  '0.1.1-rc.2'
])

function commandName() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
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
      else rejectCommand(new Error(`${command} ${args.join(' ')} exited with ${signal ?? `code ${code}`}\n${output}`))
    })
  })
}

function startServer(command, args, options) {
  const child = spawn(command, args, {
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

/**
 * Exercise the real dsh CLI against a temporary profile: install this local
 * package, boot the web Host, serve the Client contribution, and invoke the
 * strict getSettings Remote endpoint. This is intentionally not called an
 * end-to-end ASR test; it does not contact an ASR provider or an LLM.
 */
export async function runCompatibilitySmoke({ projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url))), dshVersion, pnpm = commandName() } = {}) {
  if (!VERIFIED_DSH_SMOKE_VERSIONS.includes(dshVersion)) {
    throw new Error(`compat smoke requires one of the verified DSH versions: ${VERIFIED_DSH_SMOKE_VERSIONS.join(', ')}`)
  }

  const smokeHome = await mkdtemp(join(tmpdir(), 'dsh-ears-compat-'))
  const env = { ...process.env, DSH_HOME: smokeHome, CI: 'true' }
  let server
  try {
    await runCommand(pnpm, ['dlx', '--yes', `@deepseek-ai/dsh@${dshVersion}`, 'plugin', '--profile', 'web', 'add', projectRoot], { cwd: projectRoot, env })
    server = startServer(pnpm, ['dlx', '--yes', `@deepseek-ai/dsh@${dshVersion}`, 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'], {
      cwd: projectRoot,
      env,
      timeoutMs: 90_000
    })
    const baseUrl = await server.ready
    const rootResponse = await waitForHttp(baseUrl, '/', undefined)
    if (!rootResponse.ok) throw new Error(`dsh web root returned HTTP ${rootResponse.status}`)
    const html = await rootResponse.text()
    if (!html.includes('"id":"dsh-ears"')) throw new Error('dsh web boot manifest does not contain the dsh-ears Client contribution')

    const clientResponse = await waitForHttp(baseUrl, '/plugins/dsh-ears/client.js', undefined)
    if (!clientResponse.ok) throw new Error(`dsh-ears Client bundle returned HTTP ${clientResponse.status}`)

    const rpcResponse = await waitForHttp(baseUrl, '/api/dshEars/getSettings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
    for (const field of ['cloudAsrGroqApiKey', 'cloudAsrDeepgramApiKey', 'cloudAsrCustomApiKey', 'cloudAsrBailianApiKey', 'cloudAsrTencentSecretKey', 'cloudAsrMimoApiKey']) {
      if (value.settings[field] !== '') throw new Error(`getSettings exposed the write-only field ${field}`)
    }

    return { dshVersion, baseUrl, clientLoaded: true, settingsLoaded: true }
  } finally {
    if (server !== undefined) await stopServer(server.child)
    await rm(smokeHome, { recursive: true, force: true })
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
      console.log(`Compatibility smoke passed for dsh ${result.dshVersion}: Client bundle loaded and getSettings returned a redacted view`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    }
  }
}
