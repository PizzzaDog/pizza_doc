---
name: pd-scanner
description: >-
  Reverse-engineer an existing codebase of any language into a Pizza Doc
  space. Use when the user asks to document / оцифровать / "make a space
  from" an existing project. Detects language/framework, delegates
  entity extraction to the matching `pd-extract-<lang>` skill, wires up
  the space bottom-up, writes use cases last.
---

# pd-scanner — codebase → space (language-agnostic)

> **Layouts.** Examples below use `spaces/<id>/` (multi-space, what this
> dev repo uses). For a user project on the new default `.pizza-doc/`
> layout, drop the path arg — `pd <cmd>` auto-detects from cwd. `pd init
> <id>` makes `.pizza-doc/`; pass `--multi` for `spaces/<id>/`.

Produce a **validated Pizza Doc space** that mirrors an existing codebase.
This skill is the orchestrator. It doesn't read application code directly
— it **dispatches to a language-specific extractor skill** and wires the
results into a well-formed space.

## When to use

User says:
- "создай space из /path/to/repo"
- "document this codebase"
- "оцифруй этот проект"

**Not** for design-first ("нам надо спроектировать сервис X") — that's
`pd-author`.

## Hard rules

1. **Never hand-author entity YAML when an extractor exists.** Use `pd add`,
   `pd import`, or the relevant `pd-extract-<lang>` skill.
2. **Bottom-up build order** — tables → models → components → use cases.
3. **Validate after every layer.** Fix the first error before continuing.
4. **Source code is read-only** on your end — only the space directory
   gets written.
5. **No language assumptions.** Everything language-specific lives in an
   extractor skill, not here.

## Algorithm

### Step 1 — Detect the stack

Open the repo root. Answer, in order:

- **Language + framework?** Look at file extensions, build files, config:
  - Java/Kotlin: `pom.xml`, `build.gradle`, `*.java`, `*.kt`. Framework clues: Spring Boot, Quarkus, Micronaut.
  - TypeScript/JavaScript: `package.json`. Framework: `express`, `@nestjs/core`, `next`, `fastify`, `react`.
  - Python: `pyproject.toml`, `requirements.txt`, `*.py`. Framework: `fastapi`, `django`, `flask`.
  - Go: `go.mod`, `*.go`. Framework: `gin-gonic/gin`, `chi`, `echo`, `fiber`.
  - Rust: `Cargo.toml`. Framework: `actix-web`, `axum`, `rocket`.
  - C#/Kotlin/Ruby/Swift: analogous.
- **Where are DB migrations?** `db/`, `migrations/`, `prisma/schema.prisma`, `flyway/`, `liquibase/`.
- **Where are entities / DTOs / endpoints?** Deferred to extractor skill.
- **Who are the actors?** Grep auth middleware or role enums. 2-5 is normal.

Write a mental map. Don't commit anything yet.

### Step 2 — Dispatch to the right extractor skill

Once you know the language, **run the matching skill for the rest of the
extraction work**:

| Language | Skill |
|---|---|
| Java / Kotlin | `.Codex/skills/pd-extract-java/SKILL.md` |
| TypeScript / JavaScript | `.Codex/skills/pd-extract-typescript/SKILL.md` |
| Python | `.Codex/skills/pd-extract-python/SKILL.md` |
| Go | `.Codex/skills/pd-extract-go/SKILL.md` |
| Rust / C# / Ruby / Swift | no dedicated extractor yet — adapt the closest one. File an issue. |

**If no extractor skill exists for the stack**, pause and ask the user
what to do. Do not invent an extraction procedure on the fly.

### Step 3 — Scaffold the space

```bash
pnpm pd init <space-id>
```

Edit the generated `space.yaml` to set language + framework:

```yaml
meta:
  id: <space-id>
  name: <Human Name>
  description: <one paragraph>
  version: 0.1.0
  pizzaDocVersion: 0.2.0
  implementationLanguage: <java|typescript|python|go|…>
  implementationFramework: <spring|nestjs|fastapi|gin|…>
```

These fields let downstream skills (implementer, drift-auditor) match
idioms without asking the user again.

### Step 4 — Actors

```bash
pnpm pd add actor <id> --type user|system|scheduler --space <space-id>
```

Tune `name` + 1-sentence `description` manually.

### Step 5 — Modules (deployable units)

