import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { CloudProviderController } from '../src/client/cloud-provider-controller.js'
import { PolishStateController } from '../src/client/polish-state-controller.js'
import { EMPTY_WHISPER_STATE, WhisperModelController } from '../src/client/whisper-model-controller.js'
import { EARS_ERROR_CODES } from '../src/errors.js'
import type { EarsRemote } from '../src/remote.js'
import type { CloudProviderModelsView, ReasoningEffortsView, WhisperModelState } from '../src/remote-contract.js'

vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  createSnapshotStore: (initial: unknown) => {
    let value = initial
    const listeners = new Set<() => void>()
    return {
      getSnapshot: () => value,
      set: (next: unknown) => {
        value = next
        for (const listener of listeners) listener()
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    }
  }
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve })
  return { promise, resolve }
}

describe('settings subcontroller races', () => {
  it('keeps the latest cloud provider model response', async () => {
    const groq = deferred<RemoteResult<CloudProviderModelsView>>()
    const deepgram = deferred<RemoteResult<CloudProviderModelsView>>()
    const listCloudProviderModels = vi.fn((provider: string) => provider === 'groq' ? groq.promise : deepgram.promise)
    const remote = { listCloudProviderModels } as unknown as EarsRemote
    const controller = new CloudProviderController()

    const first = controller.refresh(remote, 'groq')
    const second = controller.refresh(remote, 'deepgram')
    deepgram.resolve({ ok: true, value: { status: 'ok', models: ['nova-3'] } })
    await second
    groq.resolve({ ok: true, value: { status: 'ok', models: ['whisper-large-v3-turbo'] } })
    await first

    expect(controller.getStore().getSnapshot().view).toEqual({ status: 'ok', models: ['nova-3'] })
    controller.dispose()
  })

  it('projects Deepgram models by service and aborts the superseded listing', async () => {
    const first = deferred<RemoteResult<CloudProviderModelsView>>()
    const second = deferred<RemoteResult<CloudProviderModelsView>>()
    const signals: AbortSignal[] = []
    const listCloudProviderModels = vi.fn((provider: string, signal?: AbortSignal) => {
      if (signal !== undefined) signals.push(signal)
      return provider === 'deepgram' && signals.length === 1 ? first.promise : second.promise
    })
    const remote = { listCloudProviderModels } as unknown as EarsRemote
    const controller = new CloudProviderController()

    const recording = controller.refresh(remote, 'deepgram', 'recording-file')
    const realtime = controller.refresh(remote, 'deepgram', 'realtime')
    second.resolve({ ok: true, value: {
      status: 'ok',
      models: ['batch-only', 'stream-only', 'dual-mode', 'unknown-mode'],
      modelCapabilities: {
        'batch-only': { batch: true, streaming: false },
        'stream-only': { batch: false, streaming: true },
        'dual-mode': { batch: true, streaming: true }
      }
    } })
    await realtime
    first.resolve({ ok: true, value: { status: 'ok', models: ['batch-only'] } })
    await recording

    expect(signals[0]?.aborted).toBe(true)
    expect(controller.getStore().getSnapshot().view).toMatchObject({ status: 'ok', models: ['stream-only', 'dual-mode'] })
    controller.dispose()
  })

  it('keeps unannotated legacy Deepgram catalogs usable', async () => {
    const listCloudProviderModels = vi.fn(async () => ({
      ok: true as const,
      value: { status: 'ok' as const, models: ['legacy-model'] }
    }))
    const remote = { listCloudProviderModels } as unknown as EarsRemote
    const controller = new CloudProviderController()

    await controller.refresh(remote, 'deepgram', 'realtime')

    expect(controller.getStore().getSnapshot().view).toEqual({ status: 'ok', models: ['legacy-model'] })
    controller.dispose()
  })

  it('preserves a known Host model-listing error code', async () => {
    const listCloudProviderModels = vi.fn(async () => ({
      ok: false as const,
      error: { code: EARS_ERROR_CODES.cloudModelsTimedOut, message: 'Cloud model listing timed out', details: {} }
    }))
    const remote = { listCloudProviderModels } as unknown as EarsRemote
    const controller = new CloudProviderController()

    await controller.refresh(remote, 'groq')

    expect(controller.getStore().getSnapshot().view).toMatchObject({
      status: 'error',
      errorCode: EARS_ERROR_CODES.cloudModelsTimedOut
    })
    controller.dispose()
  })

  it('invalidates a catalog and ignores its late response', async () => {
    const pending = deferred<RemoteResult<CloudProviderModelsView>>()
    const listCloudProviderModels = vi.fn(() => pending.promise)
    const remote = { listCloudProviderModels } as unknown as EarsRemote
    const controller = new CloudProviderController()

    const refresh = controller.refresh(remote, 'groq')
    await vi.waitFor(() => expect(listCloudProviderModels).toHaveBeenCalledTimes(1))
    controller.invalidate()
    pending.resolve({ ok: true, value: { status: 'ok', models: ['stale-model'] } })
    await refresh

    expect(controller.getStore().getSnapshot()).toEqual({ status: 'ready', view: { status: 'unsupported' } })
    controller.dispose()
  })

  it('keeps the latest reasoning-effort response', async () => {
    const firstEfforts = deferred<RemoteResult<ReasoningEffortsView>>()
    const secondEfforts = deferred<RemoteResult<ReasoningEffortsView>>()
    const listReasoningEfforts = vi.fn((provider: string) => provider === 'p1' ? firstEfforts.promise : secondEfforts.promise)
    const remote = { listReasoningEfforts } as unknown as EarsRemote
    const controller = new PolishStateController()

    const first = controller.refreshReasoningEfforts(remote, 'p1', 'm1')
    const second = controller.refreshReasoningEfforts(remote, 'p2', 'm2')
    secondEfforts.resolve({ ok: true, value: { efforts: [{ id: 'p2-high', name: 'P2 high' }] } })
    await second
    firstEfforts.resolve({ ok: true, value: { efforts: [{ id: 'p1-high', name: 'P1 high' }] } })
    await first

    expect(controller.getReasoningStore().getSnapshot().efforts).toEqual([{ id: 'p2-high', name: 'P2 high' }])
    controller.dispose()
  })

  it('does not publish a Whisper response after disposal', async () => {
    const pending = deferred<RemoteResult<WhisperModelState>>()
    const getWhisperModelState = vi.fn(() => pending.promise)
    const remote = { getWhisperModelState } as unknown as EarsRemote
    const controller = new WhisperModelController(remote, {
      currentModel: () => 'tiny',
      hasPendingAcceleration: () => false
    })

    const refresh = controller.refresh()
    controller.dispose()
    pending.resolve({ ok: true, value: { ...EMPTY_WHISPER_STATE, downloaded: true } })
    await refresh

    expect(controller.getStore().getSnapshot().state).toEqual(EMPTY_WHISPER_STATE)
  })

  it('does not start overlapping Whisper model mutations', async () => {
    const pending = deferred<RemoteResult<WhisperModelState>>()
    const downloadWhisperModel = vi.fn(() => pending.promise)
    const remote = { downloadWhisperModel } as unknown as EarsRemote
    const controller = new WhisperModelController(remote, {
      currentModel: () => 'tiny',
      hasPendingAcceleration: () => false
    })

    const first = controller.download()
    await vi.waitFor(() => expect(downloadWhisperModel).toHaveBeenCalledTimes(1))
    await controller.download()
    expect(downloadWhisperModel).toHaveBeenCalledTimes(1)

    pending.resolve({ ok: true, value: { ...EMPTY_WHISPER_STATE, downloaded: true } })
    await first
    expect(controller.getStore().getSnapshot().state.downloaded).toBe(true)
    controller.dispose()
  })
})
