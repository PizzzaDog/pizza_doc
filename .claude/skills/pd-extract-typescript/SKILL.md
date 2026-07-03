---
name: pd-extract-typescript
description: >-
  Extract Pizza Doc entities (models, tables, components) from a
  TypeScript / JavaScript codebase and emit them as JSONL. Handles
  Express, NestJS, Fastify, Next.js / React, Prisma. Output feeds `pd
  import --from-jsonl`. Used by `pd-scanner` and `pd-drift-auditor`.
---

# pd-extract-typescript — TS/JS → JSONL

Read a TypeScript or JavaScript source tree and emit a JSONL stream of
Pizza Doc entity declarations. Same contract as `pd-extract-java` —
same `_placement` envelope, same schemas — just the language-specific
reading is different.

## When to use

- `pd-scanner` with `implementationLanguage: typescript` or `javascript`.
- `pd-drift-auditor` with the same.
- User directly: "extract entities from apps/backend (NestJS)".

## Inputs

1. Source directory.
2. `spaceId` + placement map from the orchestrator.
3. Output path (default `/tmp/<spaceId>-entities.jsonl`).

## Output contract

Same as `pd-extract-java`: one JSONL line per entity, each with the
`_placement` envelope. See `pd-extract-java` for the exact JSON shape
— this skill just fills the fields from TS source.

## Algorithm

### Step 1 — Walk the source tree

