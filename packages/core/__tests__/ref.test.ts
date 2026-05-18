import { describe, expect, it } from 'vitest'
import { buildRefIndex, formatRef, parseRef } from '../src/ref.js'
import type { Space } from '../src/schema.js'

describe('parseRef / formatRef', () => {
  it('round-trips a deep ref', () => {
    const ref = 'module:auth-api/domain:users/component:UserService/method:create'
    const parsed = parseRef(ref)
    expect(parsed).not.toBeNull()
    if (parsed) expect(formatRef(parsed)).toBe(ref)
  })

  it('rejects refs with unknown kinds', () => {
    expect(parseRef('pizza:shop')).toBeNull()
    expect(parseRef('module:api/weird:stuff')).toBeNull()
  })

  it('rejects malformed segments', () => {
    expect(parseRef('')).toBeNull()
    expect(parseRef('module:')).toBeNull()
    expect(parseRef('not-a-ref')).toBeNull()
  })

  it('refuses a non-top-level first segment', () => {
    expect(parseRef('component:Foo')).toBeNull()
    expect(parseRef('method:x')).toBeNull()
  })
})

describe('buildRefIndex', () => {
  const space: Space = {
    meta: { id: 'demo', name: 'Demo', version: '0.1.0', pizzaDocVersion: '0.1.0' },
    actors: [{ kind: 'actor', id: 'anon', name: 'Anon', type: 'user' }],
    useCases: [],
    modules: [
      {
        kind: 'module',
        id: 'api',
        name: 'API',
        type: 'service',
        domains: [
          {
            id: 'users',
            name: 'Users',
            components: [
              {
                kind: 'component',
                id: 'UserService',
                name: 'UserService',
                type: 'service',
                methods: [{ name: 'create', params: [], returns: 'User', calls: [], throws: [] }],
              },
            ],
            models: [],
            tables: [],
          },
        ],
        components: [],
        models: [],
        tables: [],
      },
    ],
  }

  const index = buildRefIndex(space)

  it('indexes every layer', () => {
    expect(index.has('actor:anon')).toBe(true)
    expect(index.has('module:api')).toBe(true)
    expect(index.has('module:api/domain:users')).toBe(true)
    expect(index.has('module:api/domain:users/component:UserService')).toBe(true)
    expect(index.has('module:api/domain:users/component:UserService/method:create')).toBe(true)
  })

  it('tags each target with its kind', () => {
    expect(index.get('actor:anon')?.kind).toBe('actor')
    expect(index.get('module:api/domain:users')?.kind).toBe('domain')
    expect(index.get('module:api/domain:users/component:UserService')?.kind).toBe('component')
  })

  it('lists refs of a given kind', () => {
    const actors = index.refsOfKind('actor')
    expect(actors).toEqual(['actor:anon'])
  })
})
