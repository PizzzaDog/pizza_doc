---
title: Validation rules
description: Every code the Pizza Doc validator can emit — generated from the same source as pd lint --explain.
---

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Source: packages/cli/src/commands/lint.ts (DOCS). Regenerate: pnpm gen:rules-doc -->

The validator emits issues with a `code`, a `severity`, a `message`, and
optional `file` / `entityRef` / `suggestion` fields. This page is generated
from the same knowledge base that powers `pd lint --explain <CODE>` — the
terminal version is always available offline.

Severities shown are the defaults; several warning/info codes escalate to
error under the opt-in strict flags (`--strict-contracts`, `--strict-wiring`,
`--check-orphan-paths`, `--check-state-coverage`, `--check-runbook-coverage`,
`--strict-wire-capture`) — each rule below says so in its “fix” note when it does.

## Summary (80 codes)

| Code | Severity | Pass |
| --- | --- | --- |
| `YAML_PARSE_ERROR` | error | parse |
| `FILE_UNRECOGNIZED` | info | parse |
| `CHANGE_NOT_FOUND` | error | change-set |
| `CHANGE_SCHEMA_INVALID` | error | change-set |
| `CHANGE_FILENAME_ID_MISMATCH` | error | change-set |
| `CHANGE_DELETE_PATH_INVALID` | error | change-set |
| `SCHEMA_UNKNOWN_FIELD` | error | schema |
| `SCHEMA_MISSING_REQUIRED` | error | schema |
| `SCHEMA_WRONG_TYPE` | error | schema |
| `SCHEMA_INVALID_VALUE` | error | schema |
| `SCHEMA_INVALID_ID` | error | schema |
| `SCHEMA_INVALID_REF_PATTERN` | error | schema |
| `SCHEMA_UNKNOWN_MODULE_TYPE` | error | schema |
| `SCHEMA_UNKNOWN_MODEL_KIND` | error | schema |
| `SCHEMA_UNKNOWN_COMPONENT_TYPE` | error | schema |
| `SCHEMA_FILENAME_ID_MISMATCH` | error | schema |
| `REF_BROKEN` | error | refs |
| `REF_WRONG_KIND` | error | refs |
| `USECASE_NO_STEPS` | warning | semantic |
| `USECASE_STEP_CHAIN_DISCONTINUITY` | warning | semantic |
| `USECASE_FIRST_STEP_NOT_FROM_FRONTEND` | warning | semantic |
| `USECASE_LAST_STEP_NOT_TERMINAL` | warning | semantic |
| `DTO_FLOW_VIA_TYPE_MISMATCH` | warning | semantic |
| `HTTP_STEP_TARGET_NOT_CONTROLLER` | error | semantic |
| `SQL_STEP_TARGET_NOT_DATABASE` | error | semantic |
| `DATAFLOW_SOURCE_FIELD_MISSING` | error | semantic |
| `DATAFLOW_TARGET_FIELD_MISSING` | error | semantic |
| `DATAFLOW_TYPE_INCOMPATIBLE` | warning | semantic |
| `DATAFLOW_TRANSFORM_MISSING` | warning | semantic |
| `DATAFLOW_UNUSED_DTO_FIELD` | warning | semantic |
| `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN` | error | semantic |
| `DUPLICATE_ID` | error | semantic |
| `CYCLIC_CALLS` | warning | semantic |
| `ACTOR_UNUSED` | warning | semantic |
| `COMPONENT_UNUSED` | warning | semantic |
| `DTO_UNUSED` | warning | semantic |
| `MODEL_FIELD_MISSING_COLUMN` | warning | semantic |
| `FK_COLUMN_MISSING` | error | semantic |
| `STATE_MACHINE_INCOHERENT` | warning | semantic |
| `CONFIG_KEY_DUPLICATE` | error | semantic |
| `CONFIG_SECRET_SOURCE_UNRESOLVED` | error | semantic |
| `CONFIG_RUNTIME_NO_ADMIN_UI` | warning | semantic |
| `CONFIG_RELATED_BROKEN` | error | semantic |
| `EXTERNAL_DEP_USES_UNKNOWN_CONFIG` | error | semantic |
| `EXTERNAL_DEP_ARG_CONTRACT_INVALID` | error | semantic |
| `ADR_BROKEN_LINK` | error | semantic |
| `ADR_DUPLICATE_ID` | error | semantic |
| `TOOL_SCHEMA_TOPLEVEL_COMBINATOR` | warning | semantic |
| `ADR_EMBEDS_SCHEMA_LITERAL` | info | semantic |
| `CONFIG_REF_NOT_IN_SPEC` | error | semantic |
| `EXTERNAL_CALL_NOT_IN_SPEC` | error | semantic |
| `CONTRACT_CALL_CREDENTIAL_MISSING` | warning | semantic |
| `CONTRACT_CALL_PATH_ORPHAN` | warning | semantic |
| `CONTRACT_CALL_HEADER_MISMATCH` | warning | semantic |
| `CONTRACT_CALL_ENV_MISMATCH` | warning | semantic |
| `STATE_MACHINE_SCENARIO_COVERAGE` | info | semantic |
| `HOST_DEP_BINARY_SHA256_MISSING` | warning | semantic |
| `HOST_DEP_ARTIFACT_RECIPE_MISSING` | error | semantic |
| `HOST_DEP_PREFLIGHT_MISSING` | warning | semantic |
| `HOST_DEP_PROD_OWNER_MISSING` | warning | semantic |
| `RUNBOOK_COVERAGE` | info | semantic |
| `RUNBOOK_BROKEN_LINK` | error | semantic |
| `COMPONENT_DECIDED_BY_INVALID_ADR` | error | semantic |
| `COMPONENT_DECIDED_BY_SUPERSEDED_ADR` | warning | semantic |
| `EVENT_EMIT_TARGET_NOT_EVENT` | error | semantic |
| `EVENT_SUBSCRIBE_TARGET_NOT_EVENT` | error | semantic |
| `EVENT_NO_SUBSCRIBER` | warning | semantic |
| `EVENT_SUBSCRIBE_NO_PUBLISHER` | warning | semantic |
| `WIRE_CAPTURE_MISSING` | warning | semantic |
| `WIRE_CAPTURE_PATH_BROKEN` | error | semantic |
| `WIRE_CAPTURE_STALE` | info | semantic |
| `MIGRATION_COLUMN_INCONSISTENT` | error | semantic |
| `TYPE_UNRESOLVED` | error | semantic |
| `WIRING_STEP_WITHOUT_CALL` | warning | semantic |
| `WIRING_CALL_WITHOUT_STEP` | info | semantic |
| `STEP_VIA_MISSING` | info | semantic |
| `THROWS_UNMAPPED` | warning | semantic |
| `EVENT_IDEMPOTENCY_MISSING` | warning | semantic |
| `EVENT_KEY_FIELD_UNKNOWN` | error | semantic |
| `EVENT_DELIVERY_ON_NON_EVENT` | error | semantic |

