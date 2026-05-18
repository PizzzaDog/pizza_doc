import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { allComponents, allModels, allTables } from '../util/space-walk.js'
import { buildUsageIndex } from '../util/usage-index.js'

/**
 * `pd orphans` — list entities nothing references. The inverse of `coverage`.
 * Helpful when you inherited a spec and want to know what's dead vs in
 * flight.
 */
export async function cmdOrphans(args: ParsedArgs): Promise<number> {
  const { space } = await loadSpaceForCli(resolveSpaceDir(args.positional[0]))
  const usage = buildUsageIndex(space)

  const unusedComponents = [...allComponents(space)].filter(
    (c) => !usage.componentUsedBy.get(c.ref)?.size,
  )
  const unusedModels = [...allModels(space)].filter((m) => !usage.modelUsedBy.get(m.ref)?.size)
  const unusedTables = [...allTables(space)].filter((t) => !usage.tableUsedBy.get(t.ref)?.size)
  const unusedEndpoints = [...usage.endpoints.entries()].filter(
    ([k]) => !usage.endpointsUsedBy.get(k)?.size,
  )

  const only = typeof args.flags.kind === 'string' ? args.flags.kind : undefined

  // Scope the summary count (and exit code) to the --kind filter so
  // `orphans --kind tables` doesn't fail CI because of orphan endpoints.
  const scopedCounts: number[] = []
  if (!only || only === 'components') scopedCounts.push(unusedComponents.length)
  if (!only || only === 'models') scopedCounts.push(unusedModels.length)
  if (!only || only === 'tables') scopedCounts.push(unusedTables.length)
  if (!only || only === 'endpoints') scopedCounts.push(unusedEndpoints.length)
  const total = scopedCounts.reduce((a, b) => a + b, 0)

  console.log(
    `${bold(cyan(`orphans: ${space.meta.id}`))}  ${dim(`(${total}${only ? ` in ${only}` : ' total'})`)}`,
  )

  if (!only || only === 'components') section('components', unusedComponents, (c) => c.ref)
  if (!only || only === 'models') section('models', unusedModels, (m) => m.ref)
  if (!only || only === 'tables') section('tables', unusedTables, (t) => t.ref)
  if (!only || only === 'endpoints') {
    section(
      'endpoints',
      unusedEndpoints,
      ([key, info]) => `${key}  ${dim(`→ ${info.componentRef}/method:${info.methodName}`)}`,
    )
  }

  return total > 0 ? 1 : 0
}

function section<T>(name: string, items: T[], fmt: (t: T) => string): void {
  if (items.length === 0) {
    console.log(`  ${yellow(bold(name))}: ${dim('none')}`)
    return
  }
  console.log(`  ${yellow(bold(name))}: ${items.length}`)
  for (const it of items) console.log(`    - ${fmt(it)}`)
}
