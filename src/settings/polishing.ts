export const MAX_POLISH_PROMPT_LENGTH = 4000

export interface PolishingSettings {
  enabled: boolean
  provider: string
  model: string
  reasoningEffort: string
  prompt: string
}

export const DEFAULT_POLISHING_SETTINGS: PolishingSettings = Object.freeze({
  enabled: false,
  provider: '',
  model: '',
  reasoningEffort: '',
  prompt: ''
})
