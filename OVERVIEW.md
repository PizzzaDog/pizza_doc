# Pizza Doc — Full Project Overview (v0.6.0) <!-- pd:version -->

A file-based architecture-as-code tool that lets you describe a system
fully — actors, modules, components, models, tables, use cases, state
machines, permissions, errors — as strict YAML. The same doc drives
a live diagram UI and a deterministic code-generation pipeline, so
the spec is never lying.

> **Heads-up:** the body below snapshots the **Phase 4.x state** (≈ v0.2
> era). Five minor releases since (v0.3 operations layer · v0.4 contract
> flags + change-sets + drift + port-from-legacy · v0.5 ADR back-refs +
> pub/sub edges + wire capture + migration parity + `pd doctor`) are
> tracked in [`CHANGELOG.md`](./CHANGELOG.md). When the two disagree, the
> changelog wins. The Roadmap section near the end is historical — current
> open items live in [`docs/backlog.md`](./docs/backlog.md).
>
> For an overview + why of the project at marketing depth, see
> [README.md](./README.md). For the rules-of-engagement when agents edit
> this repo, see [CLAUDE.md](./CLAUDE.md).

---

## Table of contents

- [Pitch](#pitch)
- [Architecture](#architecture)
- [Schema — every field](#schema--every-field)
- [Validator rules](#validator-rules)
- [CLI — every command](#cli--every-command)
- [Agent skills](#agent-skills)
- [Workflows](#workflows)
- [What's in each release tier](#whats-in-each-release-tier)
- [Roadmap](#roadmap)

---

## Pitch

You have N services / features / apps. The ones that got documentation
have docs that are **months out of date**. The ones that didn't just
exist as "tribal knowledge" — whoever shipped them is the only one
who knows how they work.

Pizza Doc aims to make the doc itself the contract:

- It's **YAML files next to code**, so diffable, PR-friendly, reviewable.
- It's **strictly validated** (Zod + 20+ semantic rules), so agents can't
  invent junk fields and authors can't lie about the graph.
- It **covers what you need to re-implement an app from scratch** —
  including DTO validation rules, state machines, permission matrices,
  exception-to-status mappings, event topics.
- It's **language-agnostic at the core**: 4 extractor skills (Java,
  TypeScript, Python, Go) emit the same JSONL shape, the CLI consumes
  that shape regardless of source language. Adding a language = one
  more skill file.
- It **works with agents** out of the box — 9 task-specific playbooks
  under `.claude/skills/` turn LLMs into reliable collaborators that
  don't freelance outside the spec.

## Architecture

```
pizza_doc/
├── packages/
│   ├── core/          ← Zod schemas + loader + 3-pass validator + AI exporter
│   ├── cli/           ← `pd` CLI (15 commands)
│   └── web/           ← Vite + React UI (reads spaces via File System Access API)
├── spaces/            ← Each subdirectory with space.yaml is a space
│   ├── pizza-shop-demo/
│   └── restik/
├── .claude/
│   └── skills/        ← 9 agent playbooks (5 orchestrators + 4 language extractors)
├── .pizza-doc/
│   └── schemas/       ← Generated JSON Schemas for IDE validation
├── .vscode/
│   └── settings.json  ← Wires JSON Schemas to YAML patterns
├── scripts/
│   ├── validate-space.mjs   ← Legacy validator (pnpm pd validate is preferred)
│   └── gen-json-schemas.mjs ← Regenerates .pizza-doc/schemas/*.json from Zod
├── templates/
│   └── ci/            ← Drop-in GitHub Action + pre-commit hook for consumer repos
├── CLAUDE.md          ← Rules for agents working in this repo
├── OVERVIEW.md        ← This file
├── README.md          ← Marketing-depth intro
└── Makefile           ← Convenience targets (make dev / validate / coverage / …)
```

**Source of truth for schema:** [`packages/core/src/schema.ts`](./packages/core/src/schema.ts) (Zod,
`.strict()` everywhere).

**Source of truth for validator:** [`packages/core/src/validator/semantic.ts`](./packages/core/src/validator/semantic.ts).

**Source of truth for CLI commands:** [`packages/cli/src/commands/`](./packages/cli/src/commands).

---

## Schema — every field

### Top-level entity kinds

| Kind | Where it lives | File pattern |
|---|---|---|
| `actor` | space/actors/ | `<id>.yaml` |
| `module` | space/modules/`<id>`/ | `module.yaml` |
| `domain` (inside a module) | space/modules/`<m>`/domains/`<id>`/ | `domain.yaml` |
| `component` | space/modules/`<m>`/[domains/`<d>`/]components/ | `<id>.yaml` |
| `model` | space/modules/`<m>`/[domains/`<d>`/]models/ | `<id>.yaml` |
| `table` | space/modules/`<m>`/[domains/`<d>`/]tables/ | `<id>.yaml` |
| `usecase` | space/use-cases/ | `<id>.yaml` |
| `space` itself | space/ | `space.yaml` |

`id` in YAML **must** match the filename (sans `.yaml`) or the enclosing folder
for `module.yaml` / `domain.yaml`.

### Enums (non-negotiable)

- `module.type`: `frontend · service · database · queue · external`
- `component.type`: `controller · service · repository · infrastructure · page · widget · client · job · consumer · subscriber · middleware`
- `model.modelKind`: `dto · entity · value-object · event · enum`
- `actor.type`: `user · system · scheduler`
- `step.protocol`: `http · http-response · sse · websocket · ws · internal-call · sql · event · external-api`
- `method.httpMethod`: `GET · POST · PUT · PATCH · DELETE`
- `dataFlow.cardinality`: `one · many`

### Entity field cheat-sheet

**`SpaceMeta`** (in `space.yaml`):
- `id`, `name`, `description`, `version`, `pizzaDocVersion`
- `implementationLanguage` — free string (`java`, `typescript`, ...)
- `implementationFramework` — free string (`spring`, `nestjs`, ...)

**`Actor`**: `kind: actor`, `id`, `name`, `type`, `description?`.

**`Module`**: `kind: module`, `id`, `name`, `type`, `techStack?`, `description?`,
`domains[]`, `components[]`, `models[]`, `tables[]`, `errorMapping[]`.

**`Domain`**: `id`, `name`, `description?`, `components[]`, `models[]`, `tables[]`.

**`Component`**: `kind: component`, `id`, `name`, `type`, `methods[]`,
`description?`, `sourceRef?`.

**`Method`** (inside component): `name`, `params[]`, `returns?` (defaults
`void`), `calls[]`, `throws[]`, `description?`, `httpMethod?`, `httpPath?`,
`sourceRef?`.

**`Field`** (inside model or method.params): `name`, `type`, `optional?`,
`persisted?` (default `true`), `validation?`, `description?`, `example?`,
`sourceRef?`.

**`Validation`** (inside field): `format?`, `min?`, `max?`, `minLength?`,
`maxLength?`, `pattern?`, `enumValues?`, `description?`.

**`Model`**: `kind: model`, `id`, `name`, `modelKind`, `fields[]`,
`description?`, `persistedAs?`, `topic?`, `stateMachine?`, `sourceRef?`.

**`StateMachine`**: `field`, `states[]`, `initial?`, `terminal[]`,
`transitions[]`, `description?`.

**`Transition`**: `from`, `to` (string or array), `on?`, `guard?`, `description?`.

**`Table`**: `kind: table`, `id`, `name`, `columns[]`, `indexes[]`,
`description?`, `sourceRef?`.

**`Column`**: `name`, `sqlType`, `primaryKey?`, `nullable?`, `unique?`,
`default?`, `foreignKey?`, `description?`, `sourceRef?`.

**`ErrorMapping`** (inside module): `exception`, `httpStatus`, `code?`,
`description?`.

**`UseCase`**: `kind: usecase`, `id`, `name`, `actor`, `trigger`,
`description?`, `steps[]`, `errorFlows[]`, `invariants`, `requires[]`,
`dataFlow[]`, `sourceRef?`.

**`UseCaseStep`**: `from`, `to`, `via?`, `protocol?`, `kind?`, `description?`.

**`UseCaseRequirement`**: `role?`, `tenantRole?`, `tenantContext?`,
`flag?`, `description?`.

**`DataFlow`**: `sourceField`, `targetField`, `cardinality?` (default `one`),
`transform?`.

### Ref URI grammar

Refs are strings, regex-validated by the schema:

```
actor:<id>
module:<id>
module:<id>/component:<id>
module:<id>/component:<id>/method:<name>
module:<id>/model:<id>
module:<id>/table:<id>
module:<id>/domain:<d>/component:<id>
module:<id>/domain:<d>/component:<id>/method:<name>
module:<id>/domain:<d>/model:<id>
module:<id>/domain:<d>/table:<id>
usecase:<id>
```

Top-level kinds: only `actor`, `module`, `usecase`. Everything else is
reached through a module (and optionally through a domain).

---

## Validator rules

Three passes. Pass N stops if Pass N-1 has errors.

### Pass 1 — Schema (Zod + filename/id)

- `YAML_PARSE_ERROR` · `FILE_UNRECOGNIZED`
- `SCHEMA_UNKNOWN_FIELD` · `SCHEMA_MISSING_REQUIRED` · `SCHEMA_WRONG_TYPE`
- `SCHEMA_INVALID_VALUE` · `SCHEMA_INVALID_ID` · `SCHEMA_INVALID_REF_PATTERN`
- `SCHEMA_UNKNOWN_MODULE_TYPE` · `SCHEMA_UNKNOWN_MODEL_KIND` · `SCHEMA_UNKNOWN_COMPONENT_TYPE`
- `SCHEMA_FILENAME_ID_MISMATCH`

### Pass 2 — Reference resolution

- `REF_BROKEN` · `REF_WRONG_KIND`

### Pass 3 — Semantic (runs only if passes 1+2 clean)

**3.1 use-case coherence:**
- `USECASE_NO_STEPS`
- `USECASE_STEP_CHAIN_DISCONTINUITY` — uses a virtual call stack; any frame
  seen earlier is a valid implicit return.
- `USECASE_FIRST_STEP_NOT_FROM_FRONTEND`
- `USECASE_LAST_STEP_NOT_TERMINAL` — terminal = table · external-module
  component · frontend surface.

**3.2 DTO flow:**
- `DTO_FLOW_VIA_TYPE_MISMATCH` — accepts the DTO on any param position,
  not just first.
- `HTTP_STEP_TARGET_NOT_CONTROLLER`
- `SQL_STEP_TARGET_NOT_DATABASE`

**3.3 data flow:**
- `DATAFLOW_SOURCE_FIELD_MISSING` · `DATAFLOW_TARGET_FIELD_MISSING`
- `DATAFLOW_TYPE_INCOMPATIBLE` — honours `cardinality: many` for fan-outs;
  `List<X>` ≡ `X[]`; parameterised types (`decimal(19,4)`) match unparameterised.
- `DATAFLOW_TRANSFORM_MISSING`
- `DATAFLOW_UNUSED_DTO_FIELD`
- `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN` — skips columns with `default:`.

**3.4 structural hygiene:**
- `DUPLICATE_ID` · `CYCLIC_CALLS`
- `ACTOR_UNUSED` · `COMPONENT_UNUSED` · `DTO_UNUSED`

**3.5 cross-module:**
- `MODEL_FIELD_MISSING_COLUMN` — skips fields with `persisted: false`.
- `FK_COLUMN_MISSING`

**3.6 contract extensions:**
- `STATE_MACHINE_INCOHERENT` — `field` exists on the model, no duplicate
  states, `initial`/`terminal`/transitions all reference declared states,
  no transitions from terminal states.

Each rule is an individually-callable pure function. CLI `--disable`
(future) toggles via `validateSemanticPass({ disabledRules })`.

---

## CLI — every command

Run `pnpm pd <cmd>` or `pnpm pd --help` for the usage banner.

### Scaffolding

| Command | Use |
|---|---|
| `init <space-id>` | Create a new space under `spaces/<id>/`. |
| `add actor <id>` | Emit `<id>.yaml` under `actors/`. |
| `add module <id>` | Emit module dir + `module.yaml`. |
| `add domain <id> --module <mid>` | Emit domain dir + `domain.yaml`. |
| `add component <id>` | Emit component YAML under a module/domain. |
| `add model <id>` | Emit model YAML. |
| `add table <id>` | Emit table YAML. |
| `add table --from-sql <file>` | Parse DDL → emit table YAML(s). SQL is universal → native parser. |

Non-SQL code import uses `pd import`.

### Bulk import

```
pd import --from-jsonl <file> [--dry-run] [--force]
```

JSONL stream of entities produced by a `pd-extract-<lang>` skill. Each
line is one entity + an `_placement` envelope routing it to the right
file. Transactional: any parse error aborts all writes.

### Quality gates

| Command | Exit code | Use |
|---|---|---|
| `validate [spaces/<id>] [--strict-warnings] [--verbose]` | 0 / 1 / 2 | Three-pass validator. |
| `coverage [spaces/<id>] [--min-components N] …` | 0 / 1 | Per-category coverage %; fails under thresholds. |
| `orphans [spaces/<id>] [--kind …]` | 0 / 1 | Unused components / models / tables / endpoints. |
| `endpoints [spaces/<id>] [--orphans]` | 0 / 1 | HTTP surface + use-case coverage per endpoint. |
| `dataflow <Model.field> [spaces/<id>]` | 0 / 1 | Trace a field through all use-case dataFlow. |
| `diff <git-ref> [spaces/<id>]` | 0 | Structural diff of the space vs a git ref. |
| `drift --from-jsonl <file> [spaces/<id>]` | 0 / 1 | Diff a code-side JSONL vs current space. |

### Exploration / export

| Command | Output | Use |
|---|---|---|
| `explain <ref> [spaces/<id>]` | stdout | One-shot entity walk (what it is, who uses it). |
| `stats [spaces/<id>]` | stdout | Counts, longest use cases, most-called components, coverage. |
| `watch [spaces/<id>]` | long-running | Live revalidate on YAML changes. |
| `export openapi [--out <file>] [spaces/<id>]` | JSON | OpenAPI 3.1 from controllers + DTOs; error responses from `errorMapping`. |
| `export implementation-brief <ucid> [--out <file>]` | Markdown | Self-contained brief for an LLM implementer — use case + all referenced entities flattened. |

### Utilities

- `pnpm gen:schemas` — regenerate VS Code JSON Schemas from Zod.
- `pnpm --filter @pizza-doc/web dev` — run the UI locally.
- `make dev` / `make validate SPACE=<id>` / `make coverage SPACE=<id>` / `make gen-schemas`.

---

## Agent skills

Two tiers. All in `.claude/skills/<name>/SKILL.md`.

### Orchestrators (language-agnostic)

| Skill | Direction | Trigger |
|---|---|---|
| `pd-scanner` | code → space | "оцифруй X", "document this codebase" |
| `pd-author` | nothing → space | "давай спроектируем сервис Y", "spec-first" |
| `pd-drift-auditor` | space ↔ code | "check drift", "is the doc still accurate" |
| `pd-implementer` | space → code | "implement usecase X" |
| `pd-pr-reviewer` | diff review | "review this PR to the space" |

Orchestrators never read application source code directly. They
**dispatch to the matching extractor skill** for the target language.

### Extractors (one per language)

| Skill | Covers |
|---|---|
| `pd-extract-java` | Java / Kotlin + Spring Boot / Quarkus / Micronaut |
| `pd-extract-typescript` | TS / JS + Express / NestJS / Fastify / Prisma / TypeORM / zod / React / Next |
| `pd-extract-python` | FastAPI / Django / Flask / Pydantic / SQLAlchemy |
| `pd-extract-go` | chi / echo / gin / fiber / gorm / sqlc / ent |

Each extractor reads source code and emits a JSONL stream conforming to
the Zod schemas (+ a `_placement` envelope). `pd import --from-jsonl`
consumes that stream regardless of language. Adding a new language = one
more SKILL.md.

**Boundaries (important):**
- `pd-scanner` never parses code itself — delegates.
- `pd-author` never touches source code.
- `pd-drift-auditor` never modifies either side — reports only.
- `pd-implementer` never modifies the spec; if the spec is incomplete it
  asks the user to run `pd-author`.
- `pd-pr-reviewer` never merges — reports only.
- `pd-extract-*` never writes YAML directly — always through JSONL +
  `pd import`.

---

## Workflows

### A — reverse-engineer existing code

```
[ you ]              [ agent ]                    [ CLI ]
──────               ────────                     ──────

"оцифруй ~/myproject" ──►  pd-scanner
                            │ detects language
                            ▼
                           pd-extract-<lang>
                            │ emits /tmp/myproject.jsonl
                            ▼
                                                   pd init myproject
                                                   pd add module/actor (bulk)
                                                   pd add table --from-sql (for each migration)
                                                   pd import --from-jsonl /tmp/myproject.jsonl
                                                   pd validate
                                                   (fix FK placeholders)
                            │ reads tests, README
                            ▼ writes use cases
                                                   pd validate
                                                   pd coverage
                                                   pd orphans
```

First pass: a few hours for a medium codebase. Result: validated space
with ~80% real coverage.

### B — design-first

```
[ you ]                        [ agent ]                    [ CLI ]
──────                         ────────                     ──────

"давай спроектируем X"   ──►   pd-author
                               ▼ asks 5 design questions
[ answers ]              ──►
                                                            pd init X
                                                            pd add actor/module/domain
                               ▼ drafts first use case in prose
                               ▼ derives required components/models/tables
                                                            pd add component/model/table
                               ▼ fills YAML with validation,
                                 stateMachine, requires, errorMapping
                                                            pd validate
                                                            pd coverage
[ reviewed ]                  ──►  pd-implementer                 ▼
                                   reads meta.implementationLanguage
                                   writes code bottom-up
                                                            pd validate (still passes)
                                                            pd drift (synced)
```

### Day-to-day lifecycle

```
author YAML  ──►  VS Code (JSON Schema validation)
       │
       ▼
   git commit  ──►  pre-commit hook: pd validate --strict-warnings
       │
       ▼
      PR  ──►  pd-pr-reviewer skill: pd diff + pd coverage + comment
       │
       ▼
    merged  ──►  CI: pd validate / coverage / endpoints --orphans
       │
       ▼
   releases  ──►  pd diff v1.0.0  · pd export openapi
       │
       ▼
    quarterly  ──►  pd-drift-auditor: full extract + diff
```

---

## What's in each release tier

| Phase | Delivered | Status |
|---|---|---|
| **Phase 0** | JSON Schema export + VS Code wiring | ✅ done |
| **Phase 1** | Call-stack-aware step continuity; type normalization fix for arrays / generics; `DTO_FLOW_VIA_TYPE_MISMATCH` on any param position | ✅ done |
| **Phase 2** | `Column.default`; `Field.persisted`; optional `Method.returns`; `protocol: http-response`; `DataFlow.cardinality: many` | ✅ done |
| **Phase 3** | `pd init` · `pd add` · `pd import` · `pd validate` · `pd coverage` · `pd orphans` · `pd dataflow` · `pd endpoints` · `pd diff`; 5 orchestrator skills + 4 extractor skills | ✅ done |
| **Phase 4.0** | Language-agnostic rewrite: deleted the Java-specific CLI parser, introduced `pd import --from-jsonl` + `meta.implementationLanguage` | ✅ done |
| **Phase 4.1** | `Field.validation` · `Model.stateMachine` · `Model.topic` · `Module.errorMapping` · `UseCase.requires` · `sourceRef` on every entity · `STATE_MACHINE_INCOHERENT` rule | ✅ done |
| **Phase 4.2** | `pd drift` · `pd export openapi` · `pd export implementation-brief` · `pd watch` · `pd explain` · `pd stats` · CI templates | ✅ done |

**Current tests:** 186/186 pass (all three packages). Restik showcase space:
0 errors · 0 warnings · 0 infos. OpenAPI export produces a 2500-line
valid OpenAPI 3.1 document straight from the spec.

---

## Roadmap (historical)

> Snapshot from Phase 4.x. Items 1–7 (v0.3) and 8–12 (v0.4) below are
> mostly shipped — see [`CHANGELOG.md`](./CHANGELOG.md) for the actual
> deliveries. Current open items live in [`docs/backlog.md`](./docs/backlog.md).

Not shipped yet. Ranked by ROI.

### Near-term (v0.3)

1. **`pd export openapi` → `--format yaml`** — OpenAPI in YAML flavour.
2. **`pd export contract-tests`** — draft integration tests from `errorFlows`
   + `invariants.post` in the target framework.
3. **Field validation → validator rule**: cross-check `validation` on the
   source field matches the target column's check constraints / not-null
   / length.
4. **UI**: state-machine diagram on entity pages, `requires` chips on use
   cases, validation chips on DTO fields.
5. **UI**: "implementation status" frontmatter — `draft | verified |
   implemented` per entity, with colour overlays on the canvas.
6. **`pd explain --format mermaid`** — entity graph as Mermaid for copying
   into confluence / PR descriptions.
7. **`pd fix`** — auto-fix missing `returns: void`, reorder method params
   to match `via`, normalise `decimal` → `decimal(19,4)` when the column
   is decimal.

### Mid-term (v0.4)

8. **Inheritance / composition** — `UseCase.includes: [another-ucid]` for
   reusing auth-pipeline preludes.
9. **Native extractor binaries** — non-agent parsers for CI-only pipelines
   where LLMs aren't available (`npx pd-extract-java <dir>`).
10. **Schema migration framework** — `scripts/migrate-space.mjs v0.2 → v0.3`
    codemod-style for breaking schema changes.
11. **More extractor languages** — Rust, C#, Ruby, Swift (one skill each).
12. **Live OpenAPI diff** — PR check: "this PR changes 3 endpoint
    signatures, breaking 2 downstream services".

### Long-term

13. **Semantic types for field.type** — instead of free strings, a
    structured AST (`List<Foo>` → `{kind: 'list', inner: 'Foo'}`). Enables
    cross-ref checking and better drift reports.
14. **Multi-space relationships** — one space referencing another (service
    mesh map).
15. **Test-case generation** — use cases + validation + stateMachine →
    matrix of positive/negative tests auto-emitted in the target
    framework.

---

## Quick reference

```bash
# First-time setup:
cd pizza_doc && pnpm install && pnpm build && pnpm gen:schemas

# Design a new service:
# → agent: "давай спроектируем сервис X на TS/NestJS"
#   (pd-author skill kicks in)

# Reverse-engineer an existing repo:
# → agent: "оцифруй ~/myproject"
#   (pd-scanner → pd-extract-<lang> → pd import)

# Daily gates:
pnpm pd validate  spaces/<id>
pnpm pd coverage  spaces/<id>
pnpm pd orphans   spaces/<id>

# Code handoff to LLM:
pnpm pd export implementation-brief <ucid> --out brief.md
# → paste brief.md into the implementer agent

# API generation:
pnpm pd export openapi spaces/<id> --out openapi.json
# → openapi-generator-cli / swagger-codegen does the rest

# Drift check (quarterly):
# → agent runs extractor skill, writes /tmp/code.jsonl
pnpm pd drift --from-jsonl /tmp/code.jsonl spaces/<id>

# Project snapshot for a stand-up:
pnpm pd stats spaces/<id>
```

---

## How to not break things

The repo's philosophy, in order of strictness:

1. **Schema changes need migration** — if you add/rename a Zod field in
   `packages/core/src/schema.ts`, update existing spaces in the same PR.
2. **Validator changes need fixtures** — every semantic rule has a
   `__fixtures__/invalid/<RULE_CODE>/` + `<RULE_CODE>__fixed/` pair. Add
   yours before enabling the rule.
3. **CLI commands need tests** — `__tests__/*.test.ts` per command. Snap
   against a scratch temp dir.
4. **Skills are markdown** — terse, procedural, with explicit hard rules
   and failure modes. Avoid philosophy.
5. **Never break an existing space** — run `pnpm pd validate` on
   `spaces/pizza-shop-demo` and `spaces/restik` before merging any change
   to `@pizza-doc/core`.
6. **CI is the gate** — the `spaces` job in `.github/workflows/ci.yml`
   runs `validate --strict-warnings` + `coverage` + `endpoints --orphans`
   on every space in the repo.

---

_Generated state of the project as of Phase 4.2. If a command, rule, or
skill isn't listed here, it doesn't exist yet — file an issue or open
a PR. Source of truth for the current schema is always
[`packages/core/src/schema.ts`](./packages/core/src/schema.ts)._
