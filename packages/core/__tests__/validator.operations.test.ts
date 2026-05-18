import { describe, expect, it } from 'vitest'
import {
  type Module,
  type Space,
  buildRefIndex,
  evaluateReadiness,
  validateSemanticPass,
} from '../src/index.js'
import { hasCode, loadFixture } from './helpers.js'

/**
 * Pass-3 operations rules: CONFIG_KEY_DUPLICATE / CONFIG_SECRET_SOURCE_UNRESOLVED /
 * CONFIG_RUNTIME_NO_ADMIN_UI / CONFIG_RELATED_BROKEN / EXTERNAL_DEP_USES_UNKNOWN_CONFIG /
 * EXTERNAL_DEP_ARG_CONTRACT_INVALID / ADR_BROKEN_LINK / ADR_DUPLICATE_ID.
 *
 * Each test builds the smallest possible Space that triggers (or refuses
 * to trigger) one rule, runs the full Pass-3 pipeline, and asserts the
 * presence/absence of the specific code. We use the assembled Space type
 * directly rather than going through the loader — the loader is tested
 * separately in loader.test.ts. This keeps these unit tests cheap.
 */

function emptyModule(id: string, overrides: Partial<Module> = {}): Module {
  return {
    kind: 'module',
    id,
    name: id,
    type: 'service',
    domains: [],
    components: [],
    models: [],
    tables: [],
    errorMapping: [],
    configMap: [],
    externalDeps: [],
    decisions: [],
    ...overrides,
  } as Module
}

function spaceWith(modules: Module[], overrides: Partial<Space> = {}): Space {
  return {
    meta: {
      id: 'test',
      name: 'Test',
      version: '0.1.0',
      pizzaDocVersion: '0.3.0',
    },
    actors: [],
    modules,
    useCases: [],
    decisions: [],
    ...overrides,
  } as Space
}

function codes(space: Space): string[] {
  const index = buildRefIndex(space)
  return validateSemanticPass(space, index).map((i) => i.code)
}

function readinessCodes(space: Space): string[] {
  return evaluateReadiness(space, {
    issues: [],
    passes: { schema: true, refs: true, semantic: true },
  }).issues.map((i) => i.code)
}

describe('CONFIG_KEY_DUPLICATE', () => {
  it('fires when two entries share a key inside one module', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'GOOGLE_CLIENT_ID',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: [],
          },
          {
            key: 'GOOGLE_CLIENT_ID',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: [],
          },
        ],
      }),
    ])
    expect(codes(space)).toContain('CONFIG_KEY_DUPLICATE')
  })

  it('does NOT fire across modules', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'GOOGLE_CLIENT_ID',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: [],
          },
        ],
      }),
      emptyModule('frontend', {
        type: 'frontend',
        configMap: [
          {
            key: 'GOOGLE_CLIENT_ID',
            type: 'non-secret',
            lifecycle: 'build',
            mutability: 'rotatable',
            consumer: { component: 'module:frontend' },
            related: [],
          },
        ],
      }),
    ])
    expect(codes(space)).not.toContain('CONFIG_KEY_DUPLICATE')
  })
})

describe('CONFIG_SECRET_SOURCE_UNRESOLVED', () => {
  it('fires when a secret has no sourceOfTruth', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'API_KEY',
            type: 'secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: [],
          },
        ],
      }),
    ])
    expect(codes(space)).toContain('CONFIG_SECRET_SOURCE_UNRESOLVED')
  })

  it('fires on placeholder values like "tbd"', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'API_KEY',
            type: 'secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: [],
            sourceOfTruth: 'tbd',
          },
        ],
      }),
    ])
    expect(codes(space)).toContain('CONFIG_SECRET_SOURCE_UNRESOLVED')
  })

  it('does NOT fire when sourceOfTruth is set on a secret', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'API_KEY',
            type: 'secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: [],
            sourceOfTruth: 'vault:secret/acme/api-key',
          },
        ],
      }),
    ])
    expect(codes(space)).not.toContain('CONFIG_SECRET_SOURCE_UNRESOLVED')
  })

  it('does NOT fire on non-secrets even without sourceOfTruth', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'PORT',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: [],
          },
        ],
      }),
    ])
    expect(codes(space)).not.toContain('CONFIG_SECRET_SOURCE_UNRESOLVED')
  })
})

