import * as path from 'node:path'
import {
  type AnchorIssue,
  collectMissingAnchors,
  gitToplevel,
  parseModuleRootSpecs,
  resolveAnchors,
} from '../util/anchors.js'
import { type ParsedArgs, getRepeatableFlag } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'

// Re-exported so existing importers (and tests) can reach it from here.
export { parseSourceRef } from '../util/anchors.js'

/**
 * `pd anchors [<dir>] [--code-root <dir>] [--module-root <id>=<dir>]...
 *             [--require-all] [--json]`
 *
 * Deterministic spec↔code anchor checker. Walks every `sourceRef` in the
 * space and verifies it resolves to a real file under `--code-root`
 * (default: the git toplevel of the space dir, else cwd), and — when a
 * `:line` suffix is present — that the file is long enough to contain that
 * line.
 *
 * This is the deterministic complement to `pd drift`: drift needs an
 * LLM-produced JSONL snapshot of the code side; anchors needs nothing but
 * the filesystem, so it runs in any CI. It catches the #1 silent drift —
 * code renamed / moved / deleted out from under a spec entity — without a
 * language parser, because a stale `sourceRef` stops resolving the moment
 * the file moves.
 *
 * Flags:
 *   --code-root <dir>  Root the (relative) sourceRef paths resolve against.
 *                      Default: `git rev-parse --show-toplevel` of the space
 *                      dir; falls back to cwd when not in a git repo.
 *   --module-root <module-id>=<dir>
 *                      Repeatable. Multi-repo workspaces: anchors owned by
 *                      that module resolve against <dir> first (relative to
 *                      --code-root), then fall back to --code-root. E.g.
 *                      `--module-root backend=horalab-be`. Mapping an id
 *                      that isn't a module in the space prints a warning.
 *                      Without the flag, single-root behaviour is unchanged.
 *   --require-all      Also flag component / model / table entities that
 *                      carry NO sourceRef at all (adoption gate). Off by
 *                      default so design-first spaces (no code yet) pass.
 *   --json             Emit a machine-readable report instead of text.
 *
 * Exit codes:
 *   0 — every anchor resolves (line-range warnings don't fail).
 *   1 — at least one anchor is broken, or (with --require-all) an entity
 *       has no anchor.
 *   2 — usage / load error.
 */
export async function cmdAnchors(args: ParsedArgs): Promise<number> {
  const dir = resolveSpaceDir(args.positional[0])
  const requireAll = args.flags['require-all'] === true
  const asJson = args.flags.json === true

  const { roots: moduleRootsSpec, errors: rootErrors } = parseModuleRootSpecs(
    getRepeatableFlag(args, 'module-root'),
  )
  if (rootErrors.length > 0) {
    for (const e of rootErrors) console.error(red(e))
    return 2
  }

  const { space } = await loadSpaceForCli(dir)

  const codeRoot =
    typeof args.flags['code-root'] === 'string'
      ? path.resolve(args.flags['code-root'])
      : (gitToplevel(dir) ?? process.cwd())

  const { moduleRoots, unknownModuleRoots, checked, resolved, issues } = resolveAnchors(
    space,
    codeRoot,
    moduleRootsSpec,
  )
  const allIssues: AnchorIssue[] = [...issues]
  let missing = 0
  if (requireAll) {
    const missingIssues = collectMissingAnchors(space)
    missing = missingIssues.length
    allIssues.push(...missingIssues)
  }

  const broken = allIssues.filter((i) => i.severity === 'broken').length
  const staleLines = allIssues.filter((i) => i.severity === 'stale-line').length

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          codeRoot,
          moduleRoots,
          unknownModuleRoots,
          checked,
          resolved,
          broken,
          staleLines,
          missing,
          issues: allIssues,
        },
        null,
        2,
      ),
    )
    return broken > 0 || missing > 0 ? 1 : 0
  }

  console.log(`${bold(cyan(`anchors: ${space.meta.id}`))}  ${dim(`code-root ${codeRoot}`)}`)
  const rootEntries = Object.entries(moduleRoots)
  if (rootEntries.length > 0) {
    console.log(dim(`  module roots: ${rootEntries.map(([id, p]) => `${id} → ${p}`).join(' · ')}`))
  }
  for (const id of unknownModuleRoots) {
    console.log(yellow(`  --module-root '${id}' matches no module in this space (typo?)`))
  }
  if (checked === 0 && !requireAll) {
    console.log(
      dim(
        '  no sourceRef anchors in this space (design-first?). Nothing to resolve.\n' +
          '  add `sourceRef:` to code-backed entities, or run `--require-all` to gate adoption.',
      ),
    )
    return 0
  }

  const parts = [
    `${checked} anchor${checked === 1 ? '' : 's'} checked`,
    green(`${resolved} resolved`),
    broken > 0 ? red(`${broken} broken`) : green('0 broken'),
  ]
  if (staleLines > 0) parts.push(yellow(`${staleLines} stale line${staleLines === 1 ? '' : 's'}`))
  if (requireAll) parts.push(missing > 0 ? yellow(`${missing} missing`) : green('0 missing'))
  console.log(`  ${parts.join(' · ')}`)

  printBlock(
    red('BROKEN — sourceRef points at a file that does not exist:'),
    allIssues.filter((i) => i.severity === 'broken').map(fmtIssue),
  )
  printBlock(
    yellow('STALE LINE — file exists but is shorter than the cited line:'),
    allIssues.filter((i) => i.severity === 'stale-line').map(fmtIssue),
  )
  if (requireAll) {
    printBlock(
      yellow('MISSING — code-backed entity has no sourceRef (--require-all):'),
      allIssues.filter((i) => i.severity === 'missing').map(fmtIssue),
    )
  }

  if (broken === 0 && missing === 0) {
    console.log(`\n${green('✓ all anchors resolve.')}`)
    return 0
  }
  console.log(`\n${bold('suggested next steps:')}`)
  if (broken > 0) {
    console.log(
      dim('  · broken anchors: the code moved. Update sourceRef, or re-extract + `pd import`.'),
    )
  }
  if (missing > 0) {
    console.log(dim('  · missing anchors: add `sourceRef: <path>[:line]` to bind the entity.'))
  }
  return 1
}

function fmtIssue(i: AnchorIssue): string {
  const src = i.sourceRef ? ` ${dim(`→ ${i.sourceRef}`)}` : ''
  return `${i.ref}${src}\n      ${dim(i.reason)}`
}

function printBlock(title: string, items: string[]): void {
  if (items.length === 0) return
  console.log(`\n${title}`)
  for (const it of items) console.log(`  ${it}`)
}
