import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-ears'

export function apply(ctx: Context): void {
  console.log('[dsh-ears] plugin loaded')

  ctx.effect(() => {
    console.log('[dsh-ears] plugin active — hot reload verified')

    return () => {
      console.log('[dsh-ears] plugin disposed')
    }
  })
}
