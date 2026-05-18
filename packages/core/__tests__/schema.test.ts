import { describe, expect, it } from 'vitest'
import {
  ActorSchema,
  ComponentSchema,
  IdSchema,
  ModelSchema,
  ModuleSchema,
  RefSchema,
  SpaceFileSchema,
  TableSchema,
  UseCaseSchema,
} from '../src/schema.js'

describe('IdSchema', () => {
  it('accepts kebab, camel, and snake ids', () => {
    expect(IdSchema.safeParse('user-service').success).toBe(true)
    expect(IdSchema.safeParse('UserService').success).toBe(true)
    expect(IdSchema.safeParse('user_service').success).toBe(true)
    expect(IdSchema.safeParse('user1').success).toBe(true)
  })

  it('rejects dots, slashes, and leading digits', () => {
    expect(IdSchema.safeParse('user.service').success).toBe(false)
    expect(IdSchema.safeParse('user/service').success).toBe(false)
    expect(IdSchema.safeParse('1user').success).toBe(false)
    expect(IdSchema.safeParse('').success).toBe(false)
  })
})

describe('RefSchema', () => {
  it('accepts the three top-level kinds only', () => {
    expect(RefSchema.safeParse('module:api').success).toBe(true)
    expect(RefSchema.safeParse('usecase:user-registration').success).toBe(true)
    expect(RefSchema.safeParse('actor:anon').success).toBe(true)
    expect(RefSchema.safeParse('component:Foo').success).toBe(false)
    expect(RefSchema.safeParse('table:users').success).toBe(false)
  })

  it('accepts nested segments', () => {
    const ref = 'module:auth-api/domain:users/component:UserService/method:create'
    expect(RefSchema.safeParse(ref).success).toBe(true)
  })
})

describe('ActorSchema', () => {
  it('accepts a minimal actor', () => {
    const r = ActorSchema.safeParse({ kind: 'actor', id: 'anon', name: 'Anonymous' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.type).toBe('user')
  })

  it('rejects unknown fields (strict mode)', () => {
    const r = ActorSchema.safeParse({
      kind: 'actor',
      id: 'anon',
      name: 'Anonymous',
      optinal: true,
    })
    expect(r.success).toBe(false)
  })
})

describe('ComponentSchema', () => {
  it('accepts a controller component with methods', () => {
    const r = ComponentSchema.safeParse({
      kind: 'component',
      id: 'AuthController',
      name: 'AuthController',
      type: 'controller',
      methods: [
        {
          name: 'signup',
          params: [{ name: 'body', type: 'CreateUserRequest' }],
          returns: 'RegisterResponse',
          httpMethod: 'POST',
          httpPath: '/api/auth/signup',
        },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown component type', () => {
    const r = ComponentSchema.safeParse({
      kind: 'component',
      id: 'X',
      name: 'X',
      type: 'magician',
    })
    expect(r.success).toBe(false)
  })
})

describe('ModelSchema', () => {
  it('accepts a DTO with field flags', () => {
    const r = ModelSchema.safeParse({
      kind: 'model',
      id: 'CreateUserRequest',
      name: 'CreateUserRequest',
      modelKind: 'dto',
      fields: [
        { name: 'email', type: 'string' },
        { name: 'displayName', type: 'string', optional: true },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown modelKind', () => {
    const r = ModelSchema.safeParse({
      kind: 'model',
      id: 'X',
      name: 'X',
      modelKind: 'protobuf',
      fields: [],
    })
    expect(r.success).toBe(false)
  })
})

describe('TableSchema', () => {
  it('accepts a table with foreign key', () => {
    const r = TableSchema.safeParse({
      kind: 'table',
      id: 'sessions',
      name: 'sessions',
      columns: [
        { name: 'id', sqlType: 'uuid', primaryKey: true },
        {
          name: 'user_id',
          sqlType: 'uuid',
          foreignKey: { table: 'module:db/table:users', column: 'id' },
        },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('rejects an invalid foreignKey ref', () => {
    const r = TableSchema.safeParse({
      kind: 'table',
      id: 'sessions',
      name: 'sessions',
      columns: [
        {
          name: 'user_id',
          sqlType: 'uuid',
          foreignKey: { table: 'not-a-ref', column: 'id' },
        },
      ],
    })
    expect(r.success).toBe(false)
  })
})

describe('ModuleSchema', () => {
  it('rejects an unknown module type', () => {
    const r = ModuleSchema.safeParse({ kind: 'module', id: 'x', name: 'X', type: 'microservice' })
    expect(r.success).toBe(false)
  })
})

describe('UseCaseSchema', () => {
  it('accepts a use case with invariants, error flows, and dataFlow', () => {
    const r = UseCaseSchema.safeParse({
      kind: 'usecase',
      id: 'user-registration',
      name: 'User registration',
      actor: 'actor:anon',
      trigger: 'Click',
      steps: [
        {
          from: 'module:web/component:SignupPage',
          to: 'module:api/component:AuthController',
          via: 'module:api/model:CreateUserRequest',
          protocol: 'http',
        },
      ],
      errorFlows: [
        {
          id: 'email-taken',
          condition: 'dup',
          steps: [
            {
              from: 'module:api/component:AuthController',
              to: 'module:web/component:SignupPage',
            },
          ],
        },
      ],
      invariants: { pre: ['x'], post: ['y'] },
      dataFlow: [{ sourceField: 'CreateUserRequest.email', targetField: 'users.email' }],
    })
    expect(r.success).toBe(true)
  })
})

describe('SpaceFileSchema', () => {
  it('applies default version when omitted', () => {
    const r = SpaceFileSchema.safeParse({ meta: { id: 'demo', name: 'Demo' } })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.meta.version).toBe('0.1.0')
      expect(r.data.meta.pizzaDocVersion).toBe('0.1.0')
    }
  })
})
