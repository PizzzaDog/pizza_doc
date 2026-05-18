/**
 * Minimal flag parser — no getopt, no yargs. Enough for our command shapes:
 *
 *   pd <cmd> [positional...] [--flag value] [--bool]
 *
 * Returns positional args in insertion order plus a flags object. Unknown
 * flags are kept (callers validate).
 */
export interface ParsedArgs {
  positional: string[]
  flags: Record<string, string | boolean>
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a) continue
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const eq = key.indexOf('=')
      if (eq >= 0) {
        flags[key.slice(0, eq)] = key.slice(eq + 1)
        continue
      }
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { positional, flags }
}

export function getStringFlag(
  parsed: ParsedArgs,
  name: string,
  fallback?: string,
): string | undefined {
  const v = parsed.flags[name]
  if (typeof v === 'string') return v
  return fallback
}

export function getBoolFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags[name] === true || parsed.flags[name] === 'true'
}
