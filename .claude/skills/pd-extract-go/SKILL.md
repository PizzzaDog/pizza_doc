---
name: pd-extract-go
description: >-
  Extract Pizza Doc entities (models, tables, components) from a Go
  codebase and emit them as JSONL. Handles chi / echo / gin / fiber +
  gorm / sqlx / sqlc / ent. Output feeds `pd import --from-jsonl`. Used
  by `pd-scanner` and `pd-drift-auditor`.
---

# pd-extract-go — Go → JSONL

Read a Go source tree and emit JSONL entity declarations. Same contract
and output as the other `pd-extract-*` skills.

## When to use

- `pd-scanner` with `implementationLanguage: go`.
- `pd-drift-auditor` with the same.
- User directly: "extract entities from cmd/api".

## Inputs

1. Source directory (typically the module root — where `go.mod` lives).
2. `spaceId` + placement map.
3. Output path (default `/tmp/<spaceId>-entities.jsonl`).

## Output contract

Same as `pd-extract-java`. See its SKILL.md for the JSON shape.

## Algorithm

### Step 1 — Walk the tree

Skip:
- `vendor/`, `bin/`, `dist/`, `out/`, `build/`.
- `*_test.go` — tests drive use cases separately.
- `_mock/` / `mocks/` directories.
- Generated files (look for `DO NOT EDIT` header in the first 5 lines).

### Step 2 — Classify

| Markers | Kind |
|---|---|
| struct with gorm tags (`gorm:"primaryKey"`, `gorm:"column:…"`) | model (entity) + table |
| struct with ent `Mixin` / `ent.Schema` | same |
| struct with `json:"…"` tags only | model (dto) |
| `http.HandlerFunc` / `func(w http.ResponseWriter, r *http.Request)` registered with `chi.Router.Get("/…")` / `engine.GET("/…")` / `app.Get("/…")` | component (controller) |
| `type …Service struct { … }` with methods + DI | component (service) |
| `type …Repository interface { … }` or struct with DB methods | component (repository) |
| middleware function with `func(next http.Handler) http.Handler` | component (infrastructure) |
| cron / goroutine worker (e.g. consuming from `chan`, NATS subscriber, SQS poller) | component (job) |

### Step 3 — Field extraction

