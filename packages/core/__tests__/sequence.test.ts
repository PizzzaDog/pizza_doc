import { describe, expect, it } from 'vitest'
import { buildSequenceModel } from '../src/index.js'
import type { Component, LevelView, Space, UseCase } from '../src/index.js'
import { loadFixture } from './helpers.js'

/**
 * Load `usecase-simple` and pull out its sole use case. Assertions inside;
 * callers get a narrowed pair — saves every test from `.space!` / `.find()!`
 * gymnastics.
 */
async function loadUsecaseSimple(): Promise<{ space: Space; useCase: UseCase }> {
  const { result } = await loadFixture('valid', 'usecase-simple')
  if (!result.space) throw new Error('usecase-simple fixture did not produce a space')
  const useCase = result.space.useCases.find((u) => u.id === 'user-registration')
  if (!useCase) throw new Error('user-registration use case missing from fixture')
  return { space: result.space, useCase }
}

function expectLevelView<T extends LevelView | undefined>(view: T): NonNullable<T> {
  if (!view) throw new Error('expected a LevelView, got undefined')
  return view as NonNullable<T>
}

describe('buildSequenceModel — L0 (tiers)', () => {
  it('aggregates modules into tier participants by module.type', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { tiers } = buildSequenceModel(useCase, space).main
    const ids = tiers.participants.map((p) => p.id)

    // usecase-simple has module:web (frontend) + module:api (service →
    // backend); actor:anon leads.
    expect(ids).toContain('actor:anon')
    expect(ids).toContain('tier:frontend')
    expect(ids).toContain('tier:backend')
    expect(ids).not.toContain('tier:database')
  })

  it('skips intra-tier hops (e.g. a service calling another service)', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { tiers } = buildSequenceModel(useCase, space).main
    // usecase-simple step 2 is `api→api`, which stays inside `tier:backend`.
    const intraTier = tiers.messages.filter(
      (m) => m.kind === 'call' && m.from === m.to && m.from === 'tier:backend',
    )
    expect(intraTier).toHaveLength(0)
  })

  it('marks every tier participant as having deeper content', async () => {
    const { space, useCase } = await loadUsecaseSimple()
    const { tiers } = buildSequenceModel(useCase, space).main
    for (const p of tiers.participants) {
      if (p.kind === 'actor') continue
      expect(p.hasDeeper).toBe(true)
    }
  })

  it('routes database-typed modules into tier:database', () => {
    // Synthetic space with a database module; step-driven so the tier
    // appears in the use case.
    const space: Space = {
      meta: { id: 's', name: 's', version: '0.1.0', pizzaDocVersion: '0.1.0' },
      actors: [{ kind: 'actor', id: 'anon', name: 'Anon', type: 'user' }],
      modules: [
        {
          kind: 'module',
          id: 'web',
          name: 'web',
          type: 'frontend',
          domains: [],
          components: [{ kind: 'component', id: 'Page', name: 'Page', type: 'page', methods: [] }],
          models: [],
          tables: [],
        },
        {
          kind: 'module',
          id: 'pg',
          name: 'pg',
          type: 'database',
          domains: [],
          components: [],
          models: [],
          tables: [{ kind: 'table', id: 'orders', name: 'orders', columns: [], indexes: [] }],
        },
      ],
      useCases: [
        {
          kind: 'usecase',
          id: 'u',
          name: 'u',
          actor: 'actor:anon',
          trigger: 't',
          steps: [
            {
              from: 'module:web/component:Page',
              to: 'module:pg/table:orders',
              protocol: 'sql',
            },
          ],
          errorFlows: [],
          invariants: { pre: [], post: [] },
          dataFlow: [],
        },
      ],
    }

    const model = buildSequenceModel(space.useCases[0] as UseCase, space)
    const ids = model.main.tiers.participants.map((p) => p.id)
    expect(ids).toContain('tier:frontend')
    expect(ids).toContain('tier:database')
  })
})

