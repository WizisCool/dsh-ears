import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isWhisperAvailable, transcribeWithWhisper } from '../src/asr/local-whisper.js'
import { transcribeOpenAICompatible } from '../src/asr/openai-compatible.js'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('local Whisper backend', () => {
  it('detects an executable without loading a model', async () => {
    await expect(isWhisperAvailable(process.execPath)).resolves.toBe(true)
  })

  it('does not probe an already-cancelled availability request', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(isWhisperAvailable(process.execPath, controller.signal)).resolves.toBe(false)
  })

  it('writes a private temporary audio file and reads the Whisper JSON result', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-ears-test-'))
    const command = join(directory, 'fake-whisper.mjs')
    await writeFile(command, '#!/usr/bin/env node\nimport { writeFile } from \'node:fs/promises\'\nimport { join } from \'node:path\'\nconst index = process.argv.indexOf(\'--output_dir\')\nawait writeFile(join(process.argv[index + 1], \'recording.json\'), JSON.stringify({ text: \'本地转录结果\' }))\n')
    await chmod(command, 0o755)
    try {
      await expect(transcribeWithWhisper({
        audio: Uint8Array.from([1, 2, 3]),
        mimeType: 'audio/webm;codecs=opus',
        language: 'zh-CN',
        model: 'tiny',
        signal: new AbortController().signal,
        command
      })).resolves.toBe('本地转录结果')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('OpenAI-compatible cloud ASR backend', () => {
  it('sends multipart audio and resolves the JSON transcript', async () => {
    const server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ text: request.headers.authorization === 'Bearer test-credential-placeholder' && body.includes('whisper-1') ? '云端转录结果' : '' }))
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server did not expose an address')
    try {
      await expect(transcribeOpenAICompatible({
        audio: Uint8Array.from([1, 2, 3]),
        mimeType: 'audio/webm',
        language: 'zh-CN',
        endpoint: `http://127.0.0.1:${address.port}/audio/transcriptions`,
        model: 'whisper-1',
        credential: 'test-credential-placeholder',
        signal: new AbortController().signal
      })).resolves.toBe('云端转录结果')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('rejects endpoints that embed credentials in the URL', async () => {
    await expect(transcribeOpenAICompatible({
      audio: Uint8Array.from([1]),
      mimeType: 'audio/wav',
      language: 'en-US',
      endpoint: 'https://user:pass@example.com/audio/transcriptions',
      model: 'whisper-1',
      signal: new AbortController().signal
    })).rejects.toThrow('must not contain credentials')
  })

  it('bounds a chunked response before parsing it', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.write(Buffer.alloc(1_048_577, 65))
      response.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Test server did not expose an address')
    try {
      await expect(transcribeOpenAICompatible({
        audio: Uint8Array.from([1]),
        mimeType: 'audio/wav',
        language: 'en-US',
        endpoint: `http://127.0.0.1:${address.port}/audio/transcriptions`,
        model: 'whisper-1',
        signal: new AbortController().signal
      })).rejects.toThrow('response is too large')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  })

  it('times out an unresponsive endpoint', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })))

    const pending = transcribeOpenAICompatible({
      audio: Uint8Array.from([1]),
      mimeType: 'audio/wav',
      language: 'en-US',
      endpoint: 'https://asr.example.test/audio/transcriptions',
      model: 'whisper-1',
      signal: new AbortController().signal
    })
    const rejection = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(120_000)
    await rejection
  })
})
