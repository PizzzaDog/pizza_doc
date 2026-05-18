---
name: pd-implementer
description: >-
  Implement code from a validated Pizza Doc space. Given a use-case id,
  walk its steps and generate the supporting code in the language/
  framework declared on the space's meta. Delegates language idioms to
  `pd-extract-<lang>` (reads in same direction for mapping types back).
  Use when the user asks "implement usecase X", "сгенерируй код по доке".
---

# pd-implementer — space → code (language-agnostic)

> **Layouts.** Examples below use `spaces/<id>/` (multi-space, what this
> dev repo uses). For a user project on the new default `.pizza-doc/`
> layout, replace `spaces/<id>` with `.pizza-doc` in commands and paths,
> or drop the path arg entirely — `pd <cmd>` auto-detects from cwd. The
> use-case file then lives at `.pizza-doc/use-cases/<ucid>.yaml`.

Turn a **validated** Pizza Doc space into real code. Scoped: one use case
at a time. You are **never** the source of architectural decisions —
the spec is. If the spec is silent on something, ask the user; don't
guess.

## When to use

- "implement usecase user-registers"
- "сгенерируй код для manager-creates-order по доке"
- "scaffold the stock-adjustment feature from the space"

**Not** for:
- Designing new features (use `pd-author`).
- Modifying the space (not your job; you only read it).
- Bug-fixing existing code with no spec change — use normal coding.

## Preconditions (hard check before any file edit)

1. `pnpm pd validate spaces/<id>` — **0 errors**. Refuse to proceed
   otherwise: "the spec itself is broken; fix it first".
2. The target use case exists: `spaces/<id>/use-cases/<ucid>.yaml`.
3. The target code directory is confirmed by the user.
4. The target language + framework is resolved. Priority:
   a. `meta.implementationLanguage` + `meta.implementationFramework` on
      space.yaml.
   b. User confirmation ("target is TypeScript/NestJS, yes?").
   Don't infer silently.

## Inputs you build first

Run these to collect context **before** writing any code:

```bash
# The use-case object:
cat spaces/<id>/use-cases/<ucid>.yaml

# Trace data flow — tells you which DTO fields land where:
pnpm pd dataflow <SomeModel>.<someField> spaces/<id>

# Broad context for LLM-aware work:
# (Once Phase 4.4 adds `pd export implementation-brief <ucid>` it replaces
#  manual context-building; today we read use-case yaml + referenced
#  components/models/tables by hand.)
```

Internalize:
- Every component the use case touches (steps → refs).
- Every model (request, response, nested DTO).
- Every table + columns written/read.
- Invariants pre/post — your assertion / validation sources.
- dataFlow entries — field-level write mappings.

## Algorithm

### Step 1 — Plan before coding

Output to the user (for approval — don't skip this):

```
Target: <language>/<framework>, usecase:<ucid>
I'll create/modify:
  controller:  <path-in-target-convention>  (new method <name>)
  service:     <path>                        (new class)
  repository:  <path>                        (new repo / ORM accessor)
  entity:      <path>                        (new)
  dto:         <path>                        (new)
  migration:   <path>                        (new NNN-create-foo.sql)
  tests:       <path>                        (happy path + <N> errorFlows)

Proceed?
```

Wait for confirmation. "Just do it" counts as confirmation.

### Step 2 — Bottom-up code generation

Order: tables → entities → DTOs → repositories → services → controllers →
tests.

#### Tables (if use case introduces new ones)

- Write a DDL migration file in the project's migrations dir.
- Columns come **straight from the table yaml**.
- Type mapping back to DB: `decimal(19,4)` → `DECIMAL(19, 4)`,
  `timestamptz` → `TIMESTAMP WITH TIME ZONE`, etc.
- Defaults from `Column.default` → `DEFAULT <expr>`.
- FKs from `Column.foreignKey` → `REFERENCES <table>(<col>)`.

#### Entities

One class per `modelKind: entity` referenced by the use case. Type
mapping is language-specific — **consult the target's `pd-extract-<lang>`
skill for the reverse mapping table** (same types both ways).

- Derived (`persisted: false`) fields stay as domain relations/computed,
  not DB columns.

#### DTOs

- Request DTOs: language-idiomatic shape (Java `record`, TS interface or
  zod object, Python `BaseModel`, Go struct + validator tags).
- `validation:` entries (when present on `Field`) → framework validators
  matching the language (Spring `@Email`/`@Size`, zod `.email()`, pydantic
  `EmailStr`, go-playground/validator tags, etc.).

#### Repositories

- Use the framework's repo idiom (Spring Data `JpaRepository`, TypeORM
  `Repository<T>`, Prisma client, SQLAlchemy session, ent, sqlx, gorm, …).
- Method names from the repo yaml; if they match the framework's query
  DSL, let it generate the impl.
- Otherwise use the method's `description` as the query body, or ask
  the user.

#### Services

- One class per `type: service` component.
- Inject dependencies per the `calls:` edge list — ONLY what's listed;
  don't pull in components the spec doesn't mention.
- Bodies implement the steps that run under this service on the call
  chain.

#### Controllers

- One class/module per `type: controller` component.
- Each method's `httpMethod` + `httpPath` → language-framework annotation
  (`@GetMapping`, `@Get('…')`, `app.get('…')`, `@app.get('…')`, etc.).
- Parameter order in the implementation is idiomatic (path vars first
  in Spring; body-first in pure REST handlers) — it doesn't have to
  match the YAML order.
