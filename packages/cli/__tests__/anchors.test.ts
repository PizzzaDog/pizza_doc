import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cmdAnchors, parseSourceRef } from '../src/commands/anchors.js'
import { parseArgs } from '../src/util/args.js'

/**
 * `pd anchors` — deterministic sourceRef resolver. Walks every sourceRef in
 * a minimal space and checks it resolves to a real file under --code-root.
 * Covers: resolves, broken (file gone), stale line, --require-all adoption
 * gate, and the design-first (no anchors) pass-through.
 */

describe('pd anchors', () => {
  let tmp: string
  let spaceDir: string
  let logs: string[]

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-anchors-test-'))
    spaceDir = path.join(tmp, 'spaces', 'demo')
    fs.mkdirSync(path.join(spaceDir, 'modules', 'api', 'models'), { recursive: true })
    fs.writeFileSync(
      path.join(spaceDir, 'space.yaml'),
      'meta:\n  id: demo\n  name: Demo\n  version: 0.1.0\n  pizzaDocVersion: 0.5.0\n',
    )
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'module.yaml'),
      'kind: module\nid: api\nname: API\ntype: service\n',
    )
    // A real "code" file, 3 lines long, under the code-root (= tmp).
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'src', 'User.ts'), 'export interface User {\n  id: string\n}\n')

    logs = []
    vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
      logs.push(String(m))
    })
    vi.spyOn(console, 'error').mockImplementation((m?: unknown) => {
      logs.push(String(m))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  function writeModel(sourceRef: string | null): void {
    const src = sourceRef ? `\nsourceRef: ${sourceRef}\n` : '\n'
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'models', 'User.yaml'),
      `kind: model\nid: User\nname: User\nmodelKind: entity${src}fields:\n  - name: id\n    type: string\n`,
    )
  }

  function run(...extra: string[]): Promise<number> {
    return cmdAnchors(parseArgs([spaceDir, '--code-root', tmp, '--json', ...extra]))
  }

  function report(): {
    checked: number
    resolved: number
    broken: number
    staleLines: number
    missing: number
    unknownModuleRoots: string[]
    issues: Array<{ severity: string; ref: string; reason: string }>
  } {
    const json = logs.find((l) => l.trim().startsWith('{'))
    if (!json) throw new Error(`no JSON report in output:\n${logs.join('\n')}`)
    return JSON.parse(json)
  }

  it('exit 0 when a sourceRef resolves to a real file', async () => {
    writeModel('src/User.ts')
    const code = await run()
    expect(code).toBe(0)
    const r = report()
    expect(r.checked).toBe(1)
    expect(r.resolved).toBe(1)
    expect(r.broken).toBe(0)
  })

  it('exit 1 and BROKEN when sourceRef points at a missing file', async () => {
    writeModel('src/Ghost.ts')
    const code = await run()
    expect(code).toBe(1)
    const r = report()
    expect(r.broken).toBe(1)
    expect(r.issues[0]?.severity).toBe('broken')
    expect(r.issues[0]?.ref).toBe('module:api/model:User')
  })

  it('exit 0 but flags a stale line when :line exceeds file length', async () => {
    writeModel('src/User.ts:999')
    const code = await run()
    expect(code).toBe(0) // file exists → resolved; stale line is a warning
    const r = report()
    expect(r.staleLines).toBe(1)
    expect(r.broken).toBe(0)
    expect(r.issues[0]?.severity).toBe('stale-line')
  })

  it('accepts an in-range :line', async () => {
    writeModel('src/User.ts:2')
    const code = await run()
    expect(code).toBe(0)
    expect(report().staleLines).toBe(0)
  })

  it('design-first space (no anchors) passes without --require-all', async () => {
    writeModel(null)
    const code = await run()
    expect(code).toBe(0)
    expect(report().checked).toBe(0)
  })

  it('--require-all flags a code-backed entity that has no sourceRef', async () => {
    writeModel(null)
    const code = await run('--require-all')
    expect(code).toBe(1)
    const r = report()
    expect(r.missing).toBe(1)
    expect(
      r.issues.some((i) => i.severity === 'missing' && i.ref === 'module:api/model:User'),
    ).toBe(true)
  })

  // --module-root: multi-repo workspaces where the space lives in an
  // aggregate root but modules are their own checkouts in subfolders.
  it('module-relative sourceRef breaks on a single code-root and resolves with --module-root', async () => {
    fs.mkdirSync(path.join(tmp, 'be', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'be', 'lib', 'Impl.ts'), 'export const impl = 1\n')
    writeModel('lib/Impl.ts') // valid only relative to <tmp>/be

    expect(await run()).toBe(1)
    expect(report().broken).toBe(1)

    logs = []
    expect(await run('--module-root', 'api=be')).toBe(0)
    const r = report()
    expect(r.resolved).toBe(1)
    expect(r.broken).toBe(0)
  })

  it('a genuinely broken ref stays broken even with a module-root mapping', async () => {
    fs.mkdirSync(path.join(tmp, 'be'), { recursive: true })
    writeModel('lib/Ghost.ts')
    expect(await run('--module-root', 'api=be')).toBe(1)
    const r = report()
    expect(r.broken).toBe(1)
    expect(r.issues[0]?.reason).toContain("tried module root 'be'")
  })

  it('falls back to --code-root, so workspace-relative refs in a mapped module still resolve', async () => {
    fs.mkdirSync(path.join(tmp, 'be'), { recursive: true })
    writeModel('src/User.ts') // valid relative to <tmp>, NOT to <tmp>/be
    expect(await run('--module-root', 'api=be')).toBe(0)
    expect(report().resolved).toBe(1)
  })

  it('repeats --module-root and warns on a mapping that matches no module', async () => {
    fs.mkdirSync(path.join(tmp, 'be', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'be', 'lib', 'Impl.ts'), 'export const impl = 1\n')
    writeModel('lib/Impl.ts')
    expect(await run('--module-root', 'api=be', '--module-root', 'ghost=nowhere')).toBe(0)
    expect(report().unknownModuleRoots).toEqual(['ghost'])
  })

  it('exit 2 on a malformed --module-root spec', async () => {
    writeModel('src/User.ts')
    expect(await run('--module-root', 'api')).toBe(2)
    expect(logs.join('\n')).toContain('--module-root expects <module-id>=<dir>')
  })

  it('walks nested anchors like entrypoint.sourceRef, not just top-level ones', async () => {
    writeModel('src/User.ts') // resolvable
    const compDir = path.join(spaceDir, 'modules', 'api', 'components')
    fs.mkdirSync(compDir, { recursive: true })
    fs.writeFileSync(
      path.join(compDir, 'AppRoot.yaml'),
      'kind: component\nid: AppRoot\nname: AppRoot\ntype: page\n' +
        'entrypoint:\n  kind: composition-root\n  reason: mounted by router\n  sourceRef: src/Ghost.ts\n',
    )
    const code = await run()
    expect(code).toBe(1)
    const r = report()
    expect(
      r.issues.some(
        (i) => i.ref === 'module:api/component:AppRoot/entrypoint' && i.severity === 'broken',
      ),
    ).toBe(true)
  })
})

describe('parseSourceRef', () => {
  it('splits a trailing :line', () => {
    expect(parseSourceRef('src/Foo.ts:42')).toEqual({ filePath: 'src/Foo.ts', line: 42 })
  })
  it('keeps a path with no line suffix', () => {
    expect(parseSourceRef('src/Foo.ts')).toEqual({ filePath: 'src/Foo.ts' })
  })
  it('does not treat a non-numeric tail as a line', () => {
    expect(parseSourceRef('pkg/a:b/Foo.ts')).toEqual({ filePath: 'pkg/a:b/Foo.ts' })
  })
})
