import { collectBriefContext } from '@pizza-doc/core'
import type { ValidationIssue } from '@pizza-doc/core'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { checkWireCaptureFiles } from './validate.js'

/** One gate check: stable id for --json, human label, failing issues. */
interface GateCheck {
  id: string
  label: string
  issues: Array<Pick<ValidationIssue, 'code' | 'message'>>
}

/**
 * `pd handoff <usecase-id> [spaces/<id>] [--json]`
 *
 * The gate between "the spec looks done" and "hand this use case to a
 * cheap implementer" (v0.6 — W6). One command, one exit code:
 *
 *   1. space validates — 0 errors anywhere (incl. fs-level wire-capture
 *      checks). A broken foundation fails every use case, not just this
 *      one, so errors are never scoped.
 *   2. type closure — the brief's transitive type graph resolves
 *      (`collectBriefContext.unresolvedTypes` empty).
 *   3. step ↔ call parity — no WIRING_STEP_WITHOUT_CALL on this use case.
 *   4. payload contracts — no STEP_VIA_MISSING on this use case.
 *   5. error mapping — no THROWS_UNMAPPED on the components this use
 *      case touches.
 *   6. event contracts — no EVENT_IDEMPOTENCY_MISSING on the touched
 *      components.
 *
 * Checks 3–6 are *scoped*: warnings elsewhere in the space don't block —
 * one use case can be handoff-ready while a neighbour is still being
 * designed. This is deliberately the same list the ChangeSet flow needs
 * at `design-approved → implementing`.
 *
 * Exit codes: 0 — ready (safe to run `pd export implementation-brief`);
 * 1 — gate failed; 2 — usage error / unknown use case.
 */
export async function cmdHandoff(args: ParsedArgs): Promise<number> {
  const ucid = args.positional[0]
  if (!ucid) {
    console.error(red('usage: pd handoff <usecase-id> [spaces/<id>] [--json]'))
    return 2
  }
  const dir = resolveSpaceDir(args.positional[1])
  const loaded = await loadSpaceForCli(dir)
  const { space } = loaded
  const uc = space.useCases.find((u) => u.id === ucid)
  if (!uc) {
    console.error(red(`use case not found: ${ucid}`))
    const ids = space.useCases.map((u) => u.id)
    if (ids.length > 0) console.error(dim(`known use cases: ${ids.join(', ')}`))
    return 2
  }

  const issues = [...loaded.issues, ...checkWireCaptureFiles(space, loaded.dir)]
  const ctx = collectBriefContext(space, uc)
  const involved = new Set(ctx.components.map((c) => c.ref))
  const ucRef = `usecase:${uc.id}`
  const scoped = (code: ValidationIssue['code']): ValidationIssue[] =>
    issues.filter((i) => i.code === code && i.entityRef !== undefined && involved.has(i.entityRef))

  const checks: GateCheck[] = [
    {
      id: 'space-errors',
      label: 'space validates (0 errors)',
      issues: issues.filter((i) => i.severity === 'error'),
    },
    {
      id: 'type-closure',
      label: 'type closure (brief is self-contained)',
      issues: ctx.unresolvedTypes.map((t) => ({
        code: 'TYPE_UNRESOLVED' as const,
        message: `type '${t}' resolves to nothing the brief can render`,
      })),
    },
    {
      id: 'step-call-parity',
      label: 'step ↔ call parity (steps match declared wiring)',
      issues: issues.filter((i) => i.code === 'WIRING_STEP_WITHOUT_CALL' && i.entityRef === ucRef),
    },
    {
      id: 'payload-contracts',
      label: 'payload contracts (http/event steps carry via)',
      issues: issues.filter((i) => i.code === 'STEP_VIA_MISSING' && i.entityRef === ucRef),
    },
    {
      id: 'error-mapping',
      label: 'error mapping (thrown exceptions have wire outcomes)',
      issues: scoped('THROWS_UNMAPPED'),
    },
    {
      id: 'event-contracts',
      label: 'event contracts (at-least-once subscriptions declare idempotency)',
      issues: scoped('EVENT_IDEMPOTENCY_MISSING'),
    },
  ]

  const ready = checks.every((c) => c.issues.length === 0)

  if (args.flags.json === true) {
    console.log(
      JSON.stringify(
        {
          usecase: uc.id,
          space: space.meta.id,
          ready,
          checks: checks.map((c) => ({
            id: c.id,
            label: c.label,
            ok: c.issues.length === 0,
            issues: c.issues.map((i) => ({ code: i.code, message: i.message })),
          })),
        },
        null,
        2,
      ),
    )
    return ready ? 0 : 1
  }

  console.log(`${bold(cyan(`handoff gate: ${uc.id}`))}  ${dim(`space: ${space.meta.id}`)}\n`)
  for (const c of checks) {
    if (c.issues.length === 0) {
      console.log(`  ${green('✓')} ${c.label}`)
    } else {
      console.log(`  ${red('✗')} ${c.label} — ${c.issues.length} issue(s)`)
      for (const i of c.issues) console.log(`      ${yellow(i.code)} ${i.message}`)
    }
  }
  console.log('')
  if (ready) {
    console.log(
      `${green(bold('READY'))} — hand off with: ${cyan(`pd export implementation-brief ${uc.id} --out brief.md`)}`,
    )
    return 0
  }
  console.log(
    `${red(bold('NOT READY'))} — fix the issues above. ${dim('`pd lint --explain <CODE>` describes each code.')}`,
  )
  return 1
}
