import { mkdir, open, readFile, stat, rm } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import decodeFlac from '@audio/decode-flac'
import decodeMp3 from '@audio/decode-mp3'
import decodeOpus from '@audio/decode-opus'
import decodeVorbis from '@audio/decode-vorbis'
import decodeWav from '@audio/decode-wav'
import decodeWebm from '@audio/webm-decode'
import { EARS_ERROR_CODES, EarsError, sanitizeEarsErrorText } from '../errors.js'
import { audioToPcm16Wav } from './pcm-wav.js'

export const MAX_AUDIO_FILE_BYTES = 24 * 1024 * 1024
export const MAX_AUDIO_FILE_SECONDS = 600

export type AudioFileFormat = 'wav' | 'mp3' | 'flac' | 'ogg-vorbis' | 'ogg-opus' | 'webm'

export interface DecodedAudioFile {
  readonly path: string
  readonly name: string
  readonly mimeType: 'audio/wav'
  readonly durationSeconds: number
  readonly audio: Uint8Array
}

export interface AudioFileOptions {
  readonly cwd: string
  readonly signal: AbortSignal
  readonly displayName?: string
}

export function resolveAgentFilePath(value: string, cwd: string): string {
  const input = value.trim()
  if (input === '') throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'Provide an audio file path')
  if (/^file:/i.test(input)) {
    try { return resolve(fileURLToPath(input)) } catch { throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'The audio file URL is invalid') }
  }
  return resolve(cwd, input)
}

export async function decodeAudioFile(path: string, options: AudioFileOptions): Promise<DecodedAudioFile> {
  options.signal.throwIfAborted()
  const resolvedPath = resolveAgentFilePath(path, options.cwd)
  let metadata
  try {
    metadata = await stat(resolvedPath, { bigint: false })
  } catch (error) {
    throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'The audio file could not be read', { detail: sanitizeEarsErrorText(errorText(error)) })
  }
  if (!metadata.isFile()) throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'The audio path must point to one file')
  if (metadata.size <= 0) throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The audio file is empty')
  if (metadata.size > MAX_AUDIO_FILE_BYTES) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, `The audio file exceeds ${MAX_AUDIO_FILE_BYTES / 1024 / 1024} MiB`)

  options.signal.throwIfAborted()
  let bytes: Buffer
  try {
    bytes = await readFile(resolvedPath, { signal: options.signal })
  } catch (error) {
    if (options.signal.aborted) throw options.signal.reason
    throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'The audio file could not be read', { detail: sanitizeEarsErrorText(errorText(error)) })
  }
  options.signal.throwIfAborted()
  if (bytes.byteLength > MAX_AUDIO_FILE_BYTES) throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, `The audio file exceeds ${MAX_AUDIO_FILE_BYTES / 1024 / 1024} MiB`)

  const format = sniffAudioFileFormat(resolvedPath, bytes)
  let decoded: { channelData: Float32Array[]; sampleRate: number }
  try {
    const input = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    decoded = format === 'wav'
      ? decodeWav(input)
      : format === 'mp3'
        ? await decodeMp3(input)
      : format === 'flac'
          ? await decodeFlac(input)
          : format === 'webm'
            ? await decodeWebm(input)
            : await decodeOgg(input)
  } catch (error) {
    if (options.signal.aborted) throw options.signal.reason
    throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'The audio file could not be decoded', { detail: sanitizeEarsErrorText(errorText(error)) })
  }
  options.signal.throwIfAborted()
  const frameCount = decoded.channelData[0]?.length ?? 0
  if (decoded.channelData.length === 0 || frameCount === 0 || !Number.isFinite(decoded.sampleRate) || decoded.sampleRate <= 0) {
    throw new EarsError(EARS_ERROR_CODES.asrAudioEmpty, 'The audio file contains no audio samples')
  }
  const durationSeconds = frameCount / decoded.sampleRate
  if (durationSeconds > MAX_AUDIO_FILE_SECONDS) {
    throw new EarsError(EARS_ERROR_CODES.asrAudioTooLarge, `The audio file exceeds ${MAX_AUDIO_FILE_SECONDS} seconds`)
  }
  let audio: Uint8Array
  try {
    audio = audioToPcm16Wav({ sampleRate: decoded.sampleRate, channelData: decoded.channelData })
  } catch (error) {
    throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'The audio samples could not be normalized', { detail: sanitizeEarsErrorText(errorText(error)) })
  }
  options.signal.throwIfAborted()
  return { path: resolvedPath, name: basename(options.displayName?.trim() || resolvedPath), mimeType: 'audio/wav', durationSeconds, audio }
}

