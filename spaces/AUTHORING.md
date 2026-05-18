# Authoring a space from an existing codebase

Practical guide for an AI agent (or a human) to turn a real application into
a Pizza Doc space. Optimised for **iterate-with-the-validator** workflow:
emit a batch of YAML, validate, fix, repeat.

Prerequisites: read `../CLAUDE.md` first. The hard rules (`.strict()` schemas,
filename ↔ id, ref grammar, build order) are non-negotiable and most agents
trip on them.

---

## Workflow at a glance

```
1. Survey the codebase → map modules          ┐
2. Scaffold space.yaml + module.yaml stubs    │  each step ends with
3. Identify storage → emit tables             │  pnpm pd validate spaces/<id>
4. Identify DTOs/entities → emit models       │  and errors get fixed
5. Walk handlers/services → emit components   │  before moving on
6. Reconstruct user journeys → emit use cases ┘
```

Never write all the YAML in one go then validate at the end. Emit a layer,
validate, fix, move on. That's the whole ergonomic advantage the strict
schema gives you.

---

## Step 0 — Pick a space id and create the root

Easiest:

```bash
pd init <space-id>
```

This creates the **single-space** layout (the default) at `.pizza-doc/`:

```
<repo>/.pizza-doc/
├── space.yaml          # meta.id = <space-id>
├── actors/
├── modules/
└── use-cases/
```

`<space-id>` lives in `meta.id`, not in the folder name — `.pizza-doc/` is
just the well-known location.

If your repo hosts several specs side by side (rare — Pizza Doc's own dev
repo does this), use `pd init <space-id> --multi`, which creates the
**multi-space** layout `spaces/<space-id>/...` instead. The rest of this
guide uses `spaces/<space-id>/` paths in examples because it predates the
single-space default; substitute `.pizza-doc/` if that's what you ran.

Either way, `space.yaml` looks like:

```yaml
meta:
  id: <space-id>               # for multi-space, must equal the folder name
  name: <Human-readable name>
  description: One paragraph, 2-3 sentences. What the system does, nothing more.
  version: 0.1.0
  pizzaDocVersion: 0.1.0
```

Validate (`pd validate` from cwd, no path needed) — you should get **one**
issue: "no actors, no modules, no use cases detected" (info). That's fine.
If you get a `SCHEMA_*` error, the root YAML itself is broken — fix before
continuing.

---

## Step 1 — Survey the codebase and draft the module map

Before writing any YAML, answer these on paper (or in a scratch file):

**What are the deployable units?** Each becomes one `module:`. Typical mapping:

| You see | Module |
| --- | --- |
| `apps/web/`, `frontend/`, Next.js / Vite project | `type: frontend` |
| `apps/api/`, `backend/`, Spring / Rails / Fastify project | `type: service` |
| A Postgres/Mongo/MySQL referenced in env vars or `prisma/schema.prisma` | `type: database` |
| Kafka, SQS, RabbitMQ, Redis Streams | `type: queue` |
| Stripe, SendGrid, Auth0, any third-party HTTP API | `type: external` |

A **monorepo package** is usually one module. A **single-repo monolith** is
usually one service module plus one database module plus N external modules.

**What are the actors?** Anyone who triggers a use case. Look at:
- Auth middleware → roles (`customer`, `admin`, `guest`)
- Cron jobs / schedulers → `type: scheduler` actor
- Webhooks from third parties → `type: system` actor

Rule of thumb: 2-5 actors. A space with 20 actors is a space whose actors
should have been grouped.

**What are the domains (optional)?** Only relevant inside service / database
modules with more than ~8 components. If the codebase already has DDD-style
folders (`orders/`, `users/`, `billing/`), map those 1:1 to domains. If it's
a flat monolith with 6 controllers, skip domains — inline everything in the
module.

Draft a one-line list per module before writing any files. Example:

```
modules:
  - web-app          (frontend, React 19)
  - api              (service, Fastify 4) — domains: auth, catalog, orders
  - db               (database, PostgreSQL 16) — domains: auth, catalog, orders
  - stripe           (external, Stripe REST)
actors:
  - visitor          (user, not signed in)
  - customer         (user, signed in)
  - admin            (user, staff)
```

---

## Step 2 — Scaffold containers (actors + modules + domains)

Emit one file per actor:

```yaml
# actors/customer.yaml
kind: actor
id: customer                   # must match the filename
name: Customer
type: user                     # user | system | scheduler
description: Signed-in shopper. One line.
```

One `module.yaml` per module:

```yaml
# modules/api/module.yaml
kind: module
id: api                        # must match the folder name
name: API Server
type: service
techStack: Fastify 4 + Node 20 + Prisma
description: Owns auth, catalog, and orders; persists to `db`.
```

One `domain.yaml` per domain (if using domains):

```yaml
# modules/api/domains/orders/domain.yaml
id: orders                     # must match the folder name — no `kind:` field
name: Orders
description: Checkout flow and payment orchestration.
```

Validate. Expected: clean Pass 1, Pass 2 trivially clean (no refs yet), Pass
3 emits warnings about unused actors / modules (expected — use cases come
last).

---

## Step 3 — Emit tables (database module only)

Tables come first among the "leaf" entities because nothing references up at
them — they have `foreignKey` edges to other tables but not to anything
higher in the dependency graph.

**Where to find them:** Prisma schema, Sequelize/TypeORM entity classes,
Flyway / Alembic migrations, raw DDL. Pick one source of truth and stay
there.

```yaml
# modules/db/domains/orders/tables/orders.yaml
kind: table
id: orders                     # filename ↔ id
name: orders
description: One row per placed order.
columns:
  - name: id
    sqlType: uuid
    primaryKey: true
  - name: user_id
    sqlType: uuid
    foreignKey:
      table: module:db/domain:auth/table:users
      column: id
  - name: status
    sqlType: varchar(32)
  - name: total_cents
    sqlType: int
  - name: created_at
    sqlType: timestamptz
indexes:
  - name: idx_orders_user_id
    columns: [user_id]
```

Validate after every ~5 tables. Expected error mode: `REF_BROKEN` on
`foreignKey.table` → usually a typo in the domain or table id. Fix before
moving on.

Column-naming convention: use **actual DB casing** (snake_case for Postgres,
camelCase if your ORM actually maps to camelCase columns). Don't retranslate.

---

## Step 4 — Emit models (DTOs + entities)

Two flavours:

**Entities** — domain objects that persist to a table. Set `persistedAs`:

```yaml
# modules/api/domains/orders/models/Order.yaml
kind: model
id: Order
name: Order
modelKind: entity
persistedAs: module:db/domain:orders/table:orders
description: Aggregate root for a placed order.
fields:
  - name: id
    type: uuid
  - name: userId
    type: uuid
  - name: status
    type: string
    description: One of pending | paid | failed | cancelled.
  - name: totalCents
    type: int
  - name: items
    type: List<OrderItem>
  - name: createdAt
    type: timestamp
```

**DTOs** — request/response payloads crossing module boundaries. No `persistedAs`:

```yaml
# modules/api/domains/orders/models/CreateOrderRequest.yaml
kind: model
id: CreateOrderRequest
name: CreateOrderRequest
modelKind: dto
description: Customer checkout payload.
fields:
  - name: items
    type: List<CreateOrderItemRequest>
  - name: sourceToken
    type: string
    description: Stripe payment-method token.
```

**Where to find models in code:**
- Entities = Prisma model classes, JPA `@Entity`, Sequelize models, Django models
- DTOs = request/response interfaces, Pydantic models, Zod schemas at HTTP boundaries, Spring `@RequestBody` / `@ResponseBody` classes, GraphQL input/payload types

