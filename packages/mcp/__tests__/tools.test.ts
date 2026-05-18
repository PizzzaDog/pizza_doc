import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addActorTool, addComponentTool, addModelTool, addModuleTool } from '../src/tools/add.js'
import { explainCodeTool, explainRefTool } from '../src/tools/explain.js'
import { ALL_TOOLS, findTool } from '../src/tools/index.js'
import { searchTool } from '../src/tools/search.js'
import { validateTool } from '../src/tools/validate.js'

/**
 * MCP tool integration tests. Each test:
 *   1. mkdtemp → fresh single-space `.pizza-doc/` layout
 *   2. seed it with a minimal valid space.yaml + a few entities
 *   3. invoke the tool handler directly (no transport — we trust the
 *      stdio bridge to be a thin pass-through)
 *
 * The space scaffold here mirrors what `pd init` produces: meta + the
 * three top-level dirs. We don't generate JSON schemas for the tests
 * (not needed by the validator) and we don't ship the README either.
 */

function setupSpace(): { tmp: string; spaceDir: string } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-mcp-test-'))
  const spaceDir = path.join(tmp, '.pizza-doc')
  fs.mkdirSync(path.join(spaceDir, 'actors'), { recursive: true })
  fs.mkdirSync(path.join(spaceDir, 'modules'), { recursive: true })
  fs.mkdirSync(path.join(spaceDir, 'use-cases'), { recursive: true })
  fs.writeFileSync(
    path.join(spaceDir, 'space.yaml'),
    'meta:\n  id: demo\n  name: Demo\n  description: Test space.\n  version: 0.1.0\n  pizzaDocVersion: 0.2.0\n',
  )
  return { tmp, spaceDir }
}

describe('tool registry', () => {
  it('exposes a stable list of tools with unique names', () => {
    const names = ALL_TOOLS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    // Spot-check the top-level surface so renames break this test.
    expect(names).toEqual(
      expect.arrayContaining([
        'pd_validate',
        'pd_search',
        'pd_explain_ref',
        'pd_explain_code',
        'pd_add_actor',
        'pd_add_module',
        'pd_add_domain',
        'pd_add_component',
        'pd_add_model',
        'pd_add_table',
      ]),
    )
  })

  it('looks up tools by name and rejects unknowns', () => {
    expect(findTool('pd_validate')).toBe(validateTool)
    expect(findTool('does_not_exist')).toBeUndefined()
  })
})

describe('pd_explain_code', () => {
  it('returns the code doc for a known code', async () => {
    const out = await explainCodeTool.handler({ code: 'HTTP_STEP_TARGET_NOT_CONTROLLER' })
    expect(out.code).toBe('HTTP_STEP_TARGET_NOT_CONTROLLER')
    expect(out.doc).not.toBeNull()
    expect(out.doc?.severity).toBe('error')
    expect(out.doc?.pass).toBe('semantic')
  })

  it('returns null for an unknown code without throwing', async () => {
    const out = await explainCodeTool.handler({ code: 'NEVER_HEARD_OF_THIS' })
    expect(out.doc).toBeNull()
  })
})