## Pass 0 — parse level

### `YAML_PARSE_ERROR`

**Severity:** error

The YAML file is syntactically broken before Pizza Doc even sees its shape.

Common causes:

- Tab vs space indentation mix.
- Unterminated string or unclosed bracket.
- A field value that needs quoting (starts with !, &, *, %, etc.).

**Fix:** The error message includes line/column. Fix that location and re-run pd validate.

### `FILE_UNRECOGNIZED`

**Severity:** info

A .yaml file lives in a path the loader doesn't classify; it's skipped.

Common causes:

- Note files in actors/, modules/, etc. that aren't entity declarations.
- Stray YAML in unexpected places.

**Fix:** Move the file out of the recognized layout, or rename it to match an entity slot.

## Change-set layer

### `CHANGE_NOT_FOUND`

**Severity:** error

The requested change-set has no changes/<id>/change.yaml file.

Common causes:

- Typo in --change id.
- The change was not initialized in this space.

**Fix:** Run `pd change list`, or create it with `pd change init <id> --title "..."`.

### `CHANGE_SCHEMA_INVALID`

**Severity:** error

The change.yaml metadata does not match the change-set schema.

Common causes:

- Unknown field, invalid status, or wrong field type in change.yaml.

**Fix:** Keep metadata to id, title, status, createdAt, owner, scope, implementation, deletes, adoptedAt, rejectedAt.

### `CHANGE_FILENAME_ID_MISMATCH`

**Severity:** error

The change folder name and change.yaml id disagree.

Common causes:

- Renamed changes/<id>/ without updating change.yaml, or copied metadata from another change.

**Fix:** Rename the folder or update change.yaml so both ids match.

### `CHANGE_DELETE_PATH_INVALID`

**Severity:** error

A delete path escapes the space or is not a canonical relative path.

Common causes:

- Absolute path, ../ segment, or empty delete path.

**Fix:** Use a space-relative path such as modules/api/components/OldController.yaml.

## Pass 1 — schema

### `SCHEMA_UNKNOWN_FIELD`

**Severity:** error

You added a field that the strict Zod schema does not allow.

Common causes:

- Common invented fields: owner, team, tags, status, version (these do not exist on entities).
- Typo on a real field (e.g. returnType instead of returns).

**Fix:** Check the field list in packages/core/src/schema.ts. If a field is not there, it is not real — drop it or use the right one.

### `SCHEMA_MISSING_REQUIRED`

**Severity:** error

A required field is missing from this entity.

Common causes:

- Most entities need: kind, id, name. Models also need modelKind and fields.
- Tables need columns. Use cases need actor, trigger, steps.

**Fix:** Add the field. The error message names the path.

### `SCHEMA_WRONG_TYPE`

**Severity:** error

A field has the wrong shape (string vs object, scalar vs array, etc.).

Common causes:

- Used scalar where object expected (e.g. methods: foo instead of methods: [{...}]).
- Single value where list expected.

**Fix:** See the type in packages/core/src/schema.ts and reshape the YAML.

### `SCHEMA_INVALID_VALUE`

**Severity:** error

The value violates a constraint (regex, enum, range, cross-field invariant).

Common causes:

- IDs that do not match [A-Za-z][A-Za-z0-9_-]*.
- HTTP status codes outside 100-599.
- Names with leading/trailing whitespace.
- `modelKind: enum` without a non-empty `values:` list.
- `modelKind: enum` carrying `fields:` (enums hold literals, not structured fields).
- `values:` declared on a model that is not `modelKind: enum`.

```yaml
kind: model
id: RuntimeId
name: RuntimeId
modelKind: enum
values:
  - claude-code
  - opencode
```

**Fix:** Fix the value to satisfy the constraint named in the message. For enum models: declare `values:` and omit `fields:`.

### `SCHEMA_INVALID_ID`

**Severity:** error

An id field does not match the kebab/identifier regex.