describe('buildSequenceModel — L1 (modules)', () => {
  it('includes the actor and every module touched by steps', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const model = buildSequenceModel(useCase, space)
    const ids = model.main.modules.participants.map((p) => p.id)

    // actor:anon first, then modules in step order.
    expect(ids[0]).toBe('actor:anon')
    expect(ids).toContain('module:web')
    expect(ids).toContain('module:api')
  })

  it('synthesises actor → first-module entry at step 0 (inferred)', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { messages } = buildSequenceModel(useCase, space).main.modules
    const entry = messages[0]
    expect(entry?.from).toBe('actor:anon')
    expect(entry?.to).toBe('module:web')
    expect(entry?.inferred).toBe(true)
    expect(entry?.stepIndex).toBeUndefined()
  })

  it('skips intra-module hops at L1 (step 2 is api→api, must not appear)', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { messages } = buildSequenceModel(useCase, space).main.modules
    const selfLoops = messages.filter(
      (m) => m.kind === 'call' && m.from === 'module:api' && m.to === 'module:api',
    )
    expect(selfLoops).toHaveLength(0)
  })

  it('emits the web→api cross-module step with its http protocol + via DTO', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { messages } = buildSequenceModel(useCase, space).main.modules
    const crossing = messages.find(
      (m) => m.from === 'module:web' && m.to === 'module:api' && m.kind === 'call',
    )
    expect(crossing).toBeDefined()
    expect(crossing?.protocol).toBe('http')
    expect(crossing?.viaDtoRef).toBe('module:api/model:CreateUserRequest')
    expect(crossing?.stepIndex).toBe(1)
  })

  it('drains the stack back to the actor at end of flow', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { messages } = buildSequenceModel(useCase, space).main.modules
    const last = messages[messages.length - 1]
    expect(last?.kind).toBe('return')
    expect(last?.to).toBe('actor:anon')
    expect(last?.inferred).toBe(true)
  })
})

describe('buildSequenceModel — L2 (components per module)', () => {
  it('emits a view for every touched module', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { components } = buildSequenceModel(useCase, space).main
    expect(components.has('web')).toBe(true)
    expect(components.has('api')).toBe(true)
  })

  it('lists components in step order inside a module', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const apiView = expectLevelView(buildSequenceModel(useCase, space).main.components.get('api'))
    const labels = apiView.participants.filter((p) => p.kind === 'component').map((p) => p.label)
    expect(labels).toEqual(['AuthController', 'UserService'])
  })

  it('keeps intra-module arrows with step indices', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const apiView = expectLevelView(buildSequenceModel(useCase, space).main.components.get('api'))
    const ctrl = 'module:api/component:AuthController'
    const svc = 'module:api/component:UserService'
    const forward = apiView.messages.find(
      (m) => m.kind === 'call' && m.from === ctrl && m.to === svc,
    )
    expect(forward).toBeDefined()
    expect(forward?.stepIndex).toBe(2)
    expect(forward?.viaDtoRef).toBe('module:api/model:CreateUserRequest')
  })

  it('renders direct cross-module refs as context module participants', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const webView = expectLevelView(buildSequenceModel(useCase, space).main.components.get('web'))
    const apiContext = webView.participants.find((p) => p.id === 'module:api')
    expect(apiContext?.label).toBe('API')
    expect(apiContext?.kind).toBe('module')
    expect(apiContext?.hasDeeper).toBe(false)

    const crossing = webView.messages.find(
      (m) =>
        m.kind === 'call' && m.from === 'module:web/component:SignupPage' && m.to === 'module:api',
    )
    expect(crossing?.stepIndex).toBe(1)
  })

  it('skips steps whose both sides are in sibling modules', () => {
    // A use case with three steps: step 1 is entirely inside web, step 2
    // crosses into api, step 3 is entirely inside api. When we open L2 of
    // the `api` module, step 1 must NOT appear as a full-width
    // gutter→gutter arrow — it doesn't touch this module at all.
    const space = syntheticSpaceWithMethodCalls()
    const useCase: UseCase = {
      ...(space.useCases[0] as UseCase),
      steps: [
        {
          from: 'module:web/component:LoginPage',
          to: 'module:web/component:authClient',
          protocol: 'internal-call',
        },
        {
          from: 'module:web/component:authClient',
          to: 'module:api/component:UserService',
          protocol: 'http',
        },
        {
          from: 'module:api/component:UserService',
          to: 'module:api/component:UserRepository',
          protocol: 'internal-call',
        },
      ],
    }
    // Add the web components to the synthetic space so L1 builds cleanly.
    const spaceWithWeb: Space = {
      ...space,
      modules: [
        ...space.modules,
        {
          kind: 'module',
          id: 'web',
          name: 'web',
          type: 'frontend',
          domains: [],
          components: [
            {
              kind: 'component',
              id: 'LoginPage',
              name: 'LoginPage',
              type: 'page',
              methods: [],
            },
            {
              kind: 'component',
              id: 'authClient',
              name: 'authClient',
              type: 'client',
              methods: [],
            },
          ],
          models: [],
          tables: [],
        },
      ],
    }

    const apiView = expectLevelView(
      buildSequenceModel(useCase, spaceWithWeb).main.components.get('api'),
    )

    // Step 1 (web→web) must be absent from the api view.
    const fullGutterHop = apiView.messages.find(
      (m) => m.from.startsWith('gutter:') && m.to.startsWith('gutter:'),
    )
    expect(fullGutterHop).toBeUndefined()

    // Step 2 stays (ingress from web to UserService) and step 3 stays
    // (internal api).
    const stepIndices = apiView.messages
      .filter((m) => typeof m.stepIndex === 'number')
      .map((m) => m.stepIndex)
    expect(stepIndices).toContain(2)
    expect(stepIndices).toContain(3)
    expect(stepIndices).not.toContain(1)
  })
})

