# Pizza Doc

**File-based architecture-as-code for systems that are too big to hold in your
head but too small to deserve a wiki.**

Describe your system as YAML — actors, modules, components, models, tables,
use cases — and Pizza Doc validates the graph, renders it as a live diagram,
and exports it in a format AI agents can actually reason about.

## Why

Architecture docs rot. Diagrams drift from code. AI agents dropped into a
codebase waste half their context budget rediscovering the module boundaries
you already decided on last quarter.

Pizza Doc is a small bet that if the source of truth for your system's shape
lives in the repo as plain YAML — version-controlled, diffable, validatable —
then the UI, the AI export, and every downstream tool can rebuild from it on
demand. No database, no SaaS, no lock-in. Pick a directory, get a diagram.

- **Local-first.** Everything runs in your browser against your filesystem
  via the File System Access API. No upload, no account.
- **Strict validator.** Broken refs, type-incompatible dataFlow, unused DTOs
  — you find out before you commit.
- **AI-friendly export.** One Markdown file per space, flat and redundant,
  formatted for agents that need to reason about the whole system at once.
- **Keyboard-first.** ⌘K palette, `?` cheat sheet, ⌘E edit, ⌘/ YAML.

## Quickstart

You need Node 20+ and pnpm 10+. Three commands get you from clone to running
UI with the demo space loaded:

```bash
pnpm install
pnpm build
pnpm --filter @pizza-doc/web dev
```

Open the URL Vite prints, click **Pick a folder**, choose `spaces/`, then
select `pizza-shop-demo`. You should see the sidebar populated with actors,
modules, and seven use cases, plus a green "All clear" validation badge.

## Documentation

- **Getting started, concepts, reference** — [`docs/site/`](./docs/site/)
  (Astro Starlight). Run `pnpm --filter pizza-doc-site dev` for the live
  site, or browse the markdown in-repo.
- **Package READMEs** — [`packages/core`](./packages/core/README.md),
  [`packages/web`](./packages/web/README.md)
- **Release notes** — [`CHANGELOG.md`](./CHANGELOG.md) (latest at the top).
  Historical notes for the first public release live at
  [`docs/release-notes/v0.1.0.md`](./docs/release-notes/v0.1.0.md).
- **Contributing** — [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Workspace layout

```
pizza-doc/
├── packages/
│   ├── core/        # schemas, loader, validator, serializer, AI exporter
│   ├── web/         # Vite + React UI (File System Access API)
│   └── cli/         # Node CLI for scaffolding, validation, reporting, export
├── spaces/
│   └── pizza-shop-demo/  # seven-use-case example space
├── docs/
│   ├── site/        # Astro Starlight docs site
│   ├── release-notes/
│   └── backlog.md
└── .github/workflows/
```

## Status

**v0.5.1** <!-- pd:version --> — five minor releases past the initial public
drop. The CLI now covers scaffolding, validation, change-sets, drift, export
(OpenAPI / TS / Go / implementation-brief / operations), a doctor checklist,
a production-readiness gate, and an MCP server (`pd-mcp`) for AI agents. The
web UI ships viewer + scalar editing against the same files. Full per-release
history lives in [`CHANGELOG.md`](./CHANGELOG.md); ongoing work in
[`docs/backlog.md`](./docs/backlog.md).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm install` | Install everything |
| `pnpm build` | Build core, cli, web |
| `pnpm typecheck` | `tsc --noEmit` across all packages |
| `pnpm test` | Run vitest across all packages |
| `pnpm check` | Biome lint + format check |
| `pnpm check:fix` | Biome auto-fix |
| `pnpm detect-slop` | Run Impeccable over web sources |
| `pnpm --filter @pizza-doc/web dev` | Start the UI dev server |
| `pnpm --filter pizza-doc-site dev` | Start the docs site |

## License

MIT. See [`LICENSE`](./LICENSE).
