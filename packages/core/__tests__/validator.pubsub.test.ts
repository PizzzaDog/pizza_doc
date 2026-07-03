/**
 * Pub/sub edges (v0.5 — B2) tests.
 *
 * Covers:
 *   - Schema parses `emits` / `subscribes` and defaults to [].
 *   - REF_BROKEN fires on dangling event/via/to refs.
 *   - EVENT_EMIT_TARGET_NOT_EVENT / EVENT_SUBSCRIBE_TARGET_NOT_EVENT
 *     when the ref resolves to a non-event model.
 *   - EVENT_NO_SUBSCRIBER / EVENT_SUBSCRIBE_NO_PUBLISHER hygiene.
 *   - ruleComponentUnused recognises subscribers as alive when there's
 *     a matching publisher.
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateRefsPass, validateSemanticPass } from '../src/index.js'
import { ComponentSchema, SpaceSchema } from '../src/schema.js'
import {
  ruleEventDeliveryOnNonEvent,
  ruleEventIdempotencyMissing,
  ruleEventKeyFieldUnknown,
} from '../src/validator/semantic.js'

// We use validateRefsPass directly (it builds its own index internally).
// buildRefIndex stays imported for semantic-pass cases.
import type { Space } from '../src/index.js'

interface ComponentSpec {
  id: string
  name?: string
  emits?: ReadonlyArray<{ event: string; to?: ReadonlyArray<string> }>
  subscribes?: ReadonlyArray<{ event: string; via?: string }>
}

interface ModelSpec {
  id: string
  modelKind?: 'event' | 'entity' | 'dto' | 'value-object'
}

function makeSpace(args: {
  components: ReadonlyArray<ComponentSpec>
  models?: ReadonlyArray<ModelSpec>
}): Space {
  const components: Space['modules'][number]['components'] = args.components.map((c) => ({
    kind: 'component' as const,
    id: c.id,
    name: c.name ?? c.id,
    type: 'service' as const,
    routes: [],
    methods: [],
    emits: (c.emits ?? []).map((e) => ({ event: e.event, to: [...(e.to ?? [])] })),
    subscribes: (c.subscribes ?? []).map((s) => ({
      event: s.event,
      ...(s.via ? { via: s.via } : {}),
    })),
  }))
  const models: Space['modules'][number]['models'] = (args.models ?? []).map((m) => ({
    kind: 'model' as const,
    id: m.id,
    name: m.id,
    modelKind: m.modelKind ?? 'event',
    fields: [],
  }))
  return {
    meta: { id: 'b2', name: 'B2', version: '0.1.0', pizzaDocVersion: '0.5.0' },
    actors: [],
    modules: [
      {
        kind: 'module',
        id: 'api',
        name: 'API',
        type: 'service',
        domains: [],
        models,
        tables: [],
        errorMapping: [],
        configMap: [],
        externalDeps: [],
        decisions: [],
        components,
      },
    ],
    useCases: [],
    decisions: [],
  }
}

describe('B2 — Component.emits / subscribes schema', () => {
  it('parses emits with `to` and subscribes with `via`', () => {
    const parsed = ComponentSchema.parse({
      kind: 'component',
      id: 'Dispatcher',
      name: 'Dispatcher',
      type: 'service',
      emits: [
        {
          event: 'module:api/model:BudgetExhausted',
          to: ['module:api/component:Modal/method:show'],
        },
      ],
      subscribes: [
        {
          event: 'module:api/model:BudgetExhausted',
          via: 'module:api/component:Bus',
        },
      ],
    })
    expect(parsed.emits).toHaveLength(1)
    expect(parsed.subscribes).toHaveLength(1)
    expect(parsed.subscribes[0]?.via).toBe('module:api/component:Bus')
  })

  it('defaults emits / subscribes to []', () => {
    const parsed = ComponentSchema.parse({
      kind: 'component',
      id: 'Plain',
      name: 'Plain',
      type: 'service',
    })
    expect(parsed.emits).toEqual([])
    expect(parsed.subscribes).toEqual([])
  })
})

describe('B2 — REF_BROKEN over pub/sub edges', () => {
  it('flags a dangling emits[].event ref', () => {
    const space = makeSpace({
      components: [{ id: 'Publisher', emits: [{ event: 'module:api/model:Nope' }] }],
    })
    const { issues: refIssues } = validateRefsPass(space)
    const hit = refIssues.filter(
      (i) => i.code === 'REF_BROKEN' && i.message.includes('module:api/model:Nope'),
    )
    expect(hit.length).toBeGreaterThan(0)
  })

  it('flags a dangling subscribes[].via ref', () => {
    const space = makeSpace({
      components: [
        {
          id: 'Subscriber',
          subscribes: [
            { event: 'module:api/model:BudgetExhausted', via: 'module:api/component:Ghost' },
          ],
        },
      ],
      models: [{ id: 'BudgetExhausted' }],
    })
    const { issues: refIssues } = validateRefsPass(space)
    const hit = refIssues.filter(
      (i) => i.code === 'REF_BROKEN' && i.message.includes('module:api/component:Ghost'),
    )
    expect(hit.length).toBeGreaterThan(0)
  })
})

describe('B2 — EVENT_EMIT/SUBSCRIBE_TARGET_NOT_EVENT', () => {
  it('errors when emit.event points at an entity model', () => {
    const space = makeSpace({
      components: [{ id: 'Publisher', emits: [{ event: 'module:api/model:Order' }] }],
      models: [{ id: 'Order', modelKind: 'entity' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'EVENT_EMIT_TARGET_NOT_EVENT')).toHaveLength(1)
  })

  it('errors when subscribe.event points at a DTO', () => {
    const space = makeSpace({
      components: [{ id: 'Subscriber', subscribes: [{ event: 'module:api/model:OrderDto' }] }],
      models: [{ id: 'OrderDto', modelKind: 'dto' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'EVENT_SUBSCRIBE_TARGET_NOT_EVENT')).toHaveLength(1)
  })

  it('does not fire when modelKind is event', () => {
    const space = makeSpace({
      components: [
        { id: 'Pub', emits: [{ event: 'module:api/model:BudgetExhausted' }] },
        { id: 'Sub', subscribes: [{ event: 'module:api/model:BudgetExhausted' }] },
      ],
      models: [{ id: 'BudgetExhausted', modelKind: 'event' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'EVENT_EMIT_TARGET_NOT_EVENT')).toHaveLength(0)
    expect(issues.filter((i) => i.code === 'EVENT_SUBSCRIBE_TARGET_NOT_EVENT')).toHaveLength(0)
  })
})

describe('B2 — hygiene rules', () => {
  it('warns when emit has no subscriber', () => {
    const space = makeSpace({
      components: [{ id: 'Pub', emits: [{ event: 'module:api/model:BudgetExhausted' }] }],
      models: [{ id: 'BudgetExhausted' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const hit = issues.filter((i) => i.code === 'EVENT_NO_SUBSCRIBER')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.severity).toBe('warning')
  })

  it('warns when subscribe has no publisher', () => {
    const space = makeSpace({
      components: [{ id: 'Sub', subscribes: [{ event: 'module:api/model:BudgetExhausted' }] }],
      models: [{ id: 'BudgetExhausted' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const hit = issues.filter((i) => i.code === 'EVENT_SUBSCRIBE_NO_PUBLISHER')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.severity).toBe('warning')
  })

  it('does not warn when emit + subscribe match', () => {
    const space = makeSpace({
      components: [
        { id: 'Pub', emits: [{ event: 'module:api/model:BudgetExhausted' }] },
        { id: 'Sub', subscribes: [{ event: 'module:api/model:BudgetExhausted' }] },
      ],
      models: [{ id: 'BudgetExhausted' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'EVENT_NO_SUBSCRIBER')).toHaveLength(0)
    expect(issues.filter((i) => i.code === 'EVENT_SUBSCRIBE_NO_PUBLISHER')).toHaveLength(0)
  })
})

describe('B2 — COMPONENT_UNUSED escape via pub/sub', () => {
  it('marks an event-only subscriber as reachable when a publisher emits its event', () => {
    const space = makeSpace({
      components: [
        // Pub is referenced via a use case implicitly; here we just make sure
        // Sub is reached through the pub/sub edge alone.
        { id: 'Pub', emits: [{ event: 'module:api/model:BudgetExhausted' }] },
        { id: 'Sub', subscribes: [{ event: 'module:api/model:BudgetExhausted' }] },
      ],
      models: [{ id: 'BudgetExhausted' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const unusedSub = issues
      .filter((i) => i.code === 'COMPONENT_UNUSED')
      .find((i) => i.entityRef === 'module:api/component:Sub')
    expect(unusedSub).toBeUndefined()
  })

  it('still flags COMPONENT_UNUSED when subscribe event has no publisher', () => {
    const space = makeSpace({
      components: [{ id: 'OrphanSub', subscribes: [{ event: 'module:api/model:Nothing' }] }],
      models: [{ id: 'Nothing' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const unused = issues
      .filter((i) => i.code === 'COMPONENT_UNUSED')
      .find((i) => i.entityRef === 'module:api/component:OrphanSub')
    expect(unused).toBeDefined()
  })
})

// ---------- 3.19 Event delivery contract (v0.6 — W4) ----------

function deliverySpace(args: {
  delivery?: 'at-least-once' | 'at-most-once' | 'exactly-once'
  orderingKey?: string
  modelKind?: string
  idempotency?: { key: string; strategy?: string }
}): Space {
  return SpaceSchema.parse({
    meta: { id: 'w4', name: 'W4', version: '0.1.0', pizzaDocVersion: '0.6.0' },
    modules: [
      {
        kind: 'module',
        id: 'api',
        name: 'API',
        type: 'service',
        models: [
          {
            kind: 'model',
            id: 'OrderPlaced',
            name: 'OrderPlaced',
            modelKind: args.modelKind ?? 'event',
            topic: 'orders.placed',
            fields: [
              { name: 'orderId', type: 'uuid' },
              { name: 'total', type: 'int' },
            ],
            ...(args.delivery ? { delivery: args.delivery } : {}),
            ...(args.orderingKey ? { orderingKey: args.orderingKey } : {}),
          },
        ],
        components: [
          {
            kind: 'component',
            id: 'Pub',
            name: 'Pub',
            type: 'service',
            emits: [{ event: 'module:api/model:OrderPlaced' }],
          },
          {
            kind: 'component',
            id: 'Sub',
            name: 'Sub',
            type: 'consumer',
            subscribes: [
              {
                event: 'module:api/model:OrderPlaced',
                ...(args.idempotency ? { idempotency: args.idempotency } : {}),
              },
            ],
          },
        ],
      },
    ],
  })
}

describe('ruleEventIdempotencyMissing (EVENT_IDEMPOTENCY_MISSING — v0.6 W4)', () => {
  it('flags an at-least-once subscription without declared idempotency', () => {
    const space = deliverySpace({ delivery: 'at-least-once' })
    const issues = ruleEventIdempotencyMissing(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('EVENT_IDEMPOTENCY_MISSING')
    expect(issues[0]?.severity).toBe('warning')
    expect(issues[0]?.entityRef).toBe('module:api/component:Sub')
  })

  it('stays quiet when idempotency is declared', () => {
    const space = deliverySpace({
      delivery: 'at-least-once',
      idempotency: { key: 'orderId', strategy: 'dedupe-store' },
    })
    expect(ruleEventIdempotencyMissing(space, buildRefIndex(space))).toHaveLength(0)
  })

  it('only arms on at-least-once — other guarantees and undeclared delivery are skipped', () => {
    for (const delivery of ['at-most-once', 'exactly-once', undefined] as const) {
      const space = deliverySpace(delivery ? { delivery } : {})
      expect(ruleEventIdempotencyMissing(space, buildRefIndex(space))).toHaveLength(0)
    }
  })
})

describe('ruleEventKeyFieldUnknown (EVENT_KEY_FIELD_UNKNOWN — v0.6 W4)', () => {
  it('flags an orderingKey that names no field, with a near-match suggestion', () => {
    const space = deliverySpace({ delivery: 'at-least-once', orderingKey: 'orderd' })
    const issues = ruleEventKeyFieldUnknown(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.message).toContain("'orderd'")
    expect(issues[0]?.suggestion).toContain("'orderId'")
  })

  it('flags an idempotency.key that names no field on the event model', () => {
    const space = deliverySpace({
      delivery: 'at-least-once',
      idempotency: { key: 'orderUuid' },
    })
    const issues = ruleEventKeyFieldUnknown(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("'orderUuid'")
    expect(issues[0]?.entityRef).toBe('module:api/component:Sub')
  })

  it('accepts keys that name real fields', () => {
    const space = deliverySpace({
      delivery: 'at-least-once',
      orderingKey: 'orderId',
      idempotency: { key: 'orderId', strategy: 'upsert' },
    })
    expect(ruleEventKeyFieldUnknown(space, buildRefIndex(space))).toHaveLength(0)
  })
})

describe('ruleEventDeliveryOnNonEvent (EVENT_DELIVERY_ON_NON_EVENT — v0.6 W4)', () => {
  it('flags delivery/orderingKey on a non-event model', () => {
    const space = deliverySpace({
      modelKind: 'dto',
      delivery: 'at-least-once',
      orderingKey: 'orderId',
    })
    const issues = ruleEventDeliveryOnNonEvent(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.message).toContain('delivery and orderingKey')
  })

  it('accepts delivery contracts on event models', () => {
    const space = deliverySpace({ delivery: 'exactly-once', orderingKey: 'orderId' })
    expect(ruleEventDeliveryOnNonEvent(space, buildRefIndex(space))).toHaveLength(0)
  })
})
