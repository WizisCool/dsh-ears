import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { executableSuffixes, parseDownloadProgress, pythonCandidates, WhisperModels, type WhisperModelState } from '../src/asr/whisper-models.js'
import { readShebangInterpreter } from '../src/asr/whisper-discovery.js'

describe('whisper download progress parsing', () => {
  it('extracts percent and sizes from a tqdm line', () => {
    expect(parseDownloadProgress(' 42%|████▌     | 63.2M/150M [00:12<00:16, 5.89MB/s]')).toEqual({
      percent: 0.42,
      bytes: Math.round(63.2 * 1024 * 1024),
      totalBytes: 150 * 1024 * 1024
    })
  })

  it('uses the last update when a chunk carries carriage-return updates', () => {
    expect(parseDownloadProgress(' 10%|██        | 15.0M/150M\r 85%|████████▌ | 128M/150M')).toEqual({
      percent: 0.85,
      bytes: 128 * 1024 * 1024,
      totalBytes: 150 * 1024 * 1024
    })
  })

  it('parses bytes with explicit iB suffixes', () => {
    expect(parseDownloadProgress('100%|██████████| 72.1MiB/72.1MiB [00:02<00:00, 28.2MiB/s]')).toEqual({
      percent: 1,
      bytes: Math.round(72.1 * 1024 * 1024),
      totalBytes: Math.round(72.1 * 1024 * 1024)
    })
  })

  it('returns nulls for text without a progress tuple', () => {
    expect(parseDownloadProgress('some warning line\n')).toEqual({ percent: null, bytes: null, totalBytes: null })
  })
})

describe('windows executable discovery', () => {
  it('probes python.exe and py.exe launchers on win32', () => {
    expect(pythonCandidates('win32')).toEqual(['python.exe', 'py.exe'])
    expect(pythonCandidates('darwin')).toEqual(['python3', 'python'])
  })

  it('expands extension-less commands against PATHEXT on win32', () => {
    expect(executableSuffixes('py', 'win32', '.EXE;.CMD')).toEqual(['', '.EXE', '.CMD'])
    expect(executableSuffixes('py', 'win32', undefined)).toEqual(['', '.COM', '.EXE', '.BAT', '.CMD'])
  })

  it('leaves commands with extensions and POSIX probing untouched', () => {
    expect(executableSuffixes('python.exe', 'win32', '.EXE;.CMD')).toEqual([''])
    expect(executableSuffixes('python3', 'darwin', undefined)).toEqual([''])
  })
})

