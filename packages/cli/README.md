# @pizza-doc/cli

Node CLI for working with Pizza Doc spaces from a terminal or CI.

In this repo, run it through the root `pd` script after building:

```bash
pnpm build
pnpm pd --help
pnpm pd validate spaces/pizza-shop-demo --strict-warnings
pnpm pd readiness spaces/pizza-shop-demo --profile production
```

When iterating on the CLI package itself:

```bash
pnpm --filter @pizza-doc/cli build
pnpm --filter @pizza-doc/cli typecheck
pnpm --filter @pizza-doc/cli exec vitest run
```

## Layouts

Two layouts are supported:

- **Single-space (default)** — `pd init <id>` creates `.pizza-doc/` in cwd
  with `space.yaml`, `actors/`, `modules/`, `use-cases/` directly under it.
  This is what 99% of projects want: one repo = one spec. The `id` lives in
  `space.yaml.meta.id`, not in the folder name.
- **Multi-space (`--multi`)** — `pd init <id> --multi` creates
  `spaces/<id>/...`. Use this when one repo hosts several specs side by side
  (e.g. Pizza Doc's own dev repo with `pizza-shop-demo` and `restik`). Auto-
  detected if a `spaces/` directory already exists in cwd.

When omitting `<dir>` from any command below, the CLI walks up from cwd
looking for a `space.yaml`, then a `.pizza-doc/space.yaml`, then a `spaces/`
directory.

## Commands

Scaffolding:

```bash
pnpm pd init <space-id> [--multi]
pnpm pd add actor <id> [--type user|system|scheduler]
pnpm pd add module <id> [--type service|frontend|database|queue|external]
pnpm pd add domain <id> --module <id>
pnpm pd add component <id> --module <id> [--domain <id>] [--type ...]
pnpm pd add model <id> --module <id> [--domain <id>] [--kind dto|entity|...]
pnpm pd add table <id> --module <id> [--domain <id>] [--from-sql <file>]
pnpm pd import --from-jsonl <file> [--dry-run] [--force|--merge] [--space-dir <dir>]
```

Quality and exploration (`<dir>` = `.pizza-doc` or `spaces/<id>`,
auto-detected from cwd if omitted):

```bash
pnpm pd validate [<dir>] [--strict-warnings] [--verbose]
pnpm pd readiness [<dir>] [--profile production] [--min-endpoints 100] [--min-models 100]
pnpm pd readiness [<dir>] [--profile production] [--drift-from-jsonl <code-extract.jsonl>]
pnpm pd coverage [<dir>] [--min-components 80]
pnpm pd orphans [<dir>] [--kind components|models|tables|endpoints]
pnpm pd endpoints [<dir>] [--orphans]
pnpm pd dataflow <Model.field> [<dir>]
pnpm pd diff <git-ref> [<dir>]
pnpm pd drift --from-jsonl <code-extract.jsonl> [<dir>]
pnpm pd explain <ref> [<dir>]
pnpm pd stats [<dir>]
pnpm pd watch [<dir>]
```

Use `validate` for internal coherence: schema, refs, and semantic rules.
Use `readiness --profile production` as the releasable-spec gate in CI. It
fails on uncovered or orphaned surfaces, missing deploy-time proof for
`file`/`device`/`exec` dependencies, unproven error mappings, and optional
code/spec drift when `--drift-from-jsonl` is provided.

Export:

```bash
pnpm pd export openapi [spaces/<id>] [--out <file>]
pnpm pd export implementation-brief <usecase-id> [spaces/<id>] [--out <file>]
```

Use `pnpm pd --help` as the source of truth for the current command surface.
