# CLAUDE.md

Instructions for Claude / AI agents working in this repo.

## Persistent project memory

When the user says "Pizza Doc" in an ordinary chat, assume they mean this
product and this strategy:

- Pizza Doc has two core jobs:
  1. **Design-first / doc-driven development.** Agents and the user describe a
     product as structured docs first: use cases, interfaces, modules,
     components, DTOs/models, tables, data flow, and contracts. The goal is to
     catch missing fields, unused entities, broken refs, and architecture drift
     while refactoring the documentation, before writing the implementation.
  2. **Document an existing codebase.** Agents scan real services and generate
     a Pizza Doc space so teams can see module boundaries, use cases,
     inconsistencies, unused surfaces, and drift. The user may use this to pitch
     Pizza Doc at a previous workplace with many services.
- The UI is primarily for human review and analysis. Agents/CLI/YAML workflows
  are allowed to do the heavy authoring. The first public product scope is
  "viewer + scalar editor", not a full no-code authoring UI.
- `spaces/pizza-shop-demo` is the canonical demo and release gate.
- `spaces/restik` is only a sample imported project for regeneration tests. Do
  not spend time hand-fixing Restik data unless the user explicitly asks; improve
  the app/generator so Restik can be regenerated cleanly later.
- Before GitHub polish/release, prefer product readiness work over git hygiene:
  validation, no-loss saves, honest UI affordances, demo quality, CLI contract,
  docs consistency, and clear QA notes.
- Avoid adding heavy test-only browser stacks unless they materially improve the
  product or CI signal. Manual browser smoke is acceptable for now; add
  Playwright or similar only after an explicit product/CI decision.

## What this repo is

Pizza Doc is a **file-based architecture-as-code** tool. A user describes their
system as YAML (actors, modules, domains, components, models, tables, use
cases), the web UI renders it as diagrams, and `exportSpaceForAi()` emits a
flat Markdown file for LLMs.

- `packages/core/` — schemas, loader, 3-pass validator, serializer, AI exporter. **Source of truth: `packages/core/src/schema.ts`** (Zod).
- `packages/web/` — Vite + React UI, reads the filesystem via File System Access API.
- `packages/cli/` — `pd` / `pizza-doc` CLI. Commands: validate, coverage, orphans, dataflow, endpoints, diff, init, add.
- `spaces/` — each subdirectory with a `space.yaml` is a Pizza Doc space. `pizza-shop-demo/` is the reference.
- `scripts/validate-space.mjs` — legacy validator (kept for back-compat); prefer `pnpm pd validate` in new workflows.
- `docs/site/src/content/docs/` — Starlight docs. `yaml-format.md` is the field reference.
- `spaces/AUTHORING.md` — guide for **authoring a space from an existing codebase** (the most common agent task).
- `.claude/skills/` — role-specific playbooks for different agent tasks (see below).

## Agent skills (`.claude/skills/`)

Split into orchestrators (language-agnostic) and extractors (one per
language). Invoke the matching skill before touching spaces.

**Orchestrators:**

| Skill | Use when |
|---|---|
| `pd-scanner` | "document this codebase", "оцифруй X" — existing code → space. Detects language + dispatches to extractor. |
| `pd-author` | "let's design a new service", spec-first — nothing → space. |
| `pd-drift-auditor` | "check the doc is still accurate" — space ↔ code compare. |
| `pd-implementer` | "implement usecase X from the spec" — space → code. Uses `meta.implementationLanguage`. |
| `pd-pr-reviewer` | "review this PR to the space" — diff review, no writes. |

**Extractors** (emit JSONL consumed by `pnpm pd import --from-jsonl`):

| Language / framework | Skill |
|---|---|
| Java / Kotlin (Spring, Quarkus, Micronaut) | `pd-extract-java` |
| TypeScript / JavaScript (NestJS, Express, Prisma, zod, TypeORM, React) | `pd-extract-typescript` |
| Python (FastAPI, Django, Flask, Pydantic, SQLAlchemy) | `pd-extract-python` |
| Go (chi, echo, gin, gorm, sqlc) | `pd-extract-go` |

