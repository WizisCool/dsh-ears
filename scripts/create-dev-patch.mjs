import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const patchDirectory = path.join(projectRoot, '.dsh')
const patchPath = path.join(patchDirectory, 'cordis.patch.yml')
const pluginPath = path.join(projectRoot, 'dist', 'index.js')

await mkdir(patchDirectory, { recursive: true })
await writeFile(
  patchPath,
  [
    '- id: hmr',
    '  disabled: false',
    '  config:',
    `    base: ${JSON.stringify(projectRoot)}`,
    "    root: ['dist']",
    '    ignored:',
    "      - '**/node_modules'",
    "      - '**/.*'",
    '- insert:',
    '    - id: dsh-ears',
    `      name: ${JSON.stringify(pluginPath)}`,
    '',
  ].join('\n'),
)

console.log(`[dsh-ears] wrote ${patchPath}`)
