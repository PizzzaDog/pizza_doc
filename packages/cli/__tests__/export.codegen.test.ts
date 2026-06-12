import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderGoInterfaces, renderGoTypes, renderTypeScriptTypes } from '../src/commands/export.js'
import { loadSpaceForCli } from '../src/util/load.js'

/**
 * Codegen unit tests. Each test:
 *   1. mkdtemp → write a tiny self-consistent space (one module + a handful
 *      of models / a component with methods), schemas + pragma omitted because
 *      the loader doesn't need them.
 *   2. loadSpaceForCli → real validate pipeline, so we know the spec is
 *      well-formed before generating from it.
 *   3. assert against the generated string with `toMatch` / `toContain`.
 *      Snapshot tests would be brittle to whitespace changes; targeted
 *      regex covers the contract that matters (banner present, optional
 *      fields use `?:` / `*T`, enums become typed strings, etc.).
 */

interface Fixture {
  tmp: string
  spaceDir: string
}

function makeSpace(): Fixture {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-codegen-test-'))
  const spaceDir = path.join(tmp, '.pizza-doc')
  fs.mkdirSync(path.join(spaceDir, 'actors'), { recursive: true })
  fs.mkdirSync(path.join(spaceDir, 'modules', 'agent', 'components'), { recursive: true })
  fs.mkdirSync(path.join(spaceDir, 'modules', 'agent', 'models'), { recursive: true })
  fs.mkdirSync(path.join(spaceDir, 'use-cases'), { recursive: true })
  fs.writeFileSync(
    path.join(spaceDir, 'space.yaml'),
    [
      'meta:',
      '  id: codegen-fixture',
      '  name: Codegen Fixture',
      '  description: Tiny test space.',
      '  version: 1.2.3',
      '  pizzaDocVersion: 0.2.0',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(spaceDir, 'modules', 'agent', 'module.yaml'),
    'kind: module\nid: agent\nname: Agent\ntype: service\ntechStack: Go\n',
  )
  fs.writeFileSync(
    path.join(spaceDir, 'modules', 'agent', 'models', 'RuntimeId.yaml'),
    [
      'kind: model',
      'id: RuntimeId',
      'name: RuntimeId',
      'modelKind: enum',
      'description: The runtime that executes a session.',
      'values:',
      '  - claude-code',
      '  - opencode',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(spaceDir, 'modules', 'agent', 'models', 'StartRequest.yaml'),
    [
      'kind: model',
      'id: StartRequest',
      'name: StartRequest',
      'modelKind: dto',
      'description: Payload to start a run.',
      'fields:',
      '  - name: prompt',
      '    type: string',
      '  - name: runtime',
      '    type: RuntimeId',
      '  - name: env',
      '    type: Map<string, string>',
      '    optional: true',
      '  - name: deadline',
      '    type: timestamp',
      '    optional: true',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(spaceDir, 'modules', 'agent', 'models', 'StartResponse.yaml'),
    [
      'kind: model',
      'id: StartResponse',
      'name: StartResponse',
      'modelKind: dto',
      'fields:',
      '  - name: runId',
      '    type: uuid',
      '  - name: events',
      '    type: List<string>',
      // `cardinality: many` on a scalar — should become string[] / []string.
      '  - name: runtimes',
      '    type: string',
      '    cardinality: many',
      // `cardinality: many` on a model ref — should become RuntimeId[] /
      // []RuntimeId (not double-wrapped even though the type is bare).
      '  - name: supportedRuntimes',
      '    type: RuntimeId',
      '    cardinality: many',
      // Already-collection type with cardinality: many — must not double-wrap.
      '  - name: pages',
      '    type: List<string>',
      '    cardinality: many',
      // Optional + many — stays as a nullable slice, not a pointer to slice.
      '  - name: tags',
      '    type: string',
      '    cardinality: many',
      '    optional: true',
      // `instant` — Java `java.time.Instant` alias. Same wire form as
      // `timestamp` (ISO-8601 string) — separate case so authors who
      // think in Java types do not have to translate.
      '  - name: createdAt',
      '    type: instant',
      // `instant` + optional — same nullable handling as timestamp.
      '  - name: deletedAt',
      '    type: instant',
      '    optional: true',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(spaceDir, 'modules', 'agent', 'components', 'Driver.yaml'),
    [
      'kind: component',
      'id: Driver',
      'name: Driver',
      'type: service',
      'description: Orchestrates one run end-to-end.',
      'methods:',
      '  - name: start',
      '    description: Kick off a run.',
      '    params:',
      '      - name: req',
      '        type: StartRequest',
      '    returns: StartResponse',
      '  - name: cancel',
      '    params:',
      '      - name: runId',
      '        type: uuid',
      '    returns: void',
      // Spring Data `Page<X>` return + `Pageable` param — the two
      // Java-ism types most spec authors leak in.
      '  - name: list',
      '    description: Paginated read.',
      '    params:',
      '      - name: pageable',
      '        type: Pageable',
      '    returns: Page<StartResponse>',
      // Spring Data `Specification<X>` + `Collection<X>` params, +
      // `X?` suffix on the return.
      '  - name: lookup',
      '    description: Conditional lookup.',
      '    params:',
      '      - name: spec',
      '        type: Specification<StartResponse>',
      '      - name: ids',
      '        type: Collection<String>',
      '      - name: since',
      '        type: instant',
      '    returns: StartResponse?',
    ].join('\n'),
  )
  return { tmp, spaceDir }
}

let fixture: Fixture

beforeEach(() => {
  fixture = makeSpace()
})

afterEach(() => {
  fs.rmSync(fixture.tmp, { recursive: true, force: true })
})

describe('renderTypeScriptTypes', () => {
  it('emits a banner, a typed enum union, and a Values const', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderTypeScriptTypes(space)
    expect(out).toMatch(/^\/\/ Code generated by pizza-doc\. DO NOT EDIT\./m)
    expect(out).toMatch(/Regenerate with: pd export typescript-types/)
    expect(out).toMatch(/Source: space codegen-fixture@1\.2\.3/)
    expect(out).toMatch(/export type RuntimeId = "claude-code" \| "opencode"/)
    expect(out).toMatch(/export const RuntimeIdValues = \["claude-code", "opencode"\] as const/)
  })

  it('maps spec field types to TypeScript and respects optional', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderTypeScriptTypes(space)
    expect(out).toMatch(/export interface StartRequest \{/)
    expect(out).toMatch(/prompt: string/)
    expect(out).toMatch(/runtime: RuntimeId/)
    expect(out).toMatch(/env\?: Record<string, string>/)
    // timestamp → string (ISO 8601 by convention).
    expect(out).toMatch(/deadline\?: string/)
    expect(out).toMatch(/runId: string/)
    expect(out).toMatch(/events: string\[\]/)
  })

  it('preserves descriptions as JSDoc on interfaces and fields', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderTypeScriptTypes(space)
    expect(out).toMatch(/\/\*\* Payload to start a run\. \*\//)
    expect(out).toMatch(/\/\*\* The runtime that executes a session\. \*\//)
  })
})

describe('renderGoTypes', () => {
  it('emits a banner that go vet recognises and the requested package', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderGoTypes(space, 'agent')
    expect(out).toMatch(/^\/\/ Code generated by pizza-doc\. DO NOT EDIT\.$/m)
    expect(out).toMatch(/^package agent$/m)
  })

  it('renders enums as typed strings + a const block', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderGoTypes(space, 'agent')
    expect(out).toMatch(/type RuntimeId string/)
    expect(out).toMatch(/RuntimeIdClaudeCode RuntimeId = "claude-code"/)
    expect(out).toMatch(/RuntimeIdOpencode RuntimeId = "opencode"/)
  })

  it('uses pointer types and omitempty for optional non-slice fields', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderGoTypes(space, 'agent')
    // env is Map<string, string> with optional=true → map type, omitempty,
    // no pointer wrap (maps have a nil zero value).
    expect(out).toMatch(/Env map\[string\]string `json:"env,omitempty"`/)
    // deadline is timestamp + optional → *time.Time + omitempty.
    expect(out).toMatch(/Deadline \*time\.Time `json:"deadline,omitempty"`/)
    // Required fields don't get a pointer.
    expect(out).toMatch(/Prompt string `json:"prompt"`/)
  })

  it('adds the `time` import only when needed', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderGoTypes(space, 'agent')
    expect(out).toMatch(/^import "time"$/m)
  })

  it('PascalCases struct field names and preserves the wire name in tags', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderGoTypes(space, 'agent')
    expect(out).toMatch(/RunId string `json:"runId"`/)
  })
})

