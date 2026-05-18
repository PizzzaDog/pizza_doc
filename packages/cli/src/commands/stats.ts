import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { allComponents, allModels, allTables } from '../util/space-walk.js'
import { buildUsageIndex } from '../util/usage-index.js'

/**
 * `pd stats [spaces/<id>]`
 *
 * One-screen snapshot of the project: counts, coverage, top offenders.
 * For status meetings and slide decks.
 */
export async function cmdStats(args: ParsedArgs): Promise<number> {
  const { space } = await loadSpaceForCli(resolveSpaceDir(args.positional[0]))
  const usage = buildUsageIndex(space)

  const components = [...allComponents(space)]
  const models = [...allModels(space)]
  const tables = [...allTables(space)]
  const endpoints = [...usage.endpoints.keys()]

  console.log(
    `${bold(cyan(`stats: ${space.meta.id}`))}  ${dim(`(${space.meta.implementationLanguage ?? '—'}/${space.meta.implementationFramework ?? '—'})`)}`,
  )
  console.log('')
  console.log(`  ${bold('counts')}`)
  row('modules', space.modules.length)
  row(
    'domains',
    space.modules.reduce((n, m) => n + m.domains.length, 0),
  )
  row('actors', space.actors.length)
  row('components', components.length)
  row(
    '  methods',
    components.reduce((n, c) => n + c.component.methods.length, 0),
  )
  row('models', models.length)
  row('tables', tables.length)
  row(
    '  columns',
    tables.reduce((n, t) => n + t.table.columns.length, 0),
  )
  row('use cases', space.useCases.length)
  row(
    '  steps',
    space.useCases.reduce((n, u) => n + u.steps.length, 0),
  )
  row(
    '  dataFlow',
    space.useCases.reduce((n, u) => n + u.dataFlow.length, 0),
  )
  row('endpoints', endpoints.length)

  console.log('')
  console.log(`  ${bold('longest use cases')}`)
  const byLen = [...space.useCases].sort((a, b) => b.steps.length - a.steps.length).slice(0, 5)
  for (const uc of byLen) console.log(`    · ${uc.id} — ${uc.steps.length} steps`)

  console.log('')
  console.log(`  ${bold('most-called components')}`)
  const byUsage = [...components]
    .map((c) => ({ c, n: usage.componentUsedBy.get(c.ref)?.size ?? 0 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
  for (const { c, n } of byUsage)
    console.log(`    · ${c.component.name} — ${n} use-case references`)

  // Coverage one-liner.
  const covC = pct(
    components.filter((c) => usage.componentUsedBy.get(c.ref)?.size).length,
    components.length,
  )
  const covM = pct(models.filter((m) => usage.modelUsedBy.get(m.ref)?.size).length, models.length)
  const covT = pct(tables.filter((t) => usage.tableUsedBy.get(t.ref)?.size).length, tables.length)
  const covE = pct(
    endpoints.filter((k) => usage.endpointsUsedBy.get(k)?.size).length,
    endpoints.length,
  )
  console.log('')
  console.log(
    `  ${bold('coverage:')}  ${yellow(`components ${covC}%`)}  ${yellow(`models ${covM}%`)}  ${yellow(`tables ${covT}%`)}  ${yellow(`endpoints ${covE}%`)}`,
  )
  console.log(dim('  (run `pd coverage` for thresholds; `pd orphans` for the unused list)'))
  return 0
}

function row(label: string, n: number): void {
  console.log(`    ${label.padEnd(14)} ${dim(String(n))}`)
}
function pct(num: number, den: number): number {
  if (den === 0) return 100
  return Math.round((num / den) * 100)
}
