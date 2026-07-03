---
title: YAML format reference
description: Every field on every entity. Source of truth is the Zod schemas in @pizza-doc/core.
---

This page documents the shape of every YAML entity Pizza Doc reads. The
authoritative source is `packages/core/src/schema.ts` — when the two
disagree, the schema wins. All schemas are `.strict()`: a field this page
doesn't list does not exist, and the validator rejects it.

Two mechanical companions to this page:

- `pnpm gen:schemas` emits JSON Schemas into `.pizza-doc/schemas/` so
  VS Code validates and autocompletes the YAML inline.
- [`pd lint --explain <CODE>`](/reference/validation-rules/) documents every
  validator code referenced below.

## Space layout

```
<space root>/
  space.yaml
  actors/<id>.yaml
  modules/<id>/module.yaml
  modules/<id>/config-map.yaml            # optional
  modules/<id>/external-deps.yaml         # optional
  modules/<id>/state-machines/<id>.yaml   # optional, standalone SMs
  modules/<id>/[domains/<d>/]components/<id>.yaml
  modules/<id>/[domains/<d>/]models/<id>.yaml
  modules/<id>/[domains/<d>/]tables/<id>.yaml
  use-cases/<id>.yaml
  decisions/ADR-NNN-<slug>.md             # optional, ADR log
  operations/runbooks/<id>.md             # optional
  operations/health-contracts/<moduleId>.yaml  # optional
  wire-captures/<integration>/<scenario>.txt   # optional, referenced by wireCapture
  changes/<id>/…                          # optional, change-set overlays
```

Container files inherit their `id` from the folder name
(`modules/api-server/module.yaml` → `id: api-server`); every other file's
name must equal the `id` inside it (`SCHEMA_FILENAME_ID_MISMATCH`).

## Ref grammar

```
actor:<id>
module:<id>
module:<id>/component:<id>
module:<id>/component:<id>/method:<name>
module:<id>/model:<id>
module:<id>/table:<id>
module:<id>/domain:<id>/component:<id>
module:<id>/domain:<id>/component:<id>/method:<name>
module:<id>/domain:<id>/model:<id>
module:<id>/domain:<id>/table:<id>
usecase:<id>
```

Top-level kinds are `actor`, `module`, `usecase` — everything else reaches
through a module (and optionally a domain).

## `space.yaml`

One per space, at the root. Only a `meta:` block.

```yaml
meta:
  id: my-space                 # required, [a-zA-Z][a-zA-Z0-9_-]*
  name: My Space               # required
  description: …               # optional
  version: 0.1.0               # default "0.1.0"
  pizzaDocVersion: 0.1.0       # default "0.1.0"
  implementationLanguage: typescript   # optional hint for pd-extract-*/pd-implementer
  implementationFramework: nestjs      # optional framework hint within the language
```

## `actor`

```yaml
kind: actor
id: customer                   # required
name: Customer                 # required
type: user                     # user | system | scheduler (default: user)
description: …                 # optional
suppress: [ACTOR_UNUSED]       # optional — validator codes to drop for this actor
```

File path convention: `actors/<id>.yaml`.

## `module`

```yaml
kind: module
id: api-server                 # required
name: API Server               # required
type: service                  # required — frontend | service | database | queue | external
techStack: Node 20 + Fastify   # optional
description: …                 # optional
domains: []                    # optional — see `domain` below
components: []                 # optional — inline components
models: []                     # optional — inline models
tables: []                     # optional — inline tables
decisions: [ADR-003]           # optional — ADR ids anchored to this module
errorMapping:                  # optional — exception → wire outcome table
  - exception: StripeDeclinedException
    httpStatus: 402
    code: STRIPE_DECLINED      # optional machine-readable error code
    description: …             # optional
    handlerRef: module:api-server/component:ErrorHandler/method:handle  # optional evidence
    sourceRef: src/errors.ts:44                                         # optional evidence
```

`configMap`, `externalDeps`, `stateMachines`, and `healthContract` also
live on the module at load time, but authors don't write them in
`module.yaml` — they come from the sibling files listed in the layout
above.

