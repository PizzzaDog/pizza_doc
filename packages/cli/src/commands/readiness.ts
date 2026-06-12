import * as path from 'node:path'
import { evaluateReadiness, validate } from '@pizza-doc/core'
import type { ReadinessIssue, ReadinessMetric, ReadinessOptions, Space } from '@pizza-doc/core'
import {
  collectMissingAnchors,
  gitToplevel,
  parseModuleRootSpecs,
  resolveAnchors,
} from '../util/anchors.js'
import { type ParsedArgs, getRepeatableFlag } from '../util/args.js'
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

  const anchorOk = runAnchorGate(args, space, dir)

  const driftCode = await runOptionalDrift(args, dir)
  if (driftCode !== null && driftCode !== 0) {
    console.log(`\n${red('✗')} drift gate failed`)
  }

  return readiness.passed && anchorOk && (driftCode === null || driftCode === 0) ? 0 : 1
}

/**
 * Production anchor gate: every `sourceRef` in the space must resolve to a
 * real file. Deterministic (no LLM, no JSONL), so it belongs in the
 * readiness gate next to coverage/proof — unlike `runOptionalDrift`, which
 * needs an extracted snapshot. Returns true when the gate passes.
 *
 * Opt-in, like every other strict readiness check (`--strict-contracts`,
 * `--check-state-coverage`, …). Triggered by:
 *   --check-anchors     turn the gate on (resolves against the default root).
 *   --code-root <dir>   set + turn on; root the sourceRef paths resolve
 *                       against (default: git toplevel of the space, else cwd).
 *   --module-root <id>=<dir>
 *                       set + turn on; repeatable. Multi-repo workspaces:
 *                       that module's anchors resolve against <dir> first
 *                       (relative to the code root), then fall back to it.
 *   --require-anchors    turn on + additionally fail on code-backed entities
 *                       (component / model / table) that carry no sourceRef.
 *
 * Default `pd readiness` does NOT resolve anchors: many specs cite code that
 * lives outside this checkout (or is design-first), so resolving by default
 * would be wrong. A design-first space under the gate is silent and passes.
 */
function runAnchorGate(args: ParsedArgs, space: Space, dir: string): boolean {
  const explicitRoot = typeof args.flags['code-root'] === 'string'
  const requireAnchors = args.flags['require-anchors'] === true
  const checkAnchors = args.flags['check-anchors'] === true
  const moduleRootSpecs = getRepeatableFlag(args, 'module-root')
  if (!explicitRoot && !requireAnchors && !checkAnchors && moduleRootSpecs.length === 0) {
    return true
  }

  const { roots: moduleRootsSpec, errors: rootErrors } = parseModuleRootSpecs(moduleRootSpecs)
  if (rootErrors.length > 0) {
    console.log(`\n${bold(cyan('anchor gate:'))}`)
    for (const e of rootErrors) console.log(`  ${red(e)}`)
    console.log(`\n${red('✗')} anchor gate failed`)
    return false
  }

  const codeRoot = explicitRoot
    ? path.resolve(args.flags['code-root'] as string)
    : (gitToplevel(dir) ?? process.cwd())

  const { moduleRoots, unknownModuleRoots, checked, resolved, issues } = resolveAnchors(
    space,
    codeRoot,
    moduleRootsSpec,
  )
  const missing = requireAnchors ? collectMissingAnchors(space) : []

  if (checked === 0 && missing.length === 0) return true

  const broken = issues.filter((i) => i.severity === 'broken')
  const staleLines = issues.filter((i) => i.severity === 'stale-line')

  console.log(`\n${bold(cyan('anchor gate:'))}  ${dim(`code-root ${codeRoot}`)}`)
  const rootEntries = Object.entries(moduleRoots)
  if (rootEntries.length > 0) {
    console.log(dim(`  module roots: ${rootEntries.map(([id, p]) => `${id} → ${p}`).join(' · ')}`))
  }
  for (const id of unknownModuleRoots) {
    console.log(yellow(`  --module-root '${id}' matches no module in this space (typo?)`))
  }
  const parts = [`${checked} checked`, green(`${resolved} resolved`)]
  if (broken.length > 0) parts.push(red(`${broken.length} broken`))
  if (staleLines.length > 0) parts.push(yellow(`${staleLines.length} stale`))
  if (requireAnchors) {
    parts.push(missing.length > 0 ? yellow(`${missing.length} missing`) : green('0 missing'))
  }
  console.log(`  ${parts.join(' · ')}`)

  for (const i of broken) {
    console.log(`  ${red('READINESS_ANCHOR_UNRESOLVED')} ${dim(`[${i.ref}]`)}`)
    console.log(`    ${i.sourceRef} — ${i.reason}`)
  }
  for (const i of missing) {
    console.log(`  ${yellow('READINESS_ANCHOR_MISSING')} ${dim(`[${i.ref}]`)}`)
  }

  const failed = broken.length > 0 || missing.length > 0
  if (failed) console.log(`\n${red('✗')} anchor gate failed`)
  return !failed
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