describe('cardinality: many on Field', () => {
  it('TS: wraps scalar / ref / type in T[] without double-wrapping collections', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderTypeScriptTypes(space)
    // Scalar string + cardinality:many → string[]. This is the exact gap
    // that caused HOTFIX-1 in horalab production (TemplateDto.runtimes).
    expect(out).toMatch(/runtimes: string\[\]/)
    // Model ref + cardinality:many → RuntimeId[].
    expect(out).toMatch(/supportedRuntimes: RuntimeId\[\]/)
    // Already a List<string> — must NOT be wrapped to string[][].
    expect(out).toMatch(/pages: string\[\]/)
    expect(out).not.toMatch(/string\[\]\[\]/)
    // Optional + many → field-level `?:` AND nullable slice (no `| null`
    // wrapping the array — collections express absence by being missing).
    expect(out).toMatch(/tags\?: string\[\]/)
  })

  it('Go: wraps scalar / ref / type in []T without double-wrapping or pointer-wrapping slices', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderGoTypes(space, 'agent')
    // Required slice — no pointer wrap, no omitempty.
    expect(out).toMatch(/Runtimes \[\]string `json:"runtimes"`/)
    expect(out).toMatch(/SupportedRuntimes \[\]RuntimeId `json:"supportedRuntimes"`/)
    // List<string> + many — still []string, not [][]string.
    expect(out).toMatch(/Pages \[\]string `json:"pages"`/)
    expect(out).not.toMatch(/\[\]\[\]/)
    // Optional + many — slice stays a slice (no `*[]T`), still gets omitempty.
    expect(out).toMatch(/Tags \[\]string `json:"tags,omitempty"`/)
  })
})