`errorMapping` is the wire-outcome contract for the whole module: every
`throws` on an HTTP-serving method must have a row here
(`THROWS_UNMAPPED`, error under `--strict-contracts`), and
`pd-implementer` turns the table into framework error handlers.

Tables live **only** in `database` / `queue` modules; entities in service
modules point across with `persistedAs`.

## `domain`

```yaml
id: orders                     # required
name: Orders                   # required
description: …                 # optional
components: []                 # optional
models: []                     # optional
tables: []                     # optional
```

File path: `modules/<module-id>/domains/<id>/domain.yaml`. Domains don't
have `kind:` — they're recognised by their path.

## `component`

```yaml
kind: component
id: OrderController            # required
name: OrderController          # required
type: controller               # required — controller | service | repository | infrastructure
                               #   | page | widget | client | job
                               #   | consumer | subscriber | middleware
description: …                 # optional
methods: []                    # optional — see `method`
composes:                      # optional — structural children (mounted, not called)
  - module:web-frontend/component:PizzaCard
routes:                        # optional — inbound routes NOT bound to one method
  - path: /webhooks/stripe
    method: POST
    auth: { type: shared-secret, env: STRIPE_WEBHOOK_SECRET, header: Stripe-Signature }
    description: …
    sourceRef: src/webhooks.ts:10
emits:                         # optional — events this component publishes
  - event: module:api-server/domain:orders/model:OrderPlaced
    to: []                     # optional documentation-only subscriber list
    description: Published after the orders transaction commits.
subscribes:                    # optional — events this component consumes
  - event: module:api-server/domain:orders/model:OrderPlaced
    via: module:queue/component:Bus   # optional bus/dispatcher, documentation only
    idempotency:               # expected when the event is delivery: at-least-once
      key: orderId             # must name a field on the event model
      strategy: dedupe-store   # dedupe-store | upsert | natural
      description: …
wireCapture:                   # optional — captured-traffic contract pin
  source: curl-live            # tcpdump | curl-live | debug-log | replay-from-prod | custom
  path: wire-captures/stripe/create-charge.txt   # space-relative, must exist on disk
  capturedAt: 2026-07-03       # ISO date; >30 days old ⇒ WIRE_CAPTURE_STALE info
  capturedAgainst: stripe-api@2024-06-20          # optional vendor/version descriptor
  scenarios:
    - name: success
      assertions: { status: 200 }
decidedBy: [ADR-001]           # optional — ADR ids that shape this component
suppress: [COMPONENT_UNUSED]   # optional — validator codes to drop (not SCHEMA_*/REF_*)
entrypoint:                    # optional — justifies an intentional composition root
  kind: composition-root       # composition-root | framework-entrypoint | runtime-entrypoint
  reason: Started by application bootstrap
readiness:                     # optional
  orphan:
    reason: Intentionally mounted outside product use cases
sourceRef: src/orders.ts:12    # optional — see “sourceRef” below
```

`consumer` / `subscriber` / `middleware` types are valid HTTP-step targets
alongside `controller`. `emits`/`subscribes` pairs are what keep
event-driven components out of `COMPONENT_UNUSED`, and an `event`-protocol
use-case step must be backed by such a pair
(`WIRING_STEP_WITHOUT_CALL`).

## `method`

Lives inside a component's `methods:` list. No `kind:` of its own.

