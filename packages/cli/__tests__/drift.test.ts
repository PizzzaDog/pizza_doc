import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cmdDrift } from '../src/commands/drift.js'
import { parseArgs } from '../src/util/args.js'

/**
 * End-to-end `pd drift` — compares a JSONL "code snapshot" against a
 * minimal space on disk. Covers the three interesting drift cases:
 * code-only entity, space-only entity, field-level divergence.
 */

describe('pd drift --from-jsonl', () => {
  let tmp: string
  let origCwd: string
  let spaceDir: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-drift-test-'))
    spaceDir = path.join(tmp, 'spaces', 'demo')
    fs.mkdirSync(path.join(spaceDir, 'modules', 'api', 'models'), { recursive: true })
    fs.mkdirSync(path.join(spaceDir, 'actors'), { recursive: true })
    fs.writeFileSync(
      path.join(spaceDir, 'space.yaml'),
      'meta:\n  id: demo\n  name: Demo\n  version: 0.1.0\n  pizzaDocVersion: 0.2.0\n',
    )
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'module.yaml'),
      'kind: module\nid: api\nname: API\ntype: service\n',
    )
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'models', 'User.yaml'),
      'kind: model\nid: User\nname: User\nmodelKind: entity\nfields:\n  - name: id\n    type: uuid\n  - name: email\n    type: string\n',
    )
    origCwd = process.cwd()
    process.chdir(tmp)
  })

  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  function writeJsonl(lines: unknown[]): string {
    const file = path.join(tmp, 'code.jsonl')
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'))
    return file
  }

  it('reports 0 drift when snapshot matches', async () => {
    const file = writeJsonl([
      {
        kind: 'model',
        id: 'User',
        name: 'User',
        fields: [
          { name: 'id', type: 'uuid' },
          { name: 'email', type: 'string' },
        ],
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    expect(code).toBe(0)
  })

  it('flags a code-only entity as critical drift', async () => {
    const file = writeJsonl([
      {
        kind: 'model',
        id: 'User',
        name: 'User',
        fields: [
          { name: 'id', type: 'uuid' },
          { name: 'email', type: 'string' },
        ],
      },
      {
        kind: 'model',
        id: 'AuditLog',
        name: 'AuditLog',
        fields: [{ name: 'id', type: 'uuid' }],
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('AuditLog')
  })

  it('flags field drift on a shared model', async () => {
    const file = writeJsonl([
      {
        kind: 'model',
        id: 'User',
        name: 'User',
        fields: [
          { name: 'id', type: 'uuid' },
          { name: 'email', type: 'string' },
          { name: 'phoneNumber', type: 'string' }, // new
        ],
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('phoneNumber')
  })

  // ---------- rename pairing (v0.6 — code-anchoring Phase 3) ----------

  /** Space-side model citing a source file; the JSONL will rename it. */
  function writeSpaceOrderDto(fields = '  - name: id\n    type: uuid\n'): void {
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'models', 'OrderDto.yaml'),
      `kind: model\nid: OrderDto\nname: OrderDto\nmodelKind: dto\nsourceRef: src/models/order.ts:5\nfields:\n${fields}`,
    )
  }

  const matchingUser = {
    kind: 'model',
    id: 'User',
    name: 'User',
    fields: [
      { name: 'id', type: 'uuid' },
      { name: 'email', type: 'string' },
    ],
  }

  it('pairs a renamed model by sourceRef file instead of forking the report', async () => {
    writeSpaceOrderDto()
    const file = writeJsonl([
      matchingUser,
      {
        kind: 'model',
        id: 'OrderResponse',
        name: 'OrderResponse',
        sourceRef: 'src/models/order.ts:41', // line moved — must not matter
        fields: [{ name: 'id', type: 'uuid' }],
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    const out = logs.join('\n')
    expect(code).toBe(1)
    expect(out).toContain('OrderDto → OrderResponse')
    // The pair must be claimed out of both CRITICAL blocks.
    expect(out).not.toContain('space missing')
    expect(out).not.toContain('code missing')
  })

  it('computes field drift across the rename pair', async () => {
    writeSpaceOrderDto('  - name: id\n    type: uuid\n  - name: total\n    type: int\n')
    const file = writeJsonl([
      matchingUser,
      {
        kind: 'model',
        id: 'OrderResponse',
        name: 'OrderResponse',
        sourceRef: 'src/models/order.ts',
        fields: [
          { name: 'id', type: 'uuid' },
          { name: 'total', type: 'int' },
          { name: 'currency', type: 'string' }, // added while renaming
        ],
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('currency')
  })

  it('does not guess when several unmatched entities cite the same file', async () => {
    writeSpaceOrderDto()
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'models', 'OrderItemDto.yaml'),
      'kind: model\nid: OrderItemDto\nname: OrderItemDto\nmodelKind: dto\nsourceRef: src/models/order.ts:30\nfields:\n  - name: id\n    type: uuid\n',
    )
    const file = writeJsonl([
      matchingUser,
      {
        kind: 'model',
        id: 'OrderResponse',
        name: 'OrderResponse',
        sourceRef: 'src/models/order.ts:41',
        fields: [{ name: 'id', type: 'uuid' }],
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    const out = logs.join('\n')
    expect(code).toBe(1)
    // Ambiguous — falls back to the plain codeOnly/spaceOnly report.
    expect(out).not.toContain('→')
    expect(out).toContain('OrderResponse')
    expect(out).toContain('OrderDto')
  })

  // ---------- column attrs + caller idiom (v0.6 — pizza-shop audit) ----------

  /** DB module with an orders table: created_at carries DEFAULT now(). */
  function writeOrdersTable(): void {
    fs.mkdirSync(path.join(spaceDir, 'modules', 'db', 'tables'), { recursive: true })
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'db', 'module.yaml'),
      'kind: module\nid: db\nname: DB\ntype: database\n',
    )
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'db', 'tables', 'orders.yaml'),
      [
        'kind: table',
        'id: orders',
        'name: orders',
        'columns:',
        '  - name: id',
        '    sqlType: uuid',
        '    primaryKey: true',
        '  - name: created_at',
        '    sqlType: timestamptz',
        '    default: now()',
        '',
      ].join('\n'),
    )
  }

  it('flags a missing column DEFAULT when the code side knows its attrs', async () => {
    writeOrdersTable()
    const file = writeJsonl([
      matchingUser,
      {
        kind: 'table',
        id: 'orders',
        name: 'orders',
        columns: [
          { name: 'id', sqlType: 'uuid', nullable: false },
          // Explicit null = the DDL is KNOWN to have no default.
          { name: 'created_at', sqlType: 'timestamptz', default: null, nullable: false },
        ],
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    const out = logs.join('\n')
    expect(code).toBe(1)
    expect(out).toContain('created_at default: space=now() code=none')
  })

  it('stays silent on column attrs the code side does not know', async () => {
    writeOrdersTable()
    const file = writeJsonl([
      matchingUser,
      {
        kind: 'table',
        id: 'orders',
        name: 'orders',
        // No default/nullable keys at all — entity-derived extract.
        columns: [
          { name: 'id', sqlType: 'uuid' },
          { name: 'created_at', sqlType: 'timestamptz' },
        ],
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    expect(code).toBe(0)
  })

  /** Frontend module with one HTTP-calling component of the given type. */
  function writeFrontendCaller(type: string): void {
    fs.mkdirSync(path.join(spaceDir, 'modules', 'web', 'components'), { recursive: true })
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'web', 'module.yaml'),
      'kind: module\nid: web\nname: Web\ntype: frontend\n',
    )
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'web', 'components', 'apiClient.yaml'),
      [
        'kind: component',
        'id: apiClient',
        'name: apiClient',
        `type: ${type}`,
        'methods:',
        '  - name: fetchUsers',
        '    httpMethod: GET',
        '    httpPath: /api/users',
        '',
      ].join('\n'),
    )
  }

  /** Code-side mirror of apiClient so the endpoint index matches too. */
  const apiClientEntry = {
    kind: 'component',
    id: 'apiClient',
    name: 'apiClient',
    type: 'client',
    methods: [{ name: 'fetchUsers', httpMethod: 'GET', httpPath: '/api/users' }],
  }

  it('accepts an outbound call documented by the client idiom (method-level httpMethod)', async () => {
    writeFrontendCaller('client')
    const file = writeJsonl([
      matchingUser,
      apiClientEntry,
      {
        kind: 'outbound-call',
        method: 'GET',
        target_path: '/api/users',
        _placement: { module: 'web', file: 'src/apiClient.ts', line: 5 },
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    expect(logs.join('\n')).not.toContain('CALL_NOT_IN_SPEC')
    expect(code).toBe(0)
  })

  it('still drifts when the same httpMethod sits on a serving-side component', async () => {
    writeFrontendCaller('service')
    const file = writeJsonl([
      matchingUser,
      apiClientEntry,
      {
        kind: 'outbound-call',
        method: 'GET',
        target_path: '/api/users',
        _placement: { module: 'web', file: 'src/apiClient.ts', line: 5 },
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir]))
    spy.mockRestore()
    expect(logs.join('\n')).toContain('CALL_NOT_IN_SPEC')
    expect(code).toBe(1)
  })

  it('--json emits the structured diff with the rename pair', async () => {
    writeSpaceOrderDto()
    const file = writeJsonl([
      matchingUser,
      {
        kind: 'model',
        id: 'OrderResponse',
        name: 'OrderResponse',
        sourceRef: 'src/models/order.ts:41',
        fields: [{ name: 'id', type: 'uuid' }],
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdDrift(parseArgs(['--from-jsonl', file, spaceDir, '--json']))
    spy.mockRestore()
    expect(code).toBe(1)
    const report = JSON.parse(logs.join('\n')) as {
      verdict: string
      models: { codeOnly: string[]; spaceOnly: string[]; renamed: Array<Record<string, string>> }
    }
    expect(report.verdict).toBe('significant')
    expect(report.models.renamed).toEqual([
      { from: 'OrderDto', to: 'OrderResponse', file: 'src/models/order.ts' },
    ])
    expect(report.models.codeOnly).toEqual([])
    expect(report.models.spaceOnly).toEqual([])
  })
})