describe('whisper shebang discovery', () => {
  it('reads only the interpreter from a shebang line', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-ears-shebang-'))
    const script = join(directory, 'whisper')
    const leftover = join(directory, 'not-a-script')
    try {
      await writeFile(script, '#!/usr/bin/env python3\nprint("ok")\n')
      await writeFile(leftover, 'this is not a shebang\n')
      await expect(readShebangInterpreter(script)).resolves.toBe('python3')
      await expect(readShebangInterpreter(leftover)).resolves.toBeUndefined()
      await expect(readShebangInterpreter(join(directory, 'missing'))).resolves.toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

/**
 * A fake `python3` executable that speaks the three helper protocols the
 * manager uses: the spec probe, the model-table dump, and the model download.
 * It writes into the XDG_CACHE_HOME it inherits, so tests keep the cache fully
 * isolated from the real `~/.cache/whisper`.
 */
const FAKE_PYTHON_SCRIPT = [
  '#!/usr/bin/env node',
  "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'",
  "import { homedir } from 'node:os'",
  "import { join } from 'node:path'",
  'const args = process.argv.slice(2)',
  "const scriptIndex = args.indexOf('-c')",
  "const script = scriptIndex === -1 ? '' : args[scriptIndex + 1]",
  'const model = args[args.length - 1]',
  "const root = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'whisper')",
  "if (process.env.FAKE_WHISPER_LOG) appendFileSync(process.env.FAKE_WHISPER_LOG, 'invoked\\n')",
  "if (script.includes('find_spec')) {",
  "  process.stdout.write(process.env.FAKE_WHISPER_NO_SPEC === '1' ? 'False\\n' : 'True\\n')",
  '  process.exit(0)',
  '}',
  "if (script.includes('print(json.dumps')) {",
  "  if (process.env.FAKE_WHISPER_BAD_TABLE === '1') { process.stdout.write('not json\\n'); process.exit(0) }",
  "  process.stdout.write(JSON.stringify({ root: root, files: { tiny: 'tiny.pt', base: 'base.pt' } }) + '\\n')",
  '  process.exit(0)',
  '}',
  "if (script.includes('_download')) {",
  "  mkdirSync(root, { recursive: true })",
  "  writeFileSync(join(root, model + '.pt'), 'partial')",
  "  const slow = process.env.FAKE_WHISPER_SLOW === '1'",
  "  const fail = process.env.FAKE_WHISPER_FAIL === '1'",
  '  if (slow) {',
  "    process.stderr.write(' 42%|████▌     | 63.2M/150M [00:12<00:16, 5.89MB/s]\\n')",
  '    setTimeout(() => {',
  "      if (fail) { process.stderr.write('Traceback (most recent call last):\\n  boom\\nRuntimeError: boom\\n'); process.exit(1) }",
  "      process.stderr.write('__DSH_EARS_DONE__\\n')",
  '      process.exit(0)',
  '    }, 60000)',
  '  } else if (fail) {',
  "    process.stderr.write('Traceback (most recent call last):\\n  boom\\nRuntimeError: boom\\n')",
  '    process.exit(1)',
  '  } else {',
  "    process.stderr.write('__DSH_EARS_DONE__\\n')",
  '    process.exit(0)',
  '  }',
  '} else {',
  "  process.stdout.write('False\\n')",
  '  process.exit(0)',
  '}',
  ''
].join('\n')

/**
 * The fake python is a POSIX shebang script; native Windows cannot spawn it
 * (CreateProcess requires a real PE executable), so the spawn-based lifecycle
 * suite runs only where the kernel handles the shebang. Platform-independent
 * coverage remains in the discovery and progress-parsing suites.
 */
describe.skipIf(process.platform === 'win32')('whisper model lifecycle', () => {
  let binDir: string
  let baseEnv: NodeJS.ProcessEnv

  beforeAll(async () => {
    binDir = await mkdtemp(join(tmpdir(), 'dsh-ears-fake-bin-'))
    await writeFile(join(binDir, 'python3'), FAKE_PYTHON_SCRIPT)
    await chmod(join(binDir, 'python3'), 0o755)
    // Only the fake bin dir and the node directory are on PATH, so discovery
    // can never fall through to a real whisper CLI or Python installation.
    baseEnv = { ...process.env, PATH: `${binDir}:${dirname(process.execPath)}` }
  })

  afterAll(async () => {
    await rm(binDir, { recursive: true, force: true })
  })

  async function makeEnv(extra: Record<string, string> = {}): Promise<{ cacheDir: string; env: NodeJS.ProcessEnv }> {
    const cacheDir = await mkdtemp(join(tmpdir(), 'dsh-ears-fake-cache-'))
    return { cacheDir, env: { ...baseEnv, XDG_CACHE_HOME: cacheDir, ...extra } }
  }

  async function waitForState(manager: WhisperModels, predicate: (state: WhisperModelState) => boolean, timeoutMs = 5000): Promise<WhisperModelState> {
    const deadline = Date.now() + timeoutMs
    let state = await manager.getWhisperModelState('tiny', true)
    while (!predicate(state)) {
      if (Date.now() > deadline) throw new Error('timed out waiting for whisper model state')
      await new Promise((resolve) => setTimeout(resolve, 20))
      state = await manager.getWhisperModelState('tiny', true)
    }
    return state
  }

  async function waitForGone(path: string, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        await stat(path)
      } catch {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`file still exists: ${path}`)
  }

  it('downloads a model, writes the completion marker, and reports downloaded', async () => {
    const { cacheDir, env } = await makeEnv()
    const manager = new WhisperModels({ env })
    try {
      const start = await manager.downloadWhisperModel('tiny', true)
      expect(start.downloading).toBe(true)
      const done = await waitForState(manager, (state) => !state.downloading)
      expect(done.downloaded).toBe(true)
      expect(done.error).toBeNull()
      await stat(join(cacheDir, 'whisper', 'tiny.pt'))
      await stat(join(cacheDir, 'whisper', 'tiny.pt.dsh-ears-done'))
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('treats a model file without a completion marker as not downloaded', async () => {
    const { cacheDir, env } = await makeEnv()
    await mkdir(join(cacheDir, 'whisper'), { recursive: true })
    await writeFile(join(cacheDir, 'whisper', 'tiny.pt'), 'stale')
    const manager = new WhisperModels({ env })
    try {
      const state = await manager.getWhisperModelState('tiny', true)
      expect(state.downloaded).toBe(false)
      expect(state.error).toContain('not downloaded by dsh-ears')
      expect(state.errorCode).toBe('whisper.modelUnverified')
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('removes an orphaned completion marker when the model file is missing', async () => {
    const { cacheDir, env } = await makeEnv()
    await mkdir(join(cacheDir, 'whisper'), { recursive: true })
    await writeFile(join(cacheDir, 'whisper', 'tiny.pt.dsh-ears-done'), 'tiny')
    const manager = new WhisperModels({ env })
    try {
      const state = await manager.getWhisperModelState('tiny', true)
      expect(state.downloaded).toBe(false)
      expect(state.error).toBeNull()
      await waitForGone(join(cacheDir, 'whisper', 'tiny.pt.dsh-ears-done'))
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('refuses a second download while another model is still downloading', async () => {
    const { cacheDir, env } = await makeEnv({ FAKE_WHISPER_SLOW: '1' })
    const manager = new WhisperModels({ env })
    try {
      await manager.downloadWhisperModel('tiny', true)
      await waitForState(manager, (state) => state.downloading)
      const blocked = await manager.downloadWhisperModel('base', true)
      expect(blocked.downloading).toBe(true)
      expect(blocked.error).toBe('Another Whisper model is already downloading.')
      expect(blocked.errorCode).toBe('whisper.alreadyDownloading')
      const tiny = await manager.getWhisperModelState('tiny', true)
      expect(tiny.downloading).toBe(true)
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('cancelling a download kills the child and removes the partial file', async () => {
    const { cacheDir, env } = await makeEnv({ FAKE_WHISPER_SLOW: '1' })
    const manager = new WhisperModels({ env })
    try {
      await manager.downloadWhisperModel('tiny', true)
      const progress = await waitForState(manager, (state) => state.progress !== null && state.progress > 0)
      expect(progress.progress).toBeCloseTo(0.42, 5)
      const cancelled = await manager.cancelWhisperModelDownload('tiny', true)
      expect(cancelled.downloading).toBe(false)
      expect(cancelled.downloaded).toBe(false)
      expect(cancelled.error).toBeNull()
      await waitForGone(join(cacheDir, 'whisper', 'tiny.pt'))
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('removes the partial file and reports the traceback tail when a download fails', async () => {
    const { cacheDir, env } = await makeEnv({ FAKE_WHISPER_FAIL: '1' })
    const manager = new WhisperModels({ env })
    try {
      await manager.downloadWhisperModel('tiny', true)
      const done = await waitForState(manager, (state) => !state.downloading)
      expect(done.downloaded).toBe(false)
      expect(done.error).toContain('RuntimeError: boom')
      expect(done.errorCode).toBe('whisper.downloadFailed')
      await waitForGone(join(cacheDir, 'whisper', 'tiny.pt'))
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('deleting a model removes the file and its completion marker', async () => {
    const { cacheDir, env } = await makeEnv()
    const manager = new WhisperModels({ env })
    try {
      await manager.downloadWhisperModel('tiny', true)
      await waitForState(manager, (state) => state.downloaded)
      const after = await manager.deleteWhisperModel('tiny', true)
      expect(after.downloaded).toBe(false)
      expect(after.error).toBeNull()
      await waitForGone(join(cacheDir, 'whisper', 'tiny.pt'))
      await waitForGone(join(cacheDir, 'whisper', 'tiny.pt.dsh-ears-done'))
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('dispose kills an active download, removes the partial file, and freezes the instance', async () => {
    const { cacheDir, env } = await makeEnv({ FAKE_WHISPER_SLOW: '1' })
    const manager = new WhisperModels({ env })
    await manager.downloadWhisperModel('tiny', true)
    await waitForState(manager, (state) => state.progress !== null && state.progress > 0)
    manager.dispose()
    await waitForGone(join(cacheDir, 'whisper', 'tiny.pt'))
    const state = await manager.getWhisperModelState('tiny', true)
    expect(state.downloading).toBe(false)
    expect(state.downloaded).toBe(false)
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('negative-caches interpreter discovery failures and re-probes after the TTL', async () => {
    const { cacheDir, env } = await makeEnv({ FAKE_WHISPER_NO_SPEC: '1' })
    const logPath = join(cacheDir, 'probes.log')
    const manager = new WhisperModels({ env: { ...env, FAKE_WHISPER_LOG: logPath }, failureCacheTtlMs: 200 })
    const probeCount = async () => {
      try {
        const log = await readFile(logPath, 'utf8')
        return log.trim().split('\n').filter((line) => line !== '').length
      } catch {
        return 0
      }
    }
    try {
      const first = await manager.downloadWhisperModel('tiny', false)
      expect(first.error).toContain('openai-whisper is not installed')
      expect(first.errorCode).toBe('whisper.notInstalled')
      expect(await probeCount()).toBe(1)

      const second = await manager.downloadWhisperModel('tiny', false)
      expect(second.error).toContain('openai-whisper is not installed')
      expect(second.errorCode).toBe('whisper.notInstalled')
      expect(await probeCount()).toBe(1)

      await new Promise((resolve) => setTimeout(resolve, 250))
      await manager.downloadWhisperModel('tiny', false)
      expect(await probeCount()).toBe(2)
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  it('negative-caches model table failures instead of re-spawning on each retry', async () => {
    const { cacheDir, env } = await makeEnv({ FAKE_WHISPER_BAD_TABLE: '1' })
    const logPath = join(cacheDir, 'probes.log')
    const manager = new WhisperModels({ env: { ...env, FAKE_WHISPER_LOG: logPath }, failureCacheTtlMs: 200 })
    const probeCount = async () => {
      try {
        const log = await readFile(logPath, 'utf8')
        return log.trim().split('\n').filter((line) => line !== '').length
      } catch {
        return 0
      }
    }
    try {
      const first = await manager.getWhisperModelState('tiny', true)
      expect(first.error).not.toBeNull()
      const afterFirst = await probeCount()
      expect(afterFirst).toBeGreaterThan(0)

      const second = await manager.getWhisperModelState('tiny', true)
      expect(second.error).toBe(first.error)
      expect(await probeCount()).toBe(afterFirst)
    } finally {
      manager.dispose()
      await rm(cacheDir, { recursive: true, force: true })
    }
  })
})
