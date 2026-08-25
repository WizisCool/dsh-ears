export const MAX_CLOUD_API_KEY_LENGTH = 512

export interface CloudAsrProviderSettings {
  apiKey: string
  model: string
}

export interface CustomOpenAiSettings extends CloudAsrProviderSettings {
  endpoint: string
}

export interface BailianSettings extends CloudAsrProviderSettings {
  host: string
}

export interface CloudAsrSettings {
  groq: CloudAsrProviderSettings
  customOpenAi: CustomOpenAiSettings
  bailian: BailianSettings
}

export const DEFAULT_CLOUD_ASR_SETTINGS: CloudAsrSettings = Object.freeze({
  groq: Object.freeze({ apiKey: '', model: '' }),
  customOpenAi: Object.freeze({ apiKey: '', endpoint: '', model: '' }),
  bailian: Object.freeze({ apiKey: '', host: '', model: '' })
})

export function isHttpEndpoint(value: string): boolean {
  if (value.trim() === '') return false
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

/** Bailian public hosts must be HTTPS; loopback may use HTTP, matching custom endpoints. */
export function isBailianAsrHost(value: string): boolean {
  if (value.trim() === '') return false
  try {
    const url = new URL(value.trim())
    if (url.username !== '' || url.password !== '') return false
    const host = url.hostname.toLowerCase()
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
    if (loopback) return url.protocol === 'https:' || url.protocol === 'http:'
    return url.protocol === 'https:'
  } catch {
    return false
  }
}