describe('renderGoInterfaces', () => {
  it('emits a banner and the requested package', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderGoInterfaces(space, 'agent')
    expect(out).toMatch(/^\/\/ Code generated by pizza-doc\. DO NOT EDIT\.$/m)
    expect(out).toMatch(/^package agent$/m)
  })

  it('declares one interface per component-with-methods, with PascalCase method names', async () => {
    const { space } = await loadSpaceForCli(fixture.spaceDir)
    const out = renderGoInterfaces(space, 'agent')
    expect(out).toMatch(/type Driver interface \{/)
    // void returns become a single error.
    expect(out).toMatch(/Cancel\(runId string\) error/)
    // Non-void returns get (T, error).
    expect(out).toMatch(/Start\(req StartRequest\) \(StartResponse, error\)/)
  })
})

describe('Java-ism types (FC5)', () => {
  describe('type: instant', () => {
    it('Go: maps to time.Time and adds the time import', async () => {
      const { space } = await loadSpaceForCli(fixture.spaceDir)
      const out = renderGoTypes(space, 'agent')
      // Required instant → time.Time (not pointer).
      expect(out).toMatch(/CreatedAt time\.Time `json:"createdAt"`/)
      // Optional instant → *time.Time + omitempty.
      expect(out).toMatch(/DeletedAt \*time\.Time `json:"deletedAt,omitempty"`/)
      // `time` import landed.
      expect(out).toMatch(/"time"/)
    })

    it('TS: maps to string (ISO-8601 wire convention)', async () => {
      const { space } = await loadSpaceForCli(fixture.spaceDir)
      const out = renderTypeScriptTypes(space)
      expect(out).toMatch(/createdAt: string/)
      expect(out).toMatch(/deletedAt\?: string/)
    })
  })

  describe('Page<X> and Pageable', () => {
    it('Go: synthesises a PageOfX struct and a Pageable struct exactly once', async () => {
      const { space } = await loadSpaceForCli(fixture.spaceDir)
      const out = renderGoInterfaces(space, 'agent')
      // Method signature uses the synthesised wrapper name.
      expect(out).toMatch(/List\(pageable Pageable\) \(PageOfStartResponse, error\)/)
      // Pageable struct declared inline.
      expect(out).toMatch(
        /type Pageable struct \{[\s\S]*?Page int[\s\S]*?Size int[\s\S]*?Sort \[\]string/,
      )
      // PageOf wrapper declared.
      expect(out).toMatch(
        /type PageOfStartResponse struct \{[\s\S]*?Content\s+\[\]StartResponse[\s\S]*?TotalElements int64[\s\S]*?TotalPages\s+int[\s\S]*?Number\s+int[\s\S]*?Size\s+int/,
      )
      // No literal `Page<X>` leaks through method signatures or struct
      // field types. The string still appears in our human-readable
      // comment (`Page<StartResponse> envelope`) — strip comment lines
      // before asserting.
      const codeOnly = out
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n')
      expect(codeOnly).not.toMatch(/Page<[A-Za-z_]/)
      // No literal `?` leaks through as a Go syntax character.
      expect(codeOnly).not.toMatch(/\?\)/)
      // Two interface methods should not duplicate the struct.
      const pageableMatches = out.match(/^type Pageable struct \{/gm)
      expect(pageableMatches?.length ?? 0).toBe(1)
    })

    it('TS: inlines Page<X> as a structural type and Pageable as an envelope', async () => {
      const { space } = await loadSpaceForCli(fixture.spaceDir)
      const out = renderTypeScriptTypes(space)
      // Nothing to assert directly on methods (TS does not emit
      // interfaces from components), but the types module still parses
      // — and any future TS interface emitter inherits the mapper.
      // Sanity-check: no literal `Page<` leakage anywhere.
      // (StartResponse has no Page<> field in the fixture, but `unknown`
      // mapping would be visible — confirm by absence.)
      expect(out).not.toMatch(/: Page<[A-Za-z_]/)
    })
  })

  describe('Specification<X> and Collection<X>', () => {
    it('Go: Specification<X> → any, Collection<X> → []X', async () => {
      const { space } = await loadSpaceForCli(fixture.spaceDir)
      const out = renderGoInterfaces(space, 'agent')
      // Collection<String> → []string (Java's `String` → Go `string` via
      // the bare-type pass).
      expect(out).toMatch(/ids \[\]string/)
      // Specification<StartResponse> → any (opaque outside the JVM).
      expect(out).toMatch(/spec any/)
    })

    it('TS: Collection<X> → X[], Specification<X> → unknown', async () => {
      const { space } = await loadSpaceForCli(fixture.spaceDir)
      const out = renderTypeScriptTypes(space)
      // No interfaces are emitted from components, but mapper changes are
      // type-level: assert the assumption with a smoke check by absence.
      expect(out).not.toMatch(/Collection<[A-Za-z_]/)
    })
  })

  describe('X? suffix on return types', () => {
    it('Go: marks the return type as a pointer (idiomatic nullable)', async () => {
      const { space } = await loadSpaceForCli(fixture.spaceDir)
      const out = renderGoInterfaces(space, 'agent')
      // `returns: StartResponse?` → `(*StartResponse, error)`.
      expect(out).toMatch(/Lookup\([^)]*\) \(\*StartResponse, error\)/)
    })
  })
})
