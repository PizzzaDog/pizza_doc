import type { ValidationCode } from '@pizza-doc/core'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, red, yellow } from '../util/colors.js'

export interface CodeDoc {
  severity: 'error' | 'warning' | 'info'
  pass: string
  summary: string
  causes: string[]
  example?: string
  fix?: string
}

/**
 * Exported for `scripts/gen-validation-rules.mjs`, which renders this map
 * into docs/site …/reference/validation-rules.md — the site page stays
 * mechanically in sync with `pd lint --explain`.
 */
export const DOCS: Record<ValidationCode, CodeDoc> = {
  YAML_PARSE_ERROR: {
    severity: 'error',
    pass: 'parse',
    summary: 'The YAML file is syntactically broken before Pizza Doc even sees its shape.',
    causes: [
      'Tab vs space indentation mix.',
      'Unterminated string or unclosed bracket.',
      'A field value that needs quoting (starts with !, &, *, %, etc.).',
    ],
    fix: 'The error message includes line/column. Fix that location and re-run pd validate.',
  },
  FILE_UNRECOGNIZED: {
    severity: 'info',
    pass: 'parse',
    summary: "A .yaml file lives in a path the loader doesn't classify; it's skipped.",
    causes: [
      "Note files in actors/, modules/, etc. that aren't entity declarations.",
      'Stray YAML in unexpected places.',
    ],
    fix: 'Move the file out of the recognized layout, or rename it to match an entity slot.',
  },
  CHANGE_NOT_FOUND: {
    severity: 'error',
    pass: 'change-set',
    summary: 'The requested change-set has no changes/<id>/change.yaml file.',
    causes: ['Typo in --change id.', 'The change was not initialized in this space.'],
    fix: 'Run `pd change list`, or create it with `pd change init <id> --title "..."`.',
  },
  CHANGE_SCHEMA_INVALID: {
    severity: 'error',
    pass: 'change-set',
    summary: 'The change.yaml metadata does not match the change-set schema.',
    causes: ['Unknown field, invalid status, or wrong field type in change.yaml.'],
    fix: 'Keep metadata to id, title, status, createdAt, owner, scope, implementation, deletes, adoptedAt, rejectedAt.',
  },
  CHANGE_FILENAME_ID_MISMATCH: {
    severity: 'error',
    pass: 'change-set',
    summary: 'The change folder name and change.yaml id disagree.',
    causes: [
      'Renamed changes/<id>/ without updating change.yaml, or copied metadata from another change.',
    ],
    fix: 'Rename the folder or update change.yaml so both ids match.',
  },
  CHANGE_DELETE_PATH_INVALID: {
    severity: 'error',
    pass: 'change-set',
    summary: 'A delete path escapes the space or is not a canonical relative path.',
    causes: ['Absolute path, ../ segment, or empty delete path.'],
    fix: 'Use a space-relative path such as modules/api/components/OldController.yaml.',
  },
  SCHEMA_UNKNOWN_FIELD: {
    severity: 'error',
    pass: 'schema',
    summary: 'You added a field that the strict Zod schema does not allow.',
    causes: [
      'Common invented fields: owner, team, tags, status, version (these do not exist on entities).',
      'Typo on a real field (e.g. returnType instead of returns).',
    ],
    fix: 'Check the field list in packages/core/src/schema.ts. If a field is not there, it is not real — drop it or use the right one.',
  },
  SCHEMA_MISSING_REQUIRED: {
    severity: 'error',
    pass: 'schema',
    summary: 'A required field is missing from this entity.',
    causes: [
      'Most entities need: kind, id, name. Models also need modelKind and fields.',
      'Tables need columns. Use cases need actor, trigger, steps.',
    ],
    fix: 'Add the field. The error message names the path.',
  },
  SCHEMA_WRONG_TYPE: {
    severity: 'error',
    pass: 'schema',
    summary: 'A field has the wrong shape (string vs object, scalar vs array, etc.).',
    causes: [
      'Used scalar where object expected (e.g. methods: foo instead of methods: [{...}]).',
      'Single value where list expected.',
    ],
    fix: 'See the type in packages/core/src/schema.ts and reshape the YAML.',
  },
  SCHEMA_INVALID_VALUE: {
    severity: 'error',
    pass: 'schema',
    summary: 'The value violates a constraint (regex, enum, range, cross-field invariant).',
    causes: [
      'IDs that do not match [A-Za-z][A-Za-z0-9_-]*.',
      'HTTP status codes outside 100-599.',
      'Names with leading/trailing whitespace.',
      '`modelKind: enum` without a non-empty `values:` list.',
      '`modelKind: enum` carrying `fields:` (enums hold literals, not structured fields).',
      '`values:` declared on a model that is not `modelKind: enum`.',
    ],
    example:
      'kind: model\nid: RuntimeId\nname: RuntimeId\nmodelKind: enum\nvalues:\n  - claude-code\n  - opencode',
    fix: 'Fix the value to satisfy the constraint named in the message. For enum models: declare `values:` and omit `fields:`.',
  },
  SCHEMA_INVALID_ID: {
    severity: 'error',
    pass: 'schema',
    summary: 'An id field does not match the kebab/identifier regex.',
    causes: ['Used spaces, slashes, or dots in an id.'],
    fix: 'IDs are kebab-case identifiers: start with a letter, then letters, digits, dashes, underscores.',
  },
  SCHEMA_INVALID_REF_PATTERN: {
    severity: 'error',
    pass: 'schema',
    summary: 'A ref string does not match the ref grammar.',
    causes: [
      'Top-level kinds are only `actor:`, `module:`, `usecase:`. Anything else (component, model, table) reaches through a module.',
      'Used `schema:` (does not exist) instead of `domain:`.',
      'Wrote `component:Foo` without the module prefix.',
    ],
    fix: 'Examples: actor:user · module:api · module:api/component:Foo · module:api/domain:orders/model:Order · usecase:place-order.',
  },
  SCHEMA_UNKNOWN_MODULE_TYPE: {
    severity: 'error',
    pass: 'schema',
    summary: 'module.type is not one of the supported values.',
    causes: ['Typo or invented type.'],
    fix: 'Allowed: frontend · service · database · queue · external.',
  },
  SCHEMA_UNKNOWN_MODEL_KIND: {
    severity: 'error',
    pass: 'schema',
    summary: 'model.modelKind is not a recognized value.',
    causes: ['Typo or invented kind.'],
    fix: 'Allowed: dto · entity · value-object · event · enum.',
  },
  SCHEMA_UNKNOWN_COMPONENT_TYPE: {
    severity: 'error',
    pass: 'schema',
    summary: 'component.type is not a recognized value.',
    causes: ['Typo or invented type.'],
    fix: 'Allowed: controller · service · repository · infrastructure · page · widget · client · job · consumer · subscriber · middleware.',
  },
  SCHEMA_FILENAME_ID_MISMATCH: {
    severity: 'error',
    pass: 'schema',
    summary: 'The id inside the file does not match the filename / parent folder.',
    causes: [
      'Renamed the file but not the id, or vice versa.',
      'For container files (space.yaml, module.yaml, domain.yaml): id must equal the parent folder name.',
      'For entity files (Component.yaml, Model.yaml, etc.): id must equal the filename without extension.',
    ],
    fix: 'Rename the file/folder OR change the id. Note: the magic single-space folder `.pizza-doc/` is exempt for space.yaml — meta.id can be anything.',
  },
  REF_BROKEN: {
    severity: 'error',
    pass: 'refs',
    summary: 'A ref points to an entity that does not exist.',
    causes: [
      'Renamed an entity but did not update callers.',
      'Built top-down (use cases first), so refs point at things you have not created yet.',
      'Typo in the ref string.',
    ],
    fix: 'Build bottom-up: tables → models → components → use cases. Run pd validate after every layer.',
  },
  REF_WRONG_KIND: {
    severity: 'error',
    pass: 'refs',
    summary: 'The ref resolves to a real entity, but of the wrong kind for this slot.',
    causes: [
      'Pointed `persistedAs:` at a model instead of a table.',
      'Used a component ref where an actor was expected.',
    ],
    fix: 'Check the schema slot. The ref grammar segment names the expected kind: `table:`, `component:`, etc.',
  },
  USECASE_NO_STEPS: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A use case declares no steps — there is no flow to validate.',
    causes: ['Stub use case left as a TODO.'],
    fix: 'Add steps[]: at least one step from actor → component, optionally a terminal step.',
  },
  USECASE_STEP_CHAIN_DISCONTINUITY: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'Step N starts from a component that was never reached by previous steps (sync stack or spawned set).',
    causes: [
      'Async fan-out where the upstream step did not declare `kind: spawn` / `kind: parallel`.',
      'Truly missing intermediate step or wrong step order.',
    ],
    example:
      'steps:\n  - from: A\n    to: B\n    kind: spawn      # B now runs in the background\n  - from: B          # OK: B is in the spawned set\n    to: C',
    fix: 'If async: mark the upstream step `kind: spawn` (or `parallel`) so the validator records the spawned branch. If sync: add the missing intermediate step or fix the order.',
  },
  USECASE_FIRST_STEP_NOT_FROM_FRONTEND: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A user-actor use case starts somewhere other than a frontend module.',
    causes: [
      'The actor should be `system` (scheduler / cron / external trigger), not `user`.',
      'The flow really does start in a frontend, but the first step is mis-attributed.',
      "It's the same user action described from a system slice (downstream service, queue consumer, agent worker) — there's a separate canonical UI use case, this one models the back end view.",
    ],
    example:
      'kind: usecase\n' +
      'id: agent-handles-task\n' +
      'actor: actor:user             # user-triggered\n' +
      'perspective: system           # ← opt out of frontend-first\n' +
      "trigger: User submits a task; this slice describes the agent's view.\n" +
      'steps:\n' +
      '  - from: module:agent/component:Driver  # legitimately starts here\n' +
      '    to: module:agent/component:Worker',
    fix: 'Three options: (1) change actor.type to `system` if the trigger is automated; (2) fix the first step to come from a frontend component; (3) set perspective: system on the use case to mark it as a system-side slice. Service-only spaces (no frontend module at all) auto-skip this rule.',
  },
  USECASE_LAST_STEP_NOT_TERMINAL: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'The last step does not end at a terminal (DB write, external API, frontend surface).',
    causes: [
      'The flow stops mid-stack — usually you forgot to add the response or completion step.',
    ],
    fix: 'Add a final step ending at: a table (sql), an external-api boundary, or a frontend component (http-response).',
  },
  DTO_FLOW_VIA_TYPE_MISMATCH: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A step `via:` DTO is neither accepted (param) nor returned by the target: warning for component targets, error when the step names an exact method.',
    causes: [
      'Renamed a DTO without updating the method signature.',
      'Step points via: at the wrong model, or to: at the wrong method.',
    ],
    fix: 'Align the method signature with the DTO type, or fix the via:/to: pointers. A returns match counts — via on a GET edge may name the response model.',
  },
  HTTP_STEP_TARGET_NOT_CONTROLLER: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'A step with protocol http/sse/websocket/ws targets a component that is not a request/push receiver.',
    causes: [
      'Targeted a service or repository directly. The HTTP boundary is a `controller`, `consumer`, `subscriber`, or `middleware`.',
      'The component is an auth filter / interceptor / rate limiter and was scaffolded as `infrastructure` — change its type to `middleware`.',
    ],
    fix: 'Change the step target to: `controller` (synchronous request handler), `consumer`/`subscriber` (push receiver: webhook / SSE / WS / queue / MCP listener), or `middleware` (request lifecycle hook: auth, logging, rate-limit, tracing).',
  },
  SQL_STEP_TARGET_NOT_DATABASE: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A step with protocol `sql` does not end at a table inside a database module.',
    causes: ['Targeted a repository instead of the table the repository writes to.'],
    fix: 'sql steps go from repository → table (in a database module). Add the actual table ref.',
  },
  DATAFLOW_SOURCE_FIELD_MISSING: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A `dataFlow.sourceField` does not exist on the named DTO/entity.',
    causes: ['Renamed a field, typo, or pointed at a non-existent model.'],
    fix: 'Spell sourceField as `<Model>.<field>` and ensure the field actually exists.',
  },
  DATAFLOW_TARGET_FIELD_MISSING: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A `dataFlow.targetField` does not resolve, or the prefix is malformed.',
    causes: [
      'Bare `Table.column` form points at a missing table or column.',
      'Typed prefix has bad syntax (e.g. `stream:` without `<protocol>:<path>`, `cli-flag:` not starting with `-`).',
      'Unknown prefix.',
      'Mixed up with the step ref grammar — model targets do NOT use `module:.../model:Name.field`; just `model:Name.field` with the bare model id.',
    ],
    example:
      'dataFlow:\n' +
      '  # bare = table column (legacy default)\n' +
      '  - sourceField: Req.userId\n' +
      '    targetField: users.id\n' +
      '  # explicit table\n' +
      '  - sourceField: Req.userId\n' +
      '    targetField: table:users.id\n' +
      '  # model field — bare model id, NOT the step ref grammar\n' +
      '  - sourceField: ApiRequest.prompt\n' +
      '    targetField: model:NativeRequest.Prompt\n' +
      '  # CLI flag on the receiving process\n' +
      '  - sourceField: Req.prompt\n' +
      '    targetField: cli-flag:--prompt\n' +
      '  # short flag also OK\n' +
      '  - sourceField: Req.verbose\n' +
      '    targetField: cli-flag:-v\n' +
      '  # env var\n' +
      '  - sourceField: Req.apiKey\n' +
      '    targetField: env-var:ANTHROPIC_API_KEY\n' +
      '  # file path (any string after the colon)\n' +
      '  - sourceField: Req.runId\n' +
      '    targetField: file:.app/runtime-sessions/{runId}.json\n' +
      '  # network stream — protocol then path\n' +
      '  - sourceField: RuntimeEvent\n' +
      '    targetField: stream:sse:/runs/{runId}/events\n' +
      '  - sourceField: ChatMessage\n' +
      '    targetField: stream:websocket:/chat/{roomId}\n' +
      '  # queue / topic\n' +
      '  - sourceField: OrderEvent\n' +
      '    targetField: queue:orders.created\n' +
      '  # HTTP header\n' +
      '  - sourceField: Req.traceId\n' +
      '    targetField: http-header:X-Trace-Id',
    fix: 'Known prefixes: table:, model:, cli-flag:, env-var:, file:, stream:<proto>:<path>, queue:, http-header:. Note: `model:Name.field` uses the bare model id — it is NOT the step ref grammar (no `module:.../`). Bare `Foo.bar` is treated as `table:Foo.bar` (legacy).',
  },
  DATAFLOW_TYPE_INCOMPATIBLE: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'sourceField type does not match the targetField type and no transform is declared.',
    causes: ['Type mismatch left undocumented.'],
    fix: 'Add `transform: <description>` to acknowledge the conversion, or align the types.',
  },
  DATAFLOW_TRANSFORM_MISSING: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'Same as above when a transform is required for the type mapping.',
    causes: ['Implicit conversion that should be explicit.'],
    fix: 'Add `transform:` describing the conversion.',
  },
  DATAFLOW_UNUSED_DTO_FIELD: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A field on a request DTO is never written to a column.',
    causes: ['Field exists but is dead — consumed but never persisted.'],
    fix: 'Either persist the field, document the deliberate drop in `description:`, or remove the field.',
  },
  DATAFLOW_UNWRITTEN_REQUIRED_COLUMN: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A NOT NULL column without a default is never written by any dataFlow.',
    causes: ['New column added without a corresponding write path.'],
    fix: 'Add a dataFlow rule that writes this column, give it a default, or make it nullable.',
  },
  DUPLICATE_ID: {
    severity: 'error',
    pass: 'semantic',
    summary: 'Two entities of the same kind share an id.',
    causes: ['Copy-paste mistake.'],
    fix: 'Make ids unique within their scope (file, module, or space, depending on kind).',
  },
  CYCLIC_CALLS: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'Component.calls graph has a cycle (A → B → A).',
    causes: ['Real cycle in the architecture, or accidentally added a back-edge.'],
    fix: 'Audit whether the cycle is intentional. If yes, document it; if no, break the loop.',
  },
  ACTOR_UNUSED: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'An actor is declared but never appears as `actor:` on any use case.',
    causes: ['Defined an actor speculatively, or dropped use cases that referenced it.'],
    fix: 'Wire the actor into a use case or remove the actor file.',
  },
  COMPONENT_UNUSED: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A component is declared but never referenced in any step, call, or composes link.',
    causes: [
      'Stub component or stale code.',
      'UI child mounted by a parent but no `composes:` link declared.',
    ],
    fix: "Reference the component from a use case step, a method `calls:` list, or a parent component's `composes: [<ref>]` (UI parent-child). Or add `suppress: [COMPONENT_UNUSED]` on the component for an explicit waiver. Or delete it.",
  },
  DTO_UNUSED: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A model is declared but never referenced anywhere the validator scans.',
    causes: [
      'Speculative DTO / enum / event left as a stub.',
      'Model renamed but callers not updated.',
    ],
    fix: "Reference the model from a method param/return, another model's field type (covers enums), a step `via:`, or a dataFlow sourceField. Otherwise delete it.",
  },
  MODEL_FIELD_MISSING_COLUMN: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'An entity has a field with no matching column in its persistedAs table.',
    causes: ['Field added on the model, table not updated.'],
    fix: 'Add the column to the table or remove the field from the model.',
  },
  FK_COLUMN_MISSING: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A foreign-key column references a table.column that does not exist.',
    causes: ['Renamed the parent table/column without updating FKs.'],
    fix: 'Fix the FK target to point at a real `<table>.<column>`.',
  },
  STATE_MACHINE_INCOHERENT: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A declared state machine has unreachable states or incompatible transitions.',
    causes: ['v0.2 contract feature; rule still being firmed up.'],
    fix: 'Audit the states/transitions; ensure every state is reachable from start.',
  },
  CONFIG_KEY_DUPLICATE: {
    severity: 'error',
    pass: 'semantic',
    summary: 'Two entries in the same module config-map share a `key`.',
    causes: [
      'Copy-paste while authoring config-map.yaml; two separate features adding the same env var name independently.',
    ],
    fix: 'Pick one canonical entry, merge `description`/`related`/`sourceOfTruth` into it, delete the other. Cross-module duplicates are fine.',
  },
  CONFIG_SECRET_SOURCE_UNRESOLVED: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A `type: secret` entry has no concrete `sourceOfTruth`.',
    causes: [
      'Stub left as `tbd`/`todo`/empty during initial scan.',
      '`sourceOfTruth` field missing entirely.',
    ],
    example:
      '- key: STRIPE_API_KEY\n  type: secret\n  lifecycle: startup\n  mutability: rotatable\n  consumer:\n    component: module:backend/component:PaymentService\n  sourceOfTruth: "vault:secret/app/stripe/api-key"',
    fix: 'Set `sourceOfTruth` to the canonical store path: vault path, AWS Secrets Manager arn, "external (Console name)", etc. Anything but tbd/todo/empty.',
  },
  CONFIG_RUNTIME_NO_ADMIN_UI: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A `lifecycle: runtime` config key is not referenced by any component method or description.',
    causes: [
      'False advertising: the spec says "this can change at runtime" but no UI / API / control surface lets the admin actually change it.',
    ],
    fix: 'Either add a component (typically in a frontend module) whose method/description references the key, or downgrade `lifecycle` to `startup`. The check is loose-match on key name + camelCased variants.',
  },
  CONFIG_RELATED_BROKEN: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A `related: [...]` entry points to a non-existent config key.',
    causes: [
      'Renamed a key without updating its pair (eg. backend `GOOGLE_CLIENT_ID` ↔ frontend `VITE_GOOGLE_CLIENT_ID`).',
      'Bad ref grammar.',
    ],
    fix: 'Use `config-map:<MODULE>/<KEY>` for cross-module pairs and a bare `<KEY>` for within-module. Both halves of the pair should declare the relationship.',
  },
  EXTERNAL_DEP_USES_UNKNOWN_CONFIG: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'An external-dep entry references `usesConfigKey: X` that is not in the same module config-map.',
    causes: [
      'Renamed the credential key on the config side without updating the dep.',
      'Forgot to add the credential key entirely.',
    ],
    fix: 'Add the missing config-map entry (with `type: secret` and `sourceOfTruth`), or fix the `usesConfigKey:` value. Auth schemes other than `none` and `mtls` should always have a backing key.',
  },
  EXTERNAL_DEP_ARG_CONTRACT_INVALID: {
    severity: 'error',
    pass: 'semantic',
    summary: 'An exec positional argv contract is internally inconsistent.',
    causes: [
      'Required nonempty arg has an empty default.',
      'Positions are duplicated or have gaps.',
      'Enum or JSON-object defaults do not match their declared type.',
    ],
    fix: 'Make positions a contiguous 1-based sequence, remove blank defaults for nonempty args, and align defaults with enum/json/positive-int constraints.',
  },
  ADR_BROKEN_LINK: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A module references an ADR id that has no matching `decisions/ADR-NNN-*.md` file.',
    causes: [
      'Decision was renamed/superseded but module link not updated.',
      'ADR is in a draft branch not yet committed.',
    ],
    fix: 'Either create the ADR file or remove the id from `module.yaml.decisions:`. ADR ids in module.yaml must match `^ADR-[0-9]{3,}$`.',
  },
  ADR_DUPLICATE_ID: {
    severity: 'error',
    pass: 'semantic',
    summary: 'Two ADR markdown files declare the same `id` in their frontmatter.',
    causes: [
      'Copy-paste mistake during ADR creation.',
      'Branch merge that created two ADRs with the same id concurrently.',
    ],
    fix: 'Renumber one of them (and rename the file accordingly). ADR ids must be globally unique.',
  },
  TOOL_SCHEMA_TOPLEVEL_COMBINATOR: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A model/component declares an MCP/tool input schema whose root uses oneOf/anyOf/allOf/not.',
    causes: [
      'Encoded exactly-one-of arguments directly in a tool inputSchema root.',
      'Copied a JSON Schema that is valid generally but not accepted by Claude Code tool registration.',
      'The schedule_create incident: Claude Code silently dropped the tool when root oneOf reached the registry.',
    ],
    example:
      'inputSchema:\n' +
      '  type: object\n' +
      '  properties:\n' +
      '    at: { type: string }\n' +
      '    every: { type: string }\n' +
      '  oneOf:\n' +
      '    - required: [at]\n' +
      '    - required: [every]',
    fix: 'Keep the inputSchema root a plain object. Put required/properties at the root, document mutually-exclusive fields in descriptions, and enforce the invariant server-side in the tool handler.',
  },
  ADR_EMBEDS_SCHEMA_LITERAL: {
    severity: 'info',
    pass: 'semantic',
    summary:
      'An ADR fenced json/yaml block duplicates at least six consecutive lines from a model YAML file.',
    causes: [
      'Binding wire/model literals were copied into prose instead of referenced by path.',
      'A contract fix now has to be applied in both the YAML and ADR, creating drift risk.',
      'The oneOf incident fix had to chase the same literal in multiple places.',
    ],
    fix: 'Move the binding literal to the model YAML only. In the ADR, link to or name the exact YAML path and describe the decision in prose.',
  },
  CONFIG_REF_NOT_IN_SPEC: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'Code reads a config key (env var / property) that is not declared in the corresponding module config-map.',
    causes: [
      'Engineer added a new `@Value("${X}")` / `os.Getenv("X")` / `process.env.X` without updating `modules/<id>/config-map.yaml`.',
      'The spec is stale relative to the code.',
      'The extractor mis-identified the module; check the JSONL `_placement.module` value.',
    ],
    fix: 'Add a config-map entry for the key (with type, lifecycle, mutability, sourceOfTruth for secrets), or remove the call-site if the key is dead. Only emitted by `pd drift --from-jsonl`.',
  },
  EXTERNAL_CALL_NOT_IN_SPEC: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'Code makes an outbound network call to an endpoint that is not declared in the module external-deps.',
    causes: [
      'New integration added in code without updating `modules/<id>/external-deps.yaml`.',
      "Spec endpoint is fuzzier than the code's host (e.g. spec says `api.stripe.com`, code calls `https://api.stripe.com/v1/charges` — should still match by substring).",
      'The extractor mis-identified the module; check the JSONL `_placement.module` value.',
    ],
    fix: 'Add an external-deps entry: name, direction, protocol, endpoint (host or URL prefix), consumer ref, auth scheme, and `usesConfigKey` for the credential. Only emitted by `pd drift --from-jsonl`.',
  },
  // v0.3 (A1) — calls/routes contract layer
  CONTRACT_CALL_CREDENTIAL_MISSING: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A non-optional path call declares no credential. Internal s2s calls without auth are a security smell.',
    causes: [
      'Caller upgraded to v0.3 object form but forgot to add `credential:` block.',
      'Internal endpoint is unauthenticated by design — mark `optional: true` or set `credential: { type: none }`.',
    ],
    fix: 'Add `credential: { type: shared-secret, header: ..., env: ... }` on the call entry, or `credential: { type: none }` if unauthenticated is intentional.',
  },
  CONTRACT_CALL_PATH_ORPHAN: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'Caller declares calls[].path + method but the callee component exposes no matching route.',
    causes: [
      "Caller's path is stale (was renamed on the callee).",
      "Callee's route was never modeled (missing httpMethod/httpPath on method or absent from routes[]).",
      'Path mismatch by prefix (`/api/foo` vs `/foo`).',
    ],
    fix: 'Add a matching route on the callee component (either `routes:` entry or `httpMethod`/`httpPath` on a method), or correct the caller path.',
  },
  CONTRACT_CALL_HEADER_MISMATCH: {
    severity: 'warning',
    pass: 'semantic',
    summary: "Caller's credential.header differs from the matched callee route's auth.header.",
    causes: [
      'Header was renamed on one side without updating the other (X-Internal-Auth → X-Service-Auth).',
      'Caller copy-pasted from a different integration.',
    ],
    fix: 'Pick the canonical header name and use it on both sides (`credential.header` on caller, `auth.header` on callee route).',
  },
  CONTRACT_CALL_ENV_MISMATCH: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      "Caller's credential.env (config-map key) differs from the matched callee route's auth.env.",
    causes: [
      'Caller and callee read different env vars for the same shared secret — they will diverge on rotation.',
      'Naming convention drift across modules.',
    ],
    fix: 'Use the same config-map key on both sides, or document the rotation contract that keeps them in sync.',
  },
  // v0.3 (A2) — state machine scenario coverage
  STATE_MACHINE_SCENARIO_COVERAGE: {
    severity: 'info',
    pass: 'semantic',
    summary:
      'Non-trivial transitions (into terminal states or with post-invariants) have no scenarios[] asserting their post-conditions.',
    causes: [
      'Author declared transition into FAILED but never wrote a scenario for "after this transition, what is persisted?".',
      'Transition declares `invariants.post: [...]` but no scenario.then[] mentions any of those strings.',
    ],
    fix: 'Add a scenarios[] entry with `then: [<post-invariant string>]`. The scenario harness (per-language) reads these and turns them into runnable contract tests that catch rollback / partial-write bugs.',
  },
  // v0.3 (A3) — host external dependencies
  HOST_DEP_BINARY_SHA256_MISSING: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A host-binary entry with a github-release or url source has no sha256 pin.',
    causes: [
      'Author transcribed the source URL but forgot to record the digest.',
      'Asset is a tracking branch / latest tag and the team accepts unpinned (rare; comment-document it).',
    ],
    fix: 'Add `source.sha256: <pinned-digest>` so deploy workflows can verify integrity.',
  },
  HOST_DEP_ARTIFACT_RECIPE_MISSING: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'A host-artifact entry with `source.type: build-on-host` is missing `recipe` or `input_checksums`.',
    causes: [
      'No build script path declared — the artifact is implicitly assumed-present.',
      'Recipe declared but input_checksums is empty — the build is never invalidated when its inputs change.',
    ],
    fix: 'Set `source.recipe: <path-to-build-script>` and list every input file (or glob) under `source.input_checksums`.',
  },
  HOST_DEP_PREFLIGHT_MISSING: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A host-installed dependency has no `preflight` command. Deploy/boot has nothing to probe.',
    causes: [
      "The dep was modeled but the team hasn't agreed on a probe yet.",
      'The probe lives in tooling outside the spec (move it inline so spec stays self-contained).',
    ],
    fix: 'Add `preflight: { command: <bash command>, expected: exit_code_0 }` so the boot script and `pd drift` have a concrete probe.',
  },
  HOST_DEP_PROD_OWNER_MISSING: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A host dep marked `required_in_profiles: [prod]` has no `install_owner`. No team is accountable.',
    causes: [
      'New host dep added without claiming ownership.',
      'Ownership lives in a Slack thread / wiki page — not in the spec.',
    ],
    fix: 'Set `install_owner: <team-name>` (the team responsible for keeping the dep installed and the deploy workflow green).',
  },
  // v0.3 (A4) — operations / runbooks
  RUNBOOK_COVERAGE: {
    severity: 'info',
    pass: 'semantic',
    summary: 'A use-case errorFlow has no runbook in `operations/runbooks/` covering it.',
    causes: [
      'New errorFlow added without a paired runbook.',
      'Runbook exists but its `covers:` field does not list the errorFlow id.',
    ],
    fix: "Add a runbook with `covers: [<errorFlow.id>]`, or extend an existing runbook's `covers:`. Set severity=p0/p1 for runbooks that gate prod readiness.",
  },
  RUNBOOK_BROKEN_LINK: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A runbook references an ADR id that does not exist in `decisions/`.',
    causes: [
      'ADR id typo (ADR-007 vs ADR-7).',
      'Referenced ADR was deleted without updating the runbook.',
    ],
    fix: 'Fix the ADR id in the runbook frontmatter, or remove the reference if the ADR is no longer relevant.',
  },
  // v0.5 (B1) — ADR back-refs from components
  COMPONENT_DECIDED_BY_INVALID_ADR: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'A component lists an ADR id in `decidedBy` that does not match any `decisions/ADR-NNN-*.md` file.',
    causes: [
      'ADR id typo (ADR-007 vs ADR-7).',
      'The ADR file was deleted but the back-reference was not cleaned up.',
      'The ADR file is named differently (e.g. `decisions/ADR-026-foo.md` vs `ADR-026.md`).',
    ],
    fix: 'Fix the ADR id in the component yaml, or remove the entry from `decidedBy` if the ADR is no longer relevant.',
  },
  COMPONENT_DECIDED_BY_SUPERSEDED_ADR: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A component is decided by an ADR whose status is `superseded` or `deprecated`.',
    causes: [
      'The original ADR was replaced by a newer one (frontmatter has `supersededBy:`).',
      'The decision was retired and the component yaml was never updated.',
    ],
    fix: 'Replace the old ADR id with its `supersededBy:` target, or drop the link if the decision no longer applies. Keeps `decidedBy` pointing at the current source of truth.',
  },
  // v0.5 (B2) — pub/sub edges
  EVENT_EMIT_TARGET_NOT_EVENT: {
    severity: 'error',
    pass: 'semantic',
    summary:
      "A component's `emits[].event` ref resolves to a model whose `modelKind` is not `event`.",
    causes: [
      'Pointed `emits[].event` at an entity / DTO / value-object by accident.',
      'The target model used to be `modelKind: event` and got changed.',
    ],
    fix: "Set the target model's `modelKind: event`, or repoint `emits[].event` at the actual event payload model. Events have payload contracts the same way DTOs do — they're just modeled as `modelKind: event`.",
  },
  EVENT_SUBSCRIBE_TARGET_NOT_EVENT: {
    severity: 'error',
    pass: 'semantic',
    summary:
      "A component's `subscribes[].event` ref resolves to a model whose `modelKind` is not `event`.",
    causes: [
      'Pointed `subscribes[].event` at an entity / DTO / value-object by accident.',
      'The target model used to be `modelKind: event` and got changed.',
    ],
    fix: "Set the target model's `modelKind: event`, or repoint `subscribes[].event` at the actual event payload model.",
  },
  EVENT_NO_SUBSCRIBER: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A component publishes an event but nothing in the space subscribes to it.',
    causes: [
      'Subscriber was deleted but the publisher was left in place.',
      'Subscriber lives outside this space (cross-space pub/sub — currently not modeled).',
      'Dead publish — nobody ever listened.',
    ],
    fix: 'Either add a `subscribes:` entry on the receiver component, or remove the `emits:` entry from the publisher. Cross-space cases can suppress this code on the publisher.',
  },
  EVENT_SUBSCRIBE_NO_PUBLISHER: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A component subscribes to an event but nothing in the space publishes it.',
    causes: [
      'Publisher was deleted but the subscriber was left in place.',
      'Publisher lives outside this space.',
      "Typo on the `event:` ref — it doesn't match any `emits[].event`.",
    ],
    fix: 'Add an `emits:` entry on the publisher, or fix the typo. The two refs must match exactly. Cross-space cases can suppress this code on the subscriber.',
  },
  // v0.5 (B3) — wire capture
  WIRE_CAPTURE_MISSING: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A component consumes an `http-api` external-dep but declares no `wireCapture` pinning real wire shape.',
    causes: [
      'Spec was authored before the component had any captured-traffic fixtures.',
      'Component was added but the team relied on synth fixtures instead of real captures.',
    ],
    fix: "Add `wireCapture: { source, path, capturedAt, capturedAgainst, scenarios }` on the component. Source examples: `tcpdump`, `curl-live`, `debug-log`. Path is space-relative — convention: `.pizza-doc/wire-captures/<integration>/<scenario>.txt`. Use `--strict-wire-capture` in CI to escalate to error once you've captured baseline traffic.",
  },
  WIRE_CAPTURE_PATH_BROKEN: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'A component declares `wireCapture.path` but the file does not exist on disk (or is empty).',
    causes: [
      'Capture file was deleted but the spec was not updated.',
      'Path is misspelled relative to the space root.',
      'File exists but is zero bytes (truncated, incomplete capture).',
    ],
    fix: 'Restore the capture file, fix the path, or re-record. The path is resolved relative to the space directory.',
  },
  WIRE_CAPTURE_STALE: {
    severity: 'info',
    pass: 'semantic',
    summary: "A component's `wireCapture.capturedAt` is more than 30 days old.",
    causes: [
      'Vendor may have changed wire shape since the capture (changelog landed).',
      'No one has refreshed the fixture in a release cycle.',
    ],
    fix: 'Re-capture the wire scenarios you care about and bump `capturedAt`. Bump `capturedAgainst` too if the vendor version changed.',
  },
  // v0.5 (B4) — table migration parity
  MIGRATION_COLUMN_INCONSISTENT: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'A `migrations:` entry on a table contradicts the current `columns:` snapshot (e.g. drop-column declared but the column is still listed).',
    causes: [
      'Code dropped a column but the spec author forgot to update the columns list.',
      'Migration entry was added optimistically before the DDL ran.',
      'Reverted migration was not removed from the history list.',
    ],
    fix: 'Reconcile `columns:` and `migrations:`. For drop-column: remove the column from columns[]. For add-column: add it. For alter-column: ensure the column exists in columns[]. If the migration was reverted, remove it from the migrations[] list.',
  },
  // v0.6 (W1) — type closure + wiring parity
  TYPE_UNRESOLVED: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'A method param/return or model field names a type that is neither a primitive nor any model in the space.',
    causes: [
      'Typo in the type name (`UserDtoo`).',
      'Model was renamed or deleted but a signature still names the old type.',
      'Type exists only in code and was never modeled in the spec.',
    ],
    fix: 'Fix the spelling (the message suggests near-matches), add the missing model, or use a primitive. Wrapper names (`List<…>`, `Page<…>`) are not checked — only their type arguments. Exception names from `errorMapping[].exception` count as known types, and `type: external` modules are exempt (their contract is pinned by wireCapture).',
  },
  WIRING_STEP_WITHOUT_CALL: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A use-case step walks an edge (http/internal-call/event) that the component wiring never declares.',
    causes: [
      'Step was written top-down and the calls:/emits:/subscribes: wiring was never added.',
      'Wiring was refactored (call removed or moved) but the scenario still walks the old edge.',
      'Step endpoints point at the wrong components.',
    ],
    fix: "For http/internal-call: add a 'calls:' entry on the calling method of the from-component (or 'composes:' for structural containment). For event: declare 'emits:' on the publisher and 'subscribes:' on the receiver against the same event model. Use --strict-wiring in CI to escalate to error.",
  },
  WIRING_CALL_WITHOUT_STEP: {
    severity: 'info',
    pass: 'semantic',
    summary: 'A declared call edge is never walked by any use-case step.',
    causes: [
      'No scenario models the flow that exercises this call.',
      'The call is dead wiring left behind by a refactor.',
    ],
    fix: 'Add (or extend) a use case whose steps walk the edge, or remove the calls: entry if the dependency is gone.',
  },
  STEP_VIA_MISSING: {
    severity: 'info',
    pass: 'semantic',
    summary: 'An http/event step into a concrete component has no payload model (via:).',
    causes: [
      'Step was sketched before the DTO / event model existed.',
      'Author documented the edge but not its contract.',
    ],
    fix: "Set 'via:' to the request DTO or event model; response-only edges (GET) may point via: at the response model. Truly payload-less edges: suppress the code on the use case. --strict-wiring escalates to error.",
  },
  // v0.6 (W5) — error mapping closure
  THROWS_UNMAPPED: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      "A method serving an HTTP route throws an exception that has no row in its module's errorMapping — the wire-level outcome is undeclared.",
    causes: [
      'The throw was added to the method signature but the module-level errorMapping was never extended.',
      'Exception was renamed in the mapping (or the method) but not both.',
      'The exception is actually handled internally and can never escape.',
    ],
    fix: "Add '- exception: <Name>' with an httpStatus (and optionally a machine-readable code) to the module's errorMapping, or drop the throw if it can't escape. Only http-reachable methods (httpMethod set) are checked; `type: external` modules are exempt. --strict-contracts escalates to error.",
  },
  // v0.6 (W4) — event delivery contract
  EVENT_IDEMPOTENCY_MISSING: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A component subscribes to an event that declares delivery: at-least-once, but the subscription declares no idempotency.',
    causes: [
      'The delivery guarantee was added to the event model after the subscribers were written.',
      'The consumer really is not idempotent — the classic double-processing hole.',
    ],
    fix: "Add 'idempotency: { key: <event field>, strategy: dedupe-store | upsert | natural }' to the subscribes entry. Events without a declared 'delivery' are not checked — declare the delivery guarantee to arm this rule.",
  },
  EVENT_KEY_FIELD_UNKNOWN: {
    severity: 'error',
    pass: 'semantic',
    summary:
      "An event model's orderingKey (or a subscription's idempotency.key) names a field that does not exist on the event model.",
    causes: [
      'Typo in the key name.',
      'The event field was renamed but the delivery contract still names the old field.',
    ],
    fix: 'Fix the key to name an existing field on the event model (the message suggests near-matches), or add the field.',
  },
  EVENT_DELIVERY_ON_NON_EVENT: {
    severity: 'error',
    pass: 'semantic',
    summary:
      "A model declares delivery / orderingKey but its modelKind is not 'event' — delivery contracts only apply to events.",
    causes: [
      'The model was demoted from event to dto/entity but kept its transport fields.',
      'Copy-paste from an event model.',
    ],
    fix: "Change modelKind to 'event' (and set topic:), or remove delivery / orderingKey from the model.",
  },
}