```bash
pnpm pd add module <id> --type service|frontend|database|queue|external --space <space-id>
```

One deployable = one module. DBs / queues / third-party APIs are
first-class modules.

### Step 6 — Domains (only for service/database modules with ≥8 components)

```bash
pnpm pd add domain <id> --module <mid> --space <space-id>
```

Mirror the code's package structure when it's DDD-shaped. Skip otherwise.

### Step 7 — Tables (universal)

SQL DDL is language-independent. Use the native importer:

```bash
pnpm pd add table --from-sql <migration-file> \
  --module <db-module-id> \
  --domain <optional-domain-id> \
  --space <space-id>
```

For Prisma / ORM-declared schemas without raw SQL, delegate to the
extractor skill — it may emit JSONL with table entries.

```bash
pnpm pd validate spaces/<space-id>
```

Fix placeholder FK refs (`<FK-TABLE-REF:foo>`) by replacing them with
proper `module:<db>/[domain:<d>/]table:foo` refs.

### Step 8 — Models + components (via extractor → JSONL → import)

The extractor skill does the heavy lifting. It produces one JSONL file
(stream of entity declarations), you consume it:

```bash
pnpm pd import --from-jsonl /tmp/<spaceid>-entities.jsonl --dry-run
# review the plan
pnpm pd import --from-jsonl /tmp/<spaceid>-entities.jsonl --merge
```

The extractor is responsible for:
- Correct `_placement.{module, domain}` on every entry.
- `_placement.spaceId` only when importing into a multi-space `spaces/<id>/`
  repo. In default `.pizza-doc/` layout, omit it or pass `--space-dir .pizza-doc`.
- Correct `persistedAs:` refs for entity models (may emit placeholders).
- `httpMethod` + `httpPath` + `calls:` on controller methods.

Your job:
- Validate after each extractor pass.
- Resolve placeholders.
- Tune descriptions / fix obvious misclassifications.

### Step 9 — Use cases

Only after steps 1-8 produce `0 errors`.

Identify candidates from:
- Integration / E2E tests (`describe('user can ...')`, `test('checkout')`).
- Product docs / README / onboarding.
- Primary actions on each frontend page.
- Queue consumers / scheduled jobs (one per event type).

Aim 6-12 for a first pass.

Use cases can be written as YAML files directly or imported as JSONL with
`kind: "usecase"` through the same `pd import --from-jsonl --merge` path.
Do not mine use cases from arbitrary method bodies; tests, routes, pages,
jobs, and product docs are the source of actor intent.

```yaml
kind: usecase
id: <slug>
name: <human-readable>
actor: actor:<id>
trigger: <what user action>
description: One paragraph.
steps:
  - from: ...
    to: ...
    via: module:<m>/[domain:<d>/]model:<DtoId>
    protocol: http | http-response | internal-call | sql | event | external-api
    description: <optional, e.g. HTTP method + path for http steps>
errorFlows:
  - id: <slug>
    condition: <business-level>
    steps: [...]
    resultDescription: "HTTP 4xx ..."
invariants:
  pre:  [...]
  post: [...]
dataFlow:
  - sourceField: <Model>.<field>
    targetField: <table>.<column>
    transform: <optional>
    cardinality: one | many
```

### Step 10 — Close the gates

```bash
pnpm pd validate    spaces/<id>
pnpm pd coverage    spaces/<id>
pnpm pd orphans     spaces/<id>
pnpm pd endpoints   spaces/<id> --orphans
```

Target: **0 errors, 0 warnings, coverage ≥ 80% everywhere**.

### Step 11 — Report

One tight summary:
- counts (modules / actors / tables / models / components / use cases),
- coverage %,
- extractor skill used,
- any known gaps.

## Failure modes

- **"I'll just grep Java / Python / TS in this skill"** — no. Delegate
  to the extractor skill. This skill is an orchestrator, not a parser.
- **`persistedAs` placeholders left un-resolved.** Validator catches
  them — fix before moving on.
- **Use cases first.** Always last. Otherwise cascade of REF_BROKEN.
- **One use case for a whole user journey.** Split. One use case = one
  actor intent.
- **Modelling internal helpers as components.** Only things other
  components call by name deserve a component.yaml.

## What you don't do

- Don't propose new features — you mirror reality.
- Don't touch the source code.
- Don't invent language handling — if no extractor skill exists, stop
  and ask.