Common causes:

- Used spaces, slashes, or dots in an id.

**Fix:** IDs are kebab-case identifiers: start with a letter, then letters, digits, dashes, underscores.

### `SCHEMA_INVALID_REF_PATTERN`

**Severity:** error

A ref string does not match the ref grammar.

Common causes:

- Top-level kinds are only `actor:`, `module:`, `usecase:`. Anything else (component, model, table) reaches through a module.
- Used `schema:` (does not exist) instead of `domain:`.
- Wrote `component:Foo` without the module prefix.

**Fix:** Examples: actor:user · module:api · module:api/component:Foo · module:api/domain:orders/model:Order · usecase:place-order.

### `SCHEMA_UNKNOWN_MODULE_TYPE`

**Severity:** error

module.type is not one of the supported values.

Common causes:

- Typo or invented type.

**Fix:** Allowed: frontend · service · database · queue · external.

### `SCHEMA_UNKNOWN_MODEL_KIND`

**Severity:** error

model.modelKind is not a recognized value.

Common causes:

- Typo or invented kind.

**Fix:** Allowed: dto · entity · value-object · event · enum.

### `SCHEMA_UNKNOWN_COMPONENT_TYPE`

**Severity:** error

component.type is not a recognized value.

Common causes:

- Typo or invented type.

**Fix:** Allowed: controller · service · repository · infrastructure · page · widget · client · job · consumer · subscriber · middleware.

### `SCHEMA_FILENAME_ID_MISMATCH`

**Severity:** error

The id inside the file does not match the filename / parent folder.

Common causes:

- Renamed the file but not the id, or vice versa.
- For container files (space.yaml, module.yaml, domain.yaml): id must equal the parent folder name.
- For entity files (Component.yaml, Model.yaml, etc.): id must equal the filename without extension.

**Fix:** Rename the file/folder OR change the id. Note: the magic single-space folder `.pizza-doc/` is exempt for space.yaml — meta.id can be anything.

## Pass 2 — refs

### `REF_BROKEN`

**Severity:** error

A ref points to an entity that does not exist.

Common causes:

- Renamed an entity but did not update callers.
- Built top-down (use cases first), so refs point at things you have not created yet.
- Typo in the ref string.

**Fix:** Build bottom-up: tables → models → components → use cases. Run pd validate after every layer.

### `REF_WRONG_KIND`

**Severity:** error

The ref resolves to a real entity, but of the wrong kind for this slot.

Common causes:

- Pointed `persistedAs:` at a model instead of a table.
- Used a component ref where an actor was expected.

**Fix:** Check the schema slot. The ref grammar segment names the expected kind: `table:`, `component:`, etc.

## Pass 3 — semantic

### `USECASE_NO_STEPS`

**Severity:** warning

A use case declares no steps — there is no flow to validate.

Common causes:

- Stub use case left as a TODO.

**Fix:** Add steps[]: at least one step from actor → component, optionally a terminal step.

### `USECASE_STEP_CHAIN_DISCONTINUITY`

**Severity:** warning

Step N starts from a component that was never reached by previous steps (sync stack or spawned set).

Common causes:

- Async fan-out where the upstream step did not declare `kind: spawn` / `kind: parallel`.
- Truly missing intermediate step or wrong step order.

```yaml
steps:
  - from: A
    to: B
    kind: spawn      # B now runs in the background
  - from: B          # OK: B is in the spawned set
    to: C
```

**Fix:** If async: mark the upstream step `kind: spawn` (or `parallel`) so the validator records the spawned branch. If sync: add the missing intermediate step or fix the order.

### `USECASE_FIRST_STEP_NOT_FROM_FRONTEND`

**Severity:** warning

A user-actor use case starts somewhere other than a frontend module.

Common causes:

- The actor should be `system` (scheduler / cron / external trigger), not `user`.
- The flow really does start in a frontend, but the first step is mis-attributed.
- It's the same user action described from a system slice (downstream service, queue consumer, agent worker) — there's a separate canonical UI use case, this one models the back end view.

```yaml
kind: usecase
id: agent-handles-task
actor: actor:user             # user-triggered
perspective: system           # ← opt out of frontend-first
trigger: User submits a task; this slice describes the agent's view.
steps:
  - from: module:agent/component:Driver  # legitimately starts here
    to: module:agent/component:Worker
```

**Fix:** Three options: (1) change actor.type to `system` if the trigger is automated; (2) fix the first step to come from a frontend component; (3) set perspective: system on the use case to mark it as a system-side slice. Service-only spaces (no frontend module at all) auto-skip this rule.

### `USECASE_LAST_STEP_NOT_TERMINAL`

**Severity:** warning

The last step does not end at a terminal (DB write, external API, frontend surface).

Common causes:

- The flow stops mid-stack — usually you forgot to add the response or completion step.

**Fix:** Add a final step ending at: a table (sql), an external-api boundary, or a frontend component (http-response).

### `DTO_FLOW_VIA_TYPE_MISMATCH`

**Severity:** warning

A step `via:` DTO is neither accepted (param) nor returned by the target: warning for component targets, error when the step names an exact method.

Common causes:

- Renamed a DTO without updating the method signature.
- Step points via: at the wrong model, or to: at the wrong method.

**Fix:** Align the method signature with the DTO type, or fix the via:/to: pointers. A returns match counts — via on a GET edge may name the response model.

### `HTTP_STEP_TARGET_NOT_CONTROLLER`

