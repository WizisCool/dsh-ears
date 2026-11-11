import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodePcm16Wav } from '../src/asr/pcm-wav.js'
import { registerAgentAudioTools, type AgentAudioToolOperations } from '../src/agent-audio-tools.js'
import type { TranscriptFormat } from '../src/asr/transcript.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('Agent audio tools', () => {
  it('registers the tool list and installs model-selection guidance', () => {
    const tools = new Map<string, ToolDefinition>()
    const sections: Array<{ name: string; text: string | ((context: never) => string) }> = []
    const ctx = toolContext(tools, sections, 'C:\\audio-work')
    const dispose = registerAgentAudioTools(ctx, fakeOperations())

    expect([...tools.keys()]).toEqual(['transcribe_audio_file', 'polish_transcript', 'export_transcript_file'])
    expect(sections[0]?.name).toBe('dsh-ears:audio-transcription-tools')
    expect(typeof sections[0]?.text).toBe('function')
    const prompt = (sections[0]?.text as (context: never) => string)(undefined as never)
    expect(prompt).toContain('SenseVoice Small INT8')
    expect(prompt).toContain('natively only if')
    dispose()
  })

  it('transcribes the exact user-provided path, preserves session ownership, and exports UTF-8 with numeric collision suffixes', async () => {
    const directory = await temporaryDirectory()
    const sourcePath = join(directory, 'voice.wav')
    await writeFile(sourcePath, encodePcm16Wav(new Float32Array(16_000).fill(0.1), 16_000))
    const tools = new Map<string, ToolDefinition>()
    const sections: Array<{ name: string; text: string | ((context: never) => string) }> = []
    const ctx = toolContext(tools, sections, directory, `Please transcribe ${sourcePath}`)
    const operations = fakeOperations()
    registerAgentAudioTools(ctx, operations)
    const exec = toolExecution('session-a')

    const transcription = await tools.get('transcribe_audio_file')!.execute({ path: sourcePath, formats: ['srt'] }, exec) as Record<string, unknown>
    expect(transcription).toMatchObject({ sourceName: 'voice.wav', backend: 'local-sensevoice', hasTimestamps: true, polishingEnabled: true })
    expect(operations.transcribeAudioFile).toHaveBeenCalledWith(expect.objectContaining({ engine: 'sensevoice', needsTimestamps: true, senseVoiceModel: 'small-int8' }))

    const transcriptId = String(transcription.transcriptId)
    const polished = await tools.get('polish_transcript')!.execute({ transcriptId }, exec) as Record<string, unknown>
    expect(polished).toMatchObject({ transcriptId, polished: true })

    const first = await tools.get('export_transcript_file')!.execute({ transcriptId, format: 'srt' }, exec) as Record<string, unknown>
    const second = await tools.get('export_transcript_file')!.execute({ transcriptId, format: 'srt' }, exec) as Record<string, unknown>
    expect(first).toMatchObject({ path: join(directory, 'voice.transcript.srt'), collisionNumber: 0 })
    expect(second).toMatchObject({ path: join(directory, 'voice.transcript-1.srt'), collisionNumber: 1 })
    await expect(readFile(String(second.path), 'utf8')).resolves.toContain('Hello, world')
  })

  it('exports native-model transcripts without calling the ASR tool', async () => {
    const directory = await temporaryDirectory()
    const tools = new Map<string, ToolDefinition>()
    const sections: Array<{ name: string; text: string | ((context: never) => string) }> = []
    const ctx = toolContext(tools, sections, directory)
    registerAgentAudioTools(ctx, fakeOperations())

    const result = await tools.get('export_transcript_file')!.execute({
      sourceName: 'native.wav',
      text: 'Native audio result',
      segments: [{ start: 0, end: 1.2, text: 'Native audio result' }],
      format: 'vtt'
    }, toolExecution('session-b')) as Record<string, unknown>

    expect(result).toMatchObject({ path: join(directory, 'native.transcript.vtt'), format: 'vtt' })
    await expect(readFile(String(result.path), 'utf8')).resolves.toContain('WEBVTT')
  })

  it('allows an explicit user-provided path outside the working directory', async () => {
    const workingDirectory = await temporaryDirectory()
    const outputDirectory = await temporaryDirectory()
    const outputPath = join(outputDirectory, 'requested.txt')
    const tools = new Map<string, ToolDefinition>()
    const sections: Array<{ name: string; text: string | ((context: never) => string) }> = []
    registerAgentAudioTools(toolContext(tools, sections, workingDirectory, `Save the transcript to ${outputPath}`), fakeOperations())

    const result = await tools.get('export_transcript_file')!.execute({ text: 'Authorized output', format: 'txt', outputPath }, toolExecution('session-c')) as Record<string, unknown>
    expect(result.path).toBe(outputPath)
    await expect(readFile(outputPath, 'utf8')).resolves.toBe('Authorized output\n')
  })

  it('reads an exact audio path outside the working directory only when the user named it', async () => {
    const workingDirectory = await temporaryDirectory()
    const sourceDirectory = await temporaryDirectory()
    const sourcePath = join(sourceDirectory, 'external.wav')
    await writeFile(sourcePath, encodePcm16Wav(new Float32Array(8_000).fill(0.1), 16_000))
    const tools = new Map<string, ToolDefinition>()
    const sections: Array<{ name: string; text: string | ((context: never) => string) }> = []
    registerAgentAudioTools(toolContext(tools, sections, workingDirectory, `Transcribe ${sourcePath}`), fakeOperations())

    const result = await tools.get('transcribe_audio_file')!.execute({ path: sourcePath }, toolExecution('session-e')) as Record<string, unknown>
    expect(result.sourceName).toBe('external.wav')
  })

  it('reads an audio attachment path surfaced by the current session', async () => {
    const workingDirectory = await temporaryDirectory()
    const attachmentDirectory = await temporaryDirectory()
    const attachmentPath = join(attachmentDirectory, 'attached.wav')
    await writeFile(attachmentPath, encodePcm16Wav(new Float32Array(8_000).fill(0.1), 16_000))
    const tools = new Map<string, ToolDefinition>()
    const sections: Array<{ name: string; text: string | ((context: never) => string) }> = []
    registerAgentAudioTools(toolContext(tools, sections, workingDirectory, '', attachmentPath), fakeOperations())

    const result = await tools.get('transcribe_audio_file')!.execute({ path: attachmentPath }, toolExecution('session-f')) as Record<string, unknown>
    expect(result.sourceName).toBe('attached.wav')
  })

  it('rejects an outside output path that the user did not specify', async () => {
    const workingDirectory = await temporaryDirectory()
    const outputDirectory = await temporaryDirectory()
    const outputPath = join(outputDirectory, 'not-requested.txt')
    const tools = new Map<string, ToolDefinition>()
    const sections: Array<{ name: string; text: string | ((context: never) => string) }> = []
    registerAgentAudioTools(toolContext(tools, sections, workingDirectory), fakeOperations())

    await expect(tools.get('export_transcript_file')!.execute({ text: 'Do not write here', format: 'txt', outputPath }, toolExecution('session-d')))
      .rejects.toThrow('must be explicitly provided by the user')
  })

  it('rejects a transcript ID belonging to another Agent session', async () => {
    const directory = await temporaryDirectory()
    const sourcePath = join(directory, 'voice.wav')
    await writeFile(sourcePath, encodePcm16Wav(new Float32Array(16_000).fill(0.1), 16_000))
    const tools = new Map<string, ToolDefinition>()
    const sections: Array<{ name: string; text: string | ((context: never) => string) }> = []
    registerAgentAudioTools(toolContext(tools, sections, directory, `Please transcribe ${sourcePath}`), fakeOperations())
    const transcription = await tools.get('transcribe_audio_file')!.execute({ path: sourcePath }, toolExecution('owner')) as Record<string, unknown>

    await expect(tools.get('export_transcript_file')!.execute({ transcriptId: String(transcription.transcriptId), format: 'txt' }, toolExecution('other')))
      .rejects.toThrow('Transcript result is unavailable')
  })
})

