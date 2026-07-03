/**
 * Full-fidelity AI export tests (v0.6 — W3).
 *
 * Before W3 `exportSpaceForAi` silently dropped: field validation, enum
 * values, cardinality, state machines, pub/sub edges, routes/auth, call
 * credentials, wire captures, error mapping, config map, external deps,
 * health contracts, table defaults/migrations, use-case requires, ADR /
 * runbook indexes. Each test pins one group so a future emitter refactor
 * can't silently lose schema surface again.
 */
import { describe, expect, it } from 'vitest'
import { exportSpaceForAi } from '../src/index.js'
import type { Space } from '../src/index.js'
import { SpaceSchema } from '../src/schema.js'

function fixtureSpace(): Space {
  return SpaceSchema.parse({
    meta: {
      id: 'w3',
      name: 'W3',
      implementationLanguage: 'typescript',
      implementationFramework: 'nestjs',
    },
    actors: [{ kind: 'actor', id: 'admin', name: 'Admin' }],
    decisions: [
      {
        id: 'ADR-001',
        title: 'Idempotent charges',
        status: 'accepted',
        date: '2026-01-01',
        path: 'decisions/ADR-001-idempotent.md',
      },
      {
        id: 'ADR-002',
        title: 'Retry policy',
        status: 'accepted',
        path: 'decisions/ADR-002-retry.md',
        body: 'Retries use exponential backoff.',
      },
    ],
    runbooks: [
      {
        id: 'payment-stuck',
        title: 'Payment stuck',
        severity: 'p1',
        covers: ['declined'],
        trigger: 'charge hangs > 5m',
        path: 'operations/runbooks/payment-stuck.md',
      },
    ],
    operationsStateMachines: [
      {
        kind: 'state-machine',
        id: 'saga',
        name: 'Order saga',
        states: ['a', 'b'],
        transitions: [{ from: 'a', to: 'b', on: 'go' }],
      },
    ],
    modules: [
      {
        kind: 'module',
        id: 'api',
        name: 'API',
        type: 'service',
        errorMapping: [{ exception: 'DeclinedError', httpStatus: 402, code: 'DECLINED' }],
        configMap: [
          {
            key: 'PAYMENT_KEY',
            type: 'secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            sourceOfTruth: 'vault:payments',
            consumer: { component: 'module:api/component:Gateway' },
          },
        ],
        externalDeps: [
          {
            kind: 'http-api',
            name: 'stripe',
            direction: 'outbound',
            protocol: 'https',
            endpoint: 'api.stripe.com',
            auth: 'bearer',
            usesConfigKey: 'PAYMENT_KEY',
            consumer: 'module:api/component:Gateway',
            purpose: 'card charges',
            failureMode: 'circuit break, return 503',
          },
          {
            kind: 'host-binary',
            name: 'firecracker',
            install_path: '/usr/bin/firecracker',
            lifecycle: 'deploy',
            required_in_profiles: ['prod'],
          },
        ],
        healthContract: {
          kind: 'health-contract',
          path: '/healthz',
          okStatus: 200,
          fields: [{ name: 'status', type: 'string', enumValues: ['ok', 'degraded'] }],
        },
        stateMachines: [
          {
            kind: 'state-machine',
            id: 'order-lifecycle',
            name: 'Order lifecycle',
            states: ['new', 'paid'],
            transitions: [{ from: 'new', to: 'paid', on: 'pay' }],
          },
        ],
        components: [
          {
            kind: 'component',
            id: 'Gateway',
            name: 'Gateway',
            type: 'service',
            decidedBy: ['ADR-001'],
            entrypoint: { kind: 'composition-root', reason: 'boot wiring' },
            wireCapture: {
              source: 'curl-live',
              path: 'wire-captures/stripe/charge.txt',
              capturedAt: '2026-06-01',
              capturedAgainst: 'stripe@v1',
            },
            emits: [{ event: 'module:api/model:OrderPlaced' }],
            routes: [
              {
                path: '/webhook',
                method: 'POST',
                auth: { type: 'shared-secret', header: 'X-Sig' },
              },
            ],
            methods: [
              {
                name: 'charge',
                httpMethod: 'POST',
                httpPath: '/charge',
                routeAuth: { type: 'user-jwt', header: 'Authorization' },
                params: [{ name: 'amount', type: 'int', validation: { min: 1 } }],
                returns: 'PaymentRes',
                throws: ['DeclinedError'],
                calls: [
                  {
                    target: 'module:api/component:Repo/method:save',
                    credential: { type: 'shared-secret', header: 'X-Key', env: 'PAYMENT_KEY' },
                  },
                ],
              },
            ],
          },
          {
            kind: 'component',
            id: 'Repo',
            name: 'Repo',
            type: 'repository',
            subscribes: [
              {
                event: 'module:api/model:OrderPlaced',
                idempotency: { key: 'orderId', strategy: 'dedupe-store' },
              },
            ],
            methods: [{ name: 'save' }],
          },
        ],
        models: [
          {
            kind: 'model',
            id: 'PaymentRes',
            name: 'PaymentRes',
            modelKind: 'dto',
            fields: [
              { name: 'tags', type: 'string', cardinality: 'many' },
              { name: 'debug', type: 'string', optional: true, persisted: false },
            ],
          },
          {
            kind: 'model',
            id: 'RuntimeId',
            name: 'RuntimeId',
            modelKind: 'enum',
            values: ['claude-code', 'opencode'],
          },
          {
            kind: 'model',
            id: 'OrderPlaced',
            name: 'OrderPlaced',
            modelKind: 'event',
            topic: 'orders.placed',
            delivery: 'at-least-once',
            orderingKey: 'orderId',
            fields: [{ name: 'orderId', type: 'uuid' }],
          },
          {
            kind: 'model',
            id: 'Order',
            name: 'Order',
            modelKind: 'entity',
            persistedAs: 'module:db/table:orders',
            fields: [{ name: 'status', type: 'string' }],
            stateMachine: {
              field: 'status',
              states: ['new', 'paid'],
              initial: 'new',
              terminal: ['paid'],
              transitions: [{ from: 'new', to: 'paid', on: 'pay' }],
              scenarios: [
                { id: 'pay-persists', given: 'new order', when: 'pay', then: ['status == paid'] },
              ],
            },
          },
        ],
      },
      {
        kind: 'module',
        id: 'db',
        name: 'DB',
        type: 'database',
        tables: [
          {
            kind: 'table',
            id: 'orders',
            name: 'orders',
            columns: [
              { name: 'id', sqlType: 'uuid', primaryKey: true },
              { name: 'total', sqlType: 'int', default: '0' },
              {
                name: 'user_id',
                sqlType: 'uuid',
                foreignKey: { table: 'module:db/table:users', column: 'id' },
              },
            ],
            indexes: [{ name: 'ix_total', columns: ['total'] }],
            migrations: [{ id: 'V0002', action: 'add-column', columns: ['total'] }],
          },
          {
            kind: 'table',
            id: 'users',
            name: 'users',
            columns: [{ name: 'id', sqlType: 'uuid', primaryKey: true }],
          },
        ],
      },
    ],
    useCases: [
      {
        kind: 'usecase',
        id: 'charge',
        name: 'Charge',
        actor: 'actor:admin',
        trigger: 'admin clicks charge',
        requires: [{ role: 'ADMIN', description: 'only admins' }],
        steps: [
          {
            from: 'actor:admin',
            to: 'module:api/component:Gateway',
            via: 'module:api/model:PaymentRes',
            protocol: 'http',
          },
          {
            from: 'module:api/component:Gateway',
            to: 'module:api/component:Repo',
            protocol: 'internal-call',
            kind: 'spawn',
          },
        ],
      },
    ],
  })
}