**Field type strings are free-form.** Pizza Doc doesn't parse them — it stores
them verbatim and only checks them referentially in dataFlow (Pass 3).
Convention:
- Primitives: `string`, `int`, `long`, `float`, `boolean`, `uuid`, `timestamp`, `datetime`
- Lists: `List<Foo>`
- Maps: `Map<string, Foo>`
- Other models: `Foo` (bare id — no ref grammar in field types)

Validate after each domain's models. Expected error mode: `REF_BROKEN` on
`persistedAs` → typo in table ref or a table you forgot to create. Fix.

---

## Step 5 — Emit components (controllers, services, repositories, pages…)

One YAML per component. Methods live inline on the component — not in
separate files.

**Mapping code → component.type:**

| You see in code | component.type |
| --- | --- |
| REST controller / Express router / Fastify route group / Spring `@RestController` | `controller` |
| "Business logic" class, use-case handler, application service | `service` |
| DAO, repository, Prisma-wrapping class | `repository` |
| Auth middleware, logger, crypto util, email sender, job runner — "cross-cutting" infra | `infrastructure` |
| React page, Next.js route component, Vue page, full-screen mobile view | `page` |
| React/Vue component that's not a full page — `<CartSummary />`, `<PizzaCard />` | `widget` |
| Frontend HTTP client wrapper (`orderClient.ts`, generated OpenAPI SDK) | `client` |
| Scheduled task, queue consumer, cron entry | `job` |

If nothing fits, it's probably `infrastructure` (catch-all for cross-cutting
concerns) or `service` (catch-all for business logic).

```yaml
# modules/api/domains/orders/components/OrderController.yaml
kind: component
id: OrderController
name: OrderController
type: controller
description: HTTP entry point for checkout.
methods:
  - name: create
    params:
      - name: request
        type: CreateOrderRequest
    returns: OrderResponse
    httpMethod: POST
    httpPath: /api/orders
    calls:
      - module:api/domain:orders/component:OrderService/method:place
    throws:
      - StripeDeclinedException
      - OutOfStockException
```

**`calls:`** is the edge list for the call graph. Read the method body in the
source; every cross-component call you find becomes an entry. Calls to pure
helpers within the same component are fine to omit — the diagram gets noisy
otherwise.

**Frontend components:** omit `httpMethod`/`httpPath` on page/widget methods.
Those belong on `client`-type components that wrap `fetch`:

```yaml
# modules/web-app/components/orderClient.yaml
kind: component
id: orderClient
name: orderClient
type: client
methods:
  - name: create
    params:
      - name: request
        type: CreateOrderRequest
    returns: OrderResponse
    httpMethod: POST
    httpPath: /api/orders
```

**Ordering inside Step 5:** in a big module, emit in dependency order —
repositories first (they call tables, nothing above), then services (call
repos), then controllers (call services). It matches how you'd read the code
anyway.

Validate after each domain. Expected error mode: `REF_BROKEN` in `calls:` →
method you referenced doesn't exist (typo, wrong module, forgot the
`method:` segment). The validator suggests the closest match — usually
helpful.

---

## Step 6 — Emit use cases

Use cases are **business flows**. One per user-visible action. They tie the
whole graph together — every step references components you already emitted.

**Where to find them:**
- E2E / integration tests — each `describe('user can …')` is usually a use case
- Product specs, README demo sections, onboarding docs
- UI routes — each "primary action" on a page is a candidate
- Webhook handlers — each event type is a use case with a `system` actor

Target 3-10 use cases for a first pass. You can always add more.

