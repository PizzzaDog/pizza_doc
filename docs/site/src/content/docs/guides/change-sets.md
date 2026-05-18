---
title: Spec change-sets
description: Design and review future Pizza Doc changes before adopting them into the canonical space.
---

Pizza Doc treats the root `.pizza-doc/` (or `spaces/<id>/` in multi-space repos)
as the accepted baseline. Future design work lives inside that same space under
`changes/<change-id>/` as an overlay.

```txt
.pizza-doc/
  space.yaml
  modules/
  use-cases/
  changes/
    runtime-streaming-v1/
      change.yaml
      overlay/
        modules/
          vm-agent/
            components/RuntimeStreamer.yaml
      rationale.md
      review.md
```

The canonical `modules/`, `actors/`, `use-cases/`, and operation files are not
modified until the change is adopted.

## `change.yaml`

```yaml
id: runtime-streaming-v1
title: Runtime streaming contract v1
status: draft
createdAt: 2026-05-12T00:00:00Z
owner: nikolai
scope:
  modules: [vm-agent]
  services:
    - acme-infra/vm-agent
implementation:
  requiredChecks:
    - pd validate --change runtime-streaming-v1
    - go test ./...
  requiredCodeOwners:
    - acme-infra
deletes:
  - modules/vm-agent/components/OldRuntimeStream.yaml
```

Statuses are:

`draft`, `design-review`, `design-approved`, `implementing`, `verified`,
`adopted`, `rejected`.

Use `design-approved` for a reviewed spec that is ready to implement. Use
`verified` only after implementation checks or drift checks prove the code
matches the change. This keeps design approval separate from code verification.

## Overlay Rules

Files under `overlay/` mirror normal Pizza Doc paths. A file at:

```txt
changes/runtime-streaming-v1/overlay/modules/vm-agent/components/RuntimeStreamer.yaml
```

is loaded as if it were:

```txt
modules/vm-agent/components/RuntimeStreamer.yaml
```

If that canonical file already exists, the overlay version replaces it in the
temporary merged view. If it does not exist, the overlay adds it. Files listed in
`deletes` are removed from the temporary merged view and are deleted from the
baseline only during adoption.

## CLI Workflow

```bash
pd change init runtime-streaming-v1 --title "Runtime streaming contract v1"
pd validate --change runtime-streaming-v1
pd diff --change runtime-streaming-v1

pd change status runtime-streaming-v1 design-review
pd change status runtime-streaming-v1 design-approved
pd change status runtime-streaming-v1 implementing
pd change status runtime-streaming-v1 verified

pd change adopt runtime-streaming-v1
```

`pd validate` without `--change` always checks only the canonical baseline.
`pd change adopt <id>` first validates the merged baseline plus overlay. If there
are validation errors, adoption stops. If validation is clean, overlay files are
copied into the canonical space, `deletes` are applied, and the change is marked
`adopted`.

## UI Autodetect

Run `pd ui` from a project that contains `.pizza-doc/` and the UI opens that
space directly. The CLI serves a local filesystem API to the browser, so no
manual folder picker is needed for the same project directory.

Run `pd ui --change runtime-streaming-v1` to open the UI on the merged change
view. The top bar can switch between `baseline` and any `changes/*` entry.
Edits made while a change is selected are written to that change's `overlay/`.

Run `pd ui --global` for the old dashboard/picker behavior.

## Version Source

The release version source of truth is `packages/cli/package.json`. The CLI reads
that manifest at runtime for `pd --version`; the UI bundle receives the same
value at build time and `pd ui` also exposes it through `/api/session`.

`pnpm check:versions` fails if root, CLI, core, MCP, web, or docs package
versions diverge.