function fakeOperations(): AgentAudioToolOperations {
  return {
    transcribeAudioFile: vi.fn(async () => ({
      text: 'Hello world.',
      segments: [{ start: 0, end: 1.2, text: 'Hello world.' }],
      backend: 'local-sensevoice',
      model: 'small-int8',
      timestampSource: 'backend'
    })),
    polishingEnabled: () => true,
    polishTranscript: vi.fn(async () => ({
      polished: true,
      text: 'Hello, world.',
      segments: [{ start: 0, end: 1.2, text: 'Hello, world.' }],
      message: 'polished'
    }))
  }
}

function toolContext(
  tools: Map<string, ToolDefinition>,
  sections: Array<{ name: string; text: string | ((context: never) => string) }>,
  cwd: string,
  userText = '',
  attachmentPath?: string
): Context {
  const content = attachmentPath === undefined
    ? [{ type: 'text', text: userText }]
    : [{ type: 'file', attachment: { attachmentId: 'file' } }]
  return {
    tools: { register: (definition: ToolDefinition) => { tools.set(definition.name, definition); return () => { tools.delete(definition.name) } } },
    systemPrompt: { section: (section: { name: string; text: string | ((context: never) => string) }) => { sections.push(section); return () => undefined } },
    sessions: { get: () => ({ header: { cwd }, deriveMessages: () => [{ role: 'user', content }] }) },
    llm: { fileRequestText: () => attachmentPath === undefined ? '' : `read-only file path ${attachmentPath}` },
    get: () => undefined
  } as unknown as Context
}

function toolExecution(sessionId: string): ToolRunContext {
  return {
    agent: { id: sessionId },
    signal: new AbortController().signal
  } as unknown as ToolRunContext
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-ears-agent-audio-'))
  temporaryDirectories.push(directory)
  return directory
}