```yaml
# use-cases/place-order.yaml
kind: usecase
id: place-order
name: Customer places an order
actor: actor:customer
trigger: Submitting the checkout form on /cart.
description: Cross-module: frontend → api → db → external payment → db.
steps:
  - from: module:web-app/component:CartPage
    to: module:web-app/component:orderClient
    via: module:api/domain:orders/model:CreateOrderRequest
    protocol: internal-call
  - from: module:web-app/component:orderClient
    to: module:api/domain:orders/component:OrderController
    via: module:api/domain:orders/model:CreateOrderRequest
    protocol: http
    description: POST /api/orders
  - from: module:api/domain:orders/component:OrderController
    to: module:api/domain:orders/component:OrderService
    via: module:api/domain:orders/model:CreateOrderRequest
    protocol: internal-call
  - from: module:api/domain:orders/component:OrderService
    to: module:api/domain:orders/component:PaymentGateway
    via: module:api/domain:orders/model:PaymentRequest
    protocol: internal-call
  - from: module:api/domain:orders/component:PaymentGateway
    to: module:stripe/component:StripeAPI
    via: module:api/domain:orders/model:PaymentRequest
    protocol: external-api
  - from: module:api/domain:orders/component:OrderService
    to: module:api/domain:orders/component:OrderRepository
    via: module:api/domain:orders/model:Order
    protocol: internal-call
  - from: module:api/domain:orders/component:OrderRepository
    to: module:db/domain:orders/table:orders
    protocol: sql
    description: INSERT INTO orders.
errorFlows:
  - id: stripe-declined
    condition: Stripe returns success=false.
    steps:
      - from: module:api/domain:orders/component:PaymentGateway
        to: module:api/domain:orders/component:OrderController
        description: PaymentGateway throws StripeDeclinedException; controller maps to 402.
    resultDescription: 'HTTP 402 with { error: "STRIPE_DECLINED" }.'
invariants:
  pre:
    - Every pizzaId resolves to an available pizza.
  post:
    - On success, `orders` has one new row with status='paid'.
    - On Stripe decline, no rows are persisted.
dataFlow:
  - sourceField: CreateOrderRequest.sourceToken
    targetField: orders.stripe_charge_id
    transform: via StripeAPI.createCharge
```

### Step-writing rules

- **First step's `from`** should almost always be a frontend component (the
  UI element the actor interacts with). Pass 3 warns if not.
- **Last step's `to`** should be a terminal — a table (sql write), an
  external API, or a queue. Pass 3 warns if not.
- **Step continuity:** step N+1's `from` should be the same component as
  step N's `to`, OR a component already on the call stack (implicit return).
  Pass 3 emits `USECASE_STEP_CHAIN_DISCONTINUITY` at info severity otherwise
  — usually fine, but look twice: a discontinuity often means a missing step.
- **`via:`** is the DTO / entity carried by that step. Mandatory when
  `protocol: http` or `external-api`. Optional (but encouraged) on
  `internal-call`. Omit on `protocol: sql` (SQL steps don't carry DTOs —
  they carry columns, tracked via `dataFlow`).
- **`protocol:`** picking guide:
  - `http` — inside-the-system HTTP (frontend → backend over your own API)
  - `external-api` — calls to third-party services (Stripe, SendGrid, …)
  - `sql` — repository → table
  - `event` — publish/consume through a queue
  - `internal-call` — same-module function call (the default for most steps)
  - omit `protocol` — only for purely display / no-wire steps; rare

### Error flows

One per failure mode. Don't list "anything can throw" — list the **business
error paths** that have a distinct user-visible result (different HTTP
status, different UI state). The validator doesn't force you to cover every
`throws` from `calls:`.

### Invariants

`pre` / `post` are free-form strings. No special syntax. Use them to capture
"what has to be true before / after this use case". AI exports and the UI
both render them prominently.

### dataFlow

Field-level mapping of data movement across the graph. Optional but high
value — it's what makes the "unused DTO field" / "unwritten required
column" rules work. Pass 3 semantic checks depend on this.

Each entry: `sourceField: <Model>.<field>`, `targetField: <Model>.<field>`
or `<table>.<column>`, optional `transform: <free text>`.

---

## Iterating on validator output

### Error codes you'll see most

