import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { LlmModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { DEFAULT_EARS_SETTINGS, EarsSettingsSchema, SETTINGS_NAMESPACE, type PolishRoute } from '../config.js'
import type { EarsSettingsPatch, EarsSettingsView } from '../remote-contract.js'
import { POLISH_SYSTEM_PROMPT, polishUserText } from './prompts.js'

const MAX_TRANSCRIPT_CHARACTERS = 12_000
const POLISH_TIMEOUT_MS = 20_000

export class PolishService extends TypertRemoteService {
  static inject = ['llm']
  private settings: SettingsScope<import('../config.js').EarsSettings> | undefined

  constructor(ctx: Context) {
    super(ctx, 'dshEarsPolish', { namespace: 'dshEars' })
    ctx.inject(['settings'], (settingsCtx) => {
      this.settings = settingsCtx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), EarsSettingsSchema)
      settingsCtx.effect(() => () => {
        this.settings = undefined
      }, 'dsh-ears settings lifecycle')
    })
  }

  getSettings(): EarsSettingsView {
    if (this.settings === undefined) {
      return {
        available: false,
        writable: false,
        settings: DEFAULT_EARS_SETTINGS,
        overridden: []
      }
    }

    const snapshot = this.settings.get()
    return {
      available: true,
      writable: this.ctx.get('settings')?.writable ?? false,
      settings: snapshot,
      overridden: []
    }
  }

  async updateSettings(patch: EarsSettingsPatch): Promise<EarsSettingsView> {
    if (this.settings === undefined) return this.getSettings()
    await this.settings.update(patch)
    return this.getSettings()
  }

  async listRoutes(): Promise<PolishRoute[]> {
    const routes: PolishRoute[] = []

    for (const provider of this.ctx.llm.listProviders()) {
      let models: LlmModelInfo[]
      try {
        models = await this.ctx.llm.listModels(provider.id)
      } catch {
        continue
      }

      for (const model of models) {
        routes.push({
          provider: provider.id,
          providerName: provider.name,
          model: model.id,
          modelName: model.name
        })
      }
    }

    return routes
  }

  async polish(transcript: string, provider: string, model: string, signal: AbortSignal): Promise<string> {
    const raw = transcript.trim()
    if (raw === '' || provider.trim() === '' || model.trim() === '') return raw
    if (raw.length > MAX_TRANSCRIPT_CHARACTERS) return raw

    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), POLISH_TIMEOUT_MS)
    const forwardAbort = () => timeout.abort(signal.reason)
    signal.addEventListener('abort', forwardAbort, { once: true })

    try {
      const prepared = await this.ctx.llm.prepareCall({
        provider,
        model
      }, timeout.signal)
      const message = createUserMessage({
        content: [{ type: 'text', text: polishUserText(raw) }],
        source: { kind: 'user' }
      })
      const output = await collectText(prepared.stream({
        ...prepared.config,
        messages: [message],
        system: POLISH_SYSTEM_PROMPT,
        signal: timeout.signal
      }))

      return output === '' ? raw : output
    } catch {
      return raw
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', forwardAbort)
    }
  }
}

async function collectText(stream: AsyncIterable<StreamChunk>): Promise<string> {
  let text = ''
  let sawDelta = false

  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') {
      text += chunk.text
      sawDelta = true
      continue
    }

    if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
      throw new Error('The dsh LLM route did not complete polishing')
    }

    if (!sawDelta && chunk.type === 'block-end' && chunk.block.type === 'text') {
      text += chunk.block.text
    }
  }

  return text.trim()
}