Skip:
- `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, `__generated__/`.
- `*.spec.ts`, `*.test.ts` — tests drive use cases separately.
- `*.d.ts` — type-only, no runtime behaviour to document.

### Step 2 — Classify each file

| Markers present | Entity kind |
|---|---|
| `@Entity()` (TypeORM) | model (entity) |
| `class <Foo> {` + TypeORM decorators | model (entity) |
| `model Foo { … }` in `*.prisma` | table + model pair — table from the schema, entity model with `persistedAs` |
| `export class <Foo>Dto` / `interface <Foo>` / zod `const FooSchema = z.object({…})` | model (dto) |
| `z.object({…})` → `.refine(…)` as request validator | model (dto) |
| `@Controller('/path')` (NestJS) | component (controller) |
| `router.get('/…', …)` / `app.get('/…', …)` (Express/Fastify) | component (controller) |
| NestJS `@Injectable()` | component (service) |
| class/function suffixed `…Repository` / `…Repo` | component (repository) |
| React page component (`.tsx` in `pages/` or `app/` with default export) | component (page) |
| React widget component | component (widget) |
| `axios` wrapper / generated OpenAPI client | component (client) |
| BullMQ worker / cron / schedule | component (job) |

A file can export multiple top-level entities — emit one JSONL line
each.

### Step 3 — Field extraction

**Prisma models** → table entries:
```prisma
model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  createdAt DateTime @default(now())
  orders    Order[]
}
```

Emit:
- A `table` entry with `columns` drawn from the field list (`@id` → PK,
  `@default(expr)` → `default`, `@unique` → unique).
- An `entity` model whose `persistedAs` references the table, fields
  mirror the model, `orders: Order[]` gets `persisted: false` (relation).

**TypeORM entities**: same pattern, different syntax — `@PrimaryGeneratedColumn`,
`@Column({…})`, `@OneToMany` (persisted: false).

**Zod-based DTOs**:
```ts
export const CreateUserRequest = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
})
```
→ DTO model with fields `email`, `password`, `name`, all `type: string`.
Validator metadata (`.email()`, `.min(6)`) maps to `Field.validation`;
fill it whenever zod / class-validator / framework metadata makes the
constraint clear.

**Plain TS interfaces / classes** with public props: one field per prop.

**Type mapping (TS → Pizza Doc):**

| TS | Pizza Doc |
|---|---|
| `string` | `string` |
| `number` | `int` (or `decimal` for financial contexts; ask user) |
| `bigint` | `long` |
| `boolean` | `boolean` |
| `Date` | `timestamp` |
| `UUID`-branded or `string & { __brand: 'uuid' }` | `uuid` |
| `T[]`, `Array<T>`, `readonly T[]` | `List<T>` |
| `T \| null`, `T \| undefined`, `T?` | `T` + `optional: true` |
| Prisma `String @db.Uuid` | `uuid` |
| Prisma `Decimal @db.Decimal(19,4)` | `decimal(19,4)` |
| Prisma `DateTime` | `timestamptz` |

### Step 4 — Method extraction (components)

**NestJS:**
```ts
@Controller('/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() request: LoginRequest): AuthResponse { … }
}
```

Emit:
- `params: [{ name: 'request', type: 'LoginRequest' }]`
- `httpMethod: 'POST'`, `httpPath: '/v1/auth/login'`
- `returns: 'AuthResponse'`
- `calls:` scan the method body for `this.authService.…` → ref the
  `AuthService` component + method.

**Express-style:**
```ts
router.post('/v1/auth/login', async (req, res) => {
  const r = LoginRequest.parse(req.body)
  const token = await authService.login(r.email, r.password)
  res.json({ token })
})
```

Handler is a lambda — emit the containing module as the component;
treat the route as a method named after the handler's purpose (e.g.
`login` — inferred from the primary service method it calls).

### Step 5 — Service / repository methods

Scan class methods. `public` (no `private`/`protected`). One entry per
method, `calls:` populated from `this.<dep>.<method>(…)` invocations.

For Repository-like classes using Prisma client:
```ts
findByEmail(email: string) {
  return this.prisma.user.findUnique({ where: { email } })
}
```
Emit method `findByEmail` with params + return type. The Prisma call
becomes a call ref only if we're modelling prisma client itself as a
component (rare; usually we skip the client layer).

### Step 6 — Emit the JSONL

Compact JSON, one line per entity. Save to the requested path. UTF-8.

### Step 7 — Hand off

Orchestrator runs `pnpm pd import --from-jsonl <file> --merge` (after a
dry-run review).

## Failure modes

- **Decorators compiled away.** If the project runs through a custom
  Babel / esbuild pipeline that strips decorators, read the source
  files directly (`*.ts`), not the compiled output.
- **Heavy abstraction (controllers generated at runtime).** Ask the
  user. Don't guess.
- **Nested zod schemas with `.extend()`.** Follow the chain; emit the
  final flattened shape.
- **`any` types.** Emit as `any` verbatim. The author will refine.
- **JSX files with business logic.** React pages are components
  (`type: page`). Don't extract models from them — DTOs should live
  in their own files.

## What you don't do

- Don't run the TS compiler as a subprocess to "properly parse" — the
  LLM-first reading is fine for v0.2. Specialised AST extractors arrive
  in Phase 4.3.
- Don't infer use cases from arbitrary implementation bodies. Use cases
  come from tests / docs / pages / jobs. If the orchestrator explicitly
  asks you to convert those sources, emit `kind: "usecase"` JSONL entries.
- Don't modify source.

## v0.2 contract extensions

Same contract as `pd-extract-java` (see its SKILL.md for the full
semantics). Fill when the source has them:

### `Field.validation`

| zod / class-validator | Pizza Doc |
|---|---|
| `z.string().email()` / `@IsEmail()` | `format: email` |
| `z.string().min(X)` / `@MinLength(X)` | `minLength: X` |
| `z.string().max(Y)` / `@MaxLength(Y)` | `maxLength: Y` |
| `z.number().min(X)` / `@Min(X)` | `min: X` |
| `z.number().max(Y)` / `@Max(Y)` | `max: Y` |
| `z.string().regex(/…/)` / `@Matches(/…/)` | `pattern: "…"` |
| `z.string().uuid()` / `@IsUUID()` | `format: uuid` |
| Prisma `String @db.Citext` with check constraint | `pattern` or custom `format` |

### `Model.stateMachine`

Look for XState machines, typed status string-unions with transition
maps, or Prisma enum fields with explicit `state machine` comments.

### `Module.errorMapping`

NestJS `HttpExceptionFilter` / `@Catch` decorators. Express `next(err)`
handlers classifying by error class. FastAPI is for Python — skip.

### `UseCase.requires`

NestJS `@UseGuards(…)`, Express middleware chain mentioning role
checks, Next.js middleware matcher patterns. Ask the orchestrator to
fill `requires:` on the relevant use-case yamls.

### `sourceRef` (required)

Every component / model / table: `apps/api/src/…/Foo.ts:12`, relative to
the codebase root. Contract, not courtesy: `pd drift` pairs renamed
symbols by this file path (so a rename reports as RENAME, not
add+delete) and `pd anchors` resolves it in CI. Omitting it opts the
entity out of both.

### `Model.topic` (event-kind)

BullMQ queue names, Kafka topics from `@kafka.on('topic', …)`, NATS
subjects — extract the literal string.

## v0.3 operations evidence (config-refs + external-calls)

Beyond entities, scan the source for **operations evidence** — config
reads and outbound network calls. These don't become spec entities; they
feed `pd drift --from-jsonl` to flag drift between code and the
operations layer (`config-map.yaml` / `external-deps.yaml`). Both
evidence kinds go to the same JSONL stream as entities.

### `kind: config-ref`

```jsonl
{"kind":"config-ref","key":"STRIPE_SECRET_KEY","_placement":{"module":"backend","file":"apps/api/src/payments/stripe.ts","line":12}}
```

`_placement.module` is **required**; if you can't determine it, skip
rather than guess.

TypeScript / JavaScript patterns:

- `process.env.X` and `process.env["X"]` — `key = X`.
- `process.env.X ?? "default"` / `||` — same.
- Dotenv-style `import { config } from "dotenv"; config(); process.env.X`.
- `import.meta.env.VITE_X` and `import.meta.env.PUBLIC_X` — Vite / Astro build-time keys.
- Next.js `process.env.NEXT_PUBLIC_X` (build-time exposed).
- NestJS `ConfigService#get<string>("x")` — `key = "x"` (often dot-path mapped to env via NestJS conventions).
- `zod` / `@t3-oss/env-core` / `envsafe` schema-defined env objects — emit one entry per key in the schema.
- Cloudflare `env.X` from Worker / Pages handler signatures.

### `kind: external-call`

```jsonl
{"kind":"external-call","endpoint":"api.stripe.com","protocol":"https","_placement":{"module":"backend","file":"apps/api/src/payments/stripe.ts","line":40}}
```

Endpoint is the host (or `host:port`); strip the path. `protocol` is the wire kind.

Patterns:

- `fetch("https://...")`, `fetch(new URL(...))` — extract the URL host.
- `axios.get/post/put(url)`, `axios.create({ baseURL })`.
- `node-fetch`, `undici.request`, `got.get`.
- gRPC: `@grpc/grpc-js` `client.method({...})` with a host from the transport.
- Database clients: `pg.Pool({ connectionString })`, `mysql2.createConnection`, `mongodb.MongoClient` — `endpoint: host:port`, `protocol: postgres / mysql / mongodb`.
- Redis: `ioredis`, `redis` — `endpoint: host:port`, `protocol: redis`.
- AWS SDK clients (`new S3Client({...})`, `new DynamoDBClient(...)`) — protocol `https`, endpoint per service.
- Stripe / OpenAI / Anthropic SDKs (`new OpenAI({...})`) — emit the canonical host (`api.openai.com`).

In-cluster service-to-service calls (your frontend hitting your own
`/api`, or one Nest module calling another via DI) are **NOT**
external — those are use-case steps. Don't emit them as `external-call`.