describe('CONFIG_RUNTIME_NO_ADMIN_UI', () => {
  it('warns when a runtime entry is not referenced by any component', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'FEATURE_FLAG_X',
            type: 'non-secret',
            lifecycle: 'runtime',
            mutability: 'hot-reload',
            consumer: { component: 'module:backend' },
            related: [],
          },
        ],
      }),
    ])
    expect(codes(space)).toContain('CONFIG_RUNTIME_NO_ADMIN_UI')
  })

  it('does NOT warn when a component method mentions the key', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'FEATURE_FLAG_X',
            type: 'non-secret',
            lifecycle: 'runtime',
            mutability: 'hot-reload',
            consumer: { component: 'module:backend' },
            related: [],
          },
        ],
        components: [
          {
            kind: 'component',
            id: 'AdminApi',
            name: 'AdminApi',
            type: 'controller',
            methods: [
              {
                name: 'setFeatureFlag',
                description: 'Sets FEATURE_FLAG_X at runtime.',
                params: [],
                returns: 'void',
                calls: [],
                throws: [],
              },
            ],
          },
        ],
      }),
    ])
    expect(codes(space)).not.toContain('CONFIG_RUNTIME_NO_ADMIN_UI')
  })
})

describe('CONFIG_RELATED_BROKEN', () => {
  it('fires for a bare key that does not exist within the module', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'A',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: ['B'],
          },
        ],
      }),
    ])
    expect(codes(space)).toContain('CONFIG_RELATED_BROKEN')
  })

  it('resolves cross-module refs via config-map:<MODULE>/<KEY>', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'GOOGLE_CLIENT_ID',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: ['config-map:frontend/VITE_GOOGLE_CLIENT_ID'],
          },
        ],
      }),
      emptyModule('frontend', {
        type: 'frontend',
        configMap: [
          {
            key: 'VITE_GOOGLE_CLIENT_ID',
            type: 'non-secret',
            lifecycle: 'build',
            mutability: 'rotatable',
            consumer: { component: 'module:frontend' },
            related: [],
          },
        ],
      }),
    ])
    expect(codes(space)).not.toContain('CONFIG_RELATED_BROKEN')
  })
})

describe('READINESS_CONFIG_DEFAULT_DRIFT', () => {
  it('fires when a declared default differs from an implementation default', () => {
    const space = spaceWith([
      emptyModule('worker-service', {
        configMap: [
          {
            key: 'WORKER_ROOT',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:worker-service' },
            related: [],
            defaultValue: '/var/lib/workers',
            defaultSources: [
              {
                source: 'code',
                value: '/var/lib/old-workers',
                sourceRef: 'services/worker/src/config.ts:22',
              },
            ],
          },
        ],
      }),
    ])
    expect(readinessCodes(space)).toContain('READINESS_CONFIG_DEFAULT_DRIFT')
  })

  it('fires when observed defaults disagree and no defaultValue chooses one source of truth', () => {
    const space = spaceWith([
      emptyModule('worker-service', {
        configMap: [
          {
            key: 'WORKER_ROOT',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:worker-service' },
            related: [],
            defaultSources: [
              {
                source: 'code',
                value: '/var/lib/old-workers',
                sourceRef: 'services/worker/src/config.ts:22',
              },
              {
                source: 'script',
                value: '/var/lib/workers',
                sourceRef: 'scripts/provision-worker.sh:10',
              },
            ],
          },
        ],
      }),
    ])
    expect(readinessCodes(space)).toContain('READINESS_CONFIG_DEFAULT_DRIFT')
  })

  it('does NOT fire when declared and observed defaults match', () => {
    const space = spaceWith([
      emptyModule('worker-service', {
        configMap: [
          {
            key: 'WORKER_ROOT',
            type: 'non-secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:worker-service' },
            related: [],
            defaultValue: '/var/lib/workers',
            defaultSources: [
              {
                source: 'code',
                value: '/var/lib/workers',
                sourceRef: 'services/worker/src/config.ts:22',
              },
              {
                source: 'script',
                value: '/var/lib/workers',
                sourceRef: 'scripts/provision-worker.sh:10',
              },
            ],
          },
        ],
      }),
    ])
    expect(readinessCodes(space)).not.toContain('READINESS_CONFIG_DEFAULT_DRIFT')
  })
})

