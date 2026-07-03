---
name: pd-extract-java
description: >-
  Extract Pizza Doc entities (models, tables, components) from a Java /
  Kotlin codebase and emit them as JSONL. Use as the extraction step
  inside `pd-scanner` or `pd-drift-auditor`. Handles Spring Boot /
  Quarkus / Micronaut idioms. Output goes through `pd import
  --from-jsonl`; the skill never writes YAML directly.
---

# pd-extract-java — Java/Kotlin → JSONL

Read a Java or Kotlin source tree and emit a JSONL stream of Pizza Doc
entity declarations. You are the language-specific half of the
extraction pipeline — the orchestrator (`pd-scanner` or
`pd-drift-auditor`) consumes your JSONL with `pnpm pd import`.

## When to use

Triggered by:
- `pd-scanner` when the target project's `implementationLanguage` is
  `java` or `kotlin`.
- `pd-drift-auditor` when the space declares Java/Kotlin.
- User directly: "extract entities from apps/backend".

## Inputs

1. Source directory (`apps/backend/src/main/java/...` or similar).
2. Target `spaceId` and the `module` / `domain` placements the orchestrator
   wants each entity filed under. Usually:
   - package `online.restik.identity.internal.domain.*` → `module: backend`, `domain: identity`.
   - package `online.restik.identity.*` (module root, public API) → same placement.
3. Output file path, e.g. `/tmp/<spaceId>-entities.jsonl`.

## Output contract

One JSONL line per entity. Each line is a compact JSON object that
conforms to the matching Zod schema in `@pizza-doc/core` **plus** a
`_placement` envelope:

```jsonl
{"_placement":{"spaceId":"restik","module":"backend","domain":"identity"},"kind":"model","id":"User","name":"User","modelKind":"entity","persistedAs":"<FK-TABLE-REF:id_users>","fields":[{"name":"id","type":"uuid"},{"name":"email","type":"string"},{"name":"role","type":"string","persisted":true}]}
{"_placement":{"spaceId":"restik","module":"backend","domain":"identity"},"kind":"component","id":"AuthController","name":"AuthController","type":"controller","methods":[{"name":"login","httpMethod":"POST","httpPath":"/v1/auth/login","params":[{"name":"request","type":"LoginRequest"}],"returns":"AuthResponse","calls":["module:backend/domain:identity/component:AuthService/method:login"]}]}
```

Downstream consumers:
- For **scan mode** (fresh import): pipe this to `pnpm pd import
  --from-jsonl <file> --merge` — writes new YAMLs and merges repeated
  extraction into existing entities.
- For **drift mode**: hand to `pd-drift-auditor`, which diffs against
  existing space without importing.

## Algorithm

### Step 1 — Walk the source tree

Use plain `find` / directory walk. Skip:
- `build/`, `target/`, `out/`, `bin/` — generated.
- `test/` — for v0.2 we extract production code only; tests are use-case
  sources in a later step.

### Step 2 — Classify each file

Grep the file header for markers:

| Markers present | Entity kind | Notes |
|---|---|---|
| `@Entity`, `@Table` | `model` (modelKind: entity) | JPA entity |
| `public record <Name>(…)` | `model` (modelKind: dto) | Java 16+ record |
| `@RestController`, `@Controller` | `component` (type: controller) | |
| `@Service` | `component` (type: service) | |
| `@Repository`, `interface … extends JpaRepository<…>` | `component` (type: repository) | |
| `@Component` | `component` (type: infrastructure) | catch-all |
| `@Configuration` | `component` (type: infrastructure) | |
| `@Filter`, `implements Filter`, `OncePerRequestFilter` | `component` (type: infrastructure) | |
| sealed class/enum with `state machine` comments | skip or add as value-object | |
| pure `public record` / DTO | `model` (modelKind: dto) | |
| `class … implements …` + no annotation above | read carefully; may be a value-object |

If a file defines multiple top-level classes/records, emit one JSONL
line per each.

### Step 3 — Field extraction

**Entity fields** (JPA):
- `@Id` → column `id`, primary key. Add `persistedAs: <FK-TABLE-REF:<tableName>>`
  once per class from `@Table(name="...")`.
- `@Column(name="...", nullable=..., ...)` → use `name` if set, else the
  Java field name.
- `@OneToMany`, `@ManyToMany`, `@Transient` → `persisted: false`.
- Defaults from `= …` initializers aren't columns' DEFAULT — they're
  Java-side; don't propagate to `Column.default`.

**DTO fields** (record params or simple classes):
- Each parameter = one field.
- Leading `@NotBlank`, `@Email`, `@Size(min=x,max=y)`, `@Pattern(regexp=...)`
  → `Field.validation`. Keep the bare type plus the structured validation
  metadata.

**Type mapping (Java → Pizza Doc):**