```yaml
- name: placeOrder             # required
  params:                      # optional — same shape as model fields
    - name: request
      type: CreateOrderRequest
      optional: false
      validation: { format: uuid }   # optional, see “field validation”
  returns: OrderResponse       # default "void" — omit for void methods
  calls:                       # optional — outbound edges
    - module:api-server/domain:orders/component:OrderService/method:place   # legacy ref form
    - target: module:api-server/domain:orders/component:OrderController/method:create
      path: /api/orders        # object form: pairs with callee route for orphan-path checks
      method: POST
      credential:              # what the caller attaches
        type: user-jwt         # shared-secret | signed-token | user-jwt | none
        header: Authorization  # required for shared-secret/signed-token over HTTP
        env: SERVICE_TOKEN     # config-map key holding the credential
      optional: false          # true = best-effort call, caller survives callee downtime
      description: …
  throws: [StripeDeclinedException]  # each needs a module errorMapping row (THROWS_UNMAPPED)
  httpMethod: POST             # optional — GET | POST | PUT | PATCH | DELETE
  httpPath: /api/orders        # optional
  routeAuth:                   # inbound auth this route requires; mirrors caller credential
    type: user-jwt
    header: Authorization
  description: …               # optional
  readiness:                   # optional — endpoint-level production waiver
    orphan:
      reason: Operator-only endpoint covered by deploy smoke tests
  sourceRef: src/orders.ts:44  # optional
```

Every non-primitive leaf type in `params`/`returns` must resolve to a
model by id or name (`TYPE_UNRESOLVED`, always an error). Caller
`credential` and callee `routeAuth` must agree on header/env
(`CONTRACT_CALL_*`, errors under `--strict-contracts`).

On `client` / `page` / `widget` components, `httpMethod`/`httpPath`
document the **outgoing** request the client makes (the apiClient idiom) —
they are exempt from `THROWS_UNMAPPED` and route-orphan checks.

## Fields and validation

Model `fields:` and method `params:` share one shape:

```yaml
- name: email                  # required
  type: string                 # required — primitive, model id/name, or List<X> / X[]
  optional: false              # default false
  cardinality: one             # one | many — structured alternative to List<X>
  persisted: true              # default true; false = derived/transient (skips column check)
  validation:                  # optional — all fields optional
    format: email              # any JSON-Schema format value, free-form
    min: 0                     # numeric bounds (inclusive)
    max: 100
    minLength: 8               # string length bounds
    maxLength: 64
    pattern: '^[a-z]+$'        # ECMAScript regex
    enumValues: [S, M, L]      # closed value set
    description: …
  description: …               # optional
  example: m@example.com       # optional, any YAML value
  sourceRef: src/models.ts:12  # optional
```

## `model`

DTOs, entities, value-objects, events, and enums.

```yaml
kind: model
id: OrderPlaced                # required
name: OrderPlaced              # required
modelKind: event               # required — dto | entity | value-object | event | enum
fields: [...]                  # required except for modelKind: enum
values: []                     # required for modelKind: enum; not allowed otherwise
description: …                 # optional
persistedAs: module:postgres-db/domain:orders/table:orders   # entity → table link
topic: orders.placed           # event models — transport channel name
delivery: at-least-once        # event models — at-least-once | at-most-once | exactly-once
orderingKey: orderId           # event models — field that partitions/orders delivery
stateMachine: {...}            # optional — see “state machines”
suppress: [DTO_UNUSED]         # optional
readiness:                     # optional
  orphan:
    reason: Implemented for downstream events not modeled as use cases
sourceRef: src/models.ts:12    # optional
```

The event delivery contract (v0.6): declaring `delivery: at-least-once`
arms `EVENT_IDEMPOTENCY_MISSING` on every subscriber without an
`idempotency` block. `orderingKey` and `idempotency.key` must name real
event fields (`EVENT_KEY_FIELD_UNKNOWN`); `delivery`/`orderingKey` on a
non-event model is an error (`EVENT_DELIVERY_ON_NON_EVENT`).

`persistedAs` drives the `MODEL_FIELD_MISSING_COLUMN` fields↔columns
check; only useful on `modelKind: entity`.

## State machines

Inline on a model (simple case — one entity, one lifecycle field):

```yaml
stateMachine:
  field: status                # the model field holding the current state
  states: [paid, preparing, delivered, cancelled]   # min 2
  initial: paid                # optional, must be in states
  terminal: [delivered, cancelled]
  stateConfig:                 # optional per-state metadata
    - id: preparing
      terminal: false
      timeout: { after: 45m, transition_to: cancelled, reason: kitchen stall }
  transitions:
    - from: paid
      to: preparing            # string or list of strings
      trigger: KitchenNotifier.onOrderPlaced   # `on` is the legacy synonym — set at most one
      actor: system            # optional — user | system | free-form
      guard: payment settled   # optional prose pre-condition
      invariants: { pre: [], post: [] }        # optional structured invariants
  scenarios:                   # optional contract tests; coverage via --check-state-coverage
    - id: kitchen-accepts-order
      given: order in paid
      when: trigger KitchenNotifier.onOrderPlaced
      then:
        - order.status == preparing
```