**Entity (gorm):**
```go
type User struct {
    ID        uuid.UUID `gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
    Email     string    `gorm:"uniqueIndex;not null"`
    CreatedAt time.Time `gorm:"not null;default:now()"`
    Orders    []Order   `gorm:"foreignKey:UserID"`
}
```

Emit:
- A `table` entry named `users` (snake_case of struct unless
  `TableName()` overrides). Columns with PK / default / unique
  flags from gorm tags.
- An `entity` model `User` with `persistedAs` referring to the table.
  `Orders []Order` → field `type: List<Order>`, `persisted: false`
  (has `foreignKey` gorm tag → relation, not column).

**DTO (plain struct with JSON tags):**
```go
type CreateUserRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=6"`
    Name     string `json:"name" validate:"required"`
}
```

Each field: `name` from `json:"…"` tag, `type` from Go type.

**Type mapping (Go → Pizza Doc):**

| Go | Pizza Doc |
|---|---|
| `string` | `string` |
| `int`, `int32`, `int64` | `int` / `long` |
| `uint*` | `int` (ask user if 64-bit int needed) |
| `float32`, `float64` | `decimal` |
| `bool` | `boolean` |
| `uuid.UUID` (google/uuid) | `uuid` |
| `decimal.Decimal` (shopspring) | `decimal(19,4)` |
| `time.Time` | `timestamp` |
| `time.Time` + timezone in docs | `timestamptz` |
| `*T` (pointer) | `T` + `optional: true` |
| `[]T` | `List<T>` |
| `map[string]T` | `Map<string, T>` |
| enum types (usually named-string consts) | `string` |

### Step 4 — Method extraction (components)

Go doesn't have annotations — handlers are registered programmatically:

```go
r := chi.NewRouter()
r.Post("/v1/auth/login", authCtrl.Login)
```

Strategy:
1. Find the registration site (main / setup).
2. Map each registered method → component method with the right
   `httpMethod` + `httpPath`.
3. For the actual handler (`authCtrl.Login`), read the function body:
   - The first `json.Decode(&req)` / parse call gives the request DTO.
   - Return types from `render.JSON(w, r, …)` or the response-writer
     use gives the response DTO.

**Service methods:** public methods (capitalised name) on a `…Service`
struct. `calls:` inferred from `s.<dep>.<method>(…)` — the `<dep>` is
a struct field resolved to the target component.

**Repository methods:** interface methods.

### Step 5 — Emit JSONL

Compact, one line per entity. UTF-8.

### Step 6 — Hand off

Orchestrator runs `pnpm pd import --from-jsonl <file>`.

## Failure modes

- **Router registrations spread across multiple files.** Build a map
  by scanning every `.Get("/…", …)` / `.Post(…)` call in the package.
- **Handler functions defined inline (closures).** Treat them as
  anonymous methods on the registering file's component; name them
  after the path (e.g. handler for `POST /login` → method `login`).
- **Gorm migrations vs DDL.** If both exist, prefer DDL for tables.
- **Generated sqlc code.** Skip (DO NOT EDIT header); read the `.sql`
  source through `pd add table --from-sql` instead.

## What you don't do

- Don't `go build` / `go vet` to parse — static read only.
- Don't emit use-case entries.
- Don't modify source.

## v0.2 contract extensions

### `Field.validation`

`go-playground/validator` tags are the primary source:

| Go validator tag | Pizza Doc |
|---|---|
| `validate:"email"` | `format: email` |
| `validate:"required"` on string | `minLength: 1` |
| `validate:"min=X"` (string) | `minLength: X` |
| `validate:"max=Y"` (string) | `maxLength: Y` |
| `validate:"gte=X"` (number) | `min: X` |
| `validate:"lte=Y"` (number) | `max: Y` |
| `validate:"uuid"` | `format: uuid` |

Multiple tags on one field combine into one `validation` block.

### `Model.stateMachine`

Look for `*_status.go` files containing `const (…)` enum declarations
with documented transitions, or `looplab/fsm` usage.

### `Module.errorMapping`

HTTP handler-level error-to-status mappers — typically a switch in a
shared `render.Error(w, err)` helper. Collect `errors.Is(…, SomeErr)
→ status`.

### `UseCase.requires`

Middleware functions mentioning role checks; JWT claim validation.
Extract the required role and flag to `requires:`.

### `sourceRef` (required)

Every component / model / table: `internal/user/user.go:12`, relative
to the codebase root. Contract, not courtesy: `pd drift` pairs renamed
symbols by this file path and `pd anchors` resolves it in CI. Omitting
it opts the entity out of both.

### `Model.topic` (event-kind)

NATS subjects, Kafka topic constants, Redis Stream keys. Extract the
literal string.

## v0.3 operations evidence (config-refs + external-calls)

Beyond entities, scan for **operations evidence** — config reads and
outbound network calls. These don't become spec entities; they feed
`pd drift --from-jsonl`. Both kinds go in the same JSONL stream as
entities.

### `kind: config-ref`

```jsonl
{"kind":"config-ref","key":"STRIPE_SECRET_KEY","_placement":{"module":"backend","file":"internal/payments/stripe.go","line":12}}
```

`_placement.module` is required; skip if you can't determine it.

Go patterns:

- `os.Getenv("X")`, `os.LookupEnv("X")` — `key = X`.
- `viper.GetString("x")`, `viper.GetInt("x")` — `key = x` (viper key paths are typically `lower.case.with.dots`; convert to `UPPER_SNAKE` if you can see the env-binding mapping, else leave as-is and the drift comparator will substring-match).
- `koanf` / `kelseyhightower/envconfig` struct-binding — one config-ref per struct field, key = `<prefix>_<FIELD>` per the tag.
- `cobra.Flag` env-bound flags via `viper.BindEnv(...)`.

### `kind: external-call`

```jsonl
{"kind":"external-call","endpoint":"api.stripe.com","protocol":"https","_placement":{"module":"backend","file":"internal/payments/stripe.go","line":40}}
```

Endpoint = host (or `host:port`). `protocol` = wire kind.

Patterns:

- `http.Get(url)`, `http.NewRequest(method, url, body)`, `(*http.Client).Do(req)`.
- `(*http.Client).Get/Post/...` with explicit URL.
- gRPC: `grpc.NewClient("host:port", ...)`, `grpc.Dial("host:port", ...)` — endpoint is the address arg.
- `database/sql.Open(driver, dsn)`, `pgx.Connect(ctx, dsn)`, `sqlx.Open` — parse the host out of the DSN; emit `endpoint: host:port`, `protocol: <driver>`.
- `redis.NewClient(&redis.Options{Addr: "host:port"})`.
- `mongo.Connect(ctx, options.Client().ApplyURI("mongodb://..."))`.
- AWS SDK v2 clients, GCP / Azure clients — emit canonical host of the named service unless an override URL is set.
- Kafka: `kafka.NewWriter` / `kafka.NewReader` with `Brokers: []string{"host:port"}`.

In-cluster service-to-service calls (one of your Go services calling
another over internal DNS) are **NOT** external — those are use-case
steps. Don't emit them as `external-call`.
