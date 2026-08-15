import { describe, expect, it } from 'vitest'
import { parseDownloadProgress } from '../src/asr/whisper-models.js'

describe('whisper download progress parsing', () => {
  it('extracts percent and sizes from a tqdm line', () => {
    expect(parseDownloadProgress(' 42%|████▌     | 63.2M/150M [00:12<00:16, 5.89MB/s]')).toEqual({
      percent: 0.42,
      bytes: Math.round(63.2 * 1024 * 1024),
      totalBytes: 150 * 1024 * 1024
    })
  })

  it('uses the last update when a chunk carries carriage-return updates', () => {
    expect(parseDownloadProgress(' 10%|██        | 15.0M/150M\r 85%|████████▌ | 128M/150M')).toEqual({
      percent: 0.85,
      bytes: 128 * 1024 * 1024,
      totalBytes: 150 * 1024 * 1024
    })
  })

  it('parses bytes with explicit iB suffixes', () => {
    expect(parseDownloadProgress('100%|██████████| 72.1MiB/72.1MiB [00:02<00:00, 28.2MiB/s]')).toEqual({
      percent: 1,
      bytes: Math.round(72.1 * 1024 * 1024),
      totalBytes: Math.round(72.1 * 1024 * 1024)
    })
  })

  it('returns nulls for text without a progress tuple', () => {
    expect(parseDownloadProgress('some warning line\n')).toEqual({ percent: null, bytes: null, totalBytes: null })
  })
})
