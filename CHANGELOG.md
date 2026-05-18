# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.1] — 2026-05-18

### Fixed — version source-of-truth + INSTALL TODO

External review of the freshly-shipped v0.5.0 bundle surfaced three
real findings: the human-facing docs still claimed v0.1.x / v0.2.0,
the MCP server announced itself as `0.2.0` regardless of package
version, and `INSTALL.md` carried an unimplemented
`pd init --regenerate-schemas` command marked `TODO: не реализована`.
All three patched in one go.

- **Docs versioned and machine-checked.** `README.md`, `OVERVIEW.md`,
  and `INSTALL.md` now declare `v0.5.1` on a line tagged with the
  `<!-- pd:version -->` marker. The version source-of-truth vitest
  scans those markers and asserts the embedded semver matches the
  CLI manifest — future drift breaks `pnpm test` instead of slipping
  to an external reviewer.
- **MCP `SERVER_VERSION` follows `package.json`.** Mirrors the
  pattern already used by `CLI_VERSION`: a tiny `packages/mcp/src/version.ts`
  loads the manifest via `createRequire`, the constant re-exports
  from there. No more hardcoded literal, no more drift on bump.
- **`pd schemas regen [<dir>]`** — new CLI command that refreshes
  `<space>/schemas/*.json` from the current Zod source. Drop-in
  replacement for the old "delete schemas/ and re-init in a temp
  dir" workaround documented in `INSTALL.md`. Useful after upgrading
  the `pd` binary on an existing space.

### Notes

Plain `pd validate spaces/pizza-shop-demo` stays 0 errors / 0 warnings.
Tests: 355/355 plus three new version-source-of-truth assertions
(MCP parity + doc markers).

## [0.5.0] — 2026-05-16

### Added — lessons-driven hardening (B1–B5)

Distilled from a week of running v0.4 on a real production deployment.
v0.4 closed the contract layer; v0.5 closes the gaps the
contract layer didn't catch: ADRs that retired silently, event-driven
subscribers flagged as `COMPONENT_UNUSED`, external integrations
backed by synthesised fixtures, table snapshots that contradicted
their declared migration history, and CI that no one knew which
flags to enable. Plain `pd validate` on `spaces/pizza-shop-demo` stays
0 errors / 0 warnings — the v0.4 backward-compat invariant holds.

- **B1 — ADR back-references.** New `Component.decidedBy: [ADR-NNN]`.
  Two new validator rules:
  - `COMPONENT_DECIDED_BY_INVALID_ADR` (error) — id not present in
    `space.decisions[]`.
  - `COMPONENT_DECIDED_BY_SUPERSEDED_ADR` (warning) — linked ADR has
    `status: superseded` or `deprecated`; suggests pointing at the
    superseder.

- **B2 — pub/sub edges as first-class.** New `Component.emits` /
  `subscribes` lists with refs to `modelKind: event` payloads. The
  `ruleComponentUnused` graph traversal now treats subscribers of any
  emitted event as alive — the legitimate `COMPONENT_UNUSED`
  suppressions production needed for event-driven receivers go away. Four new
  rules: `EVENT_EMIT_TARGET_NOT_EVENT`,
  `EVENT_SUBSCRIBE_TARGET_NOT_EVENT` (both error),
  `EVENT_NO_SUBSCRIBER`, `EVENT_SUBSCRIBE_NO_PUBLISHER` (warn).
  REF_BROKEN now walks `emits[].event`, `emits[].to`,
  `subscribes[].event`, `subscribes[].via`.

- **B3 — wire capture for external integrations.** New
  `Component.wireCapture: { source, path, capturedAt, capturedAgainst,
  scenarios }`. Three codes:
  - `WIRE_CAPTURE_MISSING` (warn, error under `--strict-wire-capture`)
    — component is the `consumer:` of an `http-api` external-dep but
    declares no captured-traffic artefact.
  - `WIRE_CAPTURE_PATH_BROKEN` (error, CLI-side fs check) — file
    referenced but absent / empty.
  - `WIRE_CAPTURE_STALE` (info, CLI-side) — `capturedAt` older than 30
    days.

  Convention: captures live under `.pizza-doc/wire-captures/<integration>/`.
  This is the v0.5 answer to the synthesized-fixture lying-about-shape
  failure mode that cost a real deployment 5 hours of prod debugging.

- **B4 — table migration parity.** New
  `Table.migrations: [{ id, action: 'create' | 'add-column' |
  'drop-column' | 'alter-column', columns }]`. One rule:
  `MIGRATION_COLUMN_INCONSISTENT` (error) — a declared add/drop/alter
  doesn't match the current `columns: [...]` snapshot. Catches
  V0028-style cases where code dropped a column but the spec lagged.
  JSONL-based Java/Go entity drift deferred to v0.6 (needs extractor
  protocol changes).