Standalone file at `modules/<m>/state-machines/<id>.yaml` for
cross-cutting lifecycles — same fields plus:

```yaml
kind: state-machine
id: provisioning-lifecycle
name: Provisioning lifecycle
governs: module:backend/model:Workspace.provisionState  # optional model.field pin
```

## `table`

```yaml
kind: table
id: orders                     # required
name: orders                   # required
columns:                       # required
  - name: id
    sqlType: uuid
    primaryKey: true           # default false
    nullable: false            # default false
    unique: false              # default false
    default: gen_random_uuid() # SQL default — makes the column write-optional for dataFlow
    foreignKey:                # optional
      table: module:postgres-db/domain:menu/table:pizzas
      column: id
    description: …
    sourceRef: db/schema.sql:12
indexes:                       # optional
  - name: idx_orders_customer
    columns: [customer_id]
    unique: false
migrations:                    # optional ordered history (v0.5)
  - id: V0028
    action: add-column         # create | add-column | drop-column | alter-column
    columns: [stripe_charge_id]
    description: …
    sourceRef: migrations/V0028.sql
description: …                 # optional
readiness:                     # optional
  orphan:
    reason: Managed by migration jobs outside product use cases
sourceRef: db/schema.sql:1     # optional
```

## `usecase`

```yaml
kind: usecase
id: place-order                # required
name: Customer places an order # required
actor: actor:customer          # required
trigger: Submitting /checkout  # required — free text
perspective: user              # optional — user | system (system skips the
                               #   first-step-from-frontend warning)
description: …                 # optional
steps:                         # required
  - from: module:web-frontend/component:CartPage
    to: module:api-server/domain:orders/component:OrderController
    via: module:api-server/domain:orders/model:CreateOrderRequest   # payload model
    protocol: http             # http | http-response | sse | websocket | ws
                               #   | internal-call | sql | event | external-api
    kind: sync                 # sync (default) | spawn | parallel — concurrency shape
    description: …
errorFlows:                    # optional
  - id: stripe-declined        # required
    condition: Stripe returns 4xx
    steps: [...]               # same shape as top-level steps
    resultDescription: 'Returns 402 with { error: "STRIPE_DECLINED" }'
invariants:                    # optional
  pre: []
  post: []
requires:                      # optional machine-enforced pre-conditions
  - role: SUPER_ADMIN          # global role
    tenantRole: SHOP_MANAGER   # tenant-scoped role
    tenantContext: true        # request must carry a resolved tenant
    flag: new-checkout         # feature flag that must be on
    description: …
dataFlow:                      # optional
  - sourceField: CreateOrderRequest.sourceToken
    targetField: orders.stripe_charge_id
    cardinality: one           # one | many (list field fans out into rows)
    transform: via StripeAPI.createCharge
suppress: [USECASE_LAST_STEP_NOT_TERMINAL]   # optional
sourceRef: …                   # optional
```

Steps are hard-linked to the wiring: an `http`/`internal-call` step must
match a declared `calls`/`composes` edge and an `event` step needs an
`emits`/`subscribes` pair on the same event model
(`WIRING_STEP_WITHOUT_CALL`); `http`/`event` steps should carry `via`
(`STEP_VIA_MISSING`). `--strict-wiring` escalates both. `kind: spawn` /
`parallel` model background fan-out without tripping the continuity check.

### Data flow field grammar

`sourceField` defaults to `Model.field`. Reverse-engineered specs may also
use `model:Model.field`, `path:organisationId`, `query:page`,
`header:X-Tenant`, or `const:ACTIVE`.