describe('write tools + read tools end-to-end', () => {
  let tmp: string
  let spaceDir: string
  let origCwd: string

  beforeEach(() => {
    const setup = setupSpace()
    tmp = setup.tmp
    spaceDir = setup.spaceDir
    origCwd = process.cwd()
    // Resolve* tools default to cwd; chdir lets us test that path too.
    process.chdir(tmp)
  })

  afterEach(() => {
    process.chdir(origCwd)
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('pd_add_actor writes actors/<id>.yaml and returns the ref', async () => {
    const out = await addActorTool.handler({ id: 'end-user', type: 'user' })
    expect(out.wrote).toBe(true)
    expect(out.ref).toBe('actor:end-user')
    expect(fs.existsSync(path.join(spaceDir, 'actors', 'end-user.yaml'))).toBe(true)
    const content = fs.readFileSync(path.join(spaceDir, 'actors', 'end-user.yaml'), 'utf8')
    // Schema pragma should land on line 1 so editors pick it up.
    expect(content.split('\n')[0]).toMatch(/^# yaml-language-server: \$schema=/)
  })

  it('pd_add_module + pd_add_component nest correctly', async () => {
    const mod = await addModuleTool.handler({ id: 'api', type: 'service' })
    expect(mod.wrote).toBe(true)
    const comp = await addComponentTool.handler({
      id: 'OrderController',
      module: 'api',
      type: 'controller',
    })
    expect(comp.wrote).toBe(true)
    expect(comp.ref).toBe('module:api/component:OrderController')
    expect(
      fs.existsSync(path.join(spaceDir, 'modules', 'api', 'components', 'OrderController.yaml')),
    ).toBe(true)
  })

  it('pd_add_component supports consumer / subscriber types', async () => {
    await addModuleTool.handler({ id: 'agent', type: 'service' })
    const out = await addComponentTool.handler({
      id: 'EventConsumer',
      module: 'agent',
      type: 'consumer',
    })
    expect(out.wrote).toBe(true)
    const content = fs.readFileSync(
      path.join(spaceDir, 'modules', 'agent', 'components', 'EventConsumer.yaml'),
      'utf8',
    )
    expect(content).toMatch(/type:\s*consumer/)
  })

  it('pd_add_model with modelKind=enum requires non-empty values', async () => {
    await addModuleTool.handler({ id: 'agent', type: 'service' })
    expect(() =>
      addModelTool.handler({ id: 'RuntimeId', module: 'agent', modelKind: 'enum' }),
    ).toThrow(/non-empty values/)
    const out = await addModelTool.handler({
      id: 'RuntimeId',
      module: 'agent',
      modelKind: 'enum',
      values: ['claude-code', 'opencode'],
    })
    expect(out.wrote).toBe(true)
    const content = fs.readFileSync(
      path.join(spaceDir, 'modules', 'agent', 'models', 'RuntimeId.yaml'),
      'utf8',
    )
    expect(content).toMatch(/modelKind:\s*enum/)
    expect(content).toMatch(/- claude-code/)
  })

  it('pd_add_model rejects values: when modelKind is not enum', async () => {
    await addModuleTool.handler({ id: 'agent', type: 'service' })
    expect(() =>
      addModelTool.handler({
        id: 'NotAnEnum',
        module: 'agent',
        modelKind: 'dto',
        values: ['nope'],
      }),
    ).toThrow(/only valid for modelKind: enum/)
  })

  it('pd_validate returns structured issues + counts + summary', async () => {
    await addActorTool.handler({ id: 'end-user', type: 'user' })
    await addModuleTool.handler({ id: 'api', type: 'service' })
    const out = (await validateTool.handler({})) as Record<string, unknown> & {
      counts: Record<string, number>
      summary: Record<string, number>
      issues: { code: string }[]
    }
    expect(out.metaId).toBe('demo')
    expect(out.summary.actors).toBe(1)
    expect(out.summary.modules).toBe(1)
    expect(out.counts.errors).toBe(0)
    // No use cases yet → at least one info / warning is fine, but no errors.
    for (const i of out.issues) {
      expect(i.code).not.toMatch(/^SCHEMA_/)
    }
  })

  it('pd_search ranks id matches above description matches', async () => {
    await addModuleTool.handler({ id: 'api', type: 'service' })
    await addModuleTool.handler({
      id: 'web',
      type: 'frontend',
      description: 'mentions the api in description text',
    })
    const out = await searchTool.handler({ query: 'api' })
    expect(out.hits.length).toBeGreaterThan(0)
    // Module with id 'api' (exact match) should outrank the one that just
    // mentions the substring in its description.
    expect(out.hits[0]?.id).toBe('api')
  })

  it('pd_search filters by kind', async () => {
    await addActorTool.handler({ id: 'thing' })
    await addModuleTool.handler({ id: 'thing' })
    const justActors = await searchTool.handler({ query: 'thing', kind: 'actor' })
    expect(justActors.hits.every((h) => h.kind === 'actor')).toBe(true)
    expect(justActors.hits.length).toBe(1)
  })

  it('pd_explain_ref returns entity + relationships for a component', async () => {
    await addModuleTool.handler({ id: 'api', type: 'service' })
    await addComponentTool.handler({
      id: 'OrderController',
      module: 'api',
      type: 'controller',
    })
    const out = (await explainRefTool.handler({
      ref: 'module:api/component:OrderController',
    })) as Record<string, unknown> & {
      found: boolean
      kind?: string
      callers?: unknown
      callees?: unknown
    }
    expect(out.found).toBe(true)
    expect(out.kind).toBe('component')
    // Empty arrays are still useful — agent can branch on them.
    expect(Array.isArray(out.callers)).toBe(true)
    expect(Array.isArray(out.callees)).toBe(true)
  })

  it('pd_explain_ref reports not-found cleanly', async () => {
    const out = await explainRefTool.handler({ ref: 'module:nonsense/component:Ghost' })
    expect(out.found).toBe(false)
    expect(out.reason).toBeDefined()
  })

  it('writes refuse to clobber by default and accept force=true', async () => {
    await addActorTool.handler({ id: 'twin' })
    const second = await addActorTool.handler({ id: 'twin' })
    expect(second.wrote).toBe(false)
    expect(second.reason).toMatch(/file exists/)
    const forced = await addActorTool.handler({ id: 'twin', force: true })
    expect(forced.wrote).toBe(true)
  })
})
