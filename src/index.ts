import type { Context } from '@deepseek-ai/cordis'
import { EarsSettingsSchema } from './config-schema.js'
import { PolishService } from './polish/service.js'

export const name = 'dsh-ears'

/** Plugin configuration schema; dsh derives the entry's settings form from it. */
export const Config = EarsSettingsSchema

/** The settings service owns the profile entry config this plugin reads and writes. */
export const inject = ['settings']

export async function apply(ctx: Context): Promise<void> {
  // dsh-ears ships its own settings page, so the loader entry must not also
  // render an automatically generated form. `configure` binds the policy to the
  // calling fiber — the loader entry here, not the nested service below it.
  const disposePresentation = ctx.settings.configure({ auto: false })
  ctx.effect(() => disposePresentation, 'dsh-ears settings presentation')

  await ctx.plugin(PolishService)

  ctx.effect(() => {
    return () => undefined
  }, 'dsh-ears lifecycle')
}
