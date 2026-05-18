/**
 * Component.decidedBy back-refs (v0.5 — B1) tests.
 *
 * Covers:
 *   - Schema parses `decidedBy: [ADR-NNN]` and rejects malformed ids.
 *   - `COMPONENT_DECIDED_BY_INVALID_ADR` fires when the id is missing
 *     from `space.decisions[]`.
 *   - `COMPONENT_DECIDED_BY_SUPERSEDED_ADR` fires when the linked ADR
 *     has `status: superseded` or `deprecated`.
 *   - No issue when status is `accepted` or `proposed`.
 *   - Backward compat: components without `decidedBy` still parse and
 *     don't trip either rule.
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateSemanticPass } from '../src/index.js'
import type { AdrRef, Space } from '../src/index.js'
import { ComponentSchema } from '../src/schema.js'

function makeAdr(id: string, status: AdrRef['status'], extra: Partial<AdrRef> = {}): AdrRef {
  return {
    id,
    title: extra.title ?? id,
    status,
    supersedes: extra.supersedes ?? [],
    supersededBy: extra.supersededBy ?? null,
    path: extra.path ?? `decisions/${id}-test.md`,
    ...(extra.date ? { date: extra.date } : {}),
    ...(extra.decider ? { decider: extra.decider } : {}),
  }
}

function makeSpace(args: {
  decidedBy: ReadonlyArray<string>
  decisions: ReadonlyArray<AdrRef>
}): Space {
  return {
    meta: { id: 'b1', name: 'B1', version: '0.1.0', pizzaDocVersion: '0.5.0' },
    actors: [],
    modules: [
      {
        kind: 'module',
        id: 'api',
        name: 'API',
        type: 'service',
        domains: [],
        models: [],
        tables: [],
        errorMapping: [],
        configMap: [],
        externalDeps: [],
        decisions: [],
        components: [
          {
            kind: 'component',
            id: 'Parser',
            name: 'Parser',
            type: 'service',
            routes: [],
            decidedBy: [...args.decidedBy],
            methods: [],
          },
        ],
      },
    ],
    useCases: [],
    decisions: [...args.decisions],
  }
}

describe('B1 — Component.decidedBy schema', () => {
  it('parses a valid ADR id list', () => {
    const parsed = ComponentSchema.parse({
      kind: 'component',
      id: 'Parser',
      name: 'Parser',
      type: 'service',
      decidedBy: ['ADR-026', 'ADR-024'],
    })
    expect(parsed.decidedBy).toEqual(['ADR-026', 'ADR-024'])
  })

  it('defaults to [] when the field is omitted', () => {
    const parsed = ComponentSchema.parse({
      kind: 'component',
      id: 'Parser',
      name: 'Parser',
      type: 'service',
    })
    expect(parsed.decidedBy).toEqual([])
  })

  it('rejects ADR ids that do not match ADR-NNN', () => {
    expect(() =>
      ComponentSchema.parse({
        kind: 'component',
        id: 'Parser',
        name: 'Parser',
        type: 'service',
        decidedBy: ['ADR-7'],
      }),
    ).toThrow()
  })
})

describe('B1 — COMPONENT_DECIDED_BY_INVALID_ADR', () => {
  it('fires when the ADR id is not present in space.decisions[]', () => {
    const space = makeSpace({
      decidedBy: ['ADR-026'],
      decisions: [makeAdr('ADR-001', 'accepted')],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const hit = issues.filter((i) => i.code === 'COMPONENT_DECIDED_BY_INVALID_ADR')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.severity).toBe('error')
    expect(hit[0]?.message).toContain('ADR-026')
  })

  it('does not fire when the ADR id resolves', () => {
    const space = makeSpace({
      decidedBy: ['ADR-026'],
      decisions: [makeAdr('ADR-026', 'accepted')],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'COMPONENT_DECIDED_BY_INVALID_ADR')).toHaveLength(0)
  })

  it('does not fire when `decidedBy` is empty', () => {
    const space = makeSpace({ decidedBy: [], decisions: [] })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'COMPONENT_DECIDED_BY_INVALID_ADR')).toHaveLength(0)
  })
})

describe('B1 — COMPONENT_DECIDED_BY_SUPERSEDED_ADR', () => {
  it('fires when the linked ADR is superseded', () => {
    const space = makeSpace({
      decidedBy: ['ADR-024'],
      decisions: [makeAdr('ADR-024', 'superseded', { supersededBy: 'ADR-026' })],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const hit = issues.filter((i) => i.code === 'COMPONENT_DECIDED_BY_SUPERSEDED_ADR')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.severity).toBe('warning')
    expect(hit[0]?.message).toContain('ADR-024')
    // Suggester should mention the superseder.
    expect(hit[0]?.message).toContain('ADR-026')
  })

  it('fires when the linked ADR is deprecated (no supersededBy)', () => {
    const space = makeSpace({
      decidedBy: ['ADR-024'],
      decisions: [makeAdr('ADR-024', 'deprecated')],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const hit = issues.filter((i) => i.code === 'COMPONENT_DECIDED_BY_SUPERSEDED_ADR')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.message).toContain('deprecated')
  })

  it('does not fire for accepted or proposed ADRs', () => {
    for (const status of ['accepted', 'proposed'] as const) {
      const space = makeSpace({
        decidedBy: ['ADR-024'],
        decisions: [makeAdr('ADR-024', status)],
      })
      const index = buildRefIndex(space)
      const issues = validateSemanticPass(space, index)
      expect(
        issues.filter((i) => i.code === 'COMPONENT_DECIDED_BY_SUPERSEDED_ADR'),
        `unexpected superseded fire for status=${status}`,
      ).toHaveLength(0)
    }
  })

  it('does not fire for unresolved ids (broken-link rule owns that case)', () => {
    const space = makeSpace({
      decidedBy: ['ADR-999'],
      decisions: [makeAdr('ADR-024', 'superseded')],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'COMPONENT_DECIDED_BY_SUPERSEDED_ADR')).toHaveLength(0)
    expect(issues.filter((i) => i.code === 'COMPONENT_DECIDED_BY_INVALID_ADR')).toHaveLength(1)
  })
})
