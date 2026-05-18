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
})
