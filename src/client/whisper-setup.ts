import type { WhisperEnvironmentId, WhisperPlatformId } from '../remote-contract.js'

export type WhisperSetupStepId = 'python' | 'ffmpeg' | 'whisper'

export interface WhisperSetupStep {
  id: WhisperSetupStepId
  command: string
}

export const WHISPER_SETUP_PLATFORM_LABELS: Record<WhisperPlatformId, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux'
}

// One canonical command per step and platform; the guide shows only the
// platform the Host reports, so the commands can stay short and copyable.
const SETUP_STEPS: Record<WhisperPlatformId, WhisperSetupStep[]> = {
  windows: [
    { id: 'python', command: 'winget install Python.Python.3.12' },
    { id: 'ffmpeg', command: 'winget install Gyan.FFmpeg' },
    { id: 'whisper', command: 'pip install -U openai-whisper' }
  ],
  macos: [
    { id: 'python', command: 'brew install python' },
    { id: 'ffmpeg', command: 'brew install ffmpeg' },
    { id: 'whisper', command: 'pip3 install -U openai-whisper' }
  ],
  linux: [
    { id: 'python', command: 'sudo apt install python3 python3-pip' },
    { id: 'ffmpeg', command: 'sudo apt install ffmpeg' },
    { id: 'whisper', command: 'pip3 install -U openai-whisper' }
  ]
}

/**
 * Steps the user still needs for the reported diagnosis. A detected
 * interpreter without the whisper package skips the Python step; an unknown
 * Host platform yields no steps so the UI can fall back to generic advice.
 */
export function whisperSetupSteps(environment: WhisperEnvironmentId, platform: WhisperPlatformId | undefined): WhisperSetupStep[] {
  if (platform === undefined) return []
  const steps = SETUP_STEPS[platform]
  return environment === 'whisper-missing' ? steps.filter((step) => step.id !== 'python') : steps
}
