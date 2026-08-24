import { describe, expect, it } from 'vitest'
import { WHISPER_SETUP_PLATFORM_LABELS, whisperSetupSteps } from '../src/client/whisper-setup.js'

describe('whisper setup steps', () => {
  it('returns every step when no interpreter exists', () => {
    const steps = whisperSetupSteps('python-missing', 'windows')
    expect(steps.map((step) => step.id)).toEqual(['python', 'ffmpeg', 'whisper'])
    expect(steps[0].command).toContain('winget')
  })

  it('skips the Python step when an interpreter was detected', () => {
    const steps = whisperSetupSteps('whisper-missing', 'macos')
    expect(steps.map((step) => step.id)).toEqual(['ffmpeg', 'whisper'])
    expect(steps[0].command).toBe('brew install ffmpeg')
  })

  it('uses apt commands on Linux and pip3 for the package', () => {
    const steps = whisperSetupSteps('python-missing', 'linux')
    expect(steps.map((step) => step.command)).toEqual([
      'sudo apt install python3 python3-pip',
      'sudo apt install ffmpeg',
      'pip3 install -U openai-whisper'
    ])
  })

  it('falls back to no steps when the Host platform is unknown', () => {
    expect(whisperSetupSteps('python-missing', undefined)).toEqual([])
    expect(whisperSetupSteps('whisper-missing', undefined)).toEqual([])
  })

  it('labels every supported platform', () => {
    expect(Object.keys(WHISPER_SETUP_PLATFORM_LABELS).sort()).toEqual(['linux', 'macos', 'windows'])
    expect(WHISPER_SETUP_PLATFORM_LABELS.macos).toBe('macOS')
  })
})
