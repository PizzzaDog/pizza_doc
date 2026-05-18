---
title: YAML format reference
description: Every field on every entity. Source of truth is the Zod schemas in @pizza-doc/core.
---

This page documents the shape of every YAML entity Pizza Doc reads. The
authoritative source is `packages/core/src/schema.ts` — when the two
disagree, the schema wins.

## `space.yaml`

One per space, at the root. Only a `meta:` block.

```yaml
meta:
  id: my-space                 # required, [a-zA-Z][a-zA-Z0-9_-]*
  name: My Space               # required
  description: …               # optional
  version: 0.1.0               # default "0.1.0"
  pizzaDocVersion: 0.1.0       # default "0.1.0"
```

## `actor`

```yaml
kind: actor
id: customer                   # required
name: Customer                 # required
type: user                     # one of: user | system | scheduler (default: user)
description: …                 # optional
```

File path convention: `actors/<id>.yaml`.

## `module`

```yaml
kind: module
id: api-server                 # required
name: API Server               # required
type: service                  # required — one of: frontend | service | database | queue | external
techStack: Node 20 + Fastify   # optional
description: …                 # optional
domains: []                    # optional — see `domain` below
components: []                 # optional — inline components
models: []                     # optional — inline models (DTOs/entities/events/value-objects)
tables: []                     # optional — inline tables
errorMapping:                  # optional — exception/error to HTTP status mappings
  - exception: DuplicateEmailError
    httpStatus: 409
    code: DUPLICATE_EMAIL
    handlerRef: module:api-server/component:ErrorHandler/method:handleDuplicate
    sourceRef: src/errors.ts:44
```

File path conventions:

- `modules/<id>/module.yaml` — module with sub-folders for components/models/tables.
- `modules/<id>.yaml` — flat, single-file module (less common).

## `domain`

```yaml
id: orders                     # required
name: Orders                   # required
description: …                 # optional
components: []                 # optional
models: []                     # optional
tables: []                     # optional
```

File path: `modules/<module-id>/domains/<id>/domain.yaml`.

Domains don't have `kind:` — they're always nested under a module and
recognised by their path.

## `component`

```yaml
kind: component
id: OrderController            # required
name: OrderController          # required
type: controller               # required — one of: controller | service | repository | infrastructure | page | widget | client | job
                                # also: consumer | subscriber | middleware
description: …                 # optional
methods: []                    # optional
composes: []                    # optional — structural child component refs
entrypoint:                    # optional — justifies an intentional composition root
  kind: composition-root        # composition-root | framework-entrypoint | runtime-entrypoint
  reason: Started by application bootstrap
readiness:                     # optional
  orphan:
    reason: Intentionally mounted outside product use cases
sourceRef: src/orders.ts:12     # optional
```

## `method`

Lives inside a component's `methods:` list. No `kind:` of its own.

```yaml
- name: placeOrder             # required
  params:                      # optional
    - name: request
      type: PlaceOrderRequest
      optional: false
      validation:               # optional
        format: uuid
  returns: OrderConfirmation   # required
  calls: []                    # optional — method refs, or component refs when method is unknown
  throws: []                   # optional — free-text exception names
  description: …               # optional
  httpMethod: POST             # optional — GET | POST | PUT | PATCH | DELETE
  httpPath: /api/orders        # optional
  readiness:                   # optional — endpoint-level production waiver
    orphan:
      reason: Operator-only endpoint covered by deploy smoke tests
  sourceRef: src/orders.ts:44   # optional
```

## `model`

DTOs, entities, value-objects, and events.

```yaml
kind: model
id: PlaceOrderRequest          # required
name: PlaceOrderRequest        # required
modelKind: dto                 # required — dto | entity | value-object | event | enum
fields:                        # required
  - name: pizzaId
    type: string
    optional: false
  - name: notes
    type: string
    optional: true
description: …                 # optional
persistedAs: module:…/table:…  # optional — link an entity-kind model to a table
values: []                     # required for modelKind: enum; omit otherwise
readiness:                     # optional
  orphan:
    reason: Implemented for downstream events not modeled as use cases
sourceRef: src/models.ts:12     # optional
```

`persistedAs` is how the validator's `MODEL_FIELD_MISSING_COLUMN` rule
knows which fields-to-columns pairing to check. Only useful on
`modelKind: entity`.

## `table`