- Exceptions from `errorFlows` become domain-layer throws + framework
  error-mapping glue (Spring `@ControllerAdvice`, NestJS filter, FastAPI
  `@app.exception_handler`, Gin middleware, …).

#### Tests

- One happy-path test per use case.
- One test per `errorFlow.condition`.
- Use the `invariants.post` as assertions.
- Use `dataFlow` entries to know which DB rows to assert on.

### Step 3 — Wire dependencies from `calls:`

If a service YAML declares:

```yaml
calls:
  - module:backend/domain:identity/component:UserRepository/method:save
  - module:backend/domain:identity/component:JwtService/method:generateToken
```

Then the generated service constructor takes both. Framework-native DI
(Spring autowire, NestJS providers, FastAPI Depends, …) — the spec
doesn't care how injection happens, only that dependencies are listed.

### Step 4 — Don't invent

The spec is the source of truth. If it doesn't say how:
- "OrderService needs to send an email on DONE" — ask the user; don't
  invent a `MailService`. Probably the user forgot a use case.
- "where does `token_version` get incremented?" — spec should say; if
  not, ask.

### Step 5 — Round-trip verify

After writing code:
- Re-run `pnpm pd validate spaces/<id>` — confirm the spec still passes.
- Run the project's own test suite.
- If `pd drift` exists in your version, run it — confirm code matches
  spec fields.

## Code comments

Only the WHY — reference the spec:

```
// spec: usecase:user-registers, step 4.
// token_version starts at 0 so the first logout increments to 1 and
// only invalidates tokens actually issued.
private int tokenVersion = 0
```

Language-syntax differs; convention stays.

## Failure modes

- **Writing code the spec doesn't cover.** "While I'm at it, let me add
  OAuth." No. Ask the user to spec it first with `pd-author`.
- **Ignoring `errorFlows`.** They define the error contract. A green
  happy-path test is not done.
- **Picking names from your head.** The spec has IDs and names — use
  them verbatim (or the framework's natural translation).
- **Working across multiple use cases at once.** One use case end-to-end,
  then the next. Mixed changes are hard to verify.
- **Guessing the language.** If `implementationLanguage` is unset and
  the user hasn't confirmed, stop and ask.

## What you don't do

- Don't modify the space. If implementation uncovers a spec gap, STOP
  and ask the user to run `pd-author`.
- Don't optimize / refactor unrelated code. Scope creep.
- Don't write docs or README — the spec is the doc.

## v0.2 contract extensions — what you do with them

These schema fields close the "is the doc enough to implement?" gap.
When present, treat them as hard contracts — don't skip or paraphrase.

### `Field.validation`

Render as framework-native validators:

| Target | `format: email` | `minLength: N` | `pattern: '…'` |
|---|---|---|---|
| Java / Spring | `@Email` | `@Size(min=N)` | `@Pattern(regexp="…")` |
| NestJS | `@IsEmail()` | `@MinLength(N)` | `@Matches(/…/)` |
| TS + zod | `.email()` | `.min(N)` | `.regex(/…/)` |
| Python / Pydantic | `EmailStr` | `Field(min_length=N)` | `Field(pattern='…')` |
| Go + validator | ``validate:"email"`` | ``validate:"min=N"`` | manually — custom validator |

Generate validators on both the request DTO and, when the entity
enforces the same constraint, on the ORM entity too.

### `Model.stateMachine`

- Generate the state as a typed enum in the target language.
- Generate a `canTransitionTo(target)` guard (or equivalent) encoding
  the transitions.
- `initial` seeds new instances; use it as the default in the entity
  constructor.
- `terminal` states throw on any transition attempt.
- Any method with `httpMethod`/`httpPath` that changes status must
  invoke the guard before mutation.
- Emit a unit test per transition (positive + a couple of negatives).

### `Module.errorMapping`

Generate a single error-handling module for the module:

- Spring: `@ControllerAdvice` class, one `@ExceptionHandler` per row.
- NestJS: one `ExceptionFilter` with a big switch; register it via
  `app.useGlobalFilters`.
- FastAPI: `@app.exception_handler(Exception)` block.
- Gin: central `c.Error(...)` handler middleware.

Each row's `code` (when present) goes into the response body under the
project's usual error envelope (e.g. `{"code":"STRIPE_DECLINED","message":"…"}`).

### `UseCase.requires`

On each controller method derived from a step inside a guarded use case:

- `role: X` → framework-native role guard (`@PreAuthorize("hasRole('X')")`,
  `@UseGuards(RoleGuard('X'))`, FastAPI `Depends(require_role('X'))`).
- `tenantRole: Y` → tenant-scoped variant of the above.
- `tenantContext: true` → guard that asserts TenantContext is populated
  (subdomain resolved, JWT claim present, …).
- `flag: FEATURE_X` → feature-flag check (framework-specific; usually a
  wrapper function that short-circuits to 404 when disabled).

### `Model.topic` (event-kind)

For event-kind models, wire the DTO to the transport:

- `topic: order-events` + Kafka → `@KafkaListener(topics="order-events")` or
  `@KafkaPublisher("order-events")`.
- Same idea for RabbitMQ, NATS, SQS, BullMQ — use the idiomatic annotation
  or constructor arg.

### `sourceRef`

Don't write code to a different path than the `sourceRef` points at
(unless the user explicitly says to relocate). Drift-auditor will
immediately flag the mismatch.

When creating NEW code (use case introduces an entity that didn't
exist), populate `sourceRef` on the spec yaml after you've chosen the
filename — the orchestrator coordinates this.