describe('EXTERNAL_DEP_USES_UNKNOWN_CONFIG', () => {
  it('errors when usesConfigKey points at a non-existent key', () => {
    const space = spaceWith([
      emptyModule('backend', {
        externalDeps: [
          {
            name: 'openrouter',
            direction: 'outbound',
            protocol: 'https',
            endpoint: 'api.openrouter.ai',
            consumer: 'module:backend',
            auth: 'bearer',
            usesConfigKey: 'OPENROUTER_API_KEY',
          },
        ],
      }),
    ])
    expect(codes(space)).toContain('EXTERNAL_DEP_USES_UNKNOWN_CONFIG')
  })

  it('warns when bearer auth has no usesConfigKey at all', () => {
    const space = spaceWith([
      emptyModule('backend', {
        externalDeps: [
          {
            name: 'openrouter',
            direction: 'outbound',
            protocol: 'https',
            endpoint: 'api.openrouter.ai',
            consumer: 'module:backend',
            auth: 'bearer',
          },
        ],
      }),
    ])
    expect(codes(space)).toContain('EXTERNAL_DEP_USES_UNKNOWN_CONFIG')
  })

  it('does NOT warn for auth: none', () => {
    const space = spaceWith([
      emptyModule('backend', {
        externalDeps: [
          {
            name: 'public-api',
            direction: 'outbound',
            protocol: 'https',
            endpoint: 'api.example.com',
            consumer: 'module:backend',
            auth: 'none',
          },
        ],
      }),
    ])
    expect(codes(space)).not.toContain('EXTERNAL_DEP_USES_UNKNOWN_CONFIG')
  })

  it('does NOT error when usesConfigKey points at a real key', () => {
    const space = spaceWith([
      emptyModule('backend', {
        configMap: [
          {
            key: 'OPENROUTER_API_KEY',
            type: 'secret',
            lifecycle: 'startup',
            mutability: 'rotatable',
            consumer: { component: 'module:backend' },
            related: [],
            sourceOfTruth: 'vault:secret/example/openrouter',
          },
        ],
        externalDeps: [
          {
            name: 'openrouter',
            direction: 'outbound',
            protocol: 'https',
            endpoint: 'api.openrouter.ai',
            consumer: 'module:backend',
            auth: 'bearer',
            usesConfigKey: 'OPENROUTER_API_KEY',
          },
        ],
      }),
    ])
    expect(codes(space)).not.toContain('EXTERNAL_DEP_USES_UNKNOWN_CONFIG')
  })
})