- **B5 — `pd doctor`.** New CLI command. Advisory checklist:
  - `.pizza-doc/` / spaces dir is inside a git repo.
  - `meta.implementationLanguage` matches a known pd-extract-* skill.
  - Suggest validate flags based on space contents (`--strict-contracts`
    if http-api deps, `--strict-wire-capture` ditto,
    `--check-state-coverage` if state machines, `--check-runbook-coverage`
    if runbooks).
  - `.github/workflows/pd-validate.yml` scaffold via `--fix-ci`.

  Exit 1 when any check is `fail` (e.g. not in a git repo); info-level
  hints don't fail. Lessons-driven response to the "we didn't know
  about the flag" gap.

### Changed

- `ruleComponentUnused` graph traversal extended: pub/sub edges
  contribute to the alive-set (B2). Existing call-graph reachability
  unchanged.
- `pd validate` accepts a new flag `--strict-wire-capture` that
  escalates `WIRE_CAPTURE_MISSING` warnings to errors. Defaults
  unchanged.
- `validateRefsPass` walks `Component.emits` / `subscribes` for
  REF_BROKEN parity with `Method.calls`.

### Notes

- `pd validate` on `spaces/pizza-shop-demo`: 0 errors · 0 warnings ·
  8 infos (same baseline as v0.4).
- Test count: 274 in `@pizza-doc/core` + CLI = 355 total (was 290
  at v0.4 release; +65 new tests across B1–B5).

## [0.4.0] — 2026-05-11

### Added — contract layer (A1–A7)

A coordinated upgrade of the v0.3 operations layer into a full contract
layer between caller/callee, between code/spec, and between
spec/operations. See `pizza_doc_improvements_prompt.md` §A for the
motivating gaps. Backward compatible — legacy specs keep parsing with
the existing rule set (Codex C8).

- **A1 — calls / routes contract.** `Method.calls[]` now accepts either
  the legacy ref-string (auto-normalised to `{target}`) or a v0.3 object
  with `path`, `method`, `credential.{type, header, env}`, `optional`.
  New `Component.routes[]` declares callee-side inbound HTTP routes
  (path / method / auth) for routes not bound to a single method.
  `Method.routeAuth` adds the same auth declaration to method-bound
  routes. Four new validator rules under `--strict-contracts`
  (A5): `CONTRACT_CALL_CREDENTIAL_MISSING`,
  `CONTRACT_CALL_PATH_ORPHAN`, `CONTRACT_CALL_HEADER_MISMATCH`,
  `CONTRACT_CALL_ENV_MISMATCH`. All default `warning`.
- **A2 — first-class state machines.** New entity kind
  `state-machine.yaml` under `modules/<id>/state-machines/`
  (and optional `domains/<d>/state-machines/`). Schema adds
  `stateConfig` (per-state terminal flag + timeout policy),
  `transitions[].invariants.{pre,post}`, `transitions[].trigger` /
  `actor`, and `scenarios[]` (`{id, given, when, then[]}`). Same shape
  applies inline on `model.stateMachine`. New rule
  `STATE_MACHINE_SCENARIO_COVERAGE` (info; A5 escalates).
- **A3 — host external dependencies.** `ExternalDepEntrySchema` becomes
  a discriminated union on `kind`. Legacy entries without `kind` parse
  as `http-api`. New kinds: `host-binary`, `host-artifact`, `apt-package`
  with shared `install_path`, `install_owner`, `required_in_profiles[]`,
  `lifecycle` (`bootstrap`/`deploy`/`runtime`), `preflight {command,
  expected}`. Per-kind `source` discriminator: `github-release` /
  `url` / `build-on-host` / `apt`. Four new rules:
  `HOST_DEP_BINARY_SHA256_MISSING`, `HOST_DEP_ARTIFACT_RECIPE_MISSING`,
  `HOST_DEP_PREFLIGHT_MISSING`, `HOST_DEP_PROD_OWNER_MISSING`.
- **A4 — operations directory.** New top-level subtree
  `operations/{runbooks,state-machines,health-contracts}/`. Runbooks are
  markdown with YAML frontmatter (`id`, `severity`, `owner`, `trigger`,
  `covers[]`, `decisions[]`); same lazy-body strategy as ADRs. New
  rules: `RUNBOOK_COVERAGE` (info), `RUNBOOK_BROKEN_LINK` (error).
  Module gains optional `healthContract` (path / okStatus / fields[]
  with enum values).
