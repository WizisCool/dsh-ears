import { open } from 'node:fs/promises'

export function pathDelimiter(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':'
}

export function pythonCandidates(platform: NodeJS.Platform): readonly string[] {
  return platform === 'win32' ? ['python.exe', 'py.exe'] : ['python3', 'python']
}

/**
 * Suffixes to try when probing an executable on PATH. Windows launchers such
 * as `py` live on disk as `py.exe`, so extension-less commands are also tried
 * against every PATHEXT entry (defaulting to the Windows list when unset).
 */
export function executableSuffixes(command: string, platform: NodeJS.Platform, pathext: string | undefined): readonly string[] {
  if (platform !== 'win32') return ['']
  if (command.includes('.')) return ['']
  const extensions = (pathext ?? '.COM;.EXE;.BAT;.CMD').split(';')
  return ['', ...extensions.filter((extension) => extension !== '')]
}

/** Read only the shebang line. Never slurp a large binary into memory. */
export async function readShebangInterpreter(executablePath: string): Promise<string | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(executablePath, 'r')
    const buffer = Buffer.alloc(512)
    const { bytesRead } = await handle.read(buffer, 0, 512, 0)
    const firstLine = buffer.subarray(0, bytesRead).toString('utf8').split('\n', 1)[0] ?? ''
    if (!firstLine.startsWith('#!')) return undefined
    const parts = firstLine.slice(2).trim().split(/\s+/)
    if (parts.length === 0) return undefined
    if (parts[0] === 'env' || parts[0].endsWith('/env')) return parts[1]
    return parts[0]
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => undefined)
  }
}