describe('buildSequenceModel — L3 (methods)', () => {
  it('is empty when no touched component has any calls', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { methods } = buildSequenceModel(useCase, space).main
    expect(methods.size).toBe(0)
  })

  it('emits a method-level view + call-graph edges for components with calls', () => {
    const space = syntheticSpaceWithMethodCalls()
    const useCase = space.useCases[0]
    if (!useCase) throw new Error('synthetic fixture missing use case')
    const { methods } = buildSequenceModel(useCase, space).main

    const userServiceKey = 'module:api/component:UserService'
    const view = expectLevelView(methods.get(userServiceKey))

    const methodIds = view.participants.map((p) => p.id)
    expect(methodIds).toContain(`${userServiceKey}/method:create`)

    const internalEdges = view.messages.filter(
      (m) => !m.to.startsWith('gutter:') && !m.from.startsWith('gutter:'),
    )
    expect(internalEdges.length).toBeGreaterThan(0)
  })

  it('renders cross-component method calls as labelled target participants', () => {
    const space = syntheticSpaceWithMethodCalls()
    const useCase = space.useCases[0]
    if (!useCase) throw new Error('synthetic fixture missing use case')
    const { methods } = buildSequenceModel(useCase, space).main

    const userServiceKey = 'module:api/component:UserService'
    const view = expectLevelView(methods.get(userServiceKey))

    const targetIds = view.participants.map((p) => p.id)
    expect(targetIds).toContain('module:api/component:UserRepository/method:save')
    expect(targetIds).toContain('module:api/component:PasswordHasher/method:hash')

    const labels = view.participants.map((p) => p.label)
    expect(labels).toContain('UserRepository.save')
    expect(labels).toContain('PasswordHasher.hash')

    expect(view.messages).toContainEqual(
      expect.objectContaining({
        from: 'module:api/component:UserService/method:create',
        to: 'module:api/component:UserRepository/method:save',
        description: 'UserRepository.save',
      }),
    )
  })
})

describe('buildSequenceModel — participants & affordance', () => {
  it('sets hasDeeper=true on L1 module participants that have touched components', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const { participants } = buildSequenceModel(useCase, space).main.modules
    const api = participants.find((p) => p.id === 'module:api')
    expect(api?.hasDeeper).toBe(true)
  })

  it('sets hasDeeper=false on L2 components whose methods have no calls', async () => {
    const { space, useCase } = await loadUsecaseSimple()

    const apiView = expectLevelView(buildSequenceModel(useCase, space).main.components.get('api'))
    for (const p of apiView.participants) {
      // usecase-simple's components have no `calls` → leaves at L3.
      expect(p.hasDeeper).toBe(false)
    }
  })

  it('sets hasDeeper=true on L2 components whose methods have calls', () => {
    const space = syntheticSpaceWithMethodCalls()
    const useCase = space.useCases[0]
    if (!useCase) throw new Error('synthetic fixture missing use case')
    const apiView = expectLevelView(buildSequenceModel(useCase, space).main.components.get('api'))
    const svc = apiView.participants.find((p) => p.label === 'UserService')
    expect(svc?.hasDeeper).toBe(true)
  })
})

