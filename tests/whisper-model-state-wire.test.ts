import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
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

describe('whisper model state wire safety', () => {
  it('returns gateway-safe states on every no-interpreter path', async () => {
    // Keep PATH to the Node directory only: this prevents a real whisper or
    // Python installation from making the test depend on the host machine.
    const manager = new WhisperModels({ env: { ...process.env, PATH: dirname(process.execPath) } })
    try {
      const states: WhisperModelState[] = [
        await manager.getWhisperModelState('tiny', false),
        await manager.getWhisperModelState('tiny', true),
        await manager.downloadWhisperModel('tiny', false),
        await manager.downloadWhisperModel('tiny', true),
        await manager.cancelWhisperModelDownload('tiny', false),
        await manager.deleteWhisperModel('tiny', true)
      ]
      for (const state of states) {
        expect(state.cliAvailable).toBeTypeOf('boolean')
        expect(() => assertGatewayWireSafe(state)).not.toThrow()
      }
      manager.dispose()
      const disposed = await manager.getWhisperModelState('tiny', false)
      expect(() => assertGatewayWireSafe(disposed)).not.toThrow()
    } finally {
      manager.dispose()
    }
  })

  it('keeps the downloaded-state shape gateway-safe', () => {
    expect(() => assertGatewayWireSafe({
      cliAvailable: true,
      downloaded: true,
      downloading: false,
      progress: null,
      bytes: null,
      totalBytes: 100,
      error: null
    })).not.toThrow()
  })
})