| Code | Severity | What it means | Usual fix |
| --- | --- | --- | --- |
| `SCHEMA_PARSE_ERROR` | error | YAML doesn't parse | Indentation, unescaped colon in a string |
| `SCHEMA_FIELD_UNEXPECTED` | error | A field not in the schema | Delete it (schemas are `.strict()`) |
| `SCHEMA_FILENAME_ID_MISMATCH` | error | Filename ≠ `id` | Rename file or fix `id` |
| `SCHEMA_INVALID_REF_PATTERN` | error | Ref URI doesn't match the grammar | Check top-level kind (`module:`/`actor:`/`usecase:`); verify segment order |
| `REF_BROKEN` | error | Ref points at a non-existent entity | Read the "did you mean?" suggestion |
| `REF_KIND_MISMATCH` | error | Ref grammar OK but target's kind is wrong | E.g. pointing `step.to` at a model |
| `DTO_FLOW_VIA_TYPE_MISMATCH` | warning | `step.via` type doesn't match target method's first param | Fix the DTO or the signature |
| `USECASE_STEP_CHAIN_DISCONTINUITY` | info | Gap in the step chain | Usually add a missing step; sometimes it's a legit return — ignore |
| `COMPONENT_UNUSED` | warning | Component not touched by any use case | Add a use case, or accept (some components are listed for completeness) |
| `DTO_UNUSED_FIELD` | warning | Required DTO field never written by dataFlow | Add a dataFlow entry or drop the field |
| `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN` | warning | Non-null table column never filled by any dataFlow | Add dataFlow, or (v0.2) mark column with `default` |

### Debugging process

1. Run `pnpm pd validate spaces/<id>`
2. Read only the **first** error. Fix it. Re-run.
3. Repeat until `0 errors`.
4. Look at warnings — each is a real signal, but none block a green badge.
5. Infos are nice-to-haves; don't over-optimise.

Don't try to fix 10 errors at once — the first fix often eliminates the rest
(one broken module ref cascades everywhere).

### When the validator seems wrong

It's almost always right. Before assuming a bug:

1. Re-read the rule in `docs/site/src/content/docs/reference/validation-rules.md`
2. Check the fixture in `packages/core/src/validator/__fixtures__/` that tests this code
3. Check the schema in `packages/core/src/schema.ts`
4. If the issue really is a validator bug, file it in `docs/backlog.md` and work around it — don't "fix" by adding fake data.

---

## Style — what the demo space does well, copy it

- **Descriptions are short.** 1-2 sentences per entity. "Clarity over
  completeness."
- **No TODOs in descriptions unless they're genuine design questions** —
  see `pizza-shop-demo/modules/postgres-db/domains/orders/tables/orders.yaml`
  for an example of a legit TODO.
- **One file per entity when there's more than one of that kind.** Inline
  components/models on `module.yaml` is legal but only reads well for a
  module with exactly one of something.
- **Domains only when they carry their weight.** 3 components in a service
  module = no domains. 12 components = probably 2-3 domains.
- **Error flows should be user-visible distinct outcomes.** Not every throw.

---

## Checkpoints

After each step, you should be able to answer:

- **After step 2:** "Validator says Pass 1 clean, zero refs yet." — move on.
- **After step 3:** "Validator says Pass 2 clean (foreign keys resolve)." — move on.
- **After step 4:** "Every `persistedAs` resolves." — move on.
- **After step 5:** "Every `calls:` resolves. Components may show
  `COMPONENT_UNUSED` warnings — that's expected until use cases land." — move on.
- **After step 6:** "0 errors. Open in UI, click through each use case,
  verify the sequence diagrams match your mental model of the code."

That last one is the real validation. A space that passes the validator but
doesn't match the code is useless.

---

## Reference material (read if stuck)

- `docs/site/src/content/docs/reference/yaml-format.md` — every field documented
- `docs/site/src/content/docs/reference/validation-rules.md` — every rule + fixture
- `docs/site/src/content/docs/concepts/spaces-and-entities.md` — mental model
- `packages/core/src/schema.ts` — Zod schemas, the ground truth
- `spaces/pizza-shop-demo/` — the reference space; crib shamelessly
