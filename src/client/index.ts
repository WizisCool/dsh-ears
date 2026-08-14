import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConversationSlotProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { MicrophoneButton } from './MicrophoneButton.js'

/** Required Client service: the slot registry owns the UI contribution lifecycle. */
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  void ({} as ConversationSlotProps)
  ctx.slots.inject('conversation.input.right', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.right',
        id: 'dsh-ears-voice',
        order: 30
      },
      MicrophoneButton
    )
  )
}
