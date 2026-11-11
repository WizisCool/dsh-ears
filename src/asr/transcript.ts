import { EARS_ERROR_CODES, EarsError } from '../errors.js'

export const TRANSCRIPT_FORMATS = ['txt', 'md', 'srt', 'vtt', 'lrc'] as const
export type TranscriptFormat = typeof TRANSCRIPT_FORMATS[number]

export interface TranscriptSegment {
  readonly start: number
  readonly end: number
  readonly text: string
}

export interface TranscriptDocument {
  readonly text: string
  readonly segments?: readonly TranscriptSegment[]
}

export function normalizeTranscriptSegments(segments: readonly TranscriptSegment[], durationSeconds?: number): TranscriptSegment[] {
  const normalized: TranscriptSegment[] = []
  for (const segment of segments) {
    const start = Number(segment.start)
    const end = Number(segment.end)
    const text = segment.text.trim()
    if (text === '' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue
    const boundedStart = durationSeconds === undefined ? start : Math.min(start, durationSeconds)
    const boundedEnd = durationSeconds === undefined ? end : Math.min(end, durationSeconds)
    if (boundedEnd > boundedStart) normalized.push({ start: boundedStart, end: boundedEnd, text })
  }
  return normalized.sort((left, right) => left.start - right.start)
}

/** Group SenseVoice token alignment into readable captions without inventing timestamps. */
export function groupTimedTokens(
  tokens: readonly string[],
  timestamps: readonly number[],
  durations: readonly number[],
  durationSeconds: number
): TranscriptSegment[] {
  if (tokens.length === 0 || timestamps.length !== tokens.length) return []
  const pieces = tokens.map((token, index) => {
    const cleaned = token.replace(/^▁/, '').replace(/<\|[^|]+\|>/g, '')
    return {
      text: cleaned,
      startsWord: token.startsWith('▁'),
      start: timestamps[index] ?? NaN,
      duration: durations[index] ?? 0
    }
  }).filter((token) => token.text !== '' && Number.isFinite(token.start) && token.start >= 0)
  if (pieces.length === 0) return []

  const segments: TranscriptSegment[] = []
  let text = ''
  let start = 0
  let end = 0
  const flush = () => {
    const value = text.trim()
    if (value !== '' && end > start) segments.push({ start, end, text: value })
    text = ''
  }

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index]!
    const next = pieces[index + 1]
    const pieceEnd = piece.duration > 0 ? piece.start + piece.duration : next?.start ?? durationSeconds
    if (!Number.isFinite(pieceEnd) || pieceEnd <= piece.start) continue
    const separator = text !== '' && piece.startsWord ? ' ' : ''
    const addition = `${separator}${piece.text}`
    if (text !== '' && (piece.start - start >= 5 || text.length + addition.length > 48)) flush()
    if (text === '') start = piece.start
    text += addition
    end = pieceEnd
    if (/[.!?。！？]$/.test(piece.text)) flush()
  }
  flush()
  return normalizeTranscriptSegments(segments, durationSeconds)
}

export function formatTranscript(document: TranscriptDocument, format: TranscriptFormat, title: string): string {
  const text = document.text.trim()
  if (format === 'txt') {
    if (text === '') throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'The transcript is empty')
    return `${text}\n`
  }
  if (format === 'md') {
    if (text === '') throw new EarsError(EARS_ERROR_CODES.asrNoTranscript, 'The transcript is empty')
    return `# ${markdownTitle(title)}\n\n${text}\n`
  }

  const segments = normalizeTranscriptSegments(document.segments ?? [])
  if (segments.length === 0) throw new EarsError(EARS_ERROR_CODES.asrServiceUnavailable, 'The selected recognition result has no timestamps for subtitle export')
  if (format === 'srt') return `${segments.map((segment, index) => `${index + 1}\n${srtTime(segment.start)} --> ${srtTime(segment.end)}\n${segment.text}`).join('\n\n')}\n`
  if (format === 'vtt') return `WEBVTT\n\n${segments.map((segment) => `${vttTime(segment.start)} --> ${vttTime(segment.end)}\n${segment.text}`).join('\n\n')}\n`
  return `${segments.map((segment) => `[${lrcTime(segment.start)}]${segment.text}`).join('\n')}\n`
}

function markdownTitle(title: string): string {
  return title.trim().replace(/[\r\n]+/g, ' ').replace(/[#`*_\[\]<>]/g, '') || 'Transcript'
}

function srtTime(seconds: number): string {
  return timestamp(seconds, ',')
}

function vttTime(seconds: number): string {
  return timestamp(seconds, '.')
}

function timestamp(seconds: number, decimal: ',' | '.'): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000)
  const wholeSeconds = Math.floor(milliseconds % 60_000 / 1000)
  const remainder = milliseconds % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)}${decimal}${String(remainder).padStart(3, '0')}`
}

function lrcTime(seconds: number): string {
  const centiseconds = Math.max(0, Math.floor(seconds * 100))
  const minutes = Math.floor(centiseconds / 6000)
  const remainder = centiseconds % 6000
  return `${pad(minutes)}:${String(Math.floor(remainder / 100)).padStart(2, '0')}.${String(remainder % 100).padStart(2, '0')}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
