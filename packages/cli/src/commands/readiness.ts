import { evaluateReadiness, validate } from '@pizza-doc/core'
import type { ReadinessIssue, ReadinessMetric, ReadinessOptions } from '@pizza-doc/core'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { cmdDrift } from './drift.js'

/**
 * `pd readiness [spaces/<id>] --profile production`
 *
 * Release gate that layers production coverage/proof requirements on top
 * of normal validation. `pd validate` answers "is this spec internally
 * coherent?"; readiness answers "is this spec safe to ship from?"
 */
export async function cmdReadiness(args: ParsedArgs): Promise<number> {
  const profile = typeof args.flags.profile === 'string' ? args.flags.profile : 'production'
  if (profile !== 'production') {
    console.error(red(`unknown readiness profile: ${profile}`))
    console.error(dim('usage: pd readiness [<dir>] --profile production'))
    return 2
  }

  const dir = resolveSpaceDir(args.positional[0])
  const { space, loadResult } = await loadSpaceForCli(dir)
  const validation = validate(loadResult)
  const readiness = evaluateReadiness(space, validation, readinessOptions(args, profile))

  console.log(
    `${bold(cyan(`readiness: ${space.meta.id}`))}  ${dim(`profile=${readiness.profile}`)}`,
  )
  console.log(
    `  validation: ${validation.issues.filter((i) => i.severity === 'error').length} errors · ${validation.issues.filter((i) => i.severity === 'warning').length} warnings ${dim(readiness.strictWarnings ? '(strict)' : '(warnings allowed)')}`,
  )
  for (const metric of readiness.metrics) printMetric(metric)

  if (readiness.issues.length > 0) {
    console.log(`\n${red(bold('production blockers:'))}`)
    for (const issue of readiness.issues) printIssue(issue)
  } else {
    console.log(`\n${green('✓')} production readiness checks passed`)
  }

  const driftCode = await runOptionalDrift(args, dir)
  if (driftCode !== null && driftCode !== 0) {
    console.log(`\n${red('✗')} drift gate failed`)
  }

  return readiness.passed && (driftCode === null || driftCode === 0) ? 0 : 1
}

function strictWarnings(args: ParsedArgs): boolean {
  const flag = args.flags['strict-warnings']
  if (typeof flag === 'string') return flag !== 'false'
  return true
}

function readinessOptions(args: ParsedArgs, profile: 'production'): ReadinessOptions {
  const options: ReadinessOptions = {
    profile,
    strictWarnings: strictWarnings(args),
  }
  const minEndpoints = flagNumber(args, 'min-endpoints')
  const minModels = flagNumber(args, 'min-models')
  const minTables = flagNumber(args, 'min-tables')
  const minComponents = flagNumber(args, 'min-components')
  if (minEndpoints !== undefined) options.minEndpointCoverage = minEndpoints
  if (minModels !== undefined) options.minModelCoverage = minModels
  if (minTables !== undefined) options.minTableCoverage = minTables
  if (minComponents !== undefined) options.minComponentCoverage = minComponents
  return options
}

function flagNumber(args: ParsedArgs, name: string): number | undefined {
  const v = args.flags[name]
  if (typeof v !== 'string') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function printMetric(metric: ReadinessMetric): void {
  const ignored = metric.ignored > 0 ? dim(`, ${metric.ignored} justified`) : ''
  const status = metric.percent >= metric.threshold ? green('ok') : red('fail')
  console.log(
    `  ${metric.key.padEnd(10)} ${status}  ${metric.percent}% ${dim(`(${metric.used}/${metric.total}, min ${metric.threshold}%${ignored})`)}`,
  )
}

function printIssue(issue: ReadinessIssue): void {
  const loc = issue.entityRef ? dim(` [${issue.entityRef}]`) : ''
  const color = issue.severity === 'error' ? red : yellow
  console.log(`  ${color(issue.code)}${loc}`)
  console.log(`    ${issue.message}`)
}

async function runOptionalDrift(args: ParsedArgs, dir: string): Promise<number | null> {
  const driftFile = args.flags['drift-from-jsonl']
  if (typeof driftFile !== 'string') return null
  console.log(`\n${bold(cyan('drift gate:'))}`)
  return cmdDrift({
    positional: [dir],
    flags: {
      'from-jsonl': driftFile,
    },
  })
}
