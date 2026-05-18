import { describe, expect, it } from 'vitest'
import type { Space } from '../src/index.js'
import { buildRefIndex } from '../src/index.js'
import { ruleStateMachineCoherence } from '../src/validator/semantic.js'

/**
 * Focused unit tests on the stateMachine coherence rule. Fixture-level
 * tests live in validator.semantic.test.ts (auto-generated from the
 * CASES table). This file covers the corners that matter per-rule.
 */

function minSpace(
  overrides: Partial<Space['modules'][number]['models'][number]['stateMachine']>,
): Space {
  return {
    meta: {
      id: 'sm-test',
      name: 'sm',
      version: '0.1.0',
      pizzaDocVersion: '0.2.0',
    },
    actors: [],
    modules: [
      {
        kind: 'module',
        id: 'm',
        name: 'm',
        type: 'service',
        domains: [],
        components: [],
        tables: [],
        errorMapping: [],
        models: [
          {
            kind: 'model',
            id: 'Thing',
            name: 'Thing',
            modelKind: 'entity',
            fields: [{ name: 'status', type: 'string', optional: false, persisted: true }],
            stateMachine: {
              field: 'status',
              states: ['A', 'B', 'C'],
              terminal: [],
              transitions: [],
              ...overrides,
            },
          },
        ],
      },
    ],
    useCases: [],
  } as unknown as Space
}

describe('ruleStateMachineCoherence', () => {
  it('accepts a valid state machine with initial/terminal/transitions', () => {
    const space = minSpace({
      initial: 'A',
      terminal: ['C'],
      transitions: [
        { from: 'A', to: ['B', 'C'] },
        { from: 'B', to: 'C' },
      ],
    })
    const issues = ruleStateMachineCoherence(space, buildRefIndex(space))
    expect(issues).toEqual([])
  })

  it('flags initial that is not in states', () => {
    const space = minSpace({ initial: 'Z' })
    const issues = ruleStateMachineCoherence(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("initial = 'Z'")
  })

  it('flags terminal that is not in states', () => {
    const space = minSpace({ terminal: ['Z'] })
    const issues = ruleStateMachineCoherence(space, buildRefIndex(space))
    expect(issues.some((i) => i.message.includes('terminal contains'))).toBe(true)
  })

  it('flags transitions originating at terminal states', () => {
    const space = minSpace({
      terminal: ['C'],
      transitions: [{ from: 'C', to: 'A' }],
    })
    const issues = ruleStateMachineCoherence(space, buildRefIndex(space))
    expect(issues.some((i) => i.message.includes('originates at terminal'))).toBe(true)
  })

  it('flags transitions pointing at undeclared states', () => {
    const space = minSpace({
      transitions: [{ from: 'A', to: 'MYSTERY' }],
    })
    const issues = ruleStateMachineCoherence(space, buildRefIndex(space))
    expect(issues.some((i) => i.message.includes("to 'MYSTERY'"))).toBe(true)
  })

  it('flags machine when .field does not exist on the model', () => {
    const space = minSpace({ field: 'missing' })
    const issues = ruleStateMachineCoherence(space, buildRefIndex(space))
    expect(issues.some((i) => i.message.includes('stateMachine.field'))).toBe(true)
  })

  it('flags duplicate state names', () => {
    const space = minSpace({ states: ['A', 'A', 'B'] })
    const issues = ruleStateMachineCoherence(space, buildRefIndex(space))
    expect(issues.some((i) => i.message.includes('duplicate state names'))).toBe(true)
  })
})
