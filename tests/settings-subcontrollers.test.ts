import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { CloudProviderController } from '../src/client/cloud-provider-controller.js'
import { PolishStateController } from '../src/client/polish-state-controller.js'
import { EMPTY_WHISPER_STATE, WhisperModelController } from '../src/client/whisper-model-controller.js'
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
})
