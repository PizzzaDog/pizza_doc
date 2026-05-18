/**
 * Contract layer (v0.3 — A1) tests.
 *
 * Covers:
 *   - Legacy ref-string `calls: ["module:foo/component:Bar"]` round-trips
 *     through Zod normalization into the object form.
 *   - New object form `calls: [{target, path, method, credential, optional}]`
 *     parses cleanly.
 *   - The four contract rules fire on hand-crafted in-memory spaces:
 *       · CONTRACT_CALL_CREDENTIAL_MISSING
 *       · CONTRACT_CALL_PATH_ORPHAN
 *       · CONTRACT_CALL_HEADER_MISMATCH
 *       · CONTRACT_CALL_ENV_MISMATCH
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateSemanticPass } from '../src/index.js'
import type { Space } from '../src/index.js'
import { CallSpecSchema, ComponentSchema } from '../src/schema.js'

describe('A1 — calls/routes schema parsing', () => {
  it('legacy ref-string calls normalize to {target, optional:false}', () => {
    const parsed = CallSpecSchema.parse('module:api/component:UserService')
    expect(parsed).toEqual({
      target: 'module:api/component:UserService',
      optional: false,
    })
  })

  it('new object form preserves contract metadata', () => {
    const parsed = CallSpecSchema.parse({
      target: 'module:api/component:InfraService',
      path: '/internal/vms',
      method: 'POST',
      credential: {
        type: 'shared-secret',
        header: 'X-Internal-Auth',
        env: 'INFRA_SERVICE_INTERNAL_AUTH',
      },
      optional: false,
    })
    expect(parsed).toMatchObject({
      target: 'module:api/component:InfraService',
      path: '/internal/vms',
      method: 'POST',
      credential: {
        type: 'shared-secret',
        header: 'X-Internal-Auth',
        env: 'INFRA_SERVICE_INTERNAL_AUTH',
      },
      optional: false,
    })
  })

  it('component routes[] parses with auth declaration', () => {
    const parsed = ComponentSchema.parse({
      kind: 'component',
      id: 'AuthFilter',
      name: 'AuthFilter',
      type: 'middleware',
      routes: [
        {
          path: '/internal/vm-tokens/verify',
          method: 'POST',
          auth: {
            type: 'shared-secret',
            header: 'X-Internal-Auth',
            env: 'BACKEND_INTERNAL_AUTH',
          },
        },
      ],
    })
    expect(parsed.routes[0]).toMatchObject({
      path: '/internal/vm-tokens/verify',
      method: 'POST',
      auth: { type: 'shared-secret', header: 'X-Internal-Auth' },
    })
  })
})

function spaceWithCallerAndCallee(args: {
  callerCall: {
    target: string
    path?: string
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    credential?: {
      type: 'shared-secret' | 'signed-token' | 'user-jwt' | 'none'
      header?: string
      env?: string
    }
    optional?: boolean
  }
  calleeRoute?: { path: string; method: string; authHeader?: string; authEnv?: string }
  calleeMethodHttp?: {
    path: string
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    authHeader?: string
    authEnv?: string
  }
}): Space {
  const calleeMethods: Space['modules'][number]['components'][number]['methods'] = []
  if (args.calleeMethodHttp) {
    const m: Space['modules'][number]['components'][number]['methods'][number] = {
      name: 'handle',
      params: [],
      returns: 'void',
      calls: [],
      throws: [],
      httpMethod: args.calleeMethodHttp.method,
      httpPath: args.calleeMethodHttp.path,
    }
    if (args.calleeMethodHttp.authHeader || args.calleeMethodHttp.authEnv) {
      m.routeAuth = { type: 'shared-secret' }
      if (args.calleeMethodHttp.authHeader) m.routeAuth.header = args.calleeMethodHttp.authHeader
      if (args.calleeMethodHttp.authEnv) m.routeAuth.env = args.calleeMethodHttp.authEnv
    }
    calleeMethods.push(m)
  }

  const calleeRoutes: Space['modules'][number]['components'][number]['routes'] = []
  if (args.calleeRoute) {
    const r: Space['modules'][number]['components'][number]['routes'][number] = {
      path: args.calleeRoute.path,
      method: args.calleeRoute.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    }
    if (args.calleeRoute.authHeader || args.calleeRoute.authEnv) {
      r.auth = { type: 'shared-secret' }
      if (args.calleeRoute.authHeader) r.auth.header = args.calleeRoute.authHeader
      if (args.calleeRoute.authEnv) r.auth.env = args.calleeRoute.authEnv
    }
    calleeRoutes.push(r)
  }

  const callerCallObject: Space['modules'][number]['components'][number]['methods'][number]['calls'][number] =
    {
      target: args.callerCall.target,
      optional: args.callerCall.optional ?? false,
    }
  if (args.callerCall.path) callerCallObject.path = args.callerCall.path
  if (args.callerCall.method) callerCallObject.method = args.callerCall.method
  if (args.callerCall.credential) callerCallObject.credential = args.callerCall.credential

  return {
    meta: { id: 'contracts', name: 'Contracts', version: '0.1.0', pizzaDocVersion: '0.3.0' },
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
        externalDeps: [],
        decisions: [],
        components: [
          {
            kind: 'component',
            id: 'Caller',
            name: 'Caller',
            type: 'service',
            routes: [],
            methods: [
              {
                name: 'run',
                params: [],
                returns: 'void',
                calls: [callerCallObject],
                throws: [],
              },
            ],
          },
          {
            kind: 'component',
            id: 'Callee',
            name: 'Callee',
            type: 'controller',
            routes: calleeRoutes,
            methods: calleeMethods,
          },
        ],
      },
    ],
    useCases: [],
    decisions: [],
  }
}

describe('A1 — contract rules', () => {
  it('CONTRACT_CALL_CREDENTIAL_MISSING fires when path call has no credential', () => {
    const space = spaceWithCallerAndCallee({
      callerCall: { target: 'module:api/component:Callee', path: '/internal/foo', method: 'POST' },
      calleeRoute: { path: '/internal/foo', method: 'POST' },
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.some((i) => i.code === 'CONTRACT_CALL_CREDENTIAL_MISSING')).toBe(true)
  })

  it('CONTRACT_CALL_CREDENTIAL_MISSING does NOT fire for legacy bare-ref calls', () => {
    // Legacy `calls: ["module:foo/component:Bar"]` shape — no path means it's
    // an ungranular legacy ref, not a contract claim.
    const space = spaceWithCallerAndCallee({
      callerCall: { target: 'module:api/component:Callee' },
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.some((i) => i.code === 'CONTRACT_CALL_CREDENTIAL_MISSING')).toBe(false)
  })

  it('CONTRACT_CALL_PATH_ORPHAN fires when no matching route exists on callee', () => {
    const space = spaceWithCallerAndCallee({
      callerCall: {
        target: 'module:api/component:Callee',
        path: '/internal/bar',
        method: 'POST',
        credential: { type: 'shared-secret', header: 'X', env: 'Y' },
      },
      calleeRoute: { path: '/internal/foo', method: 'POST' }, // different path
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.some((i) => i.code === 'CONTRACT_CALL_PATH_ORPHAN')).toBe(true)
  })

  it('CONTRACT_CALL_PATH_ORPHAN does NOT fire when matched via httpMethod/httpPath on method', () => {
    const space = spaceWithCallerAndCallee({
      callerCall: {
        target: 'module:api/component:Callee',
        path: '/internal/foo',
        method: 'POST',
        credential: { type: 'shared-secret', header: 'X', env: 'Y' },
      },
      calleeMethodHttp: { path: '/internal/foo', method: 'POST' },
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.some((i) => i.code === 'CONTRACT_CALL_PATH_ORPHAN')).toBe(false)
  })

  it('CONTRACT_CALL_HEADER_MISMATCH fires when caller header != callee auth.header', () => {
    const space = spaceWithCallerAndCallee({
      callerCall: {
        target: 'module:api/component:Callee',
        path: '/internal/foo',
        method: 'POST',
        credential: { type: 'shared-secret', header: 'X-Caller-Auth', env: 'SECRET' },
      },
      calleeRoute: {
        path: '/internal/foo',
        method: 'POST',
        authHeader: 'X-Callee-Auth',
        authEnv: 'SECRET',
      },
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.some((i) => i.code === 'CONTRACT_CALL_HEADER_MISMATCH')).toBe(true)
  })

  it('CONTRACT_CALL_ENV_MISMATCH fires when caller env != callee auth.env', () => {
    const space = spaceWithCallerAndCallee({
      callerCall: {
        target: 'module:api/component:Callee',
        path: '/internal/foo',
        method: 'POST',
        credential: { type: 'shared-secret', header: 'X-Auth', env: 'CALLER_SECRET' },
      },
      calleeRoute: {
        path: '/internal/foo',
        method: 'POST',
        authHeader: 'X-Auth',
        authEnv: 'CALLEE_SECRET',
      },
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.some((i) => i.code === 'CONTRACT_CALL_ENV_MISMATCH')).toBe(true)
  })

  it('matching caller/callee passes all contract rules', () => {
    const space = spaceWithCallerAndCallee({
      callerCall: {
        target: 'module:api/component:Callee',
        path: '/internal/foo',
        method: 'POST',
        credential: { type: 'shared-secret', header: 'X-Internal-Auth', env: 'INTERNAL_AUTH' },
      },
      calleeRoute: {
        path: '/internal/foo',
        method: 'POST',
        authHeader: 'X-Internal-Auth',
        authEnv: 'INTERNAL_AUTH',
      },
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const contractIssues = issues.filter((i) => i.code.startsWith('CONTRACT_CALL_'))
    expect(contractIssues).toEqual([])
  })
})