```yaml
kind: table
id: orders                     # required
name: orders                   # required
columns:                       # required
  - name: id
    sqlType: uuid
    primaryKey: true
    nullable: false
    default: gen_random_uuid()
  - name: pizza_id
    sqlType: uuid
    nullable: false
    foreignKey:
      table: module:api-server/domain:menu/table:pizzas
      column: id
indexes: []                    # optional
description: …                 # optional
readiness:                     # optional
  orphan:
    reason: Managed by migration jobs outside product use cases
```

### Columns

```yaml
- name: email                  # required
  sqlType: text                # required
  primaryKey: false            # optional (default false)
  unique: false                # optional (default false)
  nullable: false              # optional (default false)
  foreignKey:                  # optional
    table: <ref>
    column: <column name>
  description: …               # optional
```

### Indexes

```yaml
- name: idx_orders_customer    # required
  columns: [customer_id]       # required
  unique: false                # optional (default false)
```

## `usecase`

```yaml
kind: usecase
id: place-order                # required
name: Customer places an order # required
actor: actor:customer          # required
trigger: Submitting /checkout  # required — free text
description: …                 # optional
steps:                         # required
  - from: <ref>
    to: <ref>
    via: <ref>                 # optional — DTO carried across the edge
    protocol: http             # optional — http | http-response | sse | websocket | ws | internal-call | sql | event | external-api
    kind: sync                 # optional — sync | spawn | parallel
    description: …             # optional
errorFlows: []                 # optional
invariants:                    # optional
  pre: []
  post: []
dataFlow: []                   # optional
```

### Error flows

```yaml
- id: payment-declined         # required
  condition: Stripe returns 4xx
  steps: [...]                 # same shape as top-level steps
  resultDescription: …         # optional
```

### Data flow entries

```yaml
- sourceField: PlaceOrderRequest.pizzaId     # required
  targetField: orders.pizza_id               # required
  transform: …                               # optional
```

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
`modules/<module-id>/config-map.yaml`.

```yaml
- key: WORKER_ROOT
  type: non-secret              # secret | non-secret
  lifecycle: startup            # build | startup | runtime
  mutability: rotatable         # immortal | rotatable | hot-reload
  consumer:
    component: module:worker-service
    callsite: process.env.WORKER_ROOT
  related: []                   # optional config key refs
  sourceOfTruth: deploy-yml-literal
  defaultValue: /var/lib/workers # optional documented fallback
  defaultSources:               # optional observed defaults from code/deploy/etc.
    - source: code              # code | workflow | deploy | bootstrap | script | docs
      value: /var/lib/workers
      sourceRef: src/config.go:22
```

When `defaultValue` and `defaultSources[].value` disagree, `pd readiness
--profile production` fails with `READINESS_CONFIG_DEFAULT_DRIFT`.

## `external-deps.yaml`

Module-scoped dependencies outside the application boundary live at
`modules/<module-id>/external-deps.yaml`.

```yaml
- name: legacy-worker-provision-script
  direction: outbound           # outbound | inbound | bidirectional
  protocol: exec                # free-form; file/device/exec are preflight-gated
  endpoint: /opt/example/provision-worker.sh
  consumer: module:worker-service
  auth: none                    # none | bearer | api-key | basic | mtls | oauth2 | aws-signature | custom
  preflightCheck:               # production readiness proof for file/device/exec
    sourceRef: src/preflight.go#CheckHost
  driftProbe:
    sourceRef: scripts/drift-smoke.sh
  positionalArgs:
    name: LegacyWorkerArgs
    contractTest:
      sourceRef: src/legacy-adapter.test.ts:91
    acceptanceCriteria:
      - arg #1 worker_id is nonempty
      - arg #3 runtime is accepted by the legacy script
    args:
      - position: 1
        name: worker_id
        type: string
        nonempty: true
      - position: 2
        name: slot_id
        type: positive-int
      - position: 3
        name: runtime
        type: enum
        enumValues: [RUNTIME_API, RUNTIME_OAUTH]
      - position: 4
        name: runtime_auth_data_json
        type: json-object
        defaultValue: "{}"
```

`pd readiness --profile production` fails if a `file`, `device`, or `exec`
dependency has no `preflightCheck.sourceRef` or `driftProbe.sourceRef`.
It also fails when an `exec` dependency declares required positional args
without `positionalArgs.contractTest.sourceRef`. `pd validate` still checks
the internal shape of any declared `positionalArgs` contract, such as
contiguous positions and valid defaults.

## Production readiness metadata

`pd validate` means "the spec is internally coherent": YAML parses, refs
resolve, and semantic rules can run. It does not promise the spec is ready
to ship.

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
