import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSpace, validate } from '../dist/index.js'
import { nodeFileSystem } from '../dist/node-io.js'

/**
 * Batch E: validator-side checks for the schema additions driven by
 * production dogfooding feedback.
 *
 *   - `protocol: ws` is accepted and treated like `websocket`.
 *   - `type: middleware` is a valid http/sse/ws step target.
 *   - `composes: [<ref>]` counts the target as "used" for COMPONENT_UNUSED.
 *   - `perspective: system` opts a user-actor use case out of
 *     USECASE_FIRST_STEP_NOT_FROM_FRONTEND.
 *   - `suppress: [<code>]` per-entity drops matching issues; schema/refs
 *     codes are NOT suppressible.
 *
 * Each test writes a tiny well-formed space, runs the full pipeline, and
 * asserts on the resulting issues. We use small text fixtures rather than
 * shared scaffolds so failure output points at the exact YAML.
 */

interface Fixture {
  tmp: string
  spaceDir: string
}

function makeSpace(yamls: Record<string, string>): Fixture {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-batch-e-'))
  for (const [rel, content] of Object.entries(yamls)) {
    const full = path.join(tmp, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return { tmp, spaceDir: tmp }
}

async function run(spaceDir: string, expectedId?: string) {
  const fs = nodeFileSystem(spaceDir)
  const result = await loadSpace(fs, '.', expectedId)
  return { result, validation: validate(result) }
}

const SPACE_YAML = [
  'meta:',
  '  id: batch-e',
  '  name: Batch E',
  '  description: Test fixtures.',
  '  version: 0.1.0',
  '  pizzaDocVersion: 0.2.0',
].join('\n')

describe('protocol: ws is treated like websocket', () => {
  it('http-target rule accepts ws → consumer', async () => {
    const { spaceDir } = makeSpace({
      'space.yaml': SPACE_YAML,
      'actors/user.yaml': 'kind: actor\nid: user\nname: User\ntype: system\n',
      'modules/api/module.yaml': 'kind: module\nid: api\nname: Api\ntype: service\ntechStack: TS\n',
      'modules/api/components/EventConsumer.yaml':
        'kind: component\nid: EventConsumer\nname: EventConsumer\ntype: consumer\nmethods: []\n',
      'use-cases/stream.yaml': [
        'kind: usecase',
        'id: stream',
        'name: Stream',
        'actor: actor:user',
        'trigger: External pushes events.',
        'steps:',
        '  - from: actor:user',
        '    to: module:api/component:EventConsumer',
        '    protocol: ws',
      ].join('\n'),
    })
    const { validation } = await run(spaceDir, 'batch-e')
    const httpIssues = validation.issues.filter((i) => i.code === 'HTTP_STEP_TARGET_NOT_CONTROLLER')
    expect(httpIssues).toEqual([])
  })
})

describe('type: middleware is a valid HTTP target', () => {
  it('http-target rule accepts http → middleware', async () => {
    const { spaceDir } = makeSpace({
      'space.yaml': SPACE_YAML,
      'actors/user.yaml': 'kind: actor\nid: user\nname: User\ntype: user\n',
      'modules/web/module.yaml':
        'kind: module\nid: web\nname: Web\ntype: frontend\ntechStack: React\n',
      'modules/web/components/HomePage.yaml':
        'kind: component\nid: HomePage\nname: HomePage\ntype: page\nmethods: []\n',
      'modules/api/module.yaml': 'kind: module\nid: api\nname: Api\ntype: service\ntechStack: TS\n',
      'modules/api/components/AuthFilter.yaml':
        'kind: component\nid: AuthFilter\nname: AuthFilter\ntype: middleware\nmethods: []\n',
      'use-cases/login.yaml': [
        'kind: usecase',
        'id: login',
        'name: Login',
        'actor: actor:user',
        'trigger: User clicks login.',
        'steps:',
        '  - from: module:web/component:HomePage',
        '    to: module:api/component:AuthFilter',
        '    protocol: http',
      ].join('\n'),
    })
    const { validation } = await run(spaceDir, 'batch-e')
    const httpIssues = validation.issues.filter((i) => i.code === 'HTTP_STEP_TARGET_NOT_CONTROLLER')
    expect(httpIssues).toEqual([])
  })

  it('rejects http → service (still a real error)', async () => {
    const { spaceDir } = makeSpace({
      'space.yaml': SPACE_YAML,
      'actors/user.yaml': 'kind: actor\nid: user\nname: User\ntype: user\n',
      'modules/web/module.yaml':
        'kind: module\nid: web\nname: Web\ntype: frontend\ntechStack: React\n',
      'modules/web/components/HomePage.yaml':
        'kind: component\nid: HomePage\nname: HomePage\ntype: page\nmethods: []\n',
      'modules/api/module.yaml': 'kind: module\nid: api\nname: Api\ntype: service\ntechStack: TS\n',
      'modules/api/components/UserService.yaml':
        'kind: component\nid: UserService\nname: UserService\ntype: service\nmethods: []\n',
      'use-cases/login.yaml': [
        'kind: usecase',
        'id: login',
        'name: Login',
        'actor: actor:user',
        'trigger: User clicks login.',
        'steps:',
        '  - from: module:web/component:HomePage',
        '    to: module:api/component:UserService',
        '    protocol: http',
      ].join('\n'),
    })
    const { validation } = await run(spaceDir, 'batch-e')
    const httpIssues = validation.issues.filter((i) => i.code === 'HTTP_STEP_TARGET_NOT_CONTROLLER')
    expect(httpIssues.length).toBe(1)
    expect(httpIssues[0]?.message).toMatch(/middleware/)
  })
})

describe('composes: counts as use for COMPONENT_UNUSED', () => {
  it('a component referenced only via composes is not flagged as unused', async () => {
    const { spaceDir } = makeSpace({
      'space.yaml': SPACE_YAML,
      'actors/user.yaml': 'kind: actor\nid: user\nname: User\ntype: user\n',
      'modules/web/module.yaml':
        'kind: module\nid: web\nname: Web\ntype: frontend\ntechStack: React\n',
      'modules/web/components/ChatView.yaml': [
        'kind: component',
        'id: ChatView',
        'name: ChatView',
        'type: page',
        'composes:',
        '  - module:web/component:MessageList',
        'methods: []',
      ].join('\n'),
      'modules/web/components/MessageList.yaml':
        'kind: component\nid: MessageList\nname: MessageList\ntype: widget\nmethods: []\n',
      'use-cases/view.yaml': [
        'kind: usecase',
        'id: view',
        'name: View chat',
        'actor: actor:user',
        'trigger: User opens the chat page.',
        'steps:',
        '  - from: actor:user',
        '    to: module:web/component:ChatView',
      ].join('\n'),
    })
    const { validation } = await run(spaceDir, 'batch-e')
    const messageListUnused = validation.issues.filter(
      (i) => i.code === 'COMPONENT_UNUSED' && i.entityRef === 'module:web/component:MessageList',
    )
    expect(messageListUnused).toEqual([])
  })
})

describe('perspective: system opts out of FIRST_STEP_NOT_FROM_FRONTEND', () => {
  it('user-actor use case starting in service does NOT warn when perspective=system', async () => {
    const { spaceDir } = makeSpace({
      'space.yaml': SPACE_YAML,
      'actors/user.yaml': 'kind: actor\nid: user\nname: User\ntype: user\n',
      // Frontend module exists, so the rule is active.
      'modules/web/module.yaml':
        'kind: module\nid: web\nname: Web\ntype: frontend\ntechStack: React\n',
      'modules/web/components/HomePage.yaml':
        'kind: component\nid: HomePage\nname: HomePage\ntype: page\nmethods: []\n',
      'modules/agent/module.yaml':
        'kind: module\nid: agent\nname: Agent\ntype: service\ntechStack: Go\n',
      'modules/agent/components/Driver.yaml':
        'kind: component\nid: Driver\nname: Driver\ntype: service\nmethods: []\n',
      'use-cases/system-slice.yaml': [
        'kind: usecase',
        'id: system-slice',
        'name: System view of a user action',
        'actor: actor:user',
        'perspective: system',
        'trigger: User submits; this slice models the agent view.',
        'steps:',
        '  - from: module:agent/component:Driver',
        '    to: module:agent/component:Driver',
      ].join('\n'),
    })
    const { validation } = await run(spaceDir, 'batch-e')
    const fsIssue = validation.issues.find(
      (i) =>
        i.code === 'USECASE_FIRST_STEP_NOT_FROM_FRONTEND' && i.entityRef === 'usecase:system-slice',
    )
    expect(fsIssue).toBeUndefined()
  })

  it('without perspective, the same use case fires the warning', async () => {
    const { spaceDir } = makeSpace({
      'space.yaml': SPACE_YAML,
      'actors/user.yaml': 'kind: actor\nid: user\nname: User\ntype: user\n',
      'modules/web/module.yaml':
        'kind: module\nid: web\nname: Web\ntype: frontend\ntechStack: React\n',
      'modules/web/components/HomePage.yaml':
        'kind: component\nid: HomePage\nname: HomePage\ntype: page\nmethods: []\n',
      'modules/agent/module.yaml':
        'kind: module\nid: agent\nname: Agent\ntype: service\ntechStack: Go\n',
      'modules/agent/components/Driver.yaml':
        'kind: component\nid: Driver\nname: Driver\ntype: service\nmethods: []\n',
      'use-cases/no-perspective.yaml': [
        'kind: usecase',
        'id: no-perspective',
        'name: No perspective set',
        'actor: actor:user',
        'trigger: User submits.',
        'steps:',
        '  - from: module:agent/component:Driver',
        '    to: module:agent/component:Driver',
      ].join('\n'),
    })
    const { validation } = await run(spaceDir, 'batch-e')
    const fsIssue = validation.issues.find(
      (i) =>
        i.code === 'USECASE_FIRST_STEP_NOT_FROM_FRONTEND' &&
        i.entityRef === 'usecase:no-perspective',
    )
    expect(fsIssue).toBeDefined()
  })
})

describe('suppress: drops matching issues per entity', () => {
  it('USECASE_LAST_STEP_NOT_TERMINAL on a use case is suppressed when listed', async () => {
    // Build a use case that legitimately ends mid-stack (a fire-and-forget
    // job pattern where the rest is truly out of scope), then suppress the
    // resulting warning explicitly.
    const { spaceDir } = makeSpace({
      'space.yaml': SPACE_YAML,
      'actors/user.yaml': 'kind: actor\nid: user\nname: User\ntype: system\n',
      'modules/api/module.yaml': 'kind: module\nid: api\nname: Api\ntype: service\ntechStack: TS\n',
      'modules/api/components/Worker.yaml':
        'kind: component\nid: Worker\nname: Worker\ntype: service\nmethods: []\n',
      'use-cases/fire-forget.yaml': [
        'kind: usecase',
        'id: fire-forget',
        'name: Fire and forget',
        'actor: actor:user',
        'trigger: System enqueues a job.',
        'suppress:',
        '  - USECASE_LAST_STEP_NOT_TERMINAL',
        'steps:',
        '  - from: actor:user',
        '    to: module:api/component:Worker',
      ].join('\n'),
    })
    const { validation } = await run(spaceDir, 'batch-e')
    const lastStepIssue = validation.issues.find(
      (i) => i.code === 'USECASE_LAST_STEP_NOT_TERMINAL' && i.entityRef === 'usecase:fire-forget',
    )
    expect(lastStepIssue).toBeUndefined()
  })

  it('SCHEMA_INVALID_REF_PATTERN cannot be suppressed (structural correctness)', async () => {
    // Add a use case with a bad ref AND `suppress: [SCHEMA_INVALID_REF_PATTERN]`.
    // The suppress should not apply — schema-level codes are non-suppressible
    // because they represent broken structure, not preferences.
    const { spaceDir } = makeSpace({
      'space.yaml': SPACE_YAML,
      'actors/user.yaml': 'kind: actor\nid: user\nname: User\ntype: system\n',
      'modules/api/module.yaml': 'kind: module\nid: api\nname: Api\ntype: service\ntechStack: TS\n',
      'use-cases/bad-ref.yaml': [
        'kind: usecase',
        'id: bad-ref',
        'name: Bad ref',
        'actor: actor:user',
        'trigger: doesn’t matter.',
        'suppress:',
        '  - SCHEMA_INVALID_REF_PATTERN',
        'steps:',
        '  - from: not-a-valid-ref',
        '    to: actor:user',
      ].join('\n'),
    })
    const { validation } = await run(spaceDir, 'batch-e')
    // Schema-level errors are still reported even with suppress in place.
    const schemaIssue = validation.issues.find((i) => i.code === 'SCHEMA_INVALID_REF_PATTERN')
    expect(schemaIssue).toBeDefined()
  })
})
