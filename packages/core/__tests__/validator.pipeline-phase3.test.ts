import { describe, expect, it } from 'vitest'
import { buildRefIndex, validate, validateSemanticPass } from '../src/index.js'
import type { Space } from '../src/index.js'
import type { ValidateOptions } from '../src/validator/index.js'
import { ruleUseCaseStepChainContinuity } from '../src/validator/semantic.ts'
import { loadFixture } from './helpers.js'

describe('Pass 3 integration with pipeline', () => {
  it('skips Pass 3 when Pass 2 has errors', async () => {
    const { validation } = await loadFixture('invalid', 'REF_BROKEN_COMPONENT')
    expect(validation.passes.schema).toBe(true)
    expect(validation.passes.refs).toBe(false)
    expect(validation.passes.semantic).toBe(false)
  })

  it('runs Pass 3 when Pass 2 clean', async () => {
    const { validation } = await loadFixture('invalid', 'USECASE_NO_STEPS')
    expect(validation.passes.schema).toBe(true)
    expect(validation.passes.refs).toBe(true)
    expect(validation.issues.some((i) => i.code === 'USECASE_NO_STEPS')).toBe(true)
  })

  it('respects disabledRules option', async () => {
    const { result } = await loadFixture('invalid', 'USECASE_NO_STEPS')
    // Re-run with the rule disabled; emulate the CLI --disable path.
    const options: ValidateOptions = {
      semantic: { disabledRules: new Set(['USECASE_NO_STEPS']) },
    }
    const validation = validate(result, options)
    expect(validation.issues.some((i) => i.code === 'USECASE_NO_STEPS')).toBe(false)
  })

  it('validateSemanticPass is callable directly', async () => {
    const { result } = await loadFixture('invalid', 'USECASE_NO_STEPS')
    expect(result.space).not.toBeNull()
    if (!result.space) return
    // Build the ref index via the full pipeline (simpler than re-building here).
    const full = validate(result)
    expect(full.passes.refs).toBe(true)
    // The fixture's space has a usecase with steps: [] — ruleUseCaseNoSteps should fire.
    const semantic = validateSemanticPass(result.space, buildRefIndex(result.space))
    expect(semantic.some((i) => i.code === 'USECASE_NO_STEPS')).toBe(true)
  })
})

describe('USECASE_STEP_CHAIN_DISCONTINUITY with call-stack semantics', () => {
  // Stack-aware rule: a step's `from` may be ANY frame on the active call
  // stack, not just the previous `to`. That covers implicit returns up the
  // call tree (e.g. db → repo → service → controller) without forcing
  // authors to write synthetic reverse-arrow steps. Only when `from` has
  // never been on the stack do we warn — that's a real modelling gap.
  function makeSpace(): Space {
    return {
      meta: {
        id: 'discontinuity-terminal',
        name: 'x',
        version: '0.1.0',
        pizzaDocVersion: '0.1.0',
      },
      actors: [{ kind: 'actor', id: 'sys', name: 'sys', type: 'system' }],
      modules: [
        {
          kind: 'module',
          id: 'ui',
          name: 'UI',
          type: 'frontend',
          domains: [],
          models: [],
          tables: [],
          components: [{ kind: 'component', id: 'Home', name: 'Home', type: 'page', methods: [] }],
        },
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          domains: [],
          models: [],
          tables: [],
          components: [
            { kind: 'component', id: 'Svc', name: 'Svc', type: 'service', methods: [] },
            { kind: 'component', id: 'Repo', name: 'Repo', type: 'repository', methods: [] },
          ],
        },
        {
          kind: 'module',
          id: 'db',
          name: 'DB',
          type: 'database',
          domains: [],
          components: [],
          models: [],
          tables: [
            {
              kind: 'table',
              id: 'rows',
              name: 'rows',
              columns: [
                { name: 'id', sqlType: 'uuid', primaryKey: true, nullable: false, unique: false },
              ],
              indexes: [],
            },
          ],
        },
      ],
      useCases: [
        {
          kind: 'usecase',
          id: 'uc',
          name: 'uc',
          actor: 'actor:sys',
          trigger: 'x',
          errorFlows: [],
          invariants: { pre: [], post: [] },
          dataFlow: [],
          steps: [
            // 1. Home → Svc (push Svc; stack: [Home, Svc])
            { from: 'module:ui/component:Home', to: 'module:api/component:Svc' },
            // 2. Svc → Repo (push Repo; stack: [Home, Svc, Repo])
            { from: 'module:api/component:Svc', to: 'module:api/component:Repo' },
            // 3. Repo → db/rows (terminal, don't push; stack: [Home, Svc, Repo])
            {
              from: 'module:api/component:Repo',
              to: 'module:db/table:rows',
              protocol: 'sql',
            },
            // 4. Svc → new call (valid: Svc is on the stack, implicit return
            //    from Repo. Stack unwinds to [Home, Svc], then pushes new
            //    call's `to`). No warning.
            { from: 'module:api/component:Svc', to: 'module:api/component:Repo' },
            // 5. NewGhost → anything — NewGhost was never on the stack.
            //    This is a real discontinuity → warning.
            { from: 'module:api/component:Ghost', to: 'module:ui/component:Home' },
          ],
        },
      ],
    }
  }

  it('accepts implicit return up the stack without warning', () => {
    const space = makeSpace()
    // Space needs a `Ghost` component for the ref to resolve — inject it.
    const api = space.modules.find((m) => m.id === 'api')
    api?.components.push({
      kind: 'component',
      id: 'Ghost',
      name: 'Ghost',
      type: 'service',
      methods: [],
    })
    const issues = ruleUseCaseStepChainContinuity(space, buildRefIndex(space))
    // Only step 5 (Ghost) should fire — steps 3→4 is an implicit return.
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('Ghost')
  })

  it('never-visited component is a real discontinuity (warning)', () => {
    const space = makeSpace()
    const api = space.modules.find((m) => m.id === 'api')
    api?.components.push({
      kind: 'component',
      id: 'Ghost',
      name: 'Ghost',
      type: 'service',
      methods: [],
    })
    const issues = ruleUseCaseStepChainContinuity(space, buildRefIndex(space))
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('Ghost'))).toBe(true)
  })
})
