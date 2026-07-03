/**
 * Type closure + wiring parity (v0.6 — W1) tests.
 *
 * Covers both legs of:
 *   - TYPE_UNRESOLVED — typo'd type flags with a near-match suggestion;
 *     primitives / generics / arrays / unions / enum models resolve;
 *     unparseable tokens (dotted FQNs) are skipped, never flagged.
 *   - WIRING_STEP_WITHOUT_CALL — http/internal-call steps must match a
 *     declared calls/composes edge; event steps must match an
 *     emits/subscribes pair; module-level endpoints are skipped.
 *   - WIRING_CALL_WITHOUT_STEP — declared-but-never-walked call edges
 *     get an info; walked edges and composes edges don't.
 *   - STEP_VIA_MISSING — http/event steps without via get an info; sql
 *     steps and via-carrying steps don't.
 *   - DTO_FLOW_VIA_TYPE_MISMATCH — method-level `to` binding is exact and
 *     error-severity; a `returns` match legitimizes via-as-response.
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex } from '../src/index.js'
import type { Space } from '../src/index.js'
import { SpaceSchema } from '../src/schema.js'
import {
  ruleDtoFlowViaTypeMismatch,
  ruleStepViaMissing,
  ruleTypeUnresolved,
  ruleWiringCallWithoutStep,
  ruleWiringStepWithoutCall,
} from '../src/validator/semantic.js'

const meta = { id: 'w1', name: 'W1', version: '0.1.0', pizzaDocVersion: '0.6.0' }

/** Parse an input-shaped literal so schema defaults fill in the rest. */
function makeSpace(input: unknown): Space {
  return SpaceSchema.parse(input)
}

