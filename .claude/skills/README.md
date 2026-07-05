# Pizza Doc agent skills

Playbooks for agents working with Pizza Doc spaces. Each is a
deterministic procedure: when to trigger, what to do, what to stop on.

Two tiers:

## Orchestrators (language-agnostic)

| Skill | Direction | Use when |
|---|---|---|
| **[pd-scanner](./pd-scanner/SKILL.md)** | code → space | "document this codebase", "оцифруй X" |
| **[pd-author](./pd-author/SKILL.md)** | nothing → space | "давай спроектируем", "spec-first" |
| **[pd-drift-auditor](./pd-drift-auditor/SKILL.md)** | compare space ↔ code | "проверь синхронность" |
| **[pd-implementer](./pd-implementer/SKILL.md)** | space → code | "сгенерируй код по use case X" |
| **[pd-pr-reviewer](./pd-pr-reviewer/SKILL.md)** | diff review | "review this PR to the space" |

Orchestrators don't read application code directly. They delegate to
the matching extractor for the target language.

## Extractors (language-specific)

| Language / framework | Skill |
|---|---|
| Java / Kotlin (Spring, Quarkus, Micronaut) | [pd-extract-java](./pd-extract-java/SKILL.md) |
| TypeScript / JavaScript (NestJS, Express, Fastify, Prisma, zod, TypeORM, React/Next) | [pd-extract-typescript](./pd-extract-typescript/SKILL.md) |
| Python (FastAPI, Django, Flask, Pydantic, SQLAlchemy) | [pd-extract-python](./pd-extract-python/SKILL.md) |
| Go (chi, echo, gin, fiber, gorm, sqlc) | [pd-extract-go](./pd-extract-go/SKILL.md) |

Extractors read source code of one language and emit **JSONL** entity
declarations conforming to the `@pizza-doc/core` Zod schemas plus a
`_placement` envelope. Output feeds `pnpm pd import --from-jsonl`.

Adding a new language = writing one more SKILL.md. The CLI core stays
language-agnostic.

## How they compose

```
(new idea)                                 (existing repo, no spec)
    │                                          │
    ▼                                          ▼
 pd-author ─────── space ──────►          pd-scanner
                      │                      │
                      │                      ▼
                      │              (detect language)
                      │                      │
                      │                      ▼
                      │              pd-extract-<lang>
                      │                      │
                      │                      ▼ JSONL
                      │                pnpm pd import
                      │                      │
                      │                      ▼
                      └──────► space ◄───────┘
                                 │
                                 ▼
                         pd-implementer ──► code
                                 │
                                 ▼
                       pd-drift-auditor
                       (calls pd-extract-<lang> again
                        to diff against current code)

(PR)──► pd-pr-reviewer (diff only, no writes)
```

## JSONL contract (extractor → CLI)

Every extractor emits lines like:

```jsonl
{"_placement":{"spaceId":"restik","module":"backend","domain":"identity"},"kind":"model","id":"User","name":"User","modelKind":"entity","persistedAs":"<FK-TABLE-REF:id_users>","fields":[{"name":"id","type":"uuid"},{"name":"email","type":"string"}]}
```

- `_placement` is the only transport-only field; stripped by `pd import`.
- Everything else mirrors the Zod schemas in
  [`packages/core/src/schema.ts`](../../packages/core/src/schema.ts).
- `sourceRef` is **required** on every component / model / table line
  (`path/to/decl.ts:12`, relative to the codebase root). It is the key
  `pd drift` / `pd import` use to pair a renamed symbol with its stale
  spec entity instead of forking it into add+delete — the line suffix
  may drift, the file path must be right. An entity without `sourceRef`
  silently opts out of rename detection and `pd anchors`.
- Table columns carry **tri-state attrs** for `default` and `nullable`:
  a string/boolean = the known value, `"default": null` = the DDL is
  known to have NO default, key omitted = unknown. Emit the known form
  whenever you read real DDL (migrations, `CREATE TABLE`); omit only
  when the table is inferred from ORM entities. `pd drift` compares
  attrs only when the code side knows them — this is what catches the
  "spec says `DEFAULT now()`, DDL has none, first INSERT dies" class.
- Placeholder refs like `<FK-TABLE-REF:foo>` are tolerated; the user
  resolves them post-import using `pd validate`'s errors.

## Boundaries (what each skill **won't** do)

- **pd-scanner** never parses code itself — dispatches.
- **pd-author** never touches source code.
- **pd-drift-auditor** never modifies either side — reports only.
- **pd-implementer** never modifies the spec; if spec is incomplete, it
  asks the user to run `pd-author` first.
- **pd-pr-reviewer** never approves or merges — reports only.
- **pd-extract-\*** never writes YAML directly; emits JSONL and hands
  off. Never modifies the source tree.

These non-overlaps are deliberate. Each agent has one job.

## Related CLI commands

```bash
pd init <id>                            # default: .pizza-doc/ in cwd (single-space)
pd init <id> --multi                    # legacy: spaces/<id>/ (multi-space)
pd add <kind> <id> [--from-sql]         # manual scaffolding, SQL import
pd import --from-jsonl <file>           # bulk import from any extractor
pd validate                             # auto-detects .pizza-doc or spaces/<id>
pd coverage                             # ditto
pd orphans   [--kind ...]
pd endpoints [--orphans]
pd dataflow  <Model.field>
pd diff      <git-ref>
```

When no path is given, the CLI walks up from cwd looking for
`.pizza-doc/space.yaml` (single-space, the new default), then
`spaces/<id>/space.yaml` (multi-space, used by this dev repo and by
projects that want several specs side by side).

`pd --help` prints the full list.