/** Create a new UTF-8 text file, choosing -1, -2, ... on collisions. */
export async function writeTranscriptFile(options: {
  readonly cwd: string
  readonly requestedPath?: string
  readonly defaultName: string
  readonly extension: string
  readonly contents: string
  readonly signal: AbortSignal
}): Promise<{ path: string; bytes: number; collisionNumber: number }> {
  options.signal.throwIfAborted()
  const requestedPath = options.requestedPath?.trim()
  const basePath = requestedPath === undefined || requestedPath === ''
    ? resolve(options.cwd, `${safeFilename(options.defaultName)}.${options.extension}`)
    : transcriptPathWithExtension(resolveAgentFilePath(requestedPath, options.cwd), options.extension)
  const directory = dirname(basePath)
  const extension = extname(basePath)
  const stem = extension === '' ? basePath : basePath.slice(0, -extension.length)
  const limit = 1000
  await mkdir(directory, { recursive: true })
  for (let suffix = 0; suffix < limit; suffix += 1) {
    options.signal.throwIfAborted()
    const candidate = suffix === 0 ? basePath : `${stem}-${suffix}${extension}`
    let handle
    try {
      handle = await open(candidate, 'wx')
    } catch (error) {
      if (isAlreadyExists(error)) continue
      throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'The transcript file could not be created', { detail: sanitizeEarsErrorText(errorText(error)) })
    }
    try {
      options.signal.throwIfAborted()
      await handle.writeFile(options.contents, { encoding: 'utf8', signal: options.signal })
      await handle.sync()
      return { path: candidate, bytes: Buffer.byteLength(options.contents, 'utf8'), collisionNumber: suffix }
    } catch (error) {
      await handle.close().catch(() => undefined)
      await rm(candidate, { force: true }).catch(() => undefined)
      if (options.signal.aborted) throw options.signal.reason
      throw new EarsError(EARS_ERROR_CODES.asrUnexpected, 'The transcript file could not be written', { detail: sanitizeEarsErrorText(errorText(error)) })
    } finally {
      await handle.close().catch(() => undefined)
    }
  }
  throw new EarsError(EARS_ERROR_CODES.asrUnexpected, `Could not choose a free transcript file name in ${directory}`)
}

export function audioFileFormatForPath(path: string): AudioFileFormat {
  return formatForPath(path)
}

function sniffAudioFileFormat(path: string, bytes: Uint8Array): AudioFileFormat {
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav'
  if (ascii(bytes, 0, 4) === 'fLaC') return 'flac'
  if (bytes.byteLength >= 4 && ascii(bytes, 0, 4) === '\u001aE\u00df\u00a3') return 'webm'
  if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)) return 'mp3'
  if (ascii(bytes, 0, 4) === 'OggS') return containsBytes(bytes, 'OpusHead') ? 'ogg-opus' : 'ogg-vorbis'
  return formatForPath(path)
}

function formatForPath(path: string): AudioFileFormat {
  const extension = extname(path).toLowerCase()
  if (extension === '.wav' || extension === '.wave') return 'wav'
  if (extension === '.mp3') return 'mp3'
  if (extension === '.flac') return 'flac'
  if (extension === '.ogg' || extension === '.oga' || extension === '.opus') return sniffOggCodec(path) === 'opus' ? 'ogg-opus' : 'ogg-vorbis'
  if (extension === '.webm') return 'webm'
  throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, 'Supported audio files are WAV, MP3, FLAC, OGG Vorbis, OGG Opus, and WebM with Opus or Vorbis audio')
}

async function decodeOgg(input: Uint8Array): Promise<{ channelData: Float32Array[]; sampleRate: number }> {
  if (containsBytes(input, 'OpusHead')) return decodeOpus(input)
  try {
    return await decodeVorbis(input)
  } catch (vorbisError) {
    try { return await decodeOpus(input) } catch { throw vorbisError }
  }
}

function containsBytes(input: Uint8Array, needle: string): boolean {
  const bytes = Buffer.from(needle, 'ascii')
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength).indexOf(bytes) >= 0
}

function ascii(input: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...input.subarray(offset, offset + length))
}

function sniffOggCodec(path: string): 'opus' | 'vorbis' {
  // The extension alone cannot distinguish Ogg Opus from Vorbis. The decoder
  // dispatch retries the alternate codec if the first selection fails.
  return extname(path).toLowerCase() === '.opus' ? 'opus' : 'vorbis'
}

function safeFilename(value: string): string {
  const stem = value.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim()
  return stem === '' ? 'transcript' : `${stem}.transcript`
}

function transcriptPathWithExtension(path: string, extension: string): string {
  const current = extname(path)
  if (current === '') return `${path}.${extension}`
  if (current.toLowerCase() !== `.${extension}`) {
    throw new EarsError(EARS_ERROR_CODES.asrAudioInvalid, `The output path extension must be .${extension}`)
  }
  return path
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return String(error)
}