/**
 * `pd lint --explain <CODE>` — explain a validation code.
 * `pd lint`                  — list all known codes grouped by pass.
 */
export function cmdLint(args: ParsedArgs): number {
  const explainFlag = args.flags.explain
  const code =
    typeof explainFlag === 'string'
      ? (explainFlag as ValidationCode)
      : args.positional[0]
        ? (args.positional[0] as ValidationCode)
        : undefined

  if (code) {
    const doc = DOCS[code]
    if (!doc) {
      console.error(red(`unknown code: ${code}`))
      console.error(dim('run `pd lint` to list all known codes.'))
      return 2
    }
    printCode(code, doc)
    return 0
  }

  // No code given: list everything grouped by pass.
  const byPass = new Map<string, [ValidationCode, CodeDoc][]>()
  for (const [code, doc] of Object.entries(DOCS) as [ValidationCode, CodeDoc][]) {
    if (!byPass.has(doc.pass)) byPass.set(doc.pass, [])
    byPass.get(doc.pass)?.push([code, doc])
  }
  console.log(`${bold(cyan('Pizza Doc validation codes'))}\n`)
  for (const [pass, codes] of byPass) {
    console.log(bold(`pass: ${pass}`))
    for (const [code, doc] of codes) {
      const sev = sevColor(doc.severity)
      console.log(`  ${sev(doc.severity.padEnd(7))} ${cyan(code)}`)
      console.log(`            ${dim(doc.summary)}`)
    }
    console.log()
  }
  console.log(dim('run `pd lint --explain <CODE>` for the long form.'))
  return 0
}

function printCode(code: ValidationCode, doc: CodeDoc): void {
  const sev = sevColor(doc.severity)
  console.log(`${cyan(bold(code))} ${sev(`(${doc.severity})`)}  ${dim(`pass: ${doc.pass}`)}\n`)
  console.log(doc.summary)
  if (doc.causes.length > 0) {
    console.log(`\n${bold('Common causes:')}`)
    for (const c of doc.causes) console.log(`  - ${c}`)
  }
  if (doc.example) {
    console.log(`\n${bold('Example:')}`)
    console.log(
      doc.example
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n'),
    )
  }
  if (doc.fix) {
    console.log(`\n${bold('Fix:')}`)
    console.log(`  ${doc.fix}`)
  }
}

function sevColor(sev: 'error' | 'warning' | 'info'): (s: string) => string {
  if (sev === 'error') return red
  if (sev === 'warning') return yellow
  return dim
}
