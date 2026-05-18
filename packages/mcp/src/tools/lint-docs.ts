/**
 * Validation-code reference data shared between `pd lint --explain` and the
 * MCP `pd_explain_code` tool. Same shape, same content; the MCP tool returns
 * it as structured JSON, the CLI prints a human form.
 *
 * Source: docs/site/concepts/* and the rule implementations in
 * packages/core/src/validator/. When adding a new code, add an entry here
 * so both surfaces explain it consistently.
 */
export interface CodeDoc {
  severity: 'error' | 'warning' | 'info'
  pass: 'parse' | 'schema' | 'refs' | 'semantic'
  summary: string
  causes: string[]
  example?: string
  fix?: string
}

export const CODE_DOCS: Record<string, CodeDoc> = {
  YAML_PARSE_ERROR: {
    severity: 'error',
    pass: 'parse',
    summary: 'The YAML file is syntactically broken before Pizza Doc even sees its shape.',
    causes: [
      'Tab vs space indentation mix.',
      'Unterminated string or unclosed bracket.',
      'A field value that needs quoting (starts with !, &, *, %, etc.).',
    ],
    fix: 'The error message includes line/column. Fix that location and re-run pd_validate.',
  },
  FILE_UNRECOGNIZED: {
    severity: 'info',
    pass: 'parse',
    summary: "A .yaml file lives in a path the loader doesn't classify; it's skipped.",
    causes: ['Note files inside actors/, modules/, etc.', 'Stray YAML in unexpected places.'],
    fix: 'Move the file out of the recognized layout, or rename it to match an entity slot.',
  },
  SCHEMA_UNKNOWN_FIELD: {
    severity: 'error',
    pass: 'schema',
    summary: 'A field is set that the strict Zod schema does not allow.',
    causes: [
      'Common invented fields: owner, team, tags, status, version (these do not exist on entities).',
      'Typo on a real field (e.g. returnType instead of returns).',
    ],
    fix: 'Check the field list in packages/core/src/schema.ts; if the field is not there it is not real.',
  },
  SCHEMA_MISSING_REQUIRED: {
    severity: 'error',
    pass: 'schema',
    summary: 'A required field is missing from this entity.',
    causes: [
      'Most entities need: kind, id, name. Tables need columns. Use cases need actor, trigger, steps.',
    ],
    fix: 'Add the field. The error message names the path.',
  },
  SCHEMA_WRONG_TYPE: {
    severity: 'error',
    pass: 'schema',
    summary: 'A field has the wrong shape (string vs object, scalar vs array, etc.).',
    causes: ['Used a scalar where an object was expected, or vice versa.'],
    fix: 'See the Zod type in packages/core/src/schema.ts and reshape the YAML.',
  },
  SCHEMA_INVALID_VALUE: {
    severity: 'error',
    pass: 'schema',
    summary: 'The value violates a constraint (regex, enum, range, cross-field invariant).',
    causes: [
      'IDs that do not match [A-Za-z][A-Za-z0-9_-]*.',
      'HTTP status codes outside 100-599.',
      'modelKind: enum without a non-empty values: list, or carrying fields.',
      'values: declared on a model that is not modelKind: enum.',
    ],
    example:
      'kind: model\nid: RuntimeId\nname: RuntimeId\nmodelKind: enum\nvalues:\n  - claude-code\n  - opencode',
    fix: 'Fix the value to satisfy the constraint. For enum models: declare values: and omit fields:.',
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
      'Top-level kinds are only actor:, module:, usecase:.',
      'Wrote component:Foo without the module prefix.',
      'Used schema: (does not exist) instead of domain:.',
    ],
    fix: 'Examples: actor:user, module:api, module:api/component:Foo, module:api/domain:orders/model:Order.',
  },
  SCHEMA_UNKNOWN_MODULE_TYPE: {
    severity: 'error',
    pass: 'schema',
    summary: 'module.type is not one of the supported values.',
    causes: ['Typo or invented type.'],
    fix: 'Allowed: frontend | service | database | queue | external.',
  },
  SCHEMA_UNKNOWN_MODEL_KIND: {
    severity: 'error',
    pass: 'schema',
    summary: 'model.modelKind is not a recognized value.',
    causes: ['Typo or invented kind.'],
    fix: 'Allowed: dto | entity | value-object | event | enum.',
  },
  SCHEMA_UNKNOWN_COMPONENT_TYPE: {
    severity: 'error',
    pass: 'schema',
    summary: 'component.type is not a recognized value.',
    causes: ['Typo or invented type.'],
    fix: 'Allowed: controller | service | repository | infrastructure | page | widget | client | job | consumer | subscriber | middleware.',
  },
  SCHEMA_FILENAME_ID_MISMATCH: {
    severity: 'error',
    pass: 'schema',
    summary: 'The id inside the file does not match the filename / parent folder.',
    causes: [
      'Renamed the file but not the id, or vice versa.',
      'Container files (space.yaml, module.yaml, domain.yaml): id must equal the parent folder name.',
      'Entity files (Component.yaml, Model.yaml, etc.): id must equal the filename without extension.',
    ],
    fix: 'Rename the file/folder OR change the id. The magic single-space folder `.pizza-doc/` is exempt for space.yaml.',
  },
  REF_BROKEN: {
    severity: 'error',
    pass: 'refs',
    summary: 'A ref points to an entity that does not exist.',
    causes: [
      'Renamed an entity but did not update callers.',
      'Built top-down so refs precede their targets.',
    ],
    fix: 'Build bottom-up: tables → models → components → use cases. Run pd_validate after every layer.',
  },
  REF_WRONG_KIND: {
    severity: 'error',
    pass: 'refs',
    summary: 'The ref resolves to a real entity, but of the wrong kind for this slot.',
    causes: [
      'Pointed persistedAs: at a model instead of a table.',
      'Used a component ref where an actor was expected.',
    ],
    fix: 'Check the schema slot. Each ref-segment names the expected kind.',
  },
  USECASE_NO_STEPS: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A use case declares no steps — there is no flow to validate.',
    causes: ['Stub use case left as a TODO.'],
    fix: 'Add steps[]: at least one from actor → component, optionally a terminal step.',
  },
  USECASE_STEP_CHAIN_DISCONTINUITY: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'Step N starts from a component never reached by previous steps (sync stack or spawned set).',
    causes: [
      'Async fan-out where the upstream step did not declare kind: spawn / kind: parallel.',
      'Truly missing intermediate step or wrong order.',
    ],
    example:
      'steps:\n  - from: A\n    to: B\n    kind: spawn      # B now runs in the background\n  - from: B          # OK: B is in the spawned set\n    to: C',
    fix: 'If async: mark the upstream step kind: spawn or kind: parallel. If sync: add the missing intermediate step.',
  },
  USECASE_FIRST_STEP_NOT_FROM_FRONTEND: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A user-actor use case starts somewhere other than a frontend module.',
    causes: [
      'Actor should be system (scheduler/cron) instead of user.',
      'First step is mis-attributed.',
      'Same user action described from a system slice — there is already a canonical UI use case, this one is the back-end view.',
    ],
    fix: 'Three options: change actor.type to system; fix the first step to start in a frontend; or set `perspective: system` on the use case to opt out. Service-only spaces (no frontend module) auto-skip this rule.',
  },
  USECASE_LAST_STEP_NOT_TERMINAL: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'The last step does not end at a terminal (DB write, external API, frontend surface).',
    causes: ['Flow stops mid-stack — usually missing the response/completion step.'],
    fix: 'Add a final step ending at: a table (sql), an external-api boundary, or a frontend component (http-response).',
  },
  DTO_FLOW_VIA_TYPE_MISMATCH: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'A step via: ref points at a method whose param/return type does not match the DTO referenced.',
    causes: ['Renamed a DTO without updating the method signature.'],
    fix: 'Align the method signature with the DTO type, or fix the via: pointer.',
  },
  HTTP_STEP_TARGET_NOT_CONTROLLER: {
    severity: 'error',
    pass: 'semantic',
    summary:
      'A step with protocol http/sse/websocket/ws targets a component that is not a request/push receiver.',
    causes: [
      'Targeted a service or repository directly. The HTTP boundary is controller, consumer, subscriber, or middleware.',
      'Auth filter / interceptor / rate limiter scaffolded as infrastructure — change its type to middleware.',
    ],
    fix: 'Change the step target to: controller (synchronous request handler), consumer/subscriber (push receiver: webhook / SSE / WS / queue / MCP listener), or middleware (request lifecycle hook: auth, logging, rate-limit, tracing).',
  },
  SQL_STEP_TARGET_NOT_DATABASE: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A step with protocol sql does not end at a table inside a database module.',
    causes: ['Targeted a repository instead of the table the repository writes to.'],
    fix: 'sql steps go from repository → table (in a database module).',
  },
  DATAFLOW_SOURCE_FIELD_MISSING: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A dataFlow.sourceField does not exist on the named DTO/entity.',
    causes: ['Renamed a field, typo, or pointed at a non-existent model.'],
    fix: 'Spell sourceField as <Model>.<field> and ensure the field exists.',
  },
  DATAFLOW_TARGET_FIELD_MISSING: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A dataFlow.targetField does not resolve, or the prefix is malformed.',
    causes: [
      'Bare Table.column form points at a missing table or column.',
      'Typed prefix has bad syntax (stream: missing protocol/path, cli-flag: not starting with -).',
      'Unknown prefix.',
      'Mixed up with the step ref grammar — model targets do NOT use module:.../model:Name.field; just model:Name.field with the bare model id.',
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
      '  # CLI flag\n' +
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
      '    targetField: file:.acme/runtime-sessions/{runId}.json\n' +
      '  # network stream — protocol then path\n' +
      '  - sourceField: AcmeEvent\n' +
      '    targetField: stream:sse:/runs/{runId}/events\n' +
      '  - sourceField: ChatMessage\n' +
      '    targetField: stream:websocket:/chat/{roomId}\n' +
      '  # queue topic\n' +
      '  - sourceField: OrderEvent\n' +
      '    targetField: queue:orders.created\n' +
      '  # HTTP header\n' +
      '  - sourceField: Req.traceId\n' +
      '    targetField: http-header:X-Trace-Id',
    fix: 'Known prefixes: table, model, cli-flag, env-var, file, stream:<proto>:<path>, queue, http-header. Note: model:Name.field uses the bare model id — it is NOT the step ref grammar (no module:.../). Bare Foo.bar = table:Foo.bar.',
  },
  DATAFLOW_TYPE_INCOMPATIBLE: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'sourceField type does not match the targetField type and no transform is declared.',
    causes: ['Type mismatch left undocumented.'],
    fix: 'Add transform: <description> to acknowledge the conversion, or align the types. Only runs for table targets.',
  },
  DATAFLOW_TRANSFORM_MISSING: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A transform is required for the type mapping but not declared.',
    causes: ['Implicit conversion that should be explicit.'],
    fix: 'Add transform: describing the conversion.',
  },
  DATAFLOW_UNUSED_DTO_FIELD: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A field on a request DTO is never written to a column.',
    causes: ['Field exists but is dead — consumed but never persisted.'],
    fix: 'Either persist the field, document the deliberate drop in description:, or remove it.',
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
    fix: 'Make ids unique within their scope (file, module, or space).',
  },
  CYCLIC_CALLS: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'component.calls graph has a cycle (A → B → A).',
    causes: ['Real cycle in the architecture, or accidentally added a back-edge.'],
    fix: 'Audit whether the cycle is intentional. If yes, document it; if no, break the loop.',
  },
  ACTOR_UNUSED: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'An actor is declared but never appears as actor: on any use case.',
    causes: ['Defined an actor speculatively.'],
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
    fix: "Reference it from a use case step, a method calls list, or a parent component's `composes: [<ref>]` (UI parent-child). Or add `suppress: [COMPONENT_UNUSED]` on the component for an explicit waiver. Or delete it.",
  },
  DTO_UNUSED: {
    severity: 'warning',
    pass: 'semantic',
    summary: 'A model is declared but never referenced anywhere the validator scans.',
    causes: [
      'Speculative DTO/enum/event left as a stub.',
      'Model renamed but callers not updated.',
    ],
    fix: "Reference the model from a method param/return, another model's field type (covers enums), a step via:, or a dataFlow sourceField.",
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
    fix: 'Fix the FK target to point at a real <table>.<column>.',
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
    summary: 'Two entries in the same module config-map share a key.',
    causes: ['Copy-paste; two separate features adding the same env var name.'],
    fix: 'Merge into one canonical entry. Cross-module duplicates are fine.',
  },
  CONFIG_SECRET_SOURCE_UNRESOLVED: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A type: secret entry has no concrete sourceOfTruth.',
    causes: ['Stub left as tbd/todo/empty.', 'Field missing.'],
    example:
      '- key: STRIPE_API_KEY\n  type: secret\n  lifecycle: startup\n  mutability: rotatable\n  consumer: { component: module:backend/component:PaymentService }\n  sourceOfTruth: "vault:secret/acme/stripe/api-key"',
    fix: 'Set sourceOfTruth to the canonical store path: vault path, AWS Secrets Manager arn, "external (Console name)", etc.',
  },
  CONFIG_RUNTIME_NO_ADMIN_UI: {
    severity: 'warning',
    pass: 'semantic',
    summary:
      'A lifecycle: runtime config key is not referenced by any component method/description.',
    causes: ['False advertising: spec says runtime-mutable but no surface lets admin change it.'],
    fix: 'Add a component (typically in a frontend module) whose method/description references the key, OR downgrade lifecycle to startup. Match is loose: key name + camelCased variants.',
  },
  CONFIG_RELATED_BROKEN: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A related: entry points to a non-existent config key.',
    causes: ['Renamed key without updating pair.', 'Bad ref grammar.'],
    fix: 'Use config-map:<MODULE>/<KEY> for cross-module pairs and bare <KEY> for within-module.',
  },
  EXTERNAL_DEP_USES_UNKNOWN_CONFIG: {
    severity: 'error',
    pass: 'semantic',
    summary: 'External-dep references usesConfigKey: X that is not in the module config-map.',
    causes: ['Renamed credential key without updating dep.', 'Missing config-map entry.'],
    fix: "Add the missing config-map entry (type: secret, sourceOfTruth set), or fix the usesConfigKey value. auth: none/mtls don't require a key.",
  },
  EXTERNAL_DEP_ARG_CONTRACT_INVALID: {
    severity: 'error',
    pass: 'semantic',
    summary: 'An exec positional argv contract is internally inconsistent.',
    causes: [
      'Blank default for nonempty arg.',
      'Duplicated/gapped positions.',
      'Invalid enum/json/positive-int default.',
    ],
    fix: 'Make positions contiguous, remove blank nonempty defaults, and align defaults with declared constraints.',
  },
  ADR_BROKEN_LINK: {
    severity: 'error',
    pass: 'semantic',
    summary: 'A module references an ADR id that has no matching decisions/ADR-NNN-*.md file.',
    causes: ['Decision renamed/superseded; module link not updated.', 'Draft ADR not committed.'],
    fix: 'Create the ADR file or remove the id from module.yaml.decisions. Ids must match ^ADR-[0-9]{3,}$.',
  },
  ADR_DUPLICATE_ID: {
    severity: 'error',
    pass: 'semantic',
    summary: 'Two ADR markdown files declare the same id in their frontmatter.',
    causes: ['Copy-paste during ADR creation.', 'Branch merge created two ADRs with the same id.'],
    fix: 'Renumber one and rename its file. ADR ids must be globally unique.',
  },
  CONFIG_REF_NOT_IN_SPEC: {
    severity: 'error',
    pass: 'semantic',
    summary: 'Code reads a config key that is not declared in the module config-map.',
    causes: [
      'New @Value/os.Getenv/process.env added without updating config-map.yaml.',
      'Spec stale.',
      'Extractor mis-attributed the module — check JSONL _placement.module.',
    ],
    fix: 'Add a config-map entry, or remove the call-site. Only emitted by `pd drift --from-jsonl`.',
  },
  EXTERNAL_CALL_NOT_IN_SPEC: {
    severity: 'error',
    pass: 'semantic',
    summary: 'Code makes an outbound call to an endpoint not declared in module external-deps.',
    causes: [
      'New integration added without updating external-deps.yaml.',
      'Spec endpoint is fuzzier than code host but still substring-matches; check the report.',
      'Extractor mis-attributed the module.',
    ],
    fix: 'Add an external-deps entry: name, direction, protocol, endpoint, consumer, auth, usesConfigKey. Only emitted by `pd drift --from-jsonl`.',
  },
}
