import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { WhisperModels, type WhisperModelState } from '../src/asr/whisper-models.js'
import { whisperModelStateSchema } from '../src/remote-contract.js'

/**
 * Reproduce the dsh-api-gateway strict result check: the zod parse of a
 * strict result must keep every own enumerable property JSON-safe. Optional
 * keys that arrive with an `undefined` value survive the parse as own
 * properties, so the gateway rejects the business result
 * ("business result failed boundary validation") even though the schema
 * accepted it: a WhisperModelState must never carry an `undefined` value.
 */
function assertGatewayWireSafe(state: unknown): void {
  const parsed = whisperModelStateSchema.parse(state)
  const walk = (value: unknown): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('non-finite number is not JSON-safe')
      return
    }
    if (typeof value !== 'object' || value === null) throw new Error(`${typeof value} is not JSON-safe`)
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) throw new Error(`${key} is not JSON-safe`)
      walk(item)
    }
  }
  walk(parsed)
}

async function withManager(run: (manager: WhisperModels) => Promise<void>): Promise<void> {
  const cacheDir = await mkdtemp(join(tmpdir(), 'dsh-ears-wire-'))
  const fetchMock = vi.fn(async () => {
    throw new Error('offline test')
  }) as unknown as typeof fetch
  const manager = new WhisperModels({
    env: { ...process.env, DSH_EARS_WHISPER_CACHE_DIR: cacheDir },
    fetch: fetchMock
  })
  try {
    await run(manager)
  } finally {
    manager.dispose()
    await rm(cacheDir, { recursive: true, force: true })
  }
}

describe('whisper model state wire safety', () => {
  it('returns gateway-safe states across unavailable, download, cancel, and dispose paths', async () => {
    await withManager(async (manager) => {
      const states: WhisperModelState[] = [
        await manager.getWhisperModelState('tiny', false),
        await manager.getWhisperModelState('tiny', true),
        await manager.downloadWhisperModel('tiny', false),
        await manager.cancelWhisperModelDownload('tiny', false),
        await manager.deleteWhisperModel('tiny', true)
      ]
      for (const state of states) {
        expect(state.runtimeAvailable).toBeTypeOf('boolean')
        expect(() => assertGatewayWireSafe(state)).not.toThrow()
      }

      manager.dispose()
      const disposed = await manager.getWhisperModelState('tiny', false)
      expect(disposed.runtimeAvailable).toBe(false)
      expect(() => assertGatewayWireSafe(disposed)).not.toThrow()
    })
  })

  it('does not emit removed Python or platform diagnostics', async () => {
    await withManager(async (manager) => {
      for (const runtimeAvailable of [false, true]) {
        const state = await manager.getWhisperModelState('tiny', runtimeAvailable)
        expect(state.runtimeAvailable).toBe(runtimeAvailable)
        expect(state).not.toHaveProperty('cliAvailable')
        expect(state).not.toHaveProperty('platform')
        expect(state).not.toHaveProperty('environment')
        expect(() => assertGatewayWireSafe(state)).not.toThrow()
      }
    })
  })

  it('keeps the downloaded-state shape gateway-safe', () => {
    expect(() => assertGatewayWireSafe({
      runtimeAvailable: true,
      downloaded: true,
      downloading: false,
      progress: null,
      bytes: null,
      totalBytes: 100,
      error: null
    })).not.toThrow()
  })
})
