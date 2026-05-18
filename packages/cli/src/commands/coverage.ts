import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { allComponents, allModels, allTables } from '../util/space-walk.js'
import { buildUsageIndex } from '../util/usage-index.js'

/**
 * `pd coverage` — percentage of first-class entities referenced by at
 * least one use case. Emits per-category breakdowns and an overall score.
 *
 * Default thresholds (override via --min-*): below them the command exits
 * non-zero so CI can block merges that lower coverage.
 */
export async function cmdCoverage(args: ParsedArgs): Promise<number> {
  const { space } = await loadSpaceForCli(resolveSpaceDir(args.positional[0]))
  const usage = buildUsageIndex(space)

  const components = [...allComponents(space)]
  const models = [...allModels(space)]
  const tables = [...allTables(space)]
  const endpoints = [...usage.endpoints.keys()]

  const totalComponents = components.length
  const usedComponents = components.filter((c) => usage.componentUsedBy.get(c.ref)?.size).length
  const totalModels = models.length
  const usedModels = models.filter((m) => usage.modelUsedBy.get(m.ref)?.size).length
  const totalTables = tables.length
  const usedTables = tables.filter((t) => usage.tableUsedBy.get(t.ref)?.size).length
  const totalEndpoints = endpoints.length
  const usedEndpoints = endpoints.filter((k) => usage.endpointsUsedBy.get(k)?.size).length

  const rows = [
    { label: 'components', total: totalComponents, used: usedComponents },
    { label: 'models    ', total: totalModels, used: usedModels },
    { label: 'tables    ', total: totalTables, used: usedTables },
    { label: 'endpoints ', total: totalEndpoints, used: usedEndpoints },
  ]

  console.log(`${bold(cyan(`coverage: ${space.meta.id}`))}`)
  for (const r of rows) {
    const pct = r.total === 0 ? 100 : Math.round((r.used / r.total) * 100)
    const bar = renderBar(pct)
    const pctText = pctColour(pct)(`${pct}%`.padStart(4))
    console.log(`  ${r.label}  ${bar}  ${pctText}  ${dim(`${r.used}/${r.total}`)}`)
  }

  const thresholds = {
    component: flagNumber(args, 'min-components', 80),
    model: flagNumber(args, 'min-models', 70),
    table: flagNumber(args, 'min-tables', 80),
    endpoint: flagNumber(args, 'min-endpoints', 80),
  }

  const pctComp = pct(usedComponents, totalComponents)
  const pctMod = pct(usedModels, totalModels)
  const pctTab = pct(usedTables, totalTables)
  const pctEnd = pct(usedEndpoints, totalEndpoints)

  const fails: string[] = []
  if (pctComp < thresholds.component)
    fails.push(`components (${pctComp}% < ${thresholds.component}%)`)
  if (pctMod < thresholds.model) fails.push(`models (${pctMod}% < ${thresholds.model}%)`)
  if (pctTab < thresholds.table) fails.push(`tables (${pctTab}% < ${thresholds.table}%)`)
  if (pctEnd < thresholds.endpoint) fails.push(`endpoints (${pctEnd}% < ${thresholds.endpoint}%)`)
  if (fails.length > 0) {
    console.log(`\n${red(bold('below thresholds:'))} ${fails.join(', ')}`)
    console.log(dim('  run `pd orphans` to see what is unreferenced.'))
    return 1
  }
  console.log(`\n${green('✓')} all categories above thresholds`)
  return 0
}

function pct(used: number, total: number): number {
  return total === 0 ? 100 : Math.round((used / total) * 100)
}

function flagNumber(args: ParsedArgs, name: string, fallback: number): number {
  const v = args.flags[name]
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function renderBar(pct: number, width = 20): string {
  const filled = Math.round((pct / 100) * width)
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
  return pctColour(pct)(bar)
}

function pctColour(pct: number): (s: string) => string {
  if (pct >= 80) return green
  if (pct >= 50) return yellow
  return red
}