describe('exportSpaceForAi — full fidelity (W3)', () => {
  const md = exportSpaceForAi(fixtureSpace(), { timestamp: '2026-07-02T00:00:00Z' })

  it('emits full component contracts: routes, auth, call credentials, pub/sub, capture, entrypoint', () => {
    expect(md).toContain('###### `<module:api/component:Gateway>` Gateway (service)')
    expect(md).toContain('routeAuth: { type: user-jwt, header: Authorization }')
    expect(md).toContain('validation: min=1')
    expect(md).toContain('throws: [DeclinedError]')
    expect(md).toContain('credential: { type: shared-secret, header: X-Key, env: PAYMENT_KEY }')
    expect(md).toContain('- POST /webhook  # auth: { type: shared-secret, header: X-Sig }')
    expect(md).toContain('- event: <module:api/model:OrderPlaced>')
    expect(md).toContain('subscribes:')
    expect(md).toContain('idempotency: { key: orderId, strategy: dedupe-store }')
    expect(md).toContain(
      '**Wire capture:** `wire-captures/stripe/charge.txt` (curl-live, 2026-06-01, against stripe@v1)',
    )
    expect(md).toContain('**Decisions:** ADR-001')
    expect(md).toContain('**Entrypoint:** composition-root — boot wiring')
  })

  it('emits model fidelity: enum values, cardinality, persisted flag, topic, SM scenarios', () => {
    expect(md).toContain('values: [claude-code, opencode]')
    expect(md).toContain('cardinality: many')
    expect(md).toContain('persisted: false')
    expect(md).toContain('**Topic:** `orders.placed`')
    expect(md).toContain('**Delivery:** at-least-once, ordered by `orderId`')
    expect(md).toContain('**State machine on field `status`:**')
    expect(md).toContain('- new → paid on `pay`')
    expect(md).toContain('- pay-persists: given new order; when pay; then: [status == paid]')
  })

  it('emits table fidelity: defaults, foreign keys, indexes, migrations', () => {
    expect(md).toContain('default: 0')
    expect(md).toContain('foreignKey: <module:db/table:users>.id')
    expect(md).toContain('- name: ix_total')
    expect(md).toContain('- V0002 add-column: [total]')
  })

  it('emits module operational surfaces: error mapping, config, deps, health, standalone SMs', () => {
    expect(md).toContain('| DeclinedError | 402 | DECLINED |')
    expect(md).toContain(
      '- `PAYMENT_KEY` — secret, startup, rotatable; consumer `<module:api/component:Gateway>`',
    )
    expect(md).toContain(
      '- `stripe` — outbound https → api.stripe.com; auth bearer (key `PAYMENT_KEY`); consumer `<module:api/component:Gateway>`',
    )
    expect(md).toContain(
      '- `firecracker` (host-binary) @ /usr/bin/firecracker; lifecycle deploy; profiles [prod]',
    )
    expect(md).toContain('**Health contract:** `/healthz` → 200')
    expect(md).toContain('- status: string enum [ok, degraded]')
    expect(md).toContain('##### State machine: Order lifecycle (`order-lifecycle`)')
  })

  it('emits space-level sections: stack, decisions (path vs body), runbooks, cross-module SMs', () => {
    expect(md).toContain('**Implementation stack:** typescript/nestjs')
    expect(md).toContain('### ADR-001 — Idempotent charges (accepted, 2026-01-01)')
    expect(md).toContain('_Body at `decisions/ADR-001-idempotent.md`._')
    expect(md).toContain('Retries use exponential backoff.')
    expect(md).toContain('- `payment-stuck` (p1) — Payment stuck; covers: [declined]')
    expect(md).toContain('## Cross-module state machines')
    expect(md).toContain('### State machine: Order saga (`saga`)')
    expect(md).toContain('· 2 decisions · 1 runbooks.')
  })

  it('emits use-case requires and concurrency kind on steps', () => {
    expect(md).toContain('#### Requirements (guards)')
    expect(md).toContain('- role=ADMIN — only admins')
    expect(md).toContain('kind: spawn')
  })
})