`targetField` defaults to a table column (`table.column`). You can be
explicit with `table:table.column`, write to a model with
`model:Dto.field`, or describe non-table sinks with `cli-flag:--name`,
`env-var:NAME`, `file:path`, `stream:sse:/path`, `queue:topic`, and
`http-header:X-Name`.

See [data flow](/concepts/data-flow/) for the validation rules.

## `config-map.yaml`

Module-scoped configuration entries live at
`modules/<module-id>/config-map.yaml` — a top-level YAML list.

```yaml
- key: STRIPE_API_KEY          # UPPER_SNAKE_CASE or property-style identifier
  type: secret                 # secret | non-secret
  lifecycle: startup           # build | startup | runtime
  mutability: rotatable        # immortal | rotatable | hot-reload
  consumer:
    component: module:api-server/domain:orders/component:PaymentGateway
    callsite: process.env.STRIPE_API_KEY   # optional reader-facing snippet
  related: [VITE_STRIPE_PUBLIC_KEY]        # optional; cross-module form config-map:<MODULE>/<KEY>
  sourceOfTruth: Stripe dashboard → API keys   # required in spirit for secrets
  defaultValue: /var/lib/workers           # optional documented fallback (never for secrets)
  defaultSources:              # optional observed defaults from code/deploy/etc.
    - source: code             # code | workflow | deploy | bootstrap | script | docs
      value: /var/lib/workers
      sourceRef: src/config.go:22
  sourceRef: src/config.go:20  # optional
```

When `defaultValue` and `defaultSources[].value` disagree, `pd readiness
--profile production` fails with `READINESS_CONFIG_DEFAULT_DRIFT`.

## `external-deps.yaml`

Module-scoped dependencies outside the application boundary live at
`modules/<module-id>/external-deps.yaml` — a top-level YAML list. Entries
are a discriminated union on `kind`; entries without `kind` parse as
`http-api`.

```yaml
- kind: http-api               # default
  name: stripe                 # kebab-case slug, unique in the module
  direction: outbound          # outbound | inbound | bidirectional
  protocol: https              # free-form; https/grpc/websocket/amqp/kafka/…
  endpoint: api.stripe.com     # host/URL prefix — never a secret
  purpose: Card charges at checkout
  consumer: module:api-server/domain:orders/component:PaymentGateway
  auth: bearer                 # none | bearer | api-key | basic | mtls | oauth2
                               #   | aws-signature | custom
  usesConfigKey: STRIPE_API_KEY   # config-map key carrying the credential
  failureMode: fail checkout with 402/503; no retry (ADR-001)
  sourceRef: src/payments.ts:8
```

Host-installed kinds (`host-binary`, `host-artifact`, `apt-package`)
model deploy-time assets (`install_path`, checksums, source workflows) —
see the schema for their exact fields. `file`/`device`/`exec`-protocol
deps are preflight-gated:

```yaml
- name: legacy-worker-provision-script
  direction: outbound
  protocol: exec
  endpoint: /opt/example/provision-worker.sh
  consumer: module:worker-service
  auth: none
  preflightCheck: { sourceRef: src/preflight.go#CheckHost }
  driftProbe: { sourceRef: scripts/drift-smoke.sh }
  positionalArgs:              # ordered-argv contract for exec boundaries
    name: LegacyWorkerArgs
    contractTest: { sourceRef: src/legacy-adapter.test.ts:91 }
    acceptanceCriteria:
      - arg #1 worker_id is nonempty
    args:
      - { position: 1, name: worker_id, type: string, nonempty: true }
      - { position: 2, name: runtime, type: enum, enumValues: [RUNTIME_API, RUNTIME_OAUTH] }
```

`pd readiness --profile production` fails if a `file`, `device`, or `exec`
dependency has no `preflightCheck.sourceRef` or `driftProbe.sourceRef`,
and when an `exec` dependency declares required positional args without
`positionalArgs.contractTest.sourceRef`.

## `decisions/ADR-NNN-<slug>.md`

Architecture Decision Records — markdown files with YAML frontmatter. The
body is free markdown and is loaded lazily (`pd export … --include-decisions`
and the implementation brief inline it).

