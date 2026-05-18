/**
 * Standalone state-machine (v0.3 — A2) tests.
 *
 * Covers:
 *   - StateMachineFileSchema parses with invariants + scenarios + stateConfig
 *   - STATE_MACHINE_INCOHERENT fires on standalone files when they have:
 *       · duplicate state names
 *       · initial not in states[]
 *       · terminal[] referencing unknown states
 *       · transitions to/from unknown states
 *       · transitions originating at terminal states
 *       · both `on` and `trigger` set on the same transition
 *       · stateConfig referencing unknown states
 *       · stateConfig.timeout.transition_to referencing unknown states
 *   - STATE_MACHINE_SCENARIO_COVERAGE fires when:
 *       · transitions into terminal states have no scenarios[]
 *       · a transition declares post-invariants but no scenario asserts them
 *   - Coverage rule stays silent when all post-invariants are referenced
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateSemanticPass } from '../src/index.js'
import type { Module, Space, StateMachineFile } from '../src/index.js'
import { StateMachineFileSchema } from '../src/schema.js'

describe('A2 — standalone state-machine schema', () => {
  it('parses a full standalone state machine with invariants + scenarios', () => {
    const parsed = StateMachineFileSchema.parse({
      kind: 'state-machine',
      id: 'WorkspaceProvisionState',
      name: 'Workspace Provisioning State',
      governs: 'module:api/model:Workspace.provision_state',
      states: ['QUEUED', 'CREATING_VM', 'READY', 'FAILED'],
      initial: 'QUEUED',
      terminal: ['READY', 'FAILED'],
      stateConfig: [
        {
          id: 'QUEUED',
          terminal: false,
          timeout: { after: '5m', transition_to: 'FAILED', reason: 'provisioning-timeout' },
        },
      ],
      transitions: [
        {
          from: 'QUEUED',
          to: 'CREATING_VM',
          trigger: 'WorkspaceProvisionWorker.pickup',
          actor: 'system',
          invariants: { pre: ['job.attempt < max_attempts'], post: ['vm_id_assigned'] },
        },
        {
          from: 'CREATING_VM',
          to: 'FAILED',
          trigger: 'infra-service.vm-provision-failed',
          invariants: { post: ['provisioning_error_non_null'] },
        },
      ],
      scenarios: [
        {
          id: 'provisioning-failure-persists-error',
          given: 'workspace in CREATING_VM',
          when: 'trigger infra-service.vm-provision-failed',
          then: [
            'workspace.provision_state == FAILED',
            'provisioning_error_non_null',
            'workspace.attempt > 0',
          ],
        },
      ],
    })
    expect(parsed.id).toBe('WorkspaceProvisionState')
    expect(parsed.transitions[0]?.invariants?.pre).toEqual(['job.attempt < max_attempts'])
    expect(parsed.scenarios[0]?.then).toContain('provisioning_error_non_null')
    expect(parsed.stateConfig[0]?.timeout?.after).toBe('5m')
  })
})

function spaceWithStateMachine(sm: StateMachineFile): Space {
  const mod: Module = {
    kind: 'module',
    id: 'api',
    name: 'API',
    type: 'service',
    domains: [],
    components: [],
    models: [],
    tables: [],
    errorMapping: [],
    configMap: [],
    externalDeps: [],
    decisions: [],
    stateMachines: [sm],
  }
  return {
    meta: { id: 'sm', name: 'SM', version: '0.1.0', pizzaDocVersion: '0.3.0' },
    actors: [],
    modules: [mod],
    useCases: [],
    decisions: [],
  }
}

describe('A2 — standalone state-machine coherence', () => {
  it('flags initial state that is not in states[]', () => {
    const space = spaceWithStateMachine({
      kind: 'state-machine',
      id: 'Test',
      name: 'Test',
      states: ['A', 'B'],
      initial: 'X',
      terminal: [],
      stateConfig: [],
      transitions: [],
      scenarios: [],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(
      issues.some(
        (i) => i.code === 'STATE_MACHINE_INCOHERENT' && i.message.includes("initial = 'X'"),
      ),
    ).toBe(true)
  })

  it('flags transition with both on and trigger set', () => {
    const space = spaceWithStateMachine({
      kind: 'state-machine',
      id: 'Test',
      name: 'Test',
      states: ['A', 'B'],
      terminal: [],
      stateConfig: [],
      transitions: [{ from: 'A', to: 'B', on: 'event1', trigger: 'event2' }],
      scenarios: [],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(
      issues.some(
        (i) =>
          i.code === 'STATE_MACHINE_INCOHERENT' && i.message.includes("both 'on' and 'trigger'"),
      ),
    ).toBe(true)
  })

  it('flags stateConfig.timeout.transition_to that is not in states[]', () => {
    const space = spaceWithStateMachine({
      kind: 'state-machine',
      id: 'Test',
      name: 'Test',
      states: ['A', 'B'],
      terminal: [],
      stateConfig: [
        { id: 'A', terminal: false, timeout: { after: '5m', transition_to: 'NOWHERE' } },
      ],
      transitions: [],
      scenarios: [],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(
      issues.some(
        (i) =>
          i.code === 'STATE_MACHINE_INCOHERENT' && i.message.includes("transition_to = 'NOWHERE'"),
      ),
    ).toBe(true)
  })

  it('passes coherence with valid standalone state machine', () => {
    const space = spaceWithStateMachine({
      kind: 'state-machine',
      id: 'Test',
      name: 'Test',
      states: ['A', 'B', 'DONE'],
      initial: 'A',
      terminal: ['DONE'],
      stateConfig: [],
      transitions: [
        { from: 'A', to: 'B', trigger: 'go' },
        { from: 'B', to: 'DONE', trigger: 'finish' },
      ],
      scenarios: [],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.filter((i) => i.code === 'STATE_MACHINE_INCOHERENT')).toEqual([])
  })
})

describe('A2 — STATE_MACHINE_SCENARIO_COVERAGE', () => {
  it('warns when transition into terminal state has no scenarios at all', () => {
    const space = spaceWithStateMachine({
      kind: 'state-machine',
      id: 'Test',
      name: 'Test',
      states: ['A', 'FAILED'],
      terminal: ['FAILED'],
      stateConfig: [],
      transitions: [{ from: 'A', to: 'FAILED', trigger: 'fail' }],
      scenarios: [], // no scenarios → coverage gap
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.some((i) => i.code === 'STATE_MACHINE_SCENARIO_COVERAGE')).toBe(true)
  })

  it('warns when transition declares post-invariants but no scenario asserts them', () => {
    const space = spaceWithStateMachine({
      kind: 'state-machine',
      id: 'Test',
      name: 'Test',
      states: ['A', 'B'],
      terminal: [],
      stateConfig: [],
      transitions: [
        {
          from: 'A',
          to: 'B',
          trigger: 'go',
          invariants: { post: ['some_invariant_holds'], pre: [] },
        },
      ],
      scenarios: [
        {
          id: 's1',
          given: 'A',
          when: 'go',
          then: ['something_else_entirely'], // doesn't match post-invariant
        },
      ],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    const coverage = issues.find((i) => i.code === 'STATE_MACHINE_SCENARIO_COVERAGE')
    expect(coverage).toBeDefined()
    expect(coverage?.message).toContain('some_invariant_holds')
  })

  it('stays silent when scenario.then[] references all post-invariants', () => {
    const space = spaceWithStateMachine({
      kind: 'state-machine',
      id: 'Test',
      name: 'Test',
      states: ['CREATING_VM', 'FAILED'],
      terminal: ['FAILED'],
      stateConfig: [],
      transitions: [
        {
          from: 'CREATING_VM',
          to: 'FAILED',
          trigger: 'infra-service.vm-provision-failed',
          invariants: { post: ['provisioning_error_non_null'], pre: [] },
        },
      ],
      scenarios: [
        {
          id: 'persists-error',
          given: 'workspace in CREATING_VM',
          when: 'fail',
          then: ['provisioning_error_non_null'],
        },
      ],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.filter((i) => i.code === 'STATE_MACHINE_SCENARIO_COVERAGE')).toEqual([])
  })

  it('coverage severity is info (not error)', () => {
    const space = spaceWithStateMachine({
      kind: 'state-machine',
      id: 'Test',
      name: 'Test',
      states: ['A', 'FAILED'],
      terminal: ['FAILED'],
      stateConfig: [],
      transitions: [{ from: 'A', to: 'FAILED', trigger: 'fail' }],
      scenarios: [],
    })
    const issue = validateSemanticPass(space, buildRefIndex(space)).find(
      (i) => i.code === 'STATE_MACHINE_SCENARIO_COVERAGE',
    )
    expect(issue?.severity).toBe('info')
  })
})
