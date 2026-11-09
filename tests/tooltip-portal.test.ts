import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CLIENT_DIRECTORY = fileURLToPath(new URL('../src/client/', import.meta.url))
const TOOLTIP_OPENING_TAG = /<Tooltip\b[^>]*>/gu

/**
 * The primitives Tooltip defaults to an inline bubble. The composer seat uses
 * `will-change: transform`, which makes it the containing block for the
 * `position: fixed` bubble, so an inline bubble forces a geometry pass inside
 * the bottom-pinned conversation scroll area on every show/hide. The host's
 * official composer buttons all portal for that reason; an inline bubble here
 * made the whole message list flicker while hovering the microphone at the
 * bottom of a conversation (issue #107).
 */
describe('client tooltips', () => {
  it('portal every tooltip away from the transform-containing composer seat', async () => {
    const files = (await readdir(CLIENT_DIRECTORY)).filter((name) => name.endsWith('.tsx'))
    const tooltips: Array<{ file: string; tag: string }> = []
    for (const file of files) {
      const source = await readFile(join(CLIENT_DIRECTORY, file), 'utf8')
      for (const match of source.matchAll(TOOLTIP_OPENING_TAG)) tooltips.push({ file, tag: match[0] })
    }

    expect(tooltips.length).toBeGreaterThanOrEqual(6)
    const inline = tooltips.filter(({ tag }) => !/\bportal\b/u.test(tag))
    expect(inline.map(({ file, tag }) => `${file}: ${tag}`)).toEqual([])
  })
})