| Java | Pizza Doc |
|---|---|
| `UUID`, `java.util.UUID` | `uuid` |
| `String` | `string` |
| `int`, `Integer` | `int` |
| `long`, `Long` | `long` |
| `boolean`, `Boolean` | `boolean` |
| `BigDecimal`, `java.math.BigDecimal` | `decimal(19,4)` (or the `@Column(precision=,scale=)`) |
| `Instant`, `OffsetDateTime` | `timestamptz` |
| `LocalDateTime` | `timestamp` |
| `LocalDate` | `date` |
| `List<X>`, `Set<X>`, `Collection<X>` | `List<X>` |
| `Optional<X>` | `X?` (plus `optional: true`) |
| `X[]` | `X[]` |
| custom enum | string (name of enum used as opaque string) |

**Nested records inside another class** (e.g. `OrderDto.OrderItemDto`):
- Emit each as a separate model entry (same `_placement`).
- Parent's field type references the child's unqualified name
  (`List<OrderItemDto>`).

### Step 4 — Method extraction (components)

For a controller class:

```java
@RestController
@RequestMapping("/v1/auth")
public class AuthController {
    @PostMapping("/login")
    public Map<String,String> login(@Valid @RequestBody LoginRequest request) { … }
}
```

Emit a `component` entry with `methods[]`:

```json
{
  "name":"login",
  "httpMethod":"POST",
  "httpPath":"/v1/auth/login",
  "params":[{"name":"request","type":"LoginRequest"}],
  "returns":"Map<String,String>"
}
```

Combine class-level `@RequestMapping("/v1/auth")` + method-level path.

**`calls` edges:** scan the method body for invocations on injected
dependencies. A `@RequiredArgsConstructor` Lombok class has each `final`
field as a dependency; its method calls like `authService.login(...)`
map to:

```
module:<m>/[domain:<d>/]component:AuthService/method:login
```

You need to resolve the target component's package → module/domain. The
orchestrator's placement map (Step 1's input) has this; if a call's
target is unknown, emit the ref with `<UNRESOLVED-REF>` prefix so the
user fixes it post-import.

### Step 5 — Repository method inference

Spring Data interfaces generate implementations from method names:

```java
public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    void deleteByTenantId(String tenantId);
}
```

Emit the method names verbatim. `findByEmail` → method `name: findByEmail`,
`params`: `[{name: 'email', type: 'string'}]`, `returns: 'User?'` (or
`Optional<User>` — canonicalised).

### Step 6 — Skip what you can't extract confidently

If a class doesn't match any pattern, **emit nothing** rather than guess.
The user (or the orchestrator) will surface the gap later via `pd
coverage` / `pd orphans`.

### Step 7 — Emit the JSONL

One line per entity. Compact JSON (no pretty-printing) so each line stays
one row. UTF-8, no BOM.

Save to the path the orchestrator asked for (`/tmp/<spaceId>-entities.jsonl`
is the default convention).

### Step 8 — Hand off

Done. The orchestrator runs `pnpm pd import --from-jsonl --dry-run <file>`,
reviews the plan, then imports without `--dry-run`. You don't run these
commands yourself.

## Failure modes

- **Reading test files.** Skip. Tests drive use cases, not model
  definitions.
- **Parsing via regex when tree-sitter would be more reliable.** For
  Java the `@Entity` / `public record` idioms are regex-friendly enough;
  if the project uses Kotlin or heavy generics, ask the user and
  consider a manual pass.
- **Fabricating type mappings.** If a field's type isn't in the table
  above, emit the raw type verbatim and let the user refine.
- **Assigning packages → domain naively.** `online.restik.identity.shared`
  might map to `domain:identity` or be a shared module. Ask the
  orchestrator for the placement map first.
- **Emitting an entity with missing required fields.** The import
  rejects it; at least the error is explicit.

## What you don't do

- Don't modify Java source.
- Don't run `pd import` yourself — that's the orchestrator's job.
- Don't infer use cases from arbitrary class bodies. Use cases come from
  tests / product docs / user input. If the orchestrator explicitly asks
  you to convert those sources, emit `kind: "usecase"` JSONL entries.
- Fill `sourceRef` fields whenever the declaration file/line is known.

## v0.2 contract extensions

Beyond bare shapes, fill these fields on your JSONL entries when the
source has them. They're what makes `pd-implementer` able to generate
correct-first-time code.

### `Field.validation`

Bean Validation annotations map 1:1. Collect them on record params and
`@Column`-annotated fields:

| Java annotation | Pizza Doc `validation` |
|---|---|
| `@Email` | `format: email` |
| `@NotBlank` / `@NotEmpty` | `minLength: 1` |
| `@Size(min=X, max=Y)` | `minLength: X`, `maxLength: Y` |
| `@Min(X)` | `min: X` |
| `@Max(X)` | `max: X` |
| `@Positive` | `min: 1` |
| `@PositiveOrZero` | `min: 0` |
| `@Pattern(regexp="…")` | `pattern: "…"` |

Drop them into `{"kind":"model", ..., "fields":[{"name":"email","type":"string","validation":{"format":"email","maxLength":255}}]}`.

### `Model.stateMachine`

Look for enums named like `XxxStatus` / `XxxState` with a `canTransitionTo`
method or a `Map<State, Set<State>>` transitions table. Emit:

```json
{"kind":"model","id":"Order","stateMachine":{"field":"status","states":["CREATED","SENT","DELIVERY","DONE","CANCELLED"],"initial":"CREATED","terminal":["DONE","CANCELLED"],"transitions":[{"from":"CREATED","to":["SENT","CANCELLED"]}]}}
```

### `Module.errorMapping`

Grep for `@ControllerAdvice` / `@ExceptionHandler` mappings. Each
`handle(SomeException e) → ResponseEntity.status(409)` becomes one
`{exception, httpStatus}` row. Emit at module level (the `module.yaml`
entry).

### `UseCase.requires`

Extracted from `@PreAuthorize("hasRole('SUPER_ADMIN')")` /
`@Secured` / custom role checks in controllers. `tenantContext: true`
for endpoints under a tenant-filtered path. Use-case yaml is written by
the orchestrator, not by this extractor — so note what you saw and tell
the user.

### `sourceRef` (required)

**Every** component / model / table gets a `sourceRef` pointing at its
declaration file (relative to the codebase root), optionally `:line`.
Contract, not courtesy: `pd drift` pairs renamed symbols by this file
path (RENAME instead of add+delete), `pd anchors` resolves it in CI.
Omitting it opts the entity out of both.

```json
{"kind":"model","id":"User",...,"sourceRef":"apps/backend/src/main/java/online/restik/identity/internal/domain/User.java:12"}
```

### `Model.topic` (event-kind only)

When a class is annotated `@KafkaListener(topics="…")`, `@RabbitListener(queues="…")`,
or Spring Modulith `@DomainEventListener`, emit `"topic": "<name>"` on
the associated event model.

## v0.3 operations evidence (config-refs + external-calls)

Beyond entity emission, scan the source for **operations evidence** —
configuration reads and outbound network calls. These don't become spec
entities; they're consumed only by `pd drift --from-jsonl` to flag
divergence between code and the operations layer (`config-map.yaml` /
`external-deps.yaml`). Two evidence kinds, both go to the same JSONL
stream as entities — the drift command picks them up by `kind`.

### `kind: config-ref`

Emit one line per call-site that reads a configuration value:

```jsonl
{"kind":"config-ref","key":"STRIPE_API_KEY","_placement":{"module":"backend","file":"src/main/java/.../PaymentService.java","line":42}}
```

`_placement.module` is **required** so drift can scope the key to the
right module's config-map. If you can't determine the module — skip the
entry rather than guess.

Java/Kotlin patterns to scan:

- `@Value("${prop.path:default}")` — strip `${}` and the `:default` suffix; `key = "prop.path"` (or `PROP_PATH` if it's an env binding via `application.yml`).
- `@ConfigurationProperties(prefix = "x.y")` — emit one config-ref per property in the bound class, key = `<prefix>.<field>`.
- `System.getenv("X")` / `System.getProperty("X")` — `key = X`.
- `ConfigurableEnvironment#getProperty("x")` direct calls.
- Kotlin: `@field:Value`, `bean.x` from `@ConfigurationProperties` data classes.

### `kind: external-call`

Emit one line per outbound call to a thing outside the application:

```jsonl
{"kind":"external-call","endpoint":"api.stripe.com","protocol":"https","_placement":{"module":"backend","file":"src/main/java/.../StripeClient.java","line":18}}
```

Endpoint convention: prefer the host (or `host:port` for non-HTTP
transports). Strip the path — the drift comparison is fuzzy substring
either way, but a clean host is idiomatic. `protocol` is the wire kind
(`https`, `http`, `tcp`, `grpc`, `postgres`, `kafka`, `redis`, …).

Java/Kotlin patterns:

- `WebClient.create("https://...")`, `WebClient.builder().baseUrl(...)` — host of the URL.
- `RestTemplate#getForObject/postForObject(URL)`, `RestClient.create(...)` — same.
- `OkHttpClient` `Request.Builder().url(...)`.
- `URL.openConnection()`, `HttpURLConnection`.
- Apache `HttpClient`/`CloseableHttpClient` `.execute(new HttpGet(...))`.
- JDBC `DataSource` / `DriverManager.getConnection("jdbc:postgresql://host:port/db")` — emit `endpoint: host:port`, `protocol: postgres`.
- `KafkaProducer` / `@KafkaListener` referencing `bootstrap-servers` → `endpoint: <bootstrap-host:port>`, `protocol: kafka`.
- gRPC `ManagedChannelBuilder.forAddress(host, port)` → `endpoint: host:port`, `protocol: grpc`.
- Spring Cloud `@FeignClient(url = "...")`.

When the URL is built from a config key (very common: `WebClient.create(stripeUrl)` where `stripeUrl` came from `@Value("${stripe.url}")`), still emit `external-call` with the literal default URL if visible, otherwise the variable name as a fallback hint. The drift report then suggests the operator check both the config-map entry and the external-deps entry.

In-cluster service-to-service calls (e.g. one of your modules calling another via internal DNS) are **NOT** external — those are use-case steps with `protocol: http` and a target component in another module. Don't emit them as `external-call`.
