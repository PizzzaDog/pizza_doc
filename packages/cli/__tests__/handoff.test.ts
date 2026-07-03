/**
 * `pd handoff` gate (v0.6 — W6) tests.
 *
 * One fully-wired fixture passes all six checks (exit 0); each switch
 * breaks exactly one gate leg:
 *   - parity: false        → WIRING_STEP_WITHOUT_CALL (scoped to the uc)
 *   - via: false           → STEP_VIA_MISSING
 *   - mapped: false        → THROWS_UNMAPPED on an involved component
 *   - idempotency: false   → EVENT_IDEMPOTENCY_MISSING on an involved component
 *   - returns: 'OrderRez'  → TYPE_UNRESOLVED (space error + brief closure)
 * Unknown use case → exit 2.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cmdHandoff } from '../src/commands/handoff.js'

let tmp: string
let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-handoff-test-'))
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function writeSpace(opts: {
  parity?: boolean
  via?: boolean
  mapped?: boolean
  idempotency?: boolean
  returns?: string
}): string {
  const parity = opts.parity ?? true
  const via = opts.via ?? true
  const mapped = opts.mapped ?? true
  const idempotency = opts.idempotency ?? true
  const returns = opts.returns ?? 'OrderRes'

  const spaceDir = path.join(tmp, 'handoff-fixture')
  const w = (rel: string, content: string): void => {
    const abs = path.join(spaceDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }

  w('space.yaml', 'meta:\n  id: handoff-fixture\n  name: Handoff Fixture\n')
  w('actors/customer.yaml', 'kind: actor\nid: customer\nname: Customer\ntype: user\n')

  w('modules/web/module.yaml', 'kind: module\nid: web\nname: Web\ntype: frontend\n')
  w(
    'modules/web/components/Page.yaml',
    [
      'kind: component',
      'id: Page',
      'name: Page',
      'type: page',
      'methods:',
      '  - name: submit',
      ...(parity ? ['    calls:', '      - module:api/component:Api/method:create'] : []),
      '',
    ].join('\n'),
  )

  w(
    'modules/api/module.yaml',
    [
      'kind: module',
      'id: api',
      'name: API',
      'type: service',
      ...(mapped ? ['errorMapping:', '  - exception: DeclinedError', '    httpStatus: 402'] : []),
      '',
    ].join('\n'),
  )
  w(
    'modules/api/components/Api.yaml',
    [
      'kind: component',
      'id: Api',
      'name: Api',
      'type: controller',
      'methods:',
      '  - name: create',
      '    httpMethod: POST',
      '    httpPath: /orders',
      '    params:',
      '      - name: req',
      '        type: CreateReq',
      `    returns: ${returns}`,
      '    throws:',
      '      - DeclinedError',
      'emits:',
      '  - event: module:api/model:OrderPlaced',
      '',
    ].join('\n'),
  )
  w(
    'modules/api/components/Worker.yaml',
    [
      'kind: component',
      'id: Worker',
      'name: Worker',
      'type: consumer',
      'methods:',
      '  - name: handle',
      '    params:',
      '      - name: evt',
      '        type: OrderPlaced',
      'subscribes:',
      '  - event: module:api/model:OrderPlaced',
      ...(idempotency
        ? ['    idempotency:', '      key: orderId', '      strategy: dedupe-store']
        : []),
      '',
    ].join('\n'),
  )
  w(
    'modules/api/models/CreateReq.yaml',
    'kind: model\nid: CreateReq\nname: CreateReq\nmodelKind: dto\nfields:\n  - name: note\n    type: string\n',
  )
  w(
    'modules/api/models/OrderRes.yaml',
    'kind: model\nid: OrderRes\nname: OrderRes\nmodelKind: dto\nfields:\n  - name: id\n    type: uuid\n',
  )
  w(
    'modules/api/models/OrderPlaced.yaml',
    [
      'kind: model',
      'id: OrderPlaced',
      'name: OrderPlaced',
      'modelKind: event',
      'topic: orders.placed',
      'delivery: at-least-once',
      'orderingKey: orderId',
      'fields:',
      '  - name: orderId',
      '    type: uuid',
      '',
    ].join('\n'),
  )

  w(
    'use-cases/place.yaml',
    [
      'kind: usecase',
      'id: place',
      'name: Place order',
      'actor: actor:customer',
      'trigger: customer submits the order form',
      'steps:',
      '  - from: actor:customer',
      '    to: module:web/component:Page',
      '  - from: module:web/component:Page',
      '    to: module:api/component:Api',
      '    protocol: http',
      ...(via ? ['    via: module:api/model:CreateReq'] : []),
      '  - from: module:api/component:Api',
      '    to: module:api/component:Worker',
      '    protocol: event',
      '    via: module:api/model:OrderPlaced',
      '    kind: spawn',
      '',
    ].join('\n'),
  )
  return spaceDir
}

function run(spaceDir: string, ucid: string, json = false): Promise<number> {
  return cmdHandoff({
    positional: [ucid, spaceDir],
    flags: json ? { json: true } : {},
  })
}

function lastJson(): {
  ready: boolean
  checks: Array<{ id: string; ok: boolean; issues: Array<{ code: string }> }>
} {
  const call = logSpy.mock.calls.at(-1)?.[0]
  return JSON.parse(String(call))
}

describe('pd handoff (W6)', () => {
  it('passes a fully wired use case: exit 0 + READY', async () => {
    const dir = writeSpace({})
    const code = await run(dir, 'place')
    expect(code).toBe(0)
    const printed = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
    expect(printed).toContain('READY')
    expect(printed).toContain('pd export implementation-brief place')
  })

  it('--json reports every check ok on the happy fixture', async () => {
    const dir = writeSpace({})
    const code = await run(dir, 'place', true)
    expect(code).toBe(0)
    const report = lastJson()
    expect(report.ready).toBe(true)
    expect(report.checks).toHaveLength(6)
    expect(report.checks.every((c) => c.ok)).toBe(true)
  })

  it('fails step↔call parity when the wiring lacks the call', async () => {
    const dir = writeSpace({ parity: false })
    const code = await run(dir, 'place', true)
    expect(code).toBe(1)
    const report = lastJson()
    const check = report.checks.find((c) => c.id === 'step-call-parity')
    expect(check?.ok).toBe(false)
    expect(check?.issues[0]?.code).toBe('WIRING_STEP_WITHOUT_CALL')
  })

  it('fails payload contracts when an http step has no via', async () => {
    const dir = writeSpace({ via: false })
    const code = await run(dir, 'place', true)
    expect(code).toBe(1)
    const check = lastJson().checks.find((c) => c.id === 'payload-contracts')
    expect(check?.ok).toBe(false)
    expect(check?.issues[0]?.code).toBe('STEP_VIA_MISSING')
  })

  it('fails error mapping when an involved throw has no errorMapping row', async () => {
    const dir = writeSpace({ mapped: false })
    const code = await run(dir, 'place', true)
    expect(code).toBe(1)
    const check = lastJson().checks.find((c) => c.id === 'error-mapping')
    expect(check?.ok).toBe(false)
    expect(check?.issues[0]?.code).toBe('THROWS_UNMAPPED')
  })

  it('fails event contracts when an at-least-once subscription lacks idempotency', async () => {
    const dir = writeSpace({ idempotency: false })
    const code = await run(dir, 'place', true)
    expect(code).toBe(1)
    const check = lastJson().checks.find((c) => c.id === 'event-contracts')
    expect(check?.ok).toBe(false)
    expect(check?.issues[0]?.code).toBe('EVENT_IDEMPOTENCY_MISSING')
  })

  it('fails both the error gate and type closure on a phantom type', async () => {
    const dir = writeSpace({ returns: 'OrderRez' })
    const code = await run(dir, 'place', true)
    expect(code).toBe(1)
    const report = lastJson()
    expect(report.checks.find((c) => c.id === 'space-errors')?.ok).toBe(false)
    expect(report.checks.find((c) => c.id === 'type-closure')?.ok).toBe(false)
  })

  it('exits 2 on an unknown use case', async () => {
    const dir = writeSpace({})
    expect(await run(dir, 'nope')).toBe(2)
  })
})