describe('ruleTypeUnresolved (TYPE_UNRESOLVED)', () => {
  it('flags a typo’d param type as an error with a near-match suggestion', () => {
    const space = makeSpace({
      meta,
      modules: [
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          models: [
            {
              kind: 'model',
              id: 'Order',
              name: 'Order',
              modelKind: 'dto',
              fields: [{ name: 'id', type: 'uuid' }],
            },
          ],
          components: [
            {
              kind: 'component',
              id: 'OrderService',
              name: 'OrderService',
              type: 'service',
              methods: [
                { name: 'create', params: [{ name: 'req', type: 'Ordr' }], returns: 'Order' },
              ],
            },
          ],
        },
      ],
    })
    const issues = ruleTypeUnresolved(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('TYPE_UNRESOLVED')
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.message).toContain("'Ordr'")
    expect(issues[0]?.suggestion).toContain("'Order'")
  })

  it('resolves primitives, generics, arrays, unions, enum models — and skips unparseable tokens', () => {
    const space = makeSpace({
      meta,
      modules: [
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          models: [
            {
              kind: 'model',
              id: 'Order',
              name: 'Order',
              modelKind: 'dto',
              fields: [
                { name: 'legacyUser', type: 'online.restik.User' },
                { name: 'createdAt', type: 'Instant' },
                { name: 'runtime', type: 'RuntimeId' },
              ],
            },
            {
              kind: 'model',
              id: 'RuntimeId',
              name: 'RuntimeId',
              modelKind: 'enum',
              values: ['claude-code', 'opencode'],
            },
          ],
          components: [
            {
              kind: 'component',
              id: 'OrderService',
              name: 'OrderService',
              type: 'service',
              methods: [
                {
                  name: 'search',
                  params: [
                    { name: 'q', type: 'string' },
                    { name: 'ids', type: 'List<Order>' },
                    { name: 'byKey', type: 'Map<string, Order>' },
                    { name: 'batch', type: 'Order[]' },
                    { name: 'maybe', type: 'Order | null' },
                    { name: 'opt', type: 'Optional<Order>' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(ruleTypeUnresolved(space, buildRefIndex(space))).toHaveLength(0)
  })

  it('checks model field types and method returns too', () => {
    const space = makeSpace({
      meta,
      modules: [
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          models: [
            {
              kind: 'model',
              id: 'Order',
              name: 'Order',
              modelKind: 'dto',
              fields: [{ name: 'payment', type: 'Payment' }],
            },
          ],
          components: [
            {
              kind: 'component',
              id: 'OrderService',
              name: 'OrderService',
              type: 'service',
              methods: [{ name: 'get', returns: 'Ordr' }],
            },
          ],
        },
      ],
    })
    const issues = ruleTypeUnresolved(space, buildRefIndex(space))
    expect(issues).toHaveLength(2)
    const messages = issues.map((i) => i.message).join('\n')
    expect(messages).toContain("field 'payment'")
    expect(messages).toContain('returns')
  })

  it('exempts errorMapping exception names and external-module surfaces', () => {
    const space = makeSpace({
      meta,
      modules: [
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          errorMapping: [{ exception: 'ConflictError', httpStatus: 409 }],
          components: [
            {
              kind: 'component',
              id: 'ErrorHandler',
              name: 'ErrorHandler',
              type: 'infrastructure',
              methods: [{ name: 'handle', params: [{ name: 'err', type: 'ConflictError' }] }],
            },
          ],
        },
        {
          kind: 'module',
          id: 'stripe',
          name: 'Stripe',
          type: 'external',
          components: [
            {
              kind: 'component',
              id: 'StripeAPI',
              name: 'StripeAPI',
              type: 'client',
              methods: [{ name: 'createCharge', returns: 'ChargeResult' }],
            },
          ],
        },
      ],
    })
    expect(ruleTypeUnresolved(space, buildRefIndex(space))).toHaveLength(0)
  })
})

/** Two-module space: a page calling a controller, plus one use-case step. */
function callSpace(args: {
  pageCalls?: readonly string[]
  pageComposes?: readonly string[]
  steps: ReadonlyArray<Record<string, unknown>>
  errorFlows?: ReadonlyArray<Record<string, unknown>>
}): Space {
  return makeSpace({
    meta,
    actors: [{ kind: 'actor', id: 'user', name: 'User' }],
    modules: [
      {
        kind: 'module',
        id: 'web',
        name: 'Web',
        type: 'frontend',
        components: [
          {
            kind: 'component',
            id: 'HomePage',
            name: 'HomePage',
            type: 'page',
            methods: [{ name: 'submit', calls: args.pageCalls ?? [] }],
            ...(args.pageComposes ? { composes: args.pageComposes } : {}),
          },
        ],
      },
      {
        kind: 'module',
        id: 'api',
        name: 'API',
        type: 'service',
        components: [
          {
            kind: 'component',
            id: 'OrderController',
            name: 'OrderController',
            type: 'controller',
            methods: [{ name: 'create' }],
          },
        ],
      },
    ],
    useCases: [
      {
        kind: 'usecase',
        id: 'order',
        name: 'Order',
        actor: 'actor:user',
        trigger: 'click',
        steps: args.steps,
        errorFlows: args.errorFlows ?? [],
      },
    ],
  })
}

describe('ruleWiringStepWithoutCall (WIRING_STEP_WITHOUT_CALL)', () => {
  const httpStep = {
    from: 'module:web/component:HomePage',
    to: 'module:api/component:OrderController',
    protocol: 'http',
  }

  it('warns when an http step walks an edge no method declares', () => {
    const space = callSpace({ steps: [httpStep] })
    const issues = ruleWiringStepWithoutCall(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('WIRING_STEP_WITHOUT_CALL')
    expect(issues[0]?.severity).toBe('warning')
  })

  it('passes when the edge is declared — component-level or method-level call target', () => {
    const componentLevel = callSpace({
      pageCalls: ['module:api/component:OrderController'],
      steps: [httpStep],
    })
    expect(ruleWiringStepWithoutCall(componentLevel, buildRefIndex(componentLevel))).toHaveLength(0)

    const methodLevel = callSpace({
      pageCalls: ['module:api/component:OrderController/method:create'],
      steps: [httpStep],
    })
    expect(ruleWiringStepWithoutCall(methodLevel, buildRefIndex(methodLevel))).toHaveLength(0)
  })

  it('accepts composes containment for internal-call steps', () => {
    const step = {
      from: 'module:web/component:HomePage',
      to: 'module:api/component:OrderController',
      protocol: 'internal-call',
    }
    const bare = callSpace({ steps: [step] })
    expect(ruleWiringStepWithoutCall(bare, buildRefIndex(bare))).toHaveLength(1)

    const composed = callSpace({
      pageComposes: ['module:api/component:OrderController'],
      steps: [step],
    })
    expect(ruleWiringStepWithoutCall(composed, buildRefIndex(composed))).toHaveLength(0)
  })

  it('accepts reverse edges in error flows (exception unwind) but keeps the happy path strict', () => {
    const reverse = {
      from: 'module:api/component:OrderController',
      to: 'module:web/component:HomePage',
      protocol: 'internal-call',
    }
    const happy = callSpace({
      pageCalls: ['module:api/component:OrderController'],
      steps: [reverse],
    })
    expect(ruleWiringStepWithoutCall(happy, buildRefIndex(happy))).toHaveLength(1)

    const unwind = callSpace({
      pageCalls: ['module:api/component:OrderController'],
      steps: [],
      errorFlows: [{ id: 'boom', condition: 'repository raises', steps: [reverse] }],
    })
    expect(ruleWiringStepWithoutCall(unwind, buildRefIndex(unwind))).toHaveLength(0)
  })

  it('skips steps whose endpoint is a module (nothing precise to check)', () => {
    const space = callSpace({
      steps: [{ from: 'module:web', to: 'module:api/component:OrderController', protocol: 'http' }],
    })
    expect(ruleWiringStepWithoutCall(space, buildRefIndex(space))).toHaveLength(0)
  })

  it('event steps: emits/subscribes pair on the same event passes, anything else warns', () => {
    const eventSpace = (subscribesTo: string): Space =>
      makeSpace({
        meta,
        actors: [{ kind: 'actor', id: 'clock', name: 'Clock', type: 'scheduler' }],
        modules: [
          {
            kind: 'module',
            id: 'api',
            name: 'API',
            type: 'service',
            models: [
              { kind: 'model', id: 'OrderPlaced', name: 'OrderPlaced', modelKind: 'event' },
              { kind: 'model', id: 'OrderPaid', name: 'OrderPaid', modelKind: 'event' },
            ],
            components: [
              {
                kind: 'component',
                id: 'Dispatcher',
                name: 'Dispatcher',
                type: 'service',
                emits: [{ event: 'module:api/model:OrderPlaced' }],
              },
              {
                kind: 'component',
                id: 'Notifier',
                name: 'Notifier',
                type: 'consumer',
                subscribes: [{ event: subscribesTo }],
              },
            ],
          },
        ],
        useCases: [
          {
            kind: 'usecase',
            id: 'notify',
            name: 'Notify',
            actor: 'actor:clock',
            trigger: 'order placed',
            steps: [
              {
                from: 'module:api/component:Dispatcher',
                to: 'module:api/component:Notifier',
                protocol: 'event',
                via: 'module:api/model:OrderPlaced',
              },
            ],
          },
        ],
      })

    const connected = eventSpace('module:api/model:OrderPlaced')
    expect(ruleWiringStepWithoutCall(connected, buildRefIndex(connected))).toHaveLength(0)

    const disconnected = eventSpace('module:api/model:OrderPaid')
    const issues = ruleWiringStepWithoutCall(disconnected, buildRefIndex(disconnected))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('emits/subscribes')
  })
})

describe('ruleWiringCallWithoutStep (WIRING_CALL_WITHOUT_STEP)', () => {
  it('reports a declared call edge no use case walks, at info severity', () => {
    const space = callSpace({
      pageCalls: ['module:api/component:OrderController'],
      steps: [],
    })
    const issues = ruleWiringCallWithoutStep(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('WIRING_CALL_WITHOUT_STEP')
    expect(issues[0]?.severity).toBe('info')
    expect(issues[0]?.message).toContain('HomePage.submit')
  })

  it('stays silent for walked edges and for composes containment', () => {
    const walked = callSpace({
      pageCalls: ['module:api/component:OrderController'],
      steps: [
        {
          from: 'module:web/component:HomePage',
          to: 'module:api/component:OrderController',
          protocol: 'http',
        },
      ],
    })
    expect(ruleWiringCallWithoutStep(walked, buildRefIndex(walked))).toHaveLength(0)

    const composedOnly = callSpace({
      pageComposes: ['module:api/component:OrderController'],
      steps: [],
    })
    expect(ruleWiringCallWithoutStep(composedOnly, buildRefIndex(composedOnly))).toHaveLength(0)
  })
})

describe('ruleStepViaMissing (STEP_VIA_MISSING)', () => {
  it('flags http steps without via at info severity; via-carrying and sql steps pass', () => {
    const bare = callSpace({
      pageCalls: ['module:api/component:OrderController'],
      steps: [
        {
          from: 'module:web/component:HomePage',
          to: 'module:api/component:OrderController',
          protocol: 'http',
        },
      ],
    })
    const issues = ruleStepViaMissing(bare, buildRefIndex(bare))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('STEP_VIA_MISSING')
    expect(issues[0]?.severity).toBe('info')

    const withVia = callSpace({
      pageCalls: ['module:api/component:OrderController'],
      steps: [
        {
          from: 'module:web/component:HomePage',
          to: 'module:api/component:OrderController',
          protocol: 'http',
          via: 'module:api/model:Order',
        },
      ],
    })
    expect(ruleStepViaMissing(withVia, buildRefIndex(withVia))).toHaveLength(0)

    const sql = callSpace({
      steps: [
        {
          from: 'module:web/component:HomePage',
          to: 'module:api/component:OrderController',
          protocol: 'sql',
        },
      ],
    })
    expect(ruleStepViaMissing(sql, buildRefIndex(sql))).toHaveLength(0)
  })
})

describe('ruleDtoFlowViaTypeMismatch — method-level binding + returns match', () => {
  function methodBoundSpace(args: {
    params?: readonly unknown[]
    returns?: string
    via: string
  }): Space {
    return makeSpace({
      meta,
      actors: [{ kind: 'actor', id: 'user', name: 'User' }],
      modules: [
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          models: [
            {
              kind: 'model',
              id: 'CreateOrderRequest',
              name: 'CreateOrderRequest',
              modelKind: 'dto',
              fields: [{ name: 'pizzaId', type: 'uuid' }],
            },
            {
              kind: 'model',
              id: 'Order',
              name: 'Order',
              modelKind: 'entity',
              fields: [{ name: 'id', type: 'uuid' }],
            },
          ],
          components: [
            {
              kind: 'component',
              id: 'OrderController',
              name: 'OrderController',
              type: 'controller',
              methods: [
                {
                  name: 'create',
                  params: args.params ?? [],
                  ...(args.returns ? { returns: args.returns } : {}),
                },
              ],
            },
          ],
        },
      ],
      useCases: [
        {
          kind: 'usecase',
          id: 'order',
          name: 'Order',
          actor: 'actor:user',
          trigger: 'click',
          steps: [
            {
              from: 'actor:user',
              to: 'module:api/component:OrderController/method:create',
              protocol: 'http',
              via: args.via,
            },
          ],
        },
      ],
    })
  }

  it('errors when the bound method neither accepts nor returns the via model', () => {
    const space = methodBoundSpace({
      params: [{ name: 'id', type: 'uuid' }],
      returns: 'string',
      via: 'module:api/model:CreateOrderRequest',
    })
    const issues = ruleDtoFlowViaTypeMismatch(space, buildRefIndex(space))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.message).toContain('method')
  })

  it('passes on a param match, and on a returns match (via-as-response, GET flows)', () => {
    const paramMatch = methodBoundSpace({
      params: [{ name: 'req', type: 'CreateOrderRequest' }],
      via: 'module:api/model:CreateOrderRequest',
    })
    expect(ruleDtoFlowViaTypeMismatch(paramMatch, buildRefIndex(paramMatch))).toHaveLength(0)

    const returnsMatch = methodBoundSpace({
      returns: 'Order',
      via: 'module:api/model:Order',
    })
    expect(ruleDtoFlowViaTypeMismatch(returnsMatch, buildRefIndex(returnsMatch))).toHaveLength(0)
  })
})
