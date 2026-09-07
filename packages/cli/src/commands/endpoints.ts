import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import type { EndpointOwner } from '../util/usage-index.js'
import { buildUsageIndex } from '../util/usage-index.js'

/**
 * `pd endpoints [--orphans] [--module <id>]` — HTTP surface report. Lists
 * every endpoint declared across the space's inbound components, grouped by
 * method, with the use cases that exercise each one. A verb+path declared by
 * several modules (proxy in front of a backend) lists every owner. `--orphans`
 * narrows to endpoints no use case covers — the classic "forgotten endpoint"
 * audit. `--module <id>` narrows to endpoints served by one module.
 */
export async function cmdEndpoints(args: ParsedArgs): Promise<number> {
  const { space } = await loadSpaceForCli(resolveSpaceDir(args.positional[0]))
  const usage = buildUsageIndex(space)
  const onlyOrphans = args.flags.orphans === true
  const moduleFilter = typeof args.flags.module === 'string' ? args.flags.module : undefined

  if (moduleFilter && !space.modules.some((m) => m.id === moduleFilter)) {
    console.log(red(`unknown module: ${moduleFilter}`))
    console.log(dim(`  available: ${space.modules.map((m) => m.id).join(', ')}`))
    return 2
  }

  const all = [...usage.endpoints.entries()].sort(([a], [b]) => a.localeCompare(b))
  const entries = moduleFilter
    ? all
        .map(
          ([key, owners]) =>
            [key, owners.filter((o) => ownerModuleId(o) === moduleFilter)] as const,
        )
        .filter(([, owners]) => owners.length > 0)
    : all

  const scope = moduleFilter
    ? `module ${moduleFilter}: ${entries.length} of ${all.length} declared`
    : `${entries.length} declared`
  console.log(`${bold(cyan(`endpoints: ${space.meta.id}`))}  ${dim(scope)}`)

  let shown = 0
  for (const [key, owners] of entries) {
    const users = [...(usage.endpointsUsedBy.get(key) ?? [])]
    if (onlyOrphans && users.length > 0) continue
    shown++
    const status =
      users.length > 0
        ? green(`${users.length} usecase${users.length === 1 ? '' : 's'}`)
        : red('orphan')
    // Single owner keeps the compact one-line format; a shared verb+path puts
    // each owner on its own line so the collision is impossible to miss.
    const only = owners.length === 1 ? owners[0] : undefined
    const ownerSuffix = only ? `  ${dim(`→ ${ownerRef(only)}`)}` : ''
    console.log(`  ${bold(padMethod(key))}  ${status}${ownerSuffix}`)
    if (!only) {
      for (const o of owners) console.log(`    ${dim(`→ ${ownerRef(o)}`)}`)
    }
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

function ownerRef(owner: EndpointOwner): string {
  return `${owner.componentRef}/method:${owner.methodName}`
}

/** `module:<id>/…` → `<id>`. */
function ownerModuleId(owner: EndpointOwner): string | undefined {
  const head = owner.componentRef.split('/')[0]
  return head?.startsWith('module:') ? head.slice('module:'.length) : undefined
}

function padMethod(key: string): string {
  const space = key.indexOf(' ')
  if (space < 0) return key
  const method = key.slice(0, space).padEnd(6)
  return `${method}${key.slice(space)}`
}
