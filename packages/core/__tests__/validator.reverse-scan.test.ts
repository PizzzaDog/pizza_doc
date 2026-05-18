import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateRefsPass, validateSemanticPass } from '../src/index.js'
import type { Module, Space } from '../src/index.js'

function baseSpace(overrides: Partial<Space>): Space {
  const space = {
    meta: {
      id: 'reverse-scan',
      name: 'Reverse Scan',
      version: '0.1.0',
      pizzaDocVersion: '0.3.0',
    },
    actors: [{ kind: 'actor', id: 'sys', name: 'System', type: 'system' }],
    modules: [],
    useCases: [],
    decisions: [],
    ...overrides,
  }
  return {
    ...space,
    modules: space.modules.map(withModuleDefaults),
  }
}

function withModuleDefaults(module: Module): Module {
  return {
    domains: [],
    components: [],
    models: [],
    tables: [],
    configMap: [],
    externalDeps: [],
    decisions: [],
    ...module,
  }
}

describe('reverse-generation validator affordances', () => {
  it('allows component-level calls when an extractor cannot resolve the exact method', () => {
    const space = baseSpace({
      modules: [
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          domains: [],
          models: [],
          tables: [],
          components: [
            {
              kind: 'component',
              id: 'Caller',
              name: 'Caller',
              type: 'service',
              methods: [
                {
                  name: 'run',
                  params: [],
                  returns: 'void',
                  calls: [{ target: 'module:api/component:Callee', optional: false }],
                  throws: [],
                },
              ],
            },
            { kind: 'component', id: 'Callee', name: 'Callee', type: 'service', methods: [] },
          ],
        },
      ],
    })
    const result = validateRefsPass(space)
    expect(result.issues.filter((i) => i.code === 'REF_WRONG_KIND')).toEqual([])
  })

  it('treats queue and bare external module refs as terminal boundaries', () => {
    const space = baseSpace({
      modules: [
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          domains: [],
          components: [],
          models: [],
          tables: [],
        },
        {
          kind: 'module',
          id: 'broker',
          name: 'Broker',
          type: 'queue',
          domains: [],
          components: [],
          models: [],
          tables: [],
        },
        {
          kind: 'module',
          id: 'stripe',
          name: 'Stripe',
          type: 'external',
          domains: [],
          components: [],
          models: [],
          tables: [],
        },
      ],
      useCases: [
        {
          kind: 'usecase',
          id: 'publish',
          name: 'Publish event',
          actor: 'actor:sys',
          trigger: 'event',
          steps: [{ from: 'actor:sys', to: 'module:broker', protocol: 'event' }],
          errorFlows: [],
          invariants: { pre: [], post: [] },
          dataFlow: [],
        },
        {
          kind: 'usecase',
          id: 'charge',
          name: 'Charge',
          actor: 'actor:sys',
          trigger: 'payment',
          steps: [{ from: 'actor:sys', to: 'module:stripe', protocol: 'external-api' }],
          errorFlows: [],
          invariants: { pre: [], post: [] },
          dataFlow: [],
        },
      ],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.filter((i) => i.code === 'USECASE_LAST_STEP_NOT_TERMINAL')).toEqual([])
  })

  it('accepts path/query/header/const dataFlow sources', () => {
    const space = baseSpace({
      modules: [
        {
          kind: 'module',
          id: 'db',
          name: 'DB',
          type: 'database',
          domains: [],
          components: [],
          models: [],
          tables: [
            {
              kind: 'table',
              id: 'users',
              name: 'users',
              columns: [
                {
                  name: 'tenant_id',
                  sqlType: 'uuid',
                  primaryKey: false,
                  nullable: false,
                  unique: false,
                },
              ],
              indexes: [],
            },
          ],
        },
      ],
      useCases: [
        {
          kind: 'usecase',
          id: 'tenant',
          name: 'Tenant',
          actor: 'actor:sys',
          trigger: 'request',
          steps: [{ from: 'actor:sys', to: 'module:db/table:users', protocol: 'sql' }],
          errorFlows: [],
          invariants: { pre: [], post: [] },
          dataFlow: [
            { sourceField: 'path.tenantId', targetField: 'users.tenant_id', cardinality: 'one' },
            { sourceField: 'query:page', targetField: 'queue:audit', cardinality: 'one' },
            {
              sourceField: 'header:X-Tenant',
              targetField: 'http-header:X-Tenant',
              cardinality: 'one',
            },
            { sourceField: 'const:ACTIVE', targetField: 'model:Status.value', cardinality: 'one' },
          ],
        },
      ],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.filter((i) => i.code === 'DATAFLOW_SOURCE_FIELD_MISSING')).toEqual([])
  })

  it('resolves targetField through persistedAs and treats enum models as enum columns', () => {
    const space = baseSpace({
      modules: [
        {
          kind: 'module',
          id: 'api',
          name: 'API',
          type: 'service',
          domains: [],
          components: [],
          tables: [],
          models: [
            {
              kind: 'model',
              id: 'TenantType',
              name: 'TenantType',
              modelKind: 'enum',
              fields: [],
              values: ['FREE', 'PRO'],
            },
            {
              kind: 'model',
              id: 'User',
              name: 'User',
              modelKind: 'entity',
              persistedAs: 'module:db/table:users',
              fields: [
                { name: 'tenantType', type: 'TenantType', optional: false, persisted: true },
                { name: 'organisation1Id', type: 'uuid', optional: false, persisted: true },
              ],
            },
          ],
        },
        {
          kind: 'module',
          id: 'db',
          name: 'DB',
          type: 'database',
          domains: [],
          components: [],
          models: [],
          tables: [
            {
              kind: 'table',
              id: 'users',
              name: 'users',
              columns: [
                {
                  name: 'tenant_type',
                  sqlType: 'enum',
                  primaryKey: false,
                  nullable: false,
                  unique: false,
                },
                {
                  name: 'organisation_1_id',
                  sqlType: 'uuid',
                  primaryKey: false,
                  nullable: false,
                  unique: false,
                },
              ],
              indexes: [],
            },
          ],
        },
      ],
      useCases: [
        {
          kind: 'usecase',
          id: 'write-user',
          name: 'Write user',
          actor: 'actor:sys',
          trigger: 'request',
          steps: [{ from: 'actor:sys', to: 'module:db/table:users', protocol: 'sql' }],
          errorFlows: [],
          invariants: { pre: [], post: [] },
          dataFlow: [
            { sourceField: 'User.tenantType', targetField: 'User.tenant_type', cardinality: 'one' },
            {
              sourceField: 'User.organisation1Id',
              targetField: 'User.organisation_1_id',
              cardinality: 'one',
            },
          ],
        },
      ],
    })
    const issues = validateSemanticPass(space, buildRefIndex(space))
    expect(issues.filter((i) => i.code === 'DATAFLOW_TARGET_FIELD_MISSING')).toEqual([])
    expect(issues.filter((i) => i.code === 'DATAFLOW_TYPE_INCOMPATIBLE')).toEqual([])
    expect(issues.filter((i) => i.code === 'MODEL_FIELD_MISSING_COLUMN')).toEqual([])
  })
})
