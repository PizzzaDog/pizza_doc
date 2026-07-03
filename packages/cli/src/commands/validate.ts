import { existsSync, statSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

import { loadSpace, loadSpaceWithChange, validate } from '@pizza-doc/core'
import type { RunbookRef, Severity, Space, ValidationIssue } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { expectedSpaceId, resolveSpaceDir } from '../util/space-path.js'

/**
 * `pd validate [spaces/<id>] [--strict-contracts] [--check-orphan-paths]
 *              [--check-state-coverage] [--check-runbook-coverage]
 *              [--strict-wire-capture] [--strict-wiring]`
 *
 * Runs the three-pass validator and prints a human-readable summary.
 *
 * **A5 strict-contract flags.** Plain `pd validate` keeps the v0.2 baseline
 * — every v0.3 contract rule emits at most `warning`/`info`, so legacy
 * spaces don't suddenly fail. Each flag below opt-in escalates one class:
 *
 *   --strict-contracts       — CONTRACT_CALL_* and EXTERNAL_DEP_USES_UNKNOWN_CONFIG
 *                              warnings become errors. CI gate for
 *                              caller/callee credential parity. Since v0.6
 *                              (W5) also escalates THROWS_UNMAPPED — every
 *                              throw on an http-reachable method must have
 *                              an errorMapping row.
 *   --check-orphan-paths     — CONTRACT_CALL_PATH_ORPHAN escalates to error.
 *                              CI gate for caller path ↔ callee route parity.
 *   --check-state-coverage   — STATE_MACHINE_SCENARIO_COVERAGE info → error.
 *                              Forces scenarios on non-trivial transitions.
 *   --check-runbook-coverage — RUNBOOK_COVERAGE escalates *severity-aware*
 *                              (Codex C4): if the matched runbook would be
 *                              severity=p0/p1 the issue becomes error;
 *                              p2 becomes warning; validation-error stays
 *                              info. Without a matched runbook the gap is
 *                              treated as p1 by default.
 *   --strict-wire-capture    — WIRE_CAPTURE_MISSING warning → error. v0.5
 *                              (B3) gate. Use in CI for services that
 *                              integrate with vendor APIs; protects against
 *                              the synth-fixture-lies-about-shape failure
 *                              mode (cost a real deployment 5 hours of prod debugging).
 *   --strict-wiring          — WIRING_STEP_WITHOUT_CALL and STEP_VIA_MISSING
 *                              escalate to error. v0.6 (W1) gate: use-case
 *                              steps must match declared calls/emits edges
 *                              and http/event edges must carry a payload
 *                              model. TYPE_UNRESOLVED needs no flag — a
 *                              phantom type is always an error.
 *
 * Exit codes:
 *   0 — no errors and no warnings
 *   1 — errors (fail hard)
 *   2 — warnings only (strict CI may treat as fail with --strict-warnings)
 */
export async function cmdValidate(args: ParsedArgs): Promise<number> {
  const dir = resolveSpaceDir(args.positional[0])
  const fs = nodeFileSystem(dir)
  const changeId = typeof args.flags.change === 'string' ? args.flags.change : null
  const result = changeId
    ? await loadSpaceWithChange(fs, changeId, '.', expectedSpaceId(dir))
    : await loadSpace(fs, '.', expectedSpaceId(dir))
  const validation = validate(result)
  const id = result.space?.meta.id ?? expectedSpaceId(dir) ?? '<unknown>'

  // v0.3 (A5) — opt-in escalation flags. They mutate severity of v0.3 codes
  // post-validation; the underlying rules are unchanged.
  const flagStrictContracts = args.flags['strict-contracts'] === true
  const flagOrphanPaths = args.flags['check-orphan-paths'] === true
  const flagStateCoverage = args.flags['check-state-coverage'] === true
  const flagRunbookCoverage = args.flags['check-runbook-coverage'] === true
  const flagStrictWireCapture = args.flags['strict-wire-capture'] === true
  const flagStrictWiring = args.flags['strict-wiring'] === true
  if (
    (flagStrictContracts ||
      flagOrphanPaths ||
      flagStateCoverage ||
      flagRunbookCoverage ||
      flagStrictWiring) &&
    result.space
  ) {
    escalateContractIssues(validation.issues, result.space, {
      strictContracts: flagStrictContracts,
      orphanPaths: flagOrphanPaths,
      stateCoverage: flagStateCoverage,
      runbookCoverage: flagRunbookCoverage,
      strictWiring: flagStrictWiring,
    })
  }

  // v0.5 (B3) — wire-capture filesystem checks. Live here rather than in
  // the semantic validator because they touch the disk; semantic.ts only
  // produces the WIRE_CAPTURE_MISSING signal from in-memory state.
  if (result.space) {
    const fsIssues = checkWireCaptureFiles(result.space, dir)
    validation.issues.push(...fsIssues)
  }
  if (flagStrictWireCapture) {
    for (const issue of validation.issues) {
      if (issue.code === 'WIRE_CAPTURE_MISSING' && issue.severity === 'warning') {
        issue.severity = 'error'
      }
    }
  }

  const errors = validation.issues.filter((i) => i.severity === 'error')
  const warnings = validation.issues.filter((i) => i.severity === 'warning')
  const infos = validation.issues.filter((i) => i.severity === 'info')

  const strict = args.flags['strict-warnings'] === true

  const changeLabel = changeId ? dim(`  change: ${changeId}`) : ''
  console.log(`${bold(cyan(`space: ${id}`))}${changeLabel}  ${dim(`${result.files.size} files`)}`)
  console.log(
    `  passes: schema=${fmtPass(validation.passes.schema)} refs=${fmtPass(validation.passes.refs)} semantic=${fmtPass(validation.passes.semantic)}`,
  )
  console.log(
    `  issues: ${red(`${errors.length} errors`)} · ${yellow(`${warnings.length} warnings`)} · ${dim(`${infos.length} infos`)}`,
  )

  if (errors.length > 0) {
    console.log(`\n${red(bold('errors:'))}`)
    for (const i of errors) printIssue(i)
  }
  if (warnings.length > 0 && !args.flags.quiet) {
    console.log(`\n${yellow(bold('warnings:'))}`)
    for (const i of warnings) printIssue(i)
  }
  if (infos.length > 0 && args.flags.verbose) {
    console.log(`\n${dim(bold('infos:'))}`)
    for (const i of infos) printIssue(i)
  }

  // v0.6 (code-anchoring Phase 4) — honest scope note. A clean run proves
  // the spec is *internally* consistent; nothing here ever read the code.
  // Without this line 0/0 reads as "done" — see docs/backlog.md
  // ("Spec ↔ code binding").
  if (errors.length === 0 && args.flags.quiet !== true) {
    console.log(
      dim(
        '\n  note: spec↔code parity NOT checked — run `pd anchors` (deterministic) or `pd drift --from-jsonl` (needs a code extract).',
      ),
    )
  }

  if (errors.length > 0) return 1
  if (strict && warnings.length > 0) return 2
  return 0
}

function fmtPass(ok: boolean): string {
  return ok ? green('ok') : red('fail')
}

function printIssue(issue: { code: string; message: string; file?: string; line?: number }): void {
  const loc = issue.file ? dim(` [${issue.file}${issue.line ? `:${issue.line}` : ''}]`) : ''
  console.log(`  ${cyan(issue.code)}${loc}`)
  console.log(`    ${issue.message}`)
}

/**
 * v0.3 (A5) escalation. Iterates `issues` in place, bumping severities
 * when the matching flag is set. The Severity ordering here is
 * `info < warning < error`; we only ever bump up.
 */
function escalateContractIssues(
  issues: ValidationIssue[],
  space: Space,
  flags: {
    strictContracts: boolean
    orphanPaths: boolean
    stateCoverage: boolean
    runbookCoverage: boolean
    strictWiring: boolean
  },
): void {
  const runbookSeverity = flags.runbookCoverage ? indexRunbookSeverity(space) : null

  for (const issue of issues) {
    // --strict-wiring: W1 wiring parity — steps must match declared
    // calls/emits edges, http/event edges must carry a payload model.
    if (flags.strictWiring) {
      if (issue.code === 'WIRING_STEP_WITHOUT_CALL' || issue.code === 'STEP_VIA_MISSING') {
        bump(issue, 'error')
        continue
      }
    }
    // --strict-contracts: A1 + A3 credential-related codes → error, plus
    // W5 error-mapping closure (throws on the wire without a mapping row).
    if (flags.strictContracts) {
      if (
        issue.code === 'CONTRACT_CALL_CREDENTIAL_MISSING' ||
        issue.code === 'CONTRACT_CALL_HEADER_MISMATCH' ||
        issue.code === 'CONTRACT_CALL_ENV_MISMATCH' ||
        issue.code === 'THROWS_UNMAPPED'
      ) {
        bump(issue, 'error')
        continue
      }
    }
    // --check-orphan-paths: A1 orphan path detector → error
    if (flags.orphanPaths && issue.code === 'CONTRACT_CALL_PATH_ORPHAN') {
      bump(issue, 'error')
      continue
    }
    // --check-state-coverage: A2 scenario coverage → error
    if (flags.stateCoverage && issue.code === 'STATE_MACHINE_SCENARIO_COVERAGE') {
      bump(issue, 'error')
      continue
    }
    // --check-runbook-coverage: A4 runbook coverage, severity-aware (Codex C4).
    if (flags.runbookCoverage && issue.code === 'RUNBOOK_COVERAGE' && runbookSeverity) {
      // Pull the entity ref (a use-case id) and the errorFlow id from the message
      // tail; the message format is `Use case '<uc>' errorFlow '<ef>' has no
      // runbook...`. We re-scan the space directly to find the severity the
      // matching runbook *would* be (the gap may be unmatched — default p1).
      const matchedSeverity = inferGapSeverity(issue, runbookSeverity)
      if (matchedSeverity === 'p0' || matchedSeverity === 'p1') {
        bump(issue, 'error')
      } else if (matchedSeverity === 'p2') {
        bump(issue, 'warning')
      }
      // validation-error → leave as info (user input errors don't gate).
    }
  }
}

/**
 * Returns: max(current, target) severity. The strings encode rank
 * info=0 / warning=1 / error=2.
 */
function bump(issue: ValidationIssue, target: Severity): void {
  const rank: Record<Severity, number> = { info: 0, warning: 1, error: 2 }
  if (rank[target] > rank[issue.severity]) issue.severity = target
}

/**
 * Build a quick lookup of errorFlow id → runbook severity. Runbooks
 * declare `covers: [<errorFlow.id-or-fq-ref>]`; we invert the map.
 */
function indexRunbookSeverity(space: Space): Map<string, RunbookRef['severity']> {
  const out = new Map<string, RunbookRef['severity']>()
  for (const rb of space.runbooks ?? []) {
    for (const c of rb.covers) {
      const errIdx = c.indexOf('/errorFlow:')
      const key = errIdx > 0 ? c.slice(errIdx + '/errorFlow:'.length) : c
      // Highest severity wins (p0 > p1 > p2 > validation-error).
      const cur = out.get(key)
      if (!cur || severityRank(rb.severity) > severityRank(cur)) {
        out.set(key, rb.severity)
      }
    }
  }
  return out
}

function severityRank(s: RunbookRef['severity']): number {
  switch (s) {
    case 'p0':
      return 4
    case 'p1':
      return 3
    case 'p2':
      return 2
    case 'validation-error':
      return 1
  }
}

/**
 * v0.5 (B3) — wire-capture file-system checks. The semantic validator
 * emits WIRE_CAPTURE_MISSING from in-memory shape; here we touch disk to
 * produce two additional codes:
 *
 *   WIRE_CAPTURE_PATH_BROKEN — capture file referenced but not on disk.
 *   WIRE_CAPTURE_STALE       — capture older than 30 days (info-level
 *                              hint to refresh against current vendor).
 *
 * Both run unconditionally — they don't need `--strict-wire-capture` to
 * fire. The escalation flag separately bumps WIRE_CAPTURE_MISSING.
 */
const WIRE_CAPTURE_STALE_DAYS = 30

/** Exported for `pd handoff` — its 0-errors gate includes fs-level checks. */
export function checkWireCaptureFiles(space: Space, spaceDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const now = Date.now()
  const staleMs = WIRE_CAPTURE_STALE_DAYS * 24 * 60 * 60 * 1000

  for (const mod of space.modules) {
    const components = [
      ...mod.components.map((c) => ({ component: c, ref: `module:${mod.id}/component:${c.id}` })),
      ...mod.domains.flatMap((d) =>
        d.components.map((c) => ({
          component: c,
          ref: `module:${mod.id}/domain:${d.id}/component:${c.id}`,
        })),
      ),
    ]
    for (const { component, ref } of components) {
      const wc = component.wireCapture
      if (!wc) continue

      // 1. Path existence — relative to the space directory.
      const abs = resolvePath(spaceDir, wc.path)
      if (!existsSync(abs)) {
        issues.push({
          severity: 'error',
          code: 'WIRE_CAPTURE_PATH_BROKEN',
          message: `Component '${component.name}' (${ref}) wireCapture.path '${wc.path}' does not exist on disk (resolved to ${abs}).`,
          entityRef: ref,
        })
        continue
      }

      // 2. Staleness — only if the file is present so we have a real mtime
      // to compare to. We use capturedAt (the author's claim) as the
      // staleness reference, not mtime — mtime resets on git checkout.
      const capturedAt = Date.parse(`${wc.capturedAt}T00:00:00Z`)
      if (Number.isFinite(capturedAt) && now - capturedAt > staleMs) {
        const ageDays = Math.floor((now - capturedAt) / (24 * 60 * 60 * 1000))
        issues.push({
          severity: 'info',
          code: 'WIRE_CAPTURE_STALE',
          message: `Component '${component.name}' (${ref}) wireCapture is ${ageDays} days old (capturedAt: ${wc.capturedAt}). Consider re-capturing against the current vendor version.`,
          entityRef: ref,
        })
      }

      // Sanity: warn if path exists but is empty — a 0-byte fixture
      // doesn't help anyone.
      try {
        const st = statSync(abs)
        if (st.isFile() && st.size === 0) {
          issues.push({
            severity: 'warning',
            code: 'WIRE_CAPTURE_PATH_BROKEN',
            message: `Component '${component.name}' (${ref}) wireCapture.path '${wc.path}' is an empty file.`,
            entityRef: ref,
          })
        }
      } catch {
        // existsSync already handled the "not there" case; if statSync
        // throws here it's a rare race we don't need to second-guess.
      }
    }
  }
  return issues
}

/**
 * Extract the errorFlow id from a RUNBOOK_COVERAGE issue message and
 * look up the implied severity. Unmatched gaps default to `p1` — the
 * "production-incident-class but no runbook" worst case.
 */
function inferGapSeverity(
  issue: ValidationIssue,
  map: Map<string, RunbookRef['severity']>,
): RunbookRef['severity'] {
  // Message shape: "Use case '<uc>' errorFlow '<ef>' has no runbook..."
  const m = issue.message.match(/errorFlow '([^']+)'/)
  if (!m) return 'p1'
  const efId = m[1] ?? ''
  return map.get(efId) ?? 'p1'
}
