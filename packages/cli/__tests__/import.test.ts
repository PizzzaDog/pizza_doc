import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cmdImport } from '../src/commands/import.js'
import { parseArgs } from '../src/util/args.js'

/**
 * End-to-end exercises of `pd import --from-jsonl`. Each test writes a
 * small JSONL stream to a fresh temp space and checks the resulting YAML
 * files end up in the right place with the expected shape.
 */

describe('pd import --from-jsonl', () => {
  let tmp: string
  let origCwd: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-import-test-'))
    // findSpaceRoot walks up from cwd — set cwd to a directory that
    // contains `spaces/` so placement resolution has something to find.
    fs.mkdirSync(path.join(tmp, 'spaces', 'demo'), { recursive: true })
    fs.writeFileSync(
      path.join(tmp, 'spaces', 'demo', 'space.yaml'),
      'meta:\n  id: demo\n  name: Demo\n  version: 0.1.0\n  pizzaDocVersion: 0.2.0\n',
    )
    origCwd = process.cwd()
    process.chdir(tmp)
  })

  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  function writeJsonl(lines: unknown[]): string {
    const file = path.join(tmp, 'in.jsonl')
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'))
    return file
  }

  it('imports a model under the right module/domain path', async () => {
    const file = writeJsonl([
      {
        _placement: { spaceId: 'demo', module: 'api', domain: 'auth' },
        kind: 'model',
        id: 'UserDto',
        name: 'UserDto',
        modelKind: 'dto',
        fields: [{ name: 'id', type: 'uuid' }],
      },
    ])
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })
    const code = await cmdImport(parseArgs(['--from-jsonl', file]))
    spy.mockRestore()
    expect(code).toBe(0)
    const target = path.join(tmp, 'spaces/demo/modules/api/domains/auth/models/UserDto.yaml')
    expect(fs.existsSync(target)).toBe(true)
    const written = fs.readFileSync(target, 'utf8')
    expect(written).toContain('kind: model')
    expect(written).toContain('id: UserDto')
    expect(written).not.toContain('_placement')
  })

  it('imports an actor', async () => {
    const file = writeJsonl([
      {
        _placement: { spaceId: 'demo' },
        kind: 'actor',
        id: 'shopper',
        name: 'Shopper',
        type: 'user',
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdImport(parseArgs(['--from-jsonl', file]))
    spy.mockRestore()
    expect(code).toBe(0)
    const target = path.join(tmp, 'spaces/demo/actors/shopper.yaml')
    expect(fs.existsSync(target)).toBe(true)
  })

  it('imports a table under module-only placement', async () => {
    const file = writeJsonl([
      {
        _placement: { spaceId: 'demo', module: 'db' },
        kind: 'table',
        id: 'users',
        name: 'users',
        columns: [{ name: 'id', sqlType: 'uuid', primaryKey: true }],
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdImport(parseArgs(['--from-jsonl', file]))
    spy.mockRestore()
    expect(code).toBe(0)
    expect(fs.existsSync(path.join(tmp, 'spaces/demo/modules/db/tables/users.yaml'))).toBe(true)
  })

  it('imports into single-space .pizza-doc without _placement.spaceId', async () => {
    const project = path.join(tmp, 'single-project')
    const spaceDir = path.join(project, '.pizza-doc')
    fs.mkdirSync(path.join(spaceDir, 'modules', 'api'), { recursive: true })
    fs.writeFileSync(
      path.join(spaceDir, 'space.yaml'),
      'meta:\n  id: single\n  name: Single\n  version: 0.1.0\n  pizzaDocVersion: 0.3.0\n',
    )
    process.chdir(project)
    const file = writeJsonl([
      {
        _placement: { module: 'api' },
        kind: 'model',
        id: 'SingleDto',
        name: 'SingleDto',
        modelKind: 'dto',
        fields: [],
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdImport(parseArgs(['--from-jsonl', file]))
    spy.mockRestore()
    expect(code).toBe(0)
    expect(fs.existsSync(path.join(spaceDir, 'modules/api/models/SingleDto.yaml'))).toBe(true)
  })

  it('honors --space-dir as an explicit import target', async () => {
    const spaceDir = path.join(tmp, 'explicit-space')
    fs.mkdirSync(path.join(spaceDir, 'modules', 'api'), { recursive: true })
    fs.writeFileSync(
      path.join(spaceDir, 'space.yaml'),
      'meta:\n  id: explicit\n  name: Explicit\n  version: 0.1.0\n  pizzaDocVersion: 0.3.0\n',
    )
    const file = writeJsonl([
      {
        _placement: { module: 'api' },
        kind: 'component',
        id: 'Worker',
        name: 'Worker',
        type: 'service',
        methods: [],
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdImport(parseArgs(['--from-jsonl', file, '--space-dir', spaceDir]))
    spy.mockRestore()
    expect(code).toBe(0)
    expect(fs.existsSync(path.join(spaceDir, 'modules/api/components/Worker.yaml'))).toBe(true)
  })

  it('refuses to overwrite without --force', async () => {
    const existing = path.join(tmp, 'spaces/demo/modules/api/models/UserDto.yaml')
    fs.mkdirSync(path.dirname(existing), { recursive: true })
    fs.writeFileSync(existing, 'kind: model\nid: UserDto\n')
    const file = writeJsonl([
      {
        _placement: { spaceId: 'demo', module: 'api' },
        kind: 'model',
        id: 'UserDto',
        name: 'UserDto',
        modelKind: 'dto',
        fields: [],
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdImport(parseArgs(['--from-jsonl', file]))
    spy.mockRestore()
    // Exit 0: we write nothing but don't error.
    expect(code).toBe(0)
    // The existing file stays untouched.
    expect(fs.readFileSync(existing, 'utf8')).toBe('kind: model\nid: UserDto\n')
  })

  it('merges keyed arrays and preserves existing fields with --merge', async () => {
    const existing = path.join(tmp, 'spaces/demo/modules/api/models/UserDto.yaml')
    fs.mkdirSync(path.dirname(existing), { recursive: true })
    fs.writeFileSync(
      existing,
      [
        'kind: model',
        'id: UserDto',
        'name: UserDto',
        'modelKind: dto',
        'description: manually tuned',
        'fields:',
        '  - name: id',
        '    type: uuid',
        '    description: stable id',
        '',
      ].join('\n'),
    )
    const file = writeJsonl([
      {
        _placement: { spaceId: 'demo', module: 'api' },
        kind: 'model',
        id: 'UserDto',
        name: 'UserDto',
        modelKind: 'dto',
        fields: [
          { name: 'id', type: 'uuid' },
          { name: 'email', type: 'string' },
        ],
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdImport(parseArgs(['--from-jsonl', file, '--merge']))
    spy.mockRestore()
    expect(code).toBe(0)
    const written = fs.readFileSync(existing, 'utf8')
    expect(written).toContain('description: manually tuned')
    expect(written).toContain('description: stable id')
    expect(written).toContain('name: email')
  })

  it('accepts malformed JSON on one line and bails without writes', async () => {
    const file = path.join(tmp, 'bad.jsonl')
    fs.writeFileSync(
      file,
      '{"_placement":{"spaceId":"demo","module":"api"},"kind":"model","id":"OK","name":"OK","modelKind":"dto","fields":[]}\nnot-json\n',
    )
    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '))
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdImport(parseArgs(['--from-jsonl', file]))
    spy.mockRestore()
    logSpy.mockRestore()
    expect(code).toBe(1)
    expect(errors.some((e) => e.includes('invalid JSON'))).toBe(true)
    // The valid line didn't get imported because of the transactional stop.
    expect(fs.existsSync(path.join(tmp, 'spaces/demo/modules/api/models/OK.yaml'))).toBe(false)
  })

  it('dry-run prints a plan without writing', async () => {
    const file = writeJsonl([
      {
        _placement: { spaceId: 'demo', module: 'api' },
        kind: 'model',
        id: 'DryDto',
        name: 'DryDto',
        modelKind: 'dto',
        fields: [],
      },
    ])
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const code = await cmdImport(parseArgs(['--from-jsonl', file, '--dry-run']))
    spy.mockRestore()
    expect(code).toBe(0)
    expect(fs.existsSync(path.join(tmp, 'spaces/demo/modules/api/models/DryDto.yaml'))).toBe(false)
  })
})
