import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { buildUsageIndex } from '../util/usage-index.js'

/**
 * `pd endpoints [--orphans]` — HTTP surface report. Lists every endpoint
 * declared across the space's controllers, grouped by method, with the
 * use cases that exercise each one. `--orphans` narrows to endpoints no
 * use case covers — the classic "forgotten endpoint" audit.
 */
export async function cmdEndpoints(args: ParsedArgs): Promise<number> {
  const { space } = await loadSpaceForCli(resolveSpaceDir(args.positional[0]))
  const usage = buildUsageIndex(space)
  const onlyOrphans = args.flags.orphans === true

  const entries = [...usage.endpoints.entries()].sort(([a], [b]) => a.localeCompare(b))
  console.log(`${bold(cyan(`endpoints: ${space.meta.id}`))}  ${dim(`${entries.length} declared`)}`)

  let shown = 0
  for (const [key, info] of entries) {
    const users = [...(usage.endpointsUsedBy.get(key) ?? [])]
    if (onlyOrphans && users.length > 0) continue
    shown++
    const status =
      users.length > 0
        ? green(`${users.length} usecase${users.length === 1 ? '' : 's'}`)
        : red('orphan')
    console.log(
      `  ${bold(padMethod(key))}  ${status}  ${dim(`→ ${info.componentRef}/method:${info.methodName}`)}`,
    )
    if (!onlyOrphans && users.length > 0) {
      for (const u of users) console.log(`    ${dim('·')} ${yellow(u)}`)
    }
  }
  if (shown === 0 && onlyOrphans) {
    console.log(`\n${green('✓')} every endpoint is covered by at least one use case`)
    return 0
  }
  const orphanCount = entries.filter(([k]) => !usage.endpointsUsedBy.get(k)?.size).length
  return orphanCount > 0 && onlyOrphans ? 1 : 0
}

function padMethod(key: string): string {
  const space = key.indexOf(' ')
  if (space < 0) return key
  const method = key.slice(0, space).padEnd(6)
  return `${method}${key.slice(space)}`
}