Adding a new language = one more SKILL.md. The CLI core stays
language-agnostic — the only code-introspection built in is SQL DDL
(universal) and JSONL import.

See [`.claude/skills/README.md`](.claude/skills/README.md) for the full
composition diagram + JSONL contract.

## Layouts: `.pizza-doc/` vs `spaces/<id>/`

The CLI supports two layouts:

- **Single-space (default)** — `pd init <id>` creates `.pizza-doc/` in cwd.
  This is the user-facing default: one repo = one spec, `meta.id` lives in
  `space.yaml`, the folder name is the magic marker `.pizza-doc`.
- **Multi-space** — `pd init <id> --multi` creates `spaces/<id>/`. **This
  dev repo uses multi-space** because it hosts `pizza-shop-demo`, `restik`,
  etc. side by side. When you (the agent) work *in this repo* on the demo
  spaces, examples below use `spaces/<id>` paths. When you work on a
  user's project, expect `.pizza-doc/` and pass it explicitly or rely on
  cwd auto-detection.

`findSpaceRoot` walks up from cwd looking for `space.yaml`, then
`.pizza-doc/space.yaml`, then `spaces/`. So most commands need no path
argument when run from anywhere inside the project.

## How to validate (do this constantly)

```bash
# One-time / after pulling changes to the core package:
pnpm --filter @pizza-doc/core build
pnpm --filter @pizza-doc/cli build

# After any YAML edit (in this multi-space repo, name the space):
pnpm pd validate spaces/<space-id>
# …or bare `pd validate` from inside a space dir — cwd auto-detects.
# In a single-space user project, `pd validate` from anywhere is enough.

# Completeness reports — run these before shipping a spec:
pnpm pd coverage spaces/<space-id>
pnpm pd orphans spaces/<space-id>
pnpm pd endpoints spaces/<space-id> --orphans
pnpm pd dataflow <Model.field> spaces/<space-id>
```

Output groups errors / warnings / infos with file paths. **Fix errors before
moving on.** Warnings (especially `COMPONENT_UNUSED`, `DTO_UNUSED_FIELD`) are
usually real and worth addressing, but not blocking.

The UI also ships a live validator (⌘K → "reload" or just save a file — the
file watcher picks it up within 2s). If the user has the dev server running,
just ask them to read the badge.

## Scripts

```bash
pnpm install                            # everything
pnpm build                              # core + cli + web
pnpm typecheck                          # tsc --noEmit across packages
pnpm test                               # vitest across packages
pnpm check                              # biome lint + format check
pnpm check:fix                          # biome auto-fix
pnpm --filter @pizza-doc/web dev        # UI dev server
pnpm --filter pizza-doc-site dev        # docs site
```

Never run `pnpm --filter @pizza-doc/web dev` yourself — it's long-running. Ask
the user to start it, or verify changes via the CLI validator.

## Hard rules — things that will bite you

These are the top-5 ways strict Zod validation bites agents. Read them before
touching YAML.

### 1. Filename must equal `id`

`OrderController.yaml` → `id: OrderController`. Mismatch = `SCHEMA_FILENAME_ID_MISMATCH`.

Container files (`space.yaml`, `module.yaml`, `domain.yaml`) inherit `id` from
the **parent folder name**:

```
modules/api-server/module.yaml       → id: api-server
modules/api-server/domains/orders/domain.yaml  → id: orders
```

### 2. Schemas are `.strict()` — no extra fields

Adding `owner`, `tags`, `version`, `author`, `notes` to an entity = Pass 1
fail. **If a field isn't in `packages/core/src/schema.ts`, it doesn't exist.**

