# @pizza-doc/cli

## 0.5.1

### Patch Changes

- `pd schemas regen [<dir>]`: refreshes `<space>/schemas/*.json` from the
  current Zod source. Drop-in replacement for the old "delete schemas/ and
  re-init in a temp dir" workaround. Useful after upgrading the `pd` binary
  on an existing space; closes the unimplemented `--regenerate-schemas` TODO
  that the v0.5.0 `INSTALL.md` was still pointing at.
- Updated dependencies
  - @pizza-doc/core@0.5.1

## 0.5.0

### Minor Changes

- `pd validate` gains `--strict-wire-capture` (B3): escalates `WIRE_CAPTURE_MISSING` warnings to errors. Use in CI for services with external http-api integrations to protect against the synth-fixture-lies-about-shape failure mode (a real prod incident: synth fixture lied about vendor SSE shape, 5 hours of debugging). The CLI also runs filesystem checks for `WIRE_CAPTURE_PATH_BROKEN` (file absent or empty → error) and `WIRE_CAPTURE_STALE` (capturedAt > 30 days → info).
- `pd doctor` (B5): new advisory CLI command. Walks a checklist — `.pizza-doc/` in git, `meta.implementationLanguage` matches a known extractor skill, suggests `--strict-contracts` / `--strict-wire-capture` / `--check-state-coverage` / `--check-runbook-coverage` based on space contents, offers to scaffold `.github/workflows/pd-validate.yml` via `--fix-ci`. Exit 1 on any failed check; info-level hints don't fail. Closes the "we didn't know which flags to enable" gap.
- `pd lint` learns nine new validation code docs covering B1–B4 (`COMPONENT_DECIDED_BY_*`, `EVENT_*`, `WIRE_CAPTURE_*`, `MIGRATION_COLUMN_INCONSISTENT`).

### Patch Changes

- Updated dependencies
  - @pizza-doc/core@0.5.0

## 0.4.0

### Minor Changes

- `pd validate` gains four opt-in v0.3 contract flags (A5): `--strict-contracts` (caller/callee credential parity → error), `--check-orphan-paths` (caller path ↔ callee route → error), `--check-state-coverage` (state machine scenarios → error), `--check-runbook-coverage` (severity-aware errorFlow → runbook coverage per Codex C4). Plain `pd validate` keeps the v0.3 baseline so legacy spaces don't regress (Codex C8).
- `pd drift` gains four new contract dimensions (A6) consuming new JSONL entry kinds: `route` → `ROUTE_NOT_IN_SPEC`, `outbound-call` → `CALL_NOT_IN_SPEC` (with header drift detection), `state-enum-value` → `STATE_ENUM_DRIFT`, `host-asset-path` → `HOST_DEP_PATH_DRIFT`. New CLI flag `--fail-on-error` for CI gating.
- `pd port-from-legacy <archive>` (A7): new command that scaffolds a `port-audit.md` classification table (KEEP/ADAPT/REPLACE/DROP) for a `legacy-archive/` directory before any greenfield migration. Architect sign-off gates new migration so asset pipeline gaps cannot slip past silently.
- `pd lint` learns ten new validation code docs covering A1–A4 (`CONTRACT_CALL_*`, `STATE_MACHINE_SCENARIO_COVERAGE`, `HOST_DEP_*`, `RUNBOOK_COVERAGE`, `RUNBOOK_BROKEN_LINK`).
- `pd export operations` renders host-installed deps in a separate table from http-api deps (A3).

### Patch Changes

- Updated dependencies
  - @pizza-doc/core@0.4.0

## 0.3.0

### Minor Changes

- Add a production readiness profile that turns spec coverage, operational proof, error-mapping evidence, and optional drift checks into a release gate separate from default validation.
- Improve reverse code-scan imports, validator affordances, and scaffold warnings for production code snapshots.

### Patch Changes

- Updated dependencies
  - @pizza-doc/core@0.3.0