```markdown
---
id: ADR-001                    # required, ADR-NNN; filename must start with it
title: Charge Stripe synchronously inside checkout, no retry
status: accepted               # proposed | accepted | deprecated | superseded
date: 2026-07-03               # optional
decider: solo                  # optional
supersedes: []                 # optional ADR ids this one replaces
supersededBy: null             # optional ADR id that replaced this one
---

## Context …
```

Link ADRs from entities: `module.decisions: [ADR-001]` (coarse) or
`component.decidedBy: [ADR-001]` (precise). Broken links are
`COMPONENT_DECIDED_BY_INVALID_ADR` / `ADR_BROKEN_LINK`; pointing at a
superseded ADR warns.

## `operations/runbooks/<id>.md`

Operational playbooks — markdown + frontmatter, linked to use-case error
flows via `covers`.

```markdown
---
id: stripe-declines-spike      # required, must match filename stem
title: Stripe decline rate spikes above baseline   # optional
severity: p2                   # p0 | p1 | p2 | validation-error
owner: solo                    # optional
trigger: 402 rate exceeds 5% for 15+ minutes       # optional
covers: [stripe-declined]      # errorFlow ids (or usecase:<id>/errorFlow:<id> refs)
decisions: [ADR-001]           # optional related ADRs
---

## Detection …
```

Every errorFlow without a covering runbook is a `RUNBOOK_COVERAGE` info;
`--check-runbook-coverage` escalates severity-aware (p0/p1 gaps become
errors, p2 warnings, validation-error stays info).

## `operations/health-contracts/<moduleId>.yaml`

Declares the JSON shape of a module's health endpoint so monitors can be
checked against a canonical contract.

```yaml
kind: health-contract
path: /healthz                 # default /healthz
okStatus: 200                  # default 200
fields:
  - name: status
    type: string
    enumValues: [ok, degraded, down]
    required: true             # default true
description: …
sourceRef: src/health.ts:5
```

## `sourceRef` — binding spec to code

Components, models, tables, methods, fields, columns, routes, and most
operations entries accept `sourceRef: path/to/decl.ts:12` (path relative
to the code root; `:line` optional). It is the deterministic spec↔code
binding:

- `pd anchors` resolves every sourceRef to a real file (no LLM — default
  CI material; `--module-root <id>=<dir>` maps multi-repo workspaces).
- `pd drift` pairs a renamed code symbol with its stale spec entity by
  sourceRef file, reporting one RENAME instead of an add+delete fork —
  and `pd import` refuses to fork a detected rename.
- `pd readiness --check-anchors` gates production on resolvable anchors.

Design-first spaces carry no sourceRefs and all three degrade gracefully.

## Production readiness metadata

`pd validate` means "the spec is internally coherent": YAML parses, refs
resolve, and semantic rules pass. It prints an explicit reminder that
spec↔code parity is a separate check (`pd anchors` / `pd drift`).

`pd readiness --profile production` means "the spec is releasable": it
layers coverage thresholds, orphan checks, deploy-time proof for
file/device/exec dependencies, error-mapping implementation evidence, and
default drift checks on top of validation.

Suppressions for production readiness are local and require a reason:

- `component.entrypoint.reason` allows an intentional composition root or
  framework/runtime entrypoint.
- `readiness.orphan.reason` on a component, method, model, or table allows
  a deliberately unreferenced item without hiding unrelated orphans.
- `errorMapping` rows need `sourceRef`, `handlerRef`, or
  `implementationProof.sourceRef` / `implementationProof.handlerRef`.

## Round-trip stability

The serializer preserves comments and key order when re-writing a file
you previously loaded. If you edit a file in the UI, the comments that
were there before stay there. Caveat: new entities written from scratch
don't have comments because the UI doesn't generate any.

## Extending

New fields require an additive schema change. See
[CONTRIBUTING.md](https://github.com/pizza-doc/pizza-doc/blob/main/CONTRIBUTING.md#adding-an-entity-kind)
for the full touch list.
