type AudioContextWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

const CLICK_NOISE_SECONDS = 0.004
const CLICK_DECAY = 25
const CLICK_DURATION_SECONDS = 0.045

let context: AudioContext | undefined
let retainCount = 0

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined
  const audioWindow = window as AudioContextWindow
  return window.AudioContext ?? audioWindow.webkitAudioContext
}

async function ensureContext(): Promise<AudioContext | undefined> {
  const Constructor = getAudioContextConstructor()
  if (Constructor === undefined) return undefined
  if (context === undefined || context.state === 'closed') context = new Constructor()
  if (context.state === 'suspended') await context.resume().catch(() => undefined)
  return context
}

/** Resume the shared context inside a user gesture so the click can play. */
export function resumeSounds(): void {
  void ensureContext()
}

/** Keep the singleton alive while a microphone is mounted. */
export function retainSounds(): () => void {
  retainCount += 1
  return () => {
    retainCount = Math.max(0, retainCount - 1)
    if (retainCount === 0) disposeSounds()
  }
}

export function disposeSounds(): void {
  retainCount = 0
  if (context === undefined) return
  const current = context
  context = undefined
  void current.close().catch(() => undefined)
}

/** A short band-passed noise click. `intensity` is 0–1. */
export function playClick(intensity = 0.5): void {
  void playClickAsync(intensity)
}

async function playClickAsync(intensity: number): Promise<void> {
  const ctx = await ensureContext()
  if (ctx === undefined) return
  const amount = Math.max(0, Math.min(1, intensity))
  const frames = Math.max(1, Math.round(ctx.sampleRate * CLICK_NOISE_SECONDS))
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let index = 0; index < frames; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * Math.exp(-index / CLICK_DECAY)
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 8
  const jitter = 1 + (Math.random() * 0.3 - 0.15)
  filter.frequency.value = (2000 + amount * 2000) * jitter
  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(Math.max(0.0001, 0.5 * amount), now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + CLICK_DURATION_SECONDS)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  source.start(now)
  source.stop(now + CLICK_DURATION_SECONDS)
  source.addEventListener('ended', () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
  }, { once: true })
}
