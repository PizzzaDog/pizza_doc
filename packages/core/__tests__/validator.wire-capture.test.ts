/**
 * Wire capture (v0.5 — B3) tests.
 *
 * Covers:
 *   - Schema parses `wireCapture` with `scenarios` and rejects malformed
 *     dates.
 *   - `WIRE_CAPTURE_MISSING` fires when a component is the `consumer:` of
 *     an `http-api` external-dep but lacks wireCapture.
 *   - Does not fire on host-binary / apt-package deps (they have no
 *     consumer ref to begin with — schema-level — but defensive check).
 *   - Module-level `consumer: 'module:X'` refs don't trigger the rule
 *     (no single owner to require capture from).
 *   - wireCapture present → no issue.
 *
 * File-system codes (WIRE_CAPTURE_PATH_BROKEN / _STALE) are tested via
 * CLI integration tests in packages/cli/__tests__/.
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateSemanticPass } from '../src/index.js'
import type { Space } from '../src/index.js'
import { ComponentSchema, WireCaptureSchema } from '../src/schema.js'

describe('B3 — WireCaptureSchema', () => {
  it('parses a typical capture envelope', () => {
    const parsed = WireCaptureSchema.parse({
      source: 'curl-live',
      path: '.pizza-doc/wire-captures/openrouter/anthropic-endturn.txt',
      capturedAt: '2026-05-15',
      capturedAgainst: 'openrouter@v1.234',
      scenarios: [
        {
          name: 'anthropic, end_turn',
          assertions: { promptTokens: 353, completionTokens: 11 },
        },
      ],
    })
    expect(parsed.source).toBe('curl-live')
    expect(parsed.scenarios).toHaveLength(1)
  })

  it('rejects a non-ISO date in capturedAt', () => {
    expect(() =>
      WireCaptureSchema.parse({
        source: 'curl-live',
        path: 'x',
        capturedAt: 'last Tuesday',
      }),
    ).toThrow()
  })

  it('lets Component.wireCapture be omitted', () => {
    const parsed = ComponentSchema.parse({
      kind: 'component',
      id: 'Plain',
      name: 'Plain',
      type: 'service',
    })
    expect(parsed.wireCapture).toBeUndefined()
  })
})

interface SpaceArgs {
  componentHasWireCapture?: boolean
  depKind?: 'http-api' | 'host-binary' | undefined
  consumerRef?: string
}

function makeSpace(args: SpaceArgs = {}): Space {
  const wireCapture =
    args.componentHasWireCapture === true
      ? {
          source: 'curl-live',
          path: '.pizza-doc/wire-captures/x.txt',
          capturedAt: '2026-05-01',
          scenarios: [],
        }
      : undefined

  const component: Space['modules'][number]['components'][number] = {
    kind: 'component',
    id: 'Parser',
    name: 'Parser',
    type: 'service',
    routes: [],
    methods: [],
    ...(wireCapture ? { wireCapture } : {}),
  }

  const consumerRef = args.consumerRef ?? 'module:api/component:Parser'
  const depKind = args.depKind ?? 'http-api'

  const externalDeps: Space['modules'][number]['externalDeps'] = []
  if (depKind === 'http-api') {
    externalDeps.push({
      kind: 'http-api',
      name: 'openrouter',
      direction: 'outbound',
      protocol: 'https',
      endpoint: 'https://openrouter.ai',
      consumer: consumerRef,
      auth: 'bearer',
    })
  } else if (depKind === 'host-binary') {
    externalDeps.push({
      kind: 'host-binary',
      name: 'firecracker',
      install_path: '/usr/local/bin/firecracker',
      required_in_profiles: [],
    })
  }

  return {
    meta: { id: 'b3', name: 'B3', version: '0.1.0', pizzaDocVersion: '0.5.0' },
    actors: [],
    modules: [
      {
        kind: 'module',
        id: 'api',
        name: 'API',
        type: 'service',
        domains: [],
        models: [],
        tables: [],
        errorMapping: [],
        configMap: [],
        externalDeps,
        decisions: [],
        components: [component],
      },
    ],
    useCases: [],
    decisions: [],
  }
}

describe('B3 — WIRE_CAPTURE_MISSING', () => {
  it('fires when http-api dep consumer has no wireCapture', () => {
    const space = makeSpace({ componentHasWireCapture: false })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const hit = issues.filter((i) => i.code === 'WIRE_CAPTURE_MISSING')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.severity).toBe('warning')
    expect(hit[0]?.message).toContain('openrouter')
  })

  it('does not fire when component has wireCapture', () => {
    const space = makeSpace({ componentHasWireCapture: true })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'WIRE_CAPTURE_MISSING')).toHaveLength(0)
  })

  it('does not fire on host-binary deps', () => {
    const space = makeSpace({ depKind: 'host-binary', componentHasWireCapture: false })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'WIRE_CAPTURE_MISSING')).toHaveLength(0)
  })

  it('does not fire when consumer is a module-level ref (no single component owner)', () => {
    const space = makeSpace({ consumerRef: 'module:api', componentHasWireCapture: false })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'WIRE_CAPTURE_MISSING')).toHaveLength(0)
  })
})
