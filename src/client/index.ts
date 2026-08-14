import type { Context } from '@deepseek-ai/cordis'

export const inject: string[] = []

/**
 * Browser plugin entry. The microphone UI is introduced in M2.
 */
export function apply(_ctx: Context): void {
  // M1 verifies package discovery only.
}