**Severity:** error

A step with protocol http/sse/websocket/ws targets a component that is not a request/push receiver.

Common causes:

- Targeted a service or repository directly. The HTTP boundary is a `controller`, `consumer`, `subscriber`, or `middleware`.
- The component is an auth filter / interceptor / rate limiter and was scaffolded as `infrastructure` — change its type to `middleware`.

**Fix:** Change the step target to: `controller` (synchronous request handler), `consumer`/`subscriber` (push receiver: webhook / SSE / WS / queue / MCP listener), or `middleware` (request lifecycle hook: auth, logging, rate-limit, tracing).

### `SQL_STEP_TARGET_NOT_DATABASE`

**Severity:** error

A step with protocol `sql` does not end at a table inside a database module.

Common causes:

- Targeted a repository instead of the table the repository writes to.

**Fix:** sql steps go from repository → table (in a database module). Add the actual table ref.

### `DATAFLOW_SOURCE_FIELD_MISSING`

**Severity:** error

A `dataFlow.sourceField` does not exist on the named DTO/entity.

Common causes:

- Renamed a field, typo, or pointed at a non-existent model.

**Fix:** Spell sourceField as `<Model>.<field>` and ensure the field actually exists.

### `DATAFLOW_TARGET_FIELD_MISSING`

**Severity:** error

A `dataFlow.targetField` does not resolve, or the prefix is malformed.

Common causes:

- Bare `Table.column` form points at a missing table or column.
- Typed prefix has bad syntax (e.g. `stream:` without `<protocol>:<path>`, `cli-flag:` not starting with `-`).
- Unknown prefix.
- Mixed up with the step ref grammar — model targets do NOT use `module:.../model:Name.field`; just `model:Name.field` with the bare model id.

```yaml
dataFlow:
  # bare = table column (legacy default)
  - sourceField: Req.userId
    targetField: users.id
  # explicit table
  - sourceField: Req.userId
    targetField: table:users.id
  # model field — bare model id, NOT the step ref grammar
  - sourceField: ApiRequest.prompt
    targetField: model:NativeRequest.Prompt
  # CLI flag on the receiving process
  - sourceField: Req.prompt
    targetField: cli-flag:--prompt
  # short flag also OK
  - sourceField: Req.verbose
    targetField: cli-flag:-v
  # env var
  - sourceField: Req.apiKey
    targetField: env-var:ANTHROPIC_API_KEY
  # file path (any string after the colon)
  - sourceField: Req.runId
    targetField: file:.app/runtime-sessions/{runId}.json
  # network stream — protocol then path
  - sourceField: RuntimeEvent
    targetField: stream:sse:/runs/{runId}/events
  - sourceField: ChatMessage
    targetField: stream:websocket:/chat/{roomId}
  # queue / topic
  - sourceField: OrderEvent
    targetField: queue:orders.created
  # HTTP header
  - sourceField: Req.traceId
    targetField: http-header:X-Trace-Id
```

**Fix:** Known prefixes: table:, model:, cli-flag:, env-var:, file:, stream:<proto>:<path>, queue:, http-header:. Note: `model:Name.field` uses the bare model id — it is NOT the step ref grammar (no `module:.../`). Bare `Foo.bar` is treated as `table:Foo.bar` (legacy).

### `DATAFLOW_TYPE_INCOMPATIBLE`

**Severity:** warning

sourceField type does not match the targetField type and no transform is declared.

Common causes:

- Type mismatch left undocumented.

**Fix:** Add `transform: <description>` to acknowledge the conversion, or align the types.

### `DATAFLOW_TRANSFORM_MISSING`

**Severity:** warning

Same as above when a transform is required for the type mapping.

Common causes:

- Implicit conversion that should be explicit.

**Fix:** Add `transform:` describing the conversion.

### `DATAFLOW_UNUSED_DTO_FIELD`

**Severity:** warning

A field on a request DTO is never written to a column.

Common causes:

- Field exists but is dead — consumed but never persisted.

**Fix:** Either persist the field, document the deliberate drop in `description:`, or remove the field.

### `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN`

**Severity:** error

A NOT NULL column without a default is never written by any dataFlow.

Common causes:

- New column added without a corresponding write path.

**Fix:** Add a dataFlow rule that writes this column, give it a default, or make it nullable.

### `DUPLICATE_ID`

**Severity:** error

Two entities of the same kind share an id.

Common causes:

- Copy-paste mistake.

**Fix:** Make ids unique within their scope (file, module, or space, depending on kind).

### `CYCLIC_CALLS`

**Severity:** warning

Component.calls graph has a cycle (A → B → A).

Common causes:

- Real cycle in the architecture, or accidentally added a back-edge.

**Fix:** Audit whether the cycle is intentional. If yes, document it; if no, break the loop.

### `ACTOR_UNUSED`

**Severity:** warning

An actor is declared but never appears as `actor:` on any use case.

Common causes:

- Defined an actor speculatively, or dropped use cases that referenced it.

**Fix:** Wire the actor into a use case or remove the actor file.

### `COMPONENT_UNUSED`

**Severity:** warning

A component is declared but never referenced in any step, call, or composes link.

Common causes:

- Stub component or stale code.
- UI child mounted by a parent but no `composes:` link declared.

**Fix:** Reference the component from a use case step, a method `calls:` list, or a parent component's `composes: [<ref>]` (UI parent-child). Or add `suppress: [COMPONENT_UNUSED]` on the component for an explicit waiver. Or delete it.

