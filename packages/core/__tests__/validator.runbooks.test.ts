/**
 * Operations layer (v0.3 — A4) tests.
 *
 * Covers:
 *   - RunbookFrontmatterSchema parses a typical runbook frontmatter.
 *   - HealthContractFileSchema parses with fields + enum statuses.
 *   - RUNBOOK_COVERAGE info fires for errorFlows not covered by any runbook.
 *   - RUNBOOK_COVERAGE silent when a runbook covers the errorFlow id.
 *   - RUNBOOK_BROKEN_LINK fires when runbook decisions[] references unknown ADR.
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateSemanticPass } from '../src/index.js'
import type { RunbookRef, Space } from '../src/index.js'
import { HealthContractFileSchema, RunbookFrontmatterSchema } from '../src/schema.js'

describe('A4 — runbook + health-contract schemas', () => {
  it('parses runbook frontmatter with severity + covers + decisions', () => {
    const parsed = RunbookFrontmatterSchema.parse({
      id: 'workspace-stuck-queued',
      title: 'Workspace stuck in QUEUED',
      severity: 'p1',
      owner: 'acme-infra',
      trigger: 'workspace shows status=QUEUED for >5min',
      covers: ['provisioning-failure', 'usecase:provision-workspace/errorFlow:worker-never-ran'],
      decisions: ['ADR-001', 'ADR-007'],
    })
    expect(parsed.severity).toBe('p1')
    expect(parsed.covers).toContain('provisioning-failure')
  })

  it('parses health-contract with fields and enum status', () => {
    const parsed = HealthContractFileSchema.parse({
      kind: 'health-contract',
      path: '/healthz',
      okStatus: 200,
      fields: [
        {
          name: 'status',
          type: 'string',
          enumValues: ['ok', 'degraded', 'down'],
          required: true,
        },
        { name: 'version', type: 'string', required: true },
        { name: 'uptime_seconds', type: 'number', required: false },
      ],
    })
    expect(parsed.fields[0]?.enumValues).toEqual(['ok', 'degraded', 'down'])
  })
})

function makeSpace(args: { runbooks?: RunbookRef[]; errorFlowIds?: string[] }): Space {
  return {
    meta: { id: 't', name: 'T', version: '0.1.0', pizzaDocVersion: '0.3.0' },
    actors: [{ kind: 'actor', id: 'user', name: 'User', type: 'user' }],
    modules: [],
    useCases: [
      {
        kind: 'usecase',
        id: 'provision',
        name: 'Provision',
        actor: 'actor:user',
        trigger: 'user clicks Create',
        steps: [],
        errorFlows: (args.errorFlowIds ?? []).map((id) => ({
          id,
          condition: 'worker dead',
          steps: [],
        })),
        invariants: { pre: [], post: [] },
        requires: [],
        dataFlow: [],
      },
    ],
    decisions: [],
    runbooks: args.runbooks ?? [],
    operationsStateMachines: [],
  } as Space
}

describe('A4 — RUNBOOK_COVERAGE rule', () => {
  it('emits info when errorFlow has no runbook covering it', () => {
    const space = makeSpace({ errorFlowIds: ['worker-never-ran'], runbooks: [] })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    const covIssue = issues.find((i) => i.code === 'RUNBOOK_COVERAGE')
    expect(covIssue).toBeDefined()
    expect(covIssue?.severity).toBe('info')
    expect(covIssue?.message).toContain('worker-never-ran')
  })

  it('stays silent when a runbook covers the errorFlow by bare id', () => {
    const space = makeSpace({
      errorFlowIds: ['worker-never-ran'],
      runbooks: [
        {
          id: 'worker-dead',
          title: 'Worker dead',
          severity: 'p1',
          covers: ['worker-never-ran'],
          decisions: [],
          path: 'operations/runbooks/worker-dead.md',
          body: '',
        },
      ],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'RUNBOOK_COVERAGE')).toBe(false)
  })

  it('stays silent when covers[] uses fully-qualified errorFlow ref', () => {
    const space = makeSpace({
      errorFlowIds: ['worker-never-ran'],
      runbooks: [
        {
          id: 'worker-dead',
          title: 'Worker dead',
          severity: 'p1',
          covers: ['usecase:provision/errorFlow:worker-never-ran'],
          decisions: [],
          path: 'operations/runbooks/worker-dead.md',
          body: '',
        },
      ],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'RUNBOOK_COVERAGE')).toBe(false)
  })
})

describe('A4 — RUNBOOK_BROKEN_LINK rule', () => {
  it('errors when runbook references a non-existent ADR', () => {
    const space = makeSpace({
      runbooks: [
        {
          id: 'rb1',
          title: 'rb1',
          severity: 'p1',
          covers: [],
          decisions: ['ADR-999'],
          path: 'operations/runbooks/rb1.md',
          body: '',
        },
      ],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    const issue = issues.find((i) => i.code === 'RUNBOOK_BROKEN_LINK')
    expect(issue?.severity).toBe('error')
    expect(issue?.message).toContain('ADR-999')
  })
})
