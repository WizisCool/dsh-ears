import { EARS_ERROR_CODES, EarsError } from '../errors.js'

/** Read a bounded HTTP response body, rejecting oversized payloads. */
export async function readBoundedText(response: Response, maxBytes: number, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted()
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    try {
      await response.body?.cancel()
    } catch {
      // Preserve the size-limit error when transport cleanup also fails.
    }
    throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Cloud ASR response is too large')
  }
  if (response.body === null) {
    const body = await response.text()
    signal?.throwIfAborted()
    if (new TextEncoder().encode(body).byteLength > maxBytes) {
      throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Cloud ASR response is too large')
    }
    return body
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const cancelOnAbort = () => {
    try {
      void reader.cancel(signal?.reason).catch(() => undefined)
    } catch {
      // The abort itself remains authoritative even if a custom reader cannot cancel.
    }
  }
  signal?.addEventListener('abort', cancelOnAbort, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      const next = await reader.read()
      signal?.throwIfAborted()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        try {
          await reader.cancel()
        } catch {
          // Preserve the size-limit error when transport cleanup also fails.
        }
        throw new EarsError(EARS_ERROR_CODES.asrResponseTooLarge, 'Cloud ASR response is too large')
      }
      chunks.push(next.value)
    }
  } finally {
    signal?.removeEventListener('abort', cancelOnAbort)
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
