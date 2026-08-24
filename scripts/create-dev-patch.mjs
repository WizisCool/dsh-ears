import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const patchDirectory = path.join(projectRoot, '.dsh')
const patchPath = path.join(patchDirectory, 'cordis.patch.yml')

await mkdir(patchDirectory, { recursive: true })
await writeFile(
  patchPath,
  [
    '- id: hmr',
    '  disabled: false',
    '  config:',
    // cordis-plugin-hmr resolves `base` with `new URL(base, ctx.baseUrl)` and
    // feeds the result to fileURLToPath: a Windows drive path (D:\…) parses
    // as a `d:` scheme and is rejected, while a POSIX absolute path survives
    // URL resolution only by luck. A file URL is the one portable form.
    `    base: ${JSON.stringify(pathToFileURL(projectRoot).href)}`,
    "    root: ['lib']",
    '    ignored:',
    "      - '**/node_modules'",
    "      - '**/.*'",
    '',
  ].join('\n'),
)

console.log(`[dsh-ears] wrote ${patchPath}`)