### `DTO_UNUSED`

**Severity:** warning

A model is declared but never referenced anywhere the validator scans.

Common causes:

- Speculative DTO / enum / event left as a stub.
- Model renamed but callers not updated.

**Fix:** Reference the model from a method param/return, another model's field type (covers enums), a step `via:`, or a dataFlow sourceField. Otherwise delete it.

### `MODEL_FIELD_MISSING_COLUMN`

**Severity:** warning

An entity has a field with no matching column in its persistedAs table.

Common causes:

- Field added on the model, table not updated.

**Fix:** Add the column to the table or remove the field from the model.

### `FK_COLUMN_MISSING`

**Severity:** error

A foreign-key column references a table.column that does not exist.

Common causes:

- Renamed the parent table/column without updating FKs.

**Fix:** Fix the FK target to point at a real `<table>.<column>`.

### `STATE_MACHINE_INCOHERENT`

**Severity:** warning

A declared state machine has unreachable states or incompatible transitions.

Common causes:

- v0.2 contract feature; rule still being firmed up.

**Fix:** Audit the states/transitions; ensure every state is reachable from start.

### `CONFIG_KEY_DUPLICATE`

**Severity:** error

Two entries in the same module config-map share a `key`.

Common causes:

- Copy-paste while authoring config-map.yaml; two separate features adding the same env var name independently.

**Fix:** Pick one canonical entry, merge `description`/`related`/`sourceOfTruth` into it, delete the other. Cross-module duplicates are fine.

### `CONFIG_SECRET_SOURCE_UNRESOLVED`

**Severity:** error

A `type: secret` entry has no concrete `sourceOfTruth`.

Common causes:

- Stub left as `tbd`/`todo`/empty during initial scan.
- `sourceOfTruth` field missing entirely.

```yaml
- key: STRIPE_API_KEY
  type: secret
  lifecycle: startup
  mutability: rotatable
  consumer:
    component: module:backend/component:PaymentService
  sourceOfTruth: "vault:secret/app/stripe/api-key"
```

**Fix:** Set `sourceOfTruth` to the canonical store path: vault path, AWS Secrets Manager arn, "external (Console name)", etc. Anything but tbd/todo/empty.

### `CONFIG_RUNTIME_NO_ADMIN_UI`

**Severity:** warning

A `lifecycle: runtime` config key is not referenced by any component method or description.

Common causes:

- False advertising: the spec says "this can change at runtime" but no UI / API / control surface lets the admin actually change it.

**Fix:** Either add a component (typically in a frontend module) whose method/description references the key, or downgrade `lifecycle` to `startup`. The check is loose-match on key name + camelCased variants.

### `CONFIG_RELATED_BROKEN`

**Severity:** error

A `related: [...]` entry points to a non-existent config key.

Common causes:

- Renamed a key without updating its pair (eg. backend `GOOGLE_CLIENT_ID` ↔ frontend `VITE_GOOGLE_CLIENT_ID`).
- Bad ref grammar.

**Fix:** Use `config-map:<MODULE>/<KEY>` for cross-module pairs and a bare `<KEY>` for within-module. Both halves of the pair should declare the relationship.

### `EXTERNAL_DEP_USES_UNKNOWN_CONFIG`

**Severity:** error

An external-dep entry references `usesConfigKey: X` that is not in the same module config-map.

Common causes:

- Renamed the credential key on the config side without updating the dep.
- Forgot to add the credential key entirely.

**Fix:** Add the missing config-map entry (with `type: secret` and `sourceOfTruth`), or fix the `usesConfigKey:` value. Auth schemes other than `none` and `mtls` should always have a backing key.

### `EXTERNAL_DEP_ARG_CONTRACT_INVALID`

**Severity:** error

An exec positional argv contract is internally inconsistent.

Common causes:

- Required nonempty arg has an empty default.
- Positions are duplicated or have gaps.
- Enum or JSON-object defaults do not match their declared type.

**Fix:** Make positions a contiguous 1-based sequence, remove blank defaults for nonempty args, and align defaults with enum/json/positive-int constraints.

### `ADR_BROKEN_LINK`

**Severity:** error

A module references an ADR id that has no matching `decisions/ADR-NNN-*.md` file.

Common causes:

- Decision was renamed/superseded but module link not updated.
- ADR is in a draft branch not yet committed.

**Fix:** Either create the ADR file or remove the id from `module.yaml.decisions:`. ADR ids in module.yaml must match `^ADR-[0-9]{3,}$`.

### `ADR_DUPLICATE_ID`

**Severity:** error

Two ADR markdown files declare the same `id` in their frontmatter.

Common causes:

- Copy-paste mistake during ADR creation.
- Branch merge that created two ADRs with the same id concurrently.

**Fix:** Renumber one of them (and rename the file accordingly). ADR ids must be globally unique.

### `TOOL_SCHEMA_TOPLEVEL_COMBINATOR`

**Severity:** warning

A model/component declares an MCP/tool input schema whose root uses oneOf/anyOf/allOf/not.

Common causes:

- Encoded exactly-one-of arguments directly in a tool inputSchema root.
- Copied a JSON Schema that is valid generally but not accepted by Claude Code tool registration.
- The schedule_create incident: Claude Code silently dropped the tool when root oneOf reached the registry.

```yaml
inputSchema:
  type: object
  properties:
    at: { type: string }
    every: { type: string }
  oneOf:
    - required: [at]
    - required: [every]
```