- **A5 — `pd validate` opt-in flags.** Four flags layered on top of the
  base validator without changing baseline behaviour:
  `--strict-contracts`, `--check-orphan-paths`,
  `--check-state-coverage`, `--check-runbook-coverage`. Severity-aware
  runbook coverage (Codex C4): p0/p1 → error, p2 → warning,
  validation-error stays info. Plain `pd validate` on a legacy space
  must not produce hard errors — pizza-shop-demo still
  `0 errors · 0 warnings · 8 infos` (Codex C8).
- **A6 — `pd drift` contract dimensions.** Four new JSONL entry kinds
  consumed by `pd drift --from-jsonl`: `route`, `outbound-call`,
  `state-enum-value`, `host-asset-path`. Each backs a drift dimension:
  `ROUTE_NOT_IN_SPEC`, `CALL_NOT_IN_SPEC` (with header drift detection),
  `STATE_ENUM_DRIFT` (understands both inline and standalone state
  machines via `governs:` refs), `HOST_DEP_PATH_DRIFT`. New CLI flag
  `--fail-on-error` for CI gating.
- **A7 — `pd port-from-legacy`.** New CLI command + skill
  `.claude/skills/pd-port-from-legacy/` that scaffolds a
  `port-audit.md` classification table when a team has a
  `legacy-archive/` directory before a greenfield migration. Each row
  must be classified KEEP / ADAPT / REPLACE / DROP with a greenfield
  owner, home, and smoke check before the architect signs off.
  Available as either CLI or skill (Codex C7).

### Backward compatibility

- Legacy `calls: [string]` parses via Zod transform into `{target}`.
- Legacy `external-deps.yaml` without `kind:` field is normalised to
  `kind: http-api`. Existing validator rules updated to skip host kinds.
- Plain `pd validate` on existing spaces yields the same diagnostic set
  as v0.3 minus the new opt-in checks; new rules default to `warning`
  or `info` so legacy specs do not regress.
- 316/316 tests pass (290 baseline + 26 new across
  `validator.contracts`, `validator.state-machines`,
  `validator.host-deps`, `validator.runbooks`).

## [0.3.0] — 2026-05-10

### Added — operations layer + readiness profile

- `@pizza-doc/core` schema gains a first-class operations layer:
  per-module `config-map.yaml` (typed environment knobs with lifecycle
  + mutability + secret source-of-truth + cross-key relations) and
  `external-deps.yaml` (outbound + inbound webhook + bidirectional
  connections with auth scheme, config-map credential reference, and
  optional positional argv contract for legacy exec boundaries).
- Architecture Decision Records under `decisions/ADR-NNN-*.md` with
  frontmatter (`status`, `supersedes`, `supersededBy`) and optional
  lazy-body loading.
- `pd readiness` — release-gate profile separate from `pd validate`.
  Aggregates spec coverage, operational proof, error-mapping evidence,
  and optional drift checks; configurable per-profile thresholds.
- `pd migrate v0.2-to-v0.3` — backups + schema regen + ADR audit +
  version stamp.
- `pd import --merge` for JSONL snapshots so reverse scans can enrich
  existing YAML without erasing hand-authored descriptions and metadata.
- Single-space import targeting via `.pizza-doc/` auto-detection and
  `--space-dir`, with `_placement.spaceId` required only when a
  multi-space repo is ambiguous.
- Reverse-scan validator affordances for real production code:
  path/query/header and const data-flow sources, component-level method
  calls, queue/external terminal boundaries, entity `persistedAs` table
  aliases, enum model compatibility with SQL enum/string columns, and
  digit-aware camelCase to snake_case matching.

### Changed

- `pd add model`, `pd add table`, and matching MCP tools now warn when
  they create placeholder scaffolds, making it harder to mistake a
  skeleton for a completed code-derived spec.
- Bundled CLI agent skills now ship with the npm package so `pd init`
  can copy the reverse-scan workflow into consumer repositories after
  installation.

## [0.1.0] — 2026-04-21

First public release. See
[`docs/release-notes/v0.1.0.md`](./docs/release-notes/v0.1.0.md) for the
full rundown and the Definition-of-Done audit against page 09.

### Added

- `@pizza-doc/core` — schemas (Zod), loader, three-pass validator, serializer,
  AI exporter, ref index.
- `@pizza-doc/web` — Vite + React UI. File System Access API,
  keyboard-first, dark mode, ⌘K command palette, inspector with autosave,
  undo/redo, file watcher, use-case canvas (React Flow + elk.js).
- `@pizza-doc/cli` — stub binary (full CLI lands in v0.2).
- `spaces/pizza-shop-demo/` — seven-use-case demo space.
- `docs/site/` — Astro Starlight docs site.
- GitHub Actions: `ci.yml` (lint/typecheck/test/build/impeccable) and
  `release.yml` (changesets + Pages + GitHub Releases).
- `CONTRIBUTING.md`, per-package READMEs, this changelog.