Common fields agents invent that don't exist:
- `owner`, `team`, `tags`, `status`, `version` on any entity
- `schema:` in ref URIs (it's always `domain:`)
- `returnType` on methods (it's `returns`)
- `fields` on components (fields live on models)

### 3. Ref URI grammar

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

Top-level kinds: **`actor`, `module`, `usecase`** — nothing else. Everything
else reaches through a module (and optionally through a domain). The regex
is `RefSchema` in `schema.ts`.

Invalid: `component:Foo` (no module), `domain:orders/component:Bar` (no
module), `schema:public/table:users` (no `schema:`).

### 4. Tables are **only** in `database` / `queue` modules

Tables don't live next to services. They live in the module that owns the
storage. `persistedAs` on an entity model points **across** modules at the
table:

```yaml
# modules/api-server/domains/orders/models/Order.yaml
kind: model
id: Order
modelKind: entity
persistedAs: module:postgres-db/domain:orders/table:orders
fields: [...]
```

### 5. Build order matters — resolve dependencies bottom-up

Refs must resolve. Build in this order:

1. `space.yaml`
2. Actors
3. Modules (+ domains) — just the container `module.yaml` / `domain.yaml` first
4. **Tables** (in database modules) — nothing refers up at them yet, so they're safe
5. **Models** — can now set `persistedAs` to real tables
6. **Components + methods** — can now reference models in params/returns and other components/methods in `calls`
7. **Use cases** — can now reference everything

Building top-down (use cases first) means every `validate` run is a flood of
`REF_BROKEN`. Don't.

## The entity kinds — at a glance

| Kind | File path | Top-level key for its own file | Purpose |
| --- | --- | --- | --- |
| `actor` | `actors/<id>.yaml` | `kind: actor` | Person or external system that initiates use cases |
| `module` | `modules/<id>/module.yaml` | `kind: module` | Deployable unit: frontend / service / database / queue / external |
| `domain` | `modules/<m>/domains/<id>/domain.yaml` | *no `kind:` — recognised by path* | Optional DDD-style grouping inside a module |
| `component` | `modules/<m>/[domains/<d>/]components/<id>.yaml` | `kind: component` | Controller, service, repository, page, widget, client, job, infrastructure |
| `model` | `modules/<m>/[domains/<d>/]models/<id>.yaml` | `kind: model` | DTO, entity, value-object, or event |
| `table` | `modules/<m>/[domains/<d>/]tables/<id>.yaml` | `kind: table` | DB table — columns with SQL types |
| `usecase` | `use-cases/<id>.yaml` | `kind: usecase` | Business flow: actor → steps → terminal |

Methods aren't a standalone kind — they're a list on a component.

## Enums — memorise these

- `module.type`: `frontend` · `service` · `database` · `queue` · `external`
- `component.type`: `controller` · `service` · `repository` · `infrastructure` · `page` · `widget` · `client` · `job`
- `model.modelKind`: `dto` · `entity` · `value-object` · `event`
- `actor.type`: `user` · `system` · `scheduler`
- `step.protocol`: `http` · `internal-call` · `sql` · `event` · `external-api`
- `method.httpMethod`: `GET` · `POST` · `PUT` · `PATCH` · `DELETE`

## When building a space from a codebase

Read **`spaces/AUTHORING.md`** first. It covers the code → YAML mapping, the
right order to emit files, and how to iterate on validator output.

## When editing this codebase (not a space)

- Commit hooks run biome — match the existing style (2-space indent, single
  quotes, no semicolons at line-end except disambiguation).
- Tests live next to sources under `__tests__/` with fixtures in `__fixtures__/`.
- The UI package has a design system in `packages/web/src/components/ui/` — reuse
  those before adding new primitives.
- Never invent new entity kinds / schema fields without a migration plan in
  `docs/backlog.md` — the schema is a public contract via AI export.

## Communication style with the user

- This is a solo-developer repo — terse is fine, no over-apologising.
- The user speaks Russian in most threads; match unless they switch.
- When validator output is long, summarise ("3 errors, all `REF_BROKEN`,
  pointing at the renamed OrderService") rather than dumping raw JSON.
- If a schema / validator question seems ambiguous, check
  `packages/core/src/schema.ts` or the relevant `__tests__/` fixture. The
  tests are executable spec.