**Fix:** Keep the inputSchema root a plain object. Put required/properties at the root, document mutually-exclusive fields in descriptions, and enforce the invariant server-side in the tool handler.

### `ADR_EMBEDS_SCHEMA_LITERAL`

**Severity:** info

An ADR fenced json/yaml block duplicates at least six consecutive lines from a model YAML file.

Common causes:

- Binding wire/model literals were copied into prose instead of referenced by path.
- A contract fix now has to be applied in both the YAML and ADR, creating drift risk.
- The oneOf incident fix had to chase the same literal in multiple places.

**Fix:** Move the binding literal to the model YAML only. In the ADR, link to or name the exact YAML path and describe the decision in prose.

### `CONFIG_REF_NOT_IN_SPEC`

**Severity:** error

Code reads a config key (env var / property) that is not declared in the corresponding module config-map.

Common causes:

- Engineer added a new `@Value("${X}")` / `os.Getenv("X")` / `process.env.X` without updating `modules/<id>/config-map.yaml`.
- The spec is stale relative to the code.
- The extractor mis-identified the module; check the JSONL `_placement.module` value.

**Fix:** Add a config-map entry for the key (with type, lifecycle, mutability, sourceOfTruth for secrets), or remove the call-site if the key is dead. Only emitted by `pd drift --from-jsonl`.

### `EXTERNAL_CALL_NOT_IN_SPEC`

**Severity:** error

Code makes an outbound network call to an endpoint that is not declared in the module external-deps.

Common causes:

- New integration added in code without updating `modules/<id>/external-deps.yaml`.
- Spec endpoint is fuzzier than the code's host (e.g. spec says `api.stripe.com`, code calls `https://api.stripe.com/v1/charges` — should still match by substring).
- The extractor mis-identified the module; check the JSONL `_placement.module` value.

**Fix:** Add an external-deps entry: name, direction, protocol, endpoint (host or URL prefix), consumer ref, auth scheme, and `usesConfigKey` for the credential. Only emitted by `pd drift --from-jsonl`.

### `CONTRACT_CALL_CREDENTIAL_MISSING`

**Severity:** warning

A non-optional path call declares no credential. Internal s2s calls without auth are a security smell.

Common causes:

- Caller upgraded to v0.3 object form but forgot to add `credential:` block.
- Internal endpoint is unauthenticated by design — mark `optional: true` or set `credential: { type: none }`.

**Fix:** Add `credential: { type: shared-secret, header: ..., env: ... }` on the call entry, or `credential: { type: none }` if unauthenticated is intentional.

### `CONTRACT_CALL_PATH_ORPHAN`

**Severity:** warning

Caller declares calls[].path + method but the callee component exposes no matching route.

Common causes:

- Caller's path is stale (was renamed on the callee).
- Callee's route was never modeled (missing httpMethod/httpPath on method or absent from routes[]).
- Path mismatch by prefix (`/api/foo` vs `/foo`).

**Fix:** Add a matching route on the callee component (either `routes:` entry or `httpMethod`/`httpPath` on a method), or correct the caller path.

### `CONTRACT_CALL_HEADER_MISMATCH`

**Severity:** warning

Caller's credential.header differs from the matched callee route's auth.header.

Common causes:

- Header was renamed on one side without updating the other (X-Internal-Auth → X-Service-Auth).
- Caller copy-pasted from a different integration.

**Fix:** Pick the canonical header name and use it on both sides (`credential.header` on caller, `auth.header` on callee route).

### `CONTRACT_CALL_ENV_MISMATCH`

**Severity:** warning

Caller's credential.env (config-map key) differs from the matched callee route's auth.env.

Common causes:

- Caller and callee read different env vars for the same shared secret — they will diverge on rotation.
- Naming convention drift across modules.

**Fix:** Use the same config-map key on both sides, or document the rotation contract that keeps them in sync.

### `STATE_MACHINE_SCENARIO_COVERAGE`

**Severity:** info

Non-trivial transitions (into terminal states or with post-invariants) have no scenarios[] asserting their post-conditions.

Common causes:

- Author declared transition into FAILED but never wrote a scenario for "after this transition, what is persisted?".
- Transition declares `invariants.post: [...]` but no scenario.then[] mentions any of those strings.

**Fix:** Add a scenarios[] entry with `then: [<post-invariant string>]`. The scenario harness (per-language) reads these and turns them into runnable contract tests that catch rollback / partial-write bugs.

### `HOST_DEP_BINARY_SHA256_MISSING`

**Severity:** warning

A host-binary entry with a github-release or url source has no sha256 pin.

Common causes:

- Author transcribed the source URL but forgot to record the digest.
- Asset is a tracking branch / latest tag and the team accepts unpinned (rare; comment-document it).

**Fix:** Add `source.sha256: <pinned-digest>` so deploy workflows can verify integrity.

### `HOST_DEP_ARTIFACT_RECIPE_MISSING`

**Severity:** error

A host-artifact entry with `source.type: build-on-host` is missing `recipe` or `input_checksums`.

Common causes:

- No build script path declared — the artifact is implicitly assumed-present.
- Recipe declared but input_checksums is empty — the build is never invalidated when its inputs change.

**Fix:** Set `source.recipe: <path-to-build-script>` and list every input file (or glob) under `source.input_checksums`.

### `HOST_DEP_PREFLIGHT_MISSING`

**Severity:** warning