describe('EXTERNAL_DEP_ARG_CONTRACT', () => {
  it('fails a required nonempty arg with an empty defaultValue', () => {
    const space = spaceWith([
      emptyModule('worker-service', {
        externalDeps: [
          {
            name: 'legacy-worker-provision-script',
            direction: 'outbound',
            protocol: 'exec',
            endpoint: '/opt/example/provision-worker.sh',
            consumer: 'module:worker-service',
            auth: 'none',
            preflightCheck: {
              sourceRef: 'services/worker/src/preflight.ts#checkHostAssets',
            },
            positionalArgs: {
              name: 'LegacyWorkerArgs',
              contractTest: {
                sourceRef: 'services/worker/src/legacy-adapter.test.ts:91',
              },
              args: [
                { position: 1, name: 'worker_id', type: 'string', nonempty: true },
                { position: 2, name: 'slot_id', type: 'positive-int' },
                { position: 3, name: 'worker_token', type: 'secret', nonempty: true },
                { position: 4, name: 'memory_mib', type: 'positive-int' },
                { position: 5, name: 'job_name', type: 'string', nonempty: true },
                {
                  position: 6,
                  name: 'resource_profile',
                  type: 'string',
                  nonempty: true,
                  defaultValue: '',
                },
                {
                  position: 7,
                  name: 'runtime',
                  type: 'enum',
                  enumValues: ['RUNTIME_API', 'RUNTIME_OAUTH'],
                },
              ],
            },
          },
        ],
      }),
    ])
    expect(codes(space)).toContain('EXTERNAL_DEP_ARG_CONTRACT_INVALID')
  })

  it('accepts a legacy exec argv contract with a test and valid defaults', () => {
    const space = spaceWith([
      emptyModule('worker-service', {
        externalDeps: [
          {
            name: 'legacy-worker-provision-script',
            direction: 'outbound',
            protocol: 'exec',
            endpoint: '/opt/example/provision-worker.sh',
            consumer: 'module:worker-service',
            auth: 'none',
            preflightCheck: {
              sourceRef: 'services/worker/src/preflight.ts#checkHostAssets',
            },
            positionalArgs: {
              name: 'LegacyWorkerArgs',
              contractTest: {
                sourceRef: 'services/worker/src/legacy-adapter.test.ts:91',
              },
              args: [
                { position: 1, name: 'worker_id', type: 'string', nonempty: true },
                { position: 2, name: 'slot_id', type: 'positive-int' },
                { position: 3, name: 'worker_token', type: 'secret', nonempty: true, secret: true },
                { position: 4, name: 'memory_mib', type: 'positive-int' },
                { position: 5, name: 'job_name', type: 'string', nonempty: true },
                { position: 6, name: 'resource_profile', type: 'string', nonempty: true },
                {
                  position: 7,
                  name: 'runtime',
                  type: 'enum',
                  enumValues: ['RUNTIME_API', 'RUNTIME_OAUTH'],
                },
                { position: 8, name: 'worker_count', type: 'positive-int', defaultValue: 1 },
                {
                  position: 9,
                  name: 'runtime_auth_data_json',
                  type: 'json-object',
                  defaultValue: '{}',
                },
              ],
            },
          },
        ],
      }),
    ])
    const found = codes(space)
    expect(found).not.toContain('EXTERNAL_DEP_ARG_CONTRACT_INVALID')
  })
})

describe('operations contract fixtures', () => {
  it('full validation fails an exec argv contract with an empty required arg', async () => {
    const { validation } = await loadFixture(
      'invalid',
      'EXTERNAL_DEP_ARG_CONTRACT_INVALID_EMPTY_ARG',
    )
    expect(hasCode(validation.issues, 'EXTERNAL_DEP_ARG_CONTRACT_INVALID')).toBe(true)
  })

  it('full validation accepts a covered exec argv + host asset contract', async () => {
    const { validation } = await loadFixture('valid', 'operations-contract-exec-boundary')
    const errors = validation.issues.filter((i) => i.severity === 'error')
    expect(errors).toEqual([])
  })
})

describe('ADR_BROKEN_LINK', () => {
  it('fires when module references an ADR that does not exist', () => {
    const space = spaceWith([emptyModule('backend', { decisions: ['ADR-007'] })])
    expect(codes(space)).toContain('ADR_BROKEN_LINK')
  })

  it('does NOT fire when the ADR is in space.decisions', () => {
    const space = spaceWith([emptyModule('backend', { decisions: ['ADR-007'] })], {
      decisions: [
        {
          id: 'ADR-007',
          title: 'Choose Postgres',
          status: 'accepted',
          supersedes: [],
          path: 'decisions/ADR-007-postgres.md',
        },
      ],
    })
    expect(codes(space)).not.toContain('ADR_BROKEN_LINK')
  })
})

describe('ADR_DUPLICATE_ID', () => {
  it('fires when two ADR files declare the same id', () => {
    const space = spaceWith([], {
      decisions: [
        {
          id: 'ADR-007',
          title: 'A',
          status: 'accepted',
          supersedes: [],
          path: 'decisions/ADR-007-a.md',
        },
        {
          id: 'ADR-007',
          title: 'B',
          status: 'accepted',
          supersedes: [],
          path: 'decisions/ADR-007-b.md',
        },
      ],
    })
    expect(codes(space)).toContain('ADR_DUPLICATE_ID')
  })
})
