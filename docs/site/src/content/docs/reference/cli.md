---
title: CLI commands
description: Every pd command — generated from the CLI's own --help output.
---

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Source: pd --help via scripts/gen-cli-doc.mjs. Regenerate: pnpm gen:cli-doc -->

`pd` (alias `pizza-doc`) is the command-line interface. Run any command
with no arguments from inside a space — `findSpaceRoot` walks up from the
current directory looking for `space.yaml`, then `.pizza-doc/space.yaml`,
then `spaces/`.

## The doc-first loop

Design-first work runs through four commands:

1. **`pd validate`** — the structural gate. 0 errors means every ref
   resolves, every type closes, wiring and steps agree. The footer reminds
   you this is *internal* consistency only.
2. **`pd handoff <usecase>`** — the per-use-case implementer gate: space
   errors, brief type closure, step↔call parity, payload models, error
   mapping, and event idempotency — scoped so a neighbour mid-design
   doesn't block. Exit 0 ⇒ safe to hand off.
3. **`pd export implementation-brief <usecase>`** — the self-contained
   artefact for the implementing agent: contracts, models, tables, config,
   wire captures, ADR bodies.
4. **`pd export ai`** — the whole space, full fidelity, for
   reason-about-everything sessions.

## The code-sync loop

Documenting or auditing an existing codebase:

1. A `pd-extract-<lang>` skill emits JSONL (components/models/tables with
   required `sourceRef`).
2. **`pd import --from-jsonl`** writes the YAML (it refuses to fork a
   renamed symbol into a duplicate entity).
3. **`pd drift --from-jsonl [--json]`** diffs code against spec — renames
   pair by sourceRef file instead of reporting add+delete.
4. **`pd anchors`** — deterministic sourceRef→file resolution, no LLM;
   belongs in default CI (`pd doctor --fix-ci` scaffolds it).

## Command reference

```
pizza-doc — file-based architecture-as-code CLI

usage:
  pd <command> [args] [flags]

scaffolding:
  init          <space-id> [--multi]        create a new space
                                default: .pizza-doc/ in cwd
                                --multi: spaces/<id>/ (multi-space monorepo)
  add actor     <id> [--type user|system|scheduler]
  add module    <id> [--type service|frontend|database|queue|external]
  add domain    <id> --module <id>
  add component <id> --module <id> [--domain <id>] [--type ...]
  add model     <id> --module <id> [--domain <id>] [--kind dto|entity|...]
  add table     <id> --module <id> [--domain <id>]
                                [--from-sql <file>]

bulk import:
  import        --from-jsonl <file> [--dry-run] [--force|--merge]
                                [--space-dir <dir>]
                                language-agnostic stream of entity
                                declarations; see pd-extract-<lang> skills

quality gates:
  validate      [<dir>] [--change <id>] [--strict-warnings] [--verbose]
                                opt-in contract flags:
                                  --strict-contracts        caller/callee credential parity → error
                                  --check-orphan-paths      caller path ↔ callee route → error
                                  --check-state-coverage    state machine scenarios → error
                                  --check-runbook-coverage  errorFlow → runbook (severity-aware)
                                  --strict-wiring           step↔calls parity + step payload (via) → error
  handoff       <usecase-id> [<dir>] [--json]
                                implementer gate for ONE use case: 0 errors
                                + type closure + step↔call parity + via
                                + throws mapped + event idempotency ⇒ exit 0
                                (then export the implementation-brief)
  readiness     [<dir>] [--profile production] [--min-endpoints 100] ...
                                [--drift-from-jsonl <file>]
                                [--check-anchors] [--require-anchors] [--code-root <dir>]
                                [--module-root <id>=<dir>]...
                                  opt-in anchor gate: every sourceRef resolves to a real file
  coverage      [<dir>] [--min-components 80] ...
  orphans       [<dir>] [--kind components|models|tables|endpoints]
  endpoints     [<dir>] [--orphans]
  dataflow      <Model.field> [<dir>]
  diff          <git-ref> [<dir>]
  diff          --change <id> [<dir>]
  drift         --from-jsonl <code-extract.jsonl> [<dir>] [--json]
                                diffs a code extract against the space; renamed
                                symbols are paired by sourceRef file (RENAME),
                                not reported as add+delete
  anchors       [<dir>] [--code-root <dir>] [--module-root <id>=<dir>]...
                                [--require-all] [--json]
                                deterministic spec↔code check: every sourceRef
                                resolves to a real file (no LLM, CI-friendly).
                                --module-root maps a module to its own repo
                                (tried first, falls back to --code-root)
  doctor        [<dir>] [--fix-ci]
                                advisory checklist: git presence, language hint,
                                flag suggestions, CI workflow scaffold

spec changes:
  change init   <id> --title "..."             create .pizza-doc/changes/<id>/
  change list   [<dir>]                        list overlay change-sets
  change show   <id> [<dir>]                   show metadata + overlay files
  change diff   <id> [<dir>]                   baseline vs merged overlay
  change status <id> <status> [<dir>]          update workflow status
  change adopt  <id> [<dir>]                   validate and apply overlay to baseline
  change reject <id> [<dir>]                   mark rejected

exploration / export:
  explain       <ref> [<dir>]                   one-shot entity walk
  lint          [--explain <CODE>]              list / explain validation codes
  stats         [<dir>]                         project-wide snapshot
  ui            [--port <n>] [--change <id>] [--global] [--no-open]
                                serve the web app; cwd .pizza-doc opens automatically
  watch         [<dir>]                         live revalidate
  export        ai [--out <file>]               full-space markdown for LLMs
                                (full fidelity: validation, SMs, events, config, ADRs)
  export        openapi [--out <file>]          OpenAPI 3.1 JSON
  export        implementation-brief <ucid> [--out <file>]
                                self-contained markdown for LLM implementer
                                (exit 1 when the type self-check fails)
  export        typescript-types [--out <file>] DTOs/enums as TS interfaces + unions
  export        go-types [--package <name>] [--out <file>]
                                DTOs/enums as Go structs + typed string consts
  export        go-interfaces [--package <name>] [--out <file>]
                                components-with-methods as Go interfaces
  export        operations [--module <id>] [--include-decisions] [--out <file>]
                                config-map + external-deps + ADR index per module (markdown)

migration:
  migrate       v0.2-to-v0.3 [<dir>]            backup + regen schemas + audit ADRs + stamp version
  schemas regen [<dir>]                         refresh .pizza-doc/schemas/*.json from current Zod
                                run after upgrading the pd binary
  port-from-legacy <archive-path> [--output <file>]
                                scaffold a port-audit.md classification table
                                for a legacy-archive/ directory (KEEP/ADAPT/REPLACE/DROP)

  <dir> is the space directory: .pizza-doc (single-space) or
  spaces/<id> (multi-space). Auto-detected from cwd when omitted.

global flags:
  --space <id>     target space in multi-space monorepos (auto-detected from cwd)
  --multi          (init only) use legacy spaces/<id>/ layout
  --force          overwrite existing files
  --help           print this help

docs: https://github.com/PizzzaDog/pizza_doc
```

This block is regenerated from `pd --help` (`pnpm gen:cli-doc`), so the
terminal is always the live source.