A host-installed dependency has no `preflight` command. Deploy/boot has nothing to probe.

Common causes:

- The dep was modeled but the team hasn't agreed on a probe yet.
- The probe lives in tooling outside the spec (move it inline so spec stays self-contained).

**Fix:** Add `preflight: { command: <bash command>, expected: exit_code_0 }` so the boot script and `pd drift` have a concrete probe.

### `HOST_DEP_PROD_OWNER_MISSING`

**Severity:** warning

A host dep marked `required_in_profiles: [prod]` has no `install_owner`. No team is accountable.

Common causes:

- New host dep added without claiming ownership.
- Ownership lives in a Slack thread / wiki page — not in the spec.

**Fix:** Set `install_owner: <team-name>` (the team responsible for keeping the dep installed and the deploy workflow green).

### `RUNBOOK_COVERAGE`

**Severity:** info

A use-case errorFlow has no runbook in `operations/runbooks/` covering it.

Common causes:

- New errorFlow added without a paired runbook.
- Runbook exists but its `covers:` field does not list the errorFlow id.

**Fix:** Add a runbook with `covers: [<errorFlow.id>]`, or extend an existing runbook's `covers:`. Set severity=p0/p1 for runbooks that gate prod readiness.

### `RUNBOOK_BROKEN_LINK`

**Severity:** error

A runbook references an ADR id that does not exist in `decisions/`.

Common causes:

- ADR id typo (ADR-007 vs ADR-7).
- Referenced ADR was deleted without updating the runbook.

**Fix:** Fix the ADR id in the runbook frontmatter, or remove the reference if the ADR is no longer relevant.

### `COMPONENT_DECIDED_BY_INVALID_ADR`

**Severity:** error

A component lists an ADR id in `decidedBy` that does not match any `decisions/ADR-NNN-*.md` file.

Common causes:

- ADR id typo (ADR-007 vs ADR-7).
- The ADR file was deleted but the back-reference was not cleaned up.
- The ADR file is named differently (e.g. `decisions/ADR-026-foo.md` vs `ADR-026.md`).

**Fix:** Fix the ADR id in the component yaml, or remove the entry from `decidedBy` if the ADR is no longer relevant.

### `COMPONENT_DECIDED_BY_SUPERSEDED_ADR`

**Severity:** warning

A component is decided by an ADR whose status is `superseded` or `deprecated`.

Common causes:

- The original ADR was replaced by a newer one (frontmatter has `supersededBy:`).
- The decision was retired and the component yaml was never updated.

**Fix:** Replace the old ADR id with its `supersededBy:` target, or drop the link if the decision no longer applies. Keeps `decidedBy` pointing at the current source of truth.

### `EVENT_EMIT_TARGET_NOT_EVENT`

**Severity:** error

A component's `emits[].event` ref resolves to a model whose `modelKind` is not `event`.

Common causes:

- Pointed `emits[].event` at an entity / DTO / value-object by accident.
- The target model used to be `modelKind: event` and got changed.

**Fix:** Set the target model's `modelKind: event`, or repoint `emits[].event` at the actual event payload model. Events have payload contracts the same way DTOs do — they're just modeled as `modelKind: event`.

### `EVENT_SUBSCRIBE_TARGET_NOT_EVENT`

**Severity:** error

A component's `subscribes[].event` ref resolves to a model whose `modelKind` is not `event`.

Common causes:

- Pointed `subscribes[].event` at an entity / DTO / value-object by accident.
- The target model used to be `modelKind: event` and got changed.

**Fix:** Set the target model's `modelKind: event`, or repoint `subscribes[].event` at the actual event payload model.

### `EVENT_NO_SUBSCRIBER`

**Severity:** warning

A component publishes an event but nothing in the space subscribes to it.

Common causes:

- Subscriber was deleted but the publisher was left in place.
- Subscriber lives outside this space (cross-space pub/sub — currently not modeled).
- Dead publish — nobody ever listened.

**Fix:** Either add a `subscribes:` entry on the receiver component, or remove the `emits:` entry from the publisher. Cross-space cases can suppress this code on the publisher.

### `EVENT_SUBSCRIBE_NO_PUBLISHER`

**Severity:** warning

A component subscribes to an event but nothing in the space publishes it.

Common causes:

- Publisher was deleted but the subscriber was left in place.
- Publisher lives outside this space.
- Typo on the `event:` ref — it doesn't match any `emits[].event`.

**Fix:** Add an `emits:` entry on the publisher, or fix the typo. The two refs must match exactly. Cross-space cases can suppress this code on the subscriber.

### `WIRE_CAPTURE_MISSING`

**Severity:** warning

A component consumes an `http-api` external-dep but declares no `wireCapture` pinning real wire shape.

Common causes:

- Spec was authored before the component had any captured-traffic fixtures.
- Component was added but the team relied on synth fixtures instead of real captures.

**Fix:** Add `wireCapture: { source, path, capturedAt, capturedAgainst, scenarios }` on the component. Source examples: `tcpdump`, `curl-live`, `debug-log`. Path is space-relative — convention: `.pizza-doc/wire-captures/<integration>/<scenario>.txt`. Use `--strict-wire-capture` in CI to escalate to error once you've captured baseline traffic.

### `WIRE_CAPTURE_PATH_BROKEN`

**Severity:** error

A component declares `wireCapture.path` but the file does not exist on disk (or is empty).

Common causes:

- Capture file was deleted but the spec was not updated.
- Path is misspelled relative to the space root.
- File exists but is zero bytes (truncated, incomplete capture).

**Fix:** Restore the capture file, fix the path, or re-record. The path is resolved relative to the space directory.

### `WIRE_CAPTURE_STALE`

**Severity:** info

A component's `wireCapture.capturedAt` is more than 30 days old.

Common causes:

- Vendor may have changed wire shape since the capture (changelog landed).
- No one has refreshed the fixture in a release cycle.

**Fix:** Re-capture the wire scenarios you care about and bump `capturedAt`. Bump `capturedAgainst` too if the vendor version changed.

### `MIGRATION_COLUMN_INCONSISTENT`

**Severity:** error

A `migrations:` entry on a table contradicts the current `columns:` snapshot (e.g. drop-column declared but the column is still listed).

Common causes:

- Code dropped a column but the spec author forgot to update the columns list.
- Migration entry was added optimistically before the DDL ran.
- Reverted migration was not removed from the history list.

**Fix:** Reconcile `columns:` and `migrations:`. For drop-column: remove the column from columns[]. For add-column: add it. For alter-column: ensure the column exists in columns[]. If the migration was reverted, remove it from the migrations[] list.

### `TYPE_UNRESOLVED`

**Severity:** error

A method param/return or model field names a type that is neither a primitive nor any model in the space.

Common causes:

- Typo in the type name (`UserDtoo`).
- Model was renamed or deleted but a signature still names the old type.
- Type exists only in code and was never modeled in the spec.

**Fix:** Fix the spelling (the message suggests near-matches), add the missing model, or use a primitive. Wrapper names (`List<…>`, `Page<…>`) are not checked — only their type arguments. Exception names from `errorMapping[].exception` count as known types, and `type: external` modules are exempt (their contract is pinned by wireCapture).

### `WIRING_STEP_WITHOUT_CALL`

**Severity:** warning

A use-case step walks an edge (http/internal-call/event) that the component wiring never declares.

Common causes:

- Step was written top-down and the calls:/emits:/subscribes: wiring was never added.
- Wiring was refactored (call removed or moved) but the scenario still walks the old edge.
- Step endpoints point at the wrong components.

**Fix:** For http/internal-call: add a 'calls:' entry on the calling method of the from-component (or 'composes:' for structural containment). For event: declare 'emits:' on the publisher and 'subscribes:' on the receiver against the same event model. Use --strict-wiring in CI to escalate to error.

### `WIRING_CALL_WITHOUT_STEP`

**Severity:** info

A declared call edge is never walked by any use-case step.

Common causes:

- No scenario models the flow that exercises this call.
- The call is dead wiring left behind by a refactor.

**Fix:** Add (or extend) a use case whose steps walk the edge, or remove the calls: entry if the dependency is gone.

### `STEP_VIA_MISSING`

**Severity:** info

An http/event step into a concrete component has no payload model (via:).

Common causes:

- Step was sketched before the DTO / event model existed.
- Author documented the edge but not its contract.

**Fix:** Set 'via:' to the request DTO or event model; response-only edges (GET) may point via: at the response model. Truly payload-less edges: suppress the code on the use case. --strict-wiring escalates to error.

### `THROWS_UNMAPPED`

**Severity:** warning

A method serving an HTTP route throws an exception that has no row in its module's errorMapping — the wire-level outcome is undeclared.

Common causes:

- The throw was added to the method signature but the module-level errorMapping was never extended.
- Exception was renamed in the mapping (or the method) but not both.
- The exception is actually handled internally and can never escape.

**Fix:** Add '- exception: <Name>' with an httpStatus (and optionally a machine-readable code) to the module's errorMapping, or drop the throw if it can't escape. Only http-reachable methods (httpMethod set) are checked; `type: external` modules are exempt. --strict-contracts escalates to error.

### `EVENT_IDEMPOTENCY_MISSING`

**Severity:** warning

A component subscribes to an event that declares delivery: at-least-once, but the subscription declares no idempotency.

Common causes:

- The delivery guarantee was added to the event model after the subscribers were written.
- The consumer really is not idempotent — the classic double-processing hole.

**Fix:** Add 'idempotency: { key: <event field>, strategy: dedupe-store | upsert | natural }' to the subscribes entry. Events without a declared 'delivery' are not checked — declare the delivery guarantee to arm this rule.

### `EVENT_KEY_FIELD_UNKNOWN`

**Severity:** error

An event model's orderingKey (or a subscription's idempotency.key) names a field that does not exist on the event model.

Common causes:

- Typo in the key name.
- The event field was renamed but the delivery contract still names the old field.

**Fix:** Fix the key to name an existing field on the event model (the message suggests near-matches), or add the field.

### `EVENT_DELIVERY_ON_NON_EVENT`

**Severity:** error

A model declares delivery / orderingKey but its modelKind is not 'event' — delivery contracts only apply to events.

Common causes:

- The model was demoted from event to dto/entity but kept its transport fields.
- Copy-paste from an event model.

**Fix:** Change modelKind to 'event' (and set topic:), or remove delivery / orderingKey from the model.

## Adding a rule

See [CONTRIBUTING.md → adding a validation rule](https://github.com/pizza-doc/pizza-doc/blob/main/CONTRIBUTING.md#adding-a-validation-rule).
Every new code needs a DOCS entry in `packages/cli/src/commands/lint.ts`;
this page regenerates from it via `pnpm gen:rules-doc`.
