/**
 * Parse tqdm-style download progress text (`42%|██ | 63.2M/150M [...]`).
 * @param text - one stderr chunk; may contain carriage-return updates.
 * @returns the last progress tuple found in the chunk.
 */
export function parseDownloadProgress(text: string): { percent: number | null; bytes: number | null; totalBytes: number | null } {
  const lines = text.split(/[\r\n]+/)
  let percent: number | null = null
  let bytes: number | null = null
  let totalBytes: number | null = null
  for (const line of lines) {
    const match = /(\d+)%\|[^|]*\|\s*([\d.]+)\s*([KMGT]?)(?:i?B)?\/([\d.]+)\s*([KMGT]?)(?:i?B)?/.exec(line)
    if (match === null) continue
    percent = Number(match[1]) / 100
    bytes = parseSize(match[2], match[3])
    totalBytes = parseSize(match[4], match[5])
  }
  return { percent, bytes, totalBytes }
}

function parseSize(value: string, unit: string): number | null {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  const multiplier = unit === 'K' ? 1024 : unit === 'M' ? 1024 * 1024 : unit === 'G' ? 1024 * 1024 * 1024 : unit === 'T' ? 1024 ** 4 : 1
  return Math.round(number * multiplier)
}