describe('buildSequenceModel — error flows', () => {
  it('renders each errorFlow as its own Flow keyed by id', () => {
    const space = syntheticSpaceWithMethodCalls()
    const base = space.useCases[0]
    if (!base) throw new Error('synthetic fixture missing use case')
    const withError: UseCase = {
      ...base,
      errorFlows: [
        {
          id: 'email-taken',
          condition: 'Repo returns duplicate-key',
          steps: [
            {
              from: 'module:api/component:UserService',
              to: 'module:api/component:AuthController',
              protocol: 'internal-call',
            },
          ],
          resultDescription: 'Throws EmailTakenException',
        },
      ],
    }

    const model = buildSequenceModel(withError, space)
    expect(model.errorFlows).toHaveLength(1)
    const first = model.errorFlows[0]
    expect(first?.id).toBe('email-taken')
    expect(first?.condition).toBe('Repo returns duplicate-key')
    expect(first?.resultDescription).toBe('Throws EmailTakenException')
    expect(first?.flow.modules.participants.length ?? 0).toBeGreaterThan(0)
  })
})

// ---------- Fixtures inline ----------

/**
 * Minimal space with a `UserService.create` method that calls a sibling
 * component method AND a peer method on itself. Used for L3 and hasDeeper
 * affordance tests that `usecase-simple` can't exercise.
 */
function syntheticSpaceWithMethodCalls(): Space {
  const userService: Component = {
    kind: 'component',
    id: 'UserService',
    name: 'UserService',
    type: 'service',
    methods: [
      {
        name: 'create',
        params: [{ name: 'email', type: 'string', required: true }],
        returns: 'User',
        calls: [
          // Internal self-call — validates before touching the DB.
          // v0.3 object form (A1): legacy YAML strings get normalized to
          // `{target, optional}` at parse time; hand-crafted fixtures pass
          // the already-normalized object.
          { target: 'module:api/component:UserService/method:validate', optional: false },
          { target: 'module:api/component:UserRepository/method:save', optional: false },
          { target: 'module:api/component:PasswordHasher/method:hash', optional: false },
        ],
        throws: [],
      },
      {
        name: 'validate',
        params: [{ name: 'email', type: 'string', required: true }],
        returns: 'boolean',
        calls: [],
        throws: [],
      },
    ],
  }
  const userRepo: Component = {
    kind: 'component',
    id: 'UserRepository',
    name: 'UserRepository',
    type: 'repository',
    methods: [
      {
        name: 'save',
        params: [],
        returns: 'void',
        calls: [],
        throws: [],
      },
    ],
  }
  const hasher: Component = {
    kind: 'component',
    id: 'PasswordHasher',
    name: 'PasswordHasher',
    type: 'infrastructure',
    methods: [
      {
        name: 'hash',
        params: [{ name: 'plaintext', type: 'string', required: true }],
        returns: 'string',
        calls: [],
        throws: [],
      },
    ],
  }

  const useCase: UseCase = {
    kind: 'usecase',
    id: 'register',
    name: 'Register',
    actor: 'actor:anon',
    trigger: 'Clicking sign up',
    steps: [
      {
        from: 'module:api/component:UserService',
        to: 'module:api/component:UserRepository',
        protocol: 'internal-call',
      },
    ],
    errorFlows: [],
    invariants: { pre: [], post: [] },
    dataFlow: [],
  }

  return {
    meta: {
      id: 'synth',
      name: 'synth',
      version: '0.1.0',
      pizzaDocVersion: '0.1.0',
    },
    actors: [
      {
        kind: 'actor',
        id: 'anon',
        name: 'Anon',
        type: 'user',
      },
    ],
    modules: [
      {
        kind: 'module',
        id: 'api',
        name: 'api',
        type: 'service',
        domains: [],
        components: [userService, userRepo, hasher],
        models: [],
        tables: [],
      },
    ],
    useCases: [useCase],
  }
}
