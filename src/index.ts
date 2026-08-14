import type { Context } from '@deepseek-ai/cordis'
import { PolishService } from './polish/service.js'

export const name = 'dsh-ears'

export async function apply(ctx: Context): Promise<void> {
  await ctx.plugin(PolishService)

  ctx.effect(() => {
    return () => undefined
  }, 'dsh-ears lifecycle')
}
