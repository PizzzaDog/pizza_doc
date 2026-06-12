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
  /**
   * Every string value of each flag, in argv order. `flags` stays last-wins
   * for the existing single-value callers; repeatable flags (`--module-root
   * a=x --module-root b=y`) read all occurrences via `getRepeatableFlag`.
   * Optional so hand-built ParsedArgs literals keep compiling.
   */
  repeated?: Record<string, string[]>
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  const repeated: Record<string, string[]> = {}
  const record = (key: string, value: string): void => {
    flags[key] = value
    const list = repeated[key] ?? []
    list.push(value)
    repeated[key] = list
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a) continue
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const eq = key.indexOf('=')
      if (eq >= 0) {
        record(key.slice(0, eq), key.slice(eq + 1))
        continue
      }
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        record(key, next)
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { positional, flags, repeated }
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

/** All occurrences of a string flag, falling back to the single `flags` value. */
export function getRepeatableFlag(parsed: ParsedArgs, name: string): string[] {
  const all = parsed.repeated?.[name]
  if (all && all.length > 0) return all
  const single = parsed.flags[name]
  return typeof single === 'string' ? [single] : []
}
