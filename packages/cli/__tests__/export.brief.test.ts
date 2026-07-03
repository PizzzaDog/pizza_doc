/**
 * Implementation-brief closure (W2) tests.
 *
 * One rich fixture space exercises every section the brief must carry to
 * be self-contained:
 *   - full method contracts of step components (routeAuth, throws, calls
 *     with credentials);
 *   - transitive model closure (a model reachable only through another
 *     model's field type) + enum values;
 *   - tables via `persistedAs` (no sql step in the flow);
 *   - config keys filtered to involved consumers (module-wide included,
 *     uninvolved component excluded);
 *   - ADR bodies for `decidedBy` components;
 *   - external-module types exempt from the self-check;
 *   - UNRESOLVED TYPES section + exit 1 when a phantom type sneaks in.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cmdExport, collectBriefContext, renderBrief } from '../src/commands/export.js'
import { loadSpaceForCli } from '../src/util/load.js'

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-brief-test-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Write the fixture space; `gatewayReturns` lets one test plant a typo. */
function writeSpace(args: { gatewayReturns: string }): string {
  const spaceDir = path.join(tmp, 'brief-fixture')
  const w = (rel: string, content: string): void => {
    const abs = path.join(spaceDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }

  w('space.yaml', ['meta:', '  id: brief-fixture', '  name: Brief Fixture'].join('\n'))
  w('actors/customer.yaml', 'kind: actor\nid: customer\nname: Customer\ntype: user\n')

  w(
    'modules/api/module.yaml',
    [
      'kind: module',
      'id: api',
      'name: API',
      'type: service',
      'errorMapping:',
      '  - exception: DeclinedError',
      '    httpStatus: 402',
      '    code: DECLINED',
    ].join('\n'),
  )
  w(
    'modules/api/config-map.yaml',
    [
      '- key: PAYMENT_KEY',
      '  type: secret',
      '  lifecycle: startup',
      '  mutability: rotatable',
      '  sourceOfTruth: "vault:secret/payments"',
      '  consumer:',
      '    component: module:api/component:Gateway',
      '  description: Bearer token for the payment vendor.',
      '- key: DB_URL',
      '  type: non-secret',
      '  lifecycle: startup',
      '  mutability: rotatable',
      '  consumer:',
      '    component: module:api',
      '- key: UNRELATED_KEY',
      '  type: non-secret',
      '  lifecycle: runtime',
      '  mutability: hot-reload',
      '  consumer:',
      '    component: module:api/component:Idle',
    ].join('\n'),
  )

  w(
    'modules/api/models/CreateOrderReq.yaml',
    [
      'kind: model',
      'id: CreateOrderReq',
      'name: CreateOrderReq',
      'modelKind: dto',
      'fields:',
      '  - name: items',
      '    type: List<OrderItemReq>',
      '  - name: runtime',
      '    type: RuntimeId',
    ].join('\n'),
  )
  w(
    'modules/api/models/OrderItemReq.yaml',
    [
      'kind: model',
      'id: OrderItemReq',
      'name: OrderItemReq',
      'modelKind: dto',
      'fields:',
      '  - name: pizzaId',
      '    type: uuid',
      '  - name: quantity',
      '    type: int',
      '    validation:',
      '      min: 1',
    ].join('\n'),
  )
  w(
    'modules/api/models/RuntimeId.yaml',
    [
      'kind: model',
      'id: RuntimeId',
      'name: RuntimeId',
      'modelKind: enum',
      'values:',
      '  - claude-code',
      '  - opencode',
    ].join('\n'),
  )
  w(
    'modules/api/models/OrderResp.yaml',
    [
      'kind: model',
      'id: OrderResp',
      'name: OrderResp',
      'modelKind: dto',
      'fields:',
      '  - name: orderId',
      '    type: uuid',
    ].join('\n'),
  )
  w(
    'modules/api/models/Order.yaml',
    [
      'kind: model',
      'id: Order',
      'name: Order',
      'modelKind: entity',
      'persistedAs: module:db/table:orders',
      'fields:',
      '  - name: id',
      '    type: uuid',
    ].join('\n'),
  )
  w(
    'modules/api/models/OrderPlaced.yaml',
    ['kind: model', 'id: OrderPlaced', 'name: OrderPlaced', 'modelKind: event'].join('\n'),
  )

  w(
    'modules/api/components/Controller.yaml',
    [
      'kind: component',
      'id: Controller',
      'name: Controller',
      'type: controller',
      'decidedBy:',
      '  - ADR-001',
      'methods:',
      '  - name: create',
      '    params:',
      '      - name: req',
      '        type: CreateOrderReq',
      '    returns: OrderResp',
      '    httpMethod: POST',
      '    httpPath: /orders',
      '    routeAuth:',
      '      type: user-jwt',
      '      header: Authorization',
      '    calls:',
      '      - module:api/component:Gateway/method:charge',
    ].join('\n'),
  )
  w(
    'modules/api/components/Gateway.yaml',
    [
      'kind: component',
      'id: Gateway',
      'name: Gateway',
      'type: service',
      'emits:',
      '  - event: module:api/model:OrderPlaced',
      'methods:',
      '  - name: charge',
      '    params:',
      '      - name: req',
      '        type: CreateOrderReq',
      `    returns: ${args.gatewayReturns}`,
      '    throws:',
      '      - DeclinedError',
      '    calls:',
      '      - target: module:api/component:Repo/method:save',
      '      - target: module:stripe/component:StripeAPI/method:createCharge',
      '        method: POST',
      '        path: /v1/charges',
      '        credential:',
      '          type: shared-secret',
      '          header: X-Key',
      '          env: PAYMENT_KEY',
    ].join('\n'),
  )
  w(
    'modules/api/components/Repo.yaml',
    [
      'kind: component',
      'id: Repo',
      'name: Repo',
      'type: repository',
      'methods:',
      '  - name: save',
      '    params:',
      '      - name: order',
      '        type: Order',
      '    returns: Order',
    ].join('\n'),
  )
  w('modules/api/components/Idle.yaml', 'kind: component\nid: Idle\nname: Idle\ntype: service\n')

  w('modules/db/module.yaml', 'kind: module\nid: db\nname: DB\ntype: database\n')
  w(
    'modules/db/tables/orders.yaml',
    [
      'kind: table',
      'id: orders',
      'name: orders',
      'columns:',
      '  - name: id',
      '    sqlType: uuid',
      '    primaryKey: true',
    ].join('\n'),
  )

  w('modules/stripe/module.yaml', 'kind: module\nid: stripe\nname: Stripe\ntype: external\n')
  w(
    'modules/stripe/components/StripeAPI.yaml',
    [
      'kind: component',
      'id: StripeAPI',
      'name: StripeAPI',
      'type: client',
      'methods:',
      '  - name: createCharge',
      '    returns: VendorBlob',
    ].join('\n'),
  )

  w(
    'decisions/ADR-001-idempotent-charges.md',
    [
      '---',
      'id: ADR-001',
      'title: Charges are idempotent',
      'status: accepted',
      '---',
      '',
      '# Charges are idempotent',
      '',
      'Every charge call must carry an idempotency key derived from the order id.',
    ].join('\n'),
  )

  w(
    'use-cases/place.yaml',
    [
      'kind: usecase',
      'id: place',
      'name: Place order',
      'actor: actor:customer',
      'trigger: checkout',
      'steps:',
      '  - from: actor:customer',
      '    to: module:api/component:Controller',
      '    via: module:api/model:CreateOrderReq',
      '    protocol: http',
      '  - from: module:api/component:Controller',
      '    to: module:api/component:Gateway',
      '    via: module:api/model:CreateOrderReq',
      '    protocol: internal-call',
      '  - from: module:api/component:Gateway',
      '    to: module:stripe/component:StripeAPI',
      '    protocol: external-api',
      '  - from: module:api/component:Gateway',
      '    to: module:api/component:Repo',
      '    via: module:api/model:Order',
      '    protocol: internal-call',
      'errorFlows:',
      '  - id: declined',
      '    condition: vendor declines the charge',
      '    steps:',
      '      - from: module:api/component:Gateway',
      '        to: module:api/component:Controller',
      '        protocol: internal-call',
    ].join('\n'),
  )

  return spaceDir
}

async function renderFixtureBrief(gatewayReturns = 'OrderResp'): Promise<{
  brief: string
  ctx: ReturnType<typeof collectBriefContext>
  spaceDir: string
}> {
  const spaceDir = writeSpace({ gatewayReturns })
  const { space } = await loadSpaceForCli(spaceDir)
  const uc = space.useCases.find((u) => u.id === 'place')
  if (!uc) throw new Error('fixture use case missing')
  const ctx = collectBriefContext(space, uc)
  return { brief: renderBrief(space, uc, ctx, spaceDir), ctx, spaceDir }
}

describe('implementation-brief closure (W2)', () => {
  it('renders full method contracts for every component on the path', async () => {
    const { brief } = await renderFixtureBrief()
    expect(brief).toContain('## Components & contracts')
    for (const header of [
      '### `<module:api/component:Controller>` Controller (controller)',
      '### `<module:api/component:Gateway>` Gateway (service)',
      '### `<module:api/component:Repo>` Repo (repository)',
      '### `<module:stripe/component:StripeAPI>` StripeAPI (client)',
    ]) {
      expect(brief).toContain(header)
    }
    expect(brief).toContain('routeAuth: { type: user-jwt, header: Authorization }')
    expect(brief).toContain('throws: [DeclinedError]')
    expect(brief).toContain('credential: { type: shared-secret, header: X-Key, env: PAYMENT_KEY }')
    expect(brief).toContain('emits:')
    expect(brief).toContain('- event: <module:api/model:OrderPlaced>')
  })

  it('closes the model graph transitively and renders enum values', async () => {
    const { brief, ctx } = await renderFixtureBrief()
    // OrderItemReq is reachable only through CreateOrderReq.items.
    expect(brief).toContain('### `<module:api/model:OrderItemReq>` OrderItemReq (dto)')
    // RuntimeId only through CreateOrderReq.runtime — with its value set.
    expect(brief).toContain('### `<module:api/model:RuntimeId>` RuntimeId (enum)')
    expect(brief).toContain('values: [claude-code, opencode]')
    // Field-level validation survives into the model block.
    expect(brief).toContain('validation: min=1')
    expect(ctx.unresolvedTypes).toEqual([])
  })

  it('pulls tables in via persistedAs even without an sql step', async () => {
    const { brief } = await renderFixtureBrief()
    expect(brief).toContain('## Tables referenced')
    expect(brief).toContain('### `<module:db/table:orders>` orders')
  })

  it('filters configuration to involved consumers', async () => {
    const { brief } = await renderFixtureBrief()
    expect(brief).toContain('## Configuration read by these components')
    expect(brief).toContain('PAYMENT_KEY')
    expect(brief).toContain('DB_URL') // module-wide consumer, module involved
    expect(brief).not.toContain('UNRELATED_KEY') // consumer not on the path
  })

  it('inlines ADR bodies for decidedBy components and the error mapping', async () => {
    const { brief } = await renderFixtureBrief()
    expect(brief).toContain('### ADR-001 — Charges are idempotent (accepted)')
    expect(brief).toContain('idempotency key derived from the order id')
    expect(brief).toContain('| DeclinedError | 402 | DECLINED |')
  })

  it('exempts external-module types from the self-check', async () => {
    const { brief, ctx } = await renderFixtureBrief()
    // StripeAPI.createCharge returns VendorBlob — unmodeled, but external.
    expect(ctx.unresolvedTypes).toEqual([])
    expect(brief).not.toContain('UNRESOLVED TYPES')
  })

  it('flags phantom types in an UNRESOLVED section and exits 1 via the CLI', async () => {
    const { brief, ctx, spaceDir } = await renderFixtureBrief('OrderRespp')
    expect(ctx.unresolvedTypes).toEqual(['OrderRespp'])
    expect(brief).toContain('## ⚠ UNRESOLVED TYPES')
    expect(brief).toContain('- `OrderRespp`')

    const out = path.join(tmp, 'brief.md')
    const code = await cmdExport({
      positional: ['implementation-brief', 'place', spaceDir],
      flags: { out },
    })
    expect(code).toBe(1)
    expect(fs.readFileSync(out, 'utf8')).toContain('UNRESOLVED TYPES')
  })

  it('exits 0 via the CLI when the brief is closed', async () => {
    const spaceDir = writeSpace({ gatewayReturns: 'OrderResp' })
    const out = path.join(tmp, 'brief.md')
    const code = await cmdExport({
      positional: ['implementation-brief', 'place', spaceDir],
      flags: { out },
    })
    expect(code).toBe(0)
  })
})
