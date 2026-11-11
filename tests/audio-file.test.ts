import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EARS_ERROR_CODES } from '../src/errors.js'
import { audioFileFormatForPath, decodeAudioFile, resolveAgentFilePath, writeTranscriptFile } from '../src/asr/audio-file.js'
import { encodePcm16Wav } from '../src/asr/pcm-wav.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('audio-file input and transcript output', () => {
  it('resolves relative paths against the Agent working directory', () => {
    expect(resolveAgentFilePath('recordings/voice.wav', 'C:\\work\\project'))
      .toBe(join('C:\\work\\project', 'recordings', 'voice.wav'))
  })

  it('recognizes WebM as an input format for WAV normalization', () => {
    expect(audioFileFormatForPath('meeting.webm')).toBe('webm')
  })

  it('decodes a WAV file and normalizes it to mono 16 kHz PCM16 WAV', async () => {
    const directory = await temporaryDirectory()
    const wav = encodePcm16Wav(new Float32Array(16_000).fill(0.2), 16_000)
    const sourcePath = join(directory, 'voice.wav')
    await writeFile(sourcePath, wav)
    const decoded = await decodeAudioFile(sourcePath, { cwd: directory, signal: new AbortController().signal })
    expect(decoded).toMatchObject({ name: 'voice.wav', mimeType: 'audio/wav', durationSeconds: 1 })
    expect(Buffer.from(decoded.audio.subarray(0, 4)).toString('ascii')).toBe('RIFF')
    expect(decoded.audio.byteLength).toBe(32_044)
  })

  it('detects a user attachment by its WAV content when the stored path has no extension', async () => {
    const directory = await temporaryDirectory()
    const sourcePath = join(directory, 'content-addressed-file')
    await writeFile(sourcePath, encodePcm16Wav(new Float32Array(8_000).fill(0.1), 16_000))
    const decoded = await decodeAudioFile(sourcePath, { cwd: directory, displayName: 'voice.wav', signal: new AbortController().signal })
    expect(decoded.name).toBe('voice.wav')
    expect(decoded.durationSeconds).toBe(0.5)
  })

  it('rejects unsupported formats and non-file paths', async () => {
    const directory = await temporaryDirectory()
    const unsupported = join(directory, 'voice.m4a')
    await writeFile(unsupported, new Uint8Array([1, 2, 3]))
    await expect(decodeAudioFile(unsupported, { cwd: directory, signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: EARS_ERROR_CODES.asrAudioInvalid })
    await expect(decodeAudioFile(directory, { cwd: directory, signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: EARS_ERROR_CODES.asrAudioInvalid })
  })

  it('uses the requested transcript name and adds a numeric suffix on collisions', async () => {
    const directory = await temporaryDirectory()
    const first = await writeTranscriptFile({
      cwd: directory,
      defaultName: 'voice.wav',
      extension: 'txt',
      contents: 'hello\n',
      signal: new AbortController().signal
    })
    const second = await writeTranscriptFile({
      cwd: directory,
      defaultName: 'voice.wav',
      extension: 'txt',
      contents: 'hello again\n',
      signal: new AbortController().signal
    })
    expect(basename(first.path)).toBe('voice.transcript.txt')
    expect(basename(second.path)).toBe('voice.transcript-1.txt')
    expect(second.collisionNumber).toBe(1)
    await expect(readFile(second.path, 'utf8')).resolves.toBe('hello again\n')
  })

  it('honors an explicit output path and never overwrites it', async () => {
    const directory = await temporaryDirectory()
    const requestedPath = join(directory, 'result.md')
    const first = await writeTranscriptFile({
      cwd: tmpdir(),
      requestedPath,
      defaultName: 'unused.wav',
      extension: 'md',
      contents: '# first\n',
      signal: new AbortController().signal
    })
    const second = await writeTranscriptFile({
      cwd: tmpdir(),
      requestedPath,
      defaultName: 'unused.wav',
      extension: 'md',
      contents: '# second\n',
      signal: new AbortController().signal
    })
    expect(first.path).toBe(requestedPath)
    expect(basename(second.path)).toBe('result-1.md')
    await expect(readFile(first.path, 'utf8')).resolves.toBe('# first\n')
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-ears-audio-file-'))
  temporaryDirectories.push(directory)
  return directory
}
