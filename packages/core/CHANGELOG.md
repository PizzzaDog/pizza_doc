# @pizza-doc/core

## 0.5.1

### Patch Changes

- Version-only bump to keep the monorepo manifests on one semver. No schema
  or validator changes.

## 0.5.0

### Minor Changes

- ADR back-references (B1): `Component.decidedBy: [ADR-NNN]` anchors a single component to one or more ADRs (finer-grained than `Module.decisions[]`). Two new validator rules: `COMPONENT_DECIDED_BY_INVALID_ADR` (error — id missing from `space.decisions[]`) and `COMPONENT_DECIDED_BY_SUPERSEDED_ADR` (warning — linked ADR has `status: superseded` or `deprecated`).
- Pub/sub edges as first-class (B2): `Component.emits` / `subscribes` list event payloads (refs to `modelKind: event` models). Graph traversal in `ruleComponentUnused` now treats subscribers of any emitted event as alive, removing the legitimate `COMPONENT_UNUSED` suppressions event-driven receivers used to need. Four new validator rules: `EVENT_EMIT_TARGET_NOT_EVENT`, `EVENT_SUBSCRIBE_TARGET_NOT_EVENT` (errors), `EVENT_NO_SUBSCRIBER`, `EVENT_SUBSCRIBE_NO_PUBLISHER` (warnings). REF_BROKEN now also walks `emits[].event`, `emits[].to`, `subscribes[].event`, `subscribes[].via`.
- Wire capture (B3): `Component.wireCapture: { source, path, capturedAt, capturedAgainst, scenarios }` pins external integrations to real captured-traffic artefacts. New validator rule `WIRE_CAPTURE_MISSING` (warning by default — components consuming http-api external-deps without a wireCapture). The CLI escalates with `--strict-wire-capture` and adds filesystem checks `WIRE_CAPTURE_PATH_BROKEN` (error) and `WIRE_CAPTURE_STALE` (info, > 30 days).
- Table migration parity (B4): `Table.migrations: [{ id, action: 'create' | 'add-column' | 'drop-column' | 'alter-column', columns }]`. New validator rule `MIGRATION_COLUMN_INCONSISTENT` (error) — declared add/drop/alter that contradicts the current `columns: [...]` snapshot.

## 0.4.0

### Minor Changes

- Contract layer (A1): `Method.calls[]` accepts the v0.3 object form `{target, path, method, credential, optional}` alongside legacy ref strings (auto-normalized via Zod transform). `Component.routes[]` declares standalone inbound HTTP routes; `Method.routeAuth` declares auth for method-bound routes. Four new validator rules: `CONTRACT_CALL_CREDENTIAL_MISSING`, `CONTRACT_CALL_PATH_ORPHAN`, `CONTRACT_CALL_HEADER_MISMATCH`, `CONTRACT_CALL_ENV_MISMATCH`.
- First-class state machines (A2): new entity `state-machine.yaml` under `modules/<id>/state-machines/`. Schema adds `stateConfig` (terminal/timeout per state), `transitions[].invariants.{pre,post}`, `transitions[].trigger`/`actor`, `scenarios[]`. Inline `model.stateMachine` extended the same way. New rule `STATE_MACHINE_SCENARIO_COVERAGE`.
- Host external dependencies (A3): `ExternalDepEntrySchema` is now a discriminated union on `kind`. Legacy entries without `kind` parse as `http-api`. New kinds: `host-binary`, `host-artifact`, `apt-package` with `install_path`, `install_owner`, `required_in_profiles[]`, `lifecycle`, `preflight {command, expected}`, and a per-kind `source` discriminator. Four new validator rules: `HOST_DEP_BINARY_SHA256_MISSING`, `HOST_DEP_ARTIFACT_RECIPE_MISSING`, `HOST_DEP_PREFLIGHT_MISSING`, `HOST_DEP_PROD_OWNER_MISSING`.
- Operations layer (A4): new top-level `operations/{runbooks,state-machines,health-contracts}/`. Runbooks are markdown with frontmatter (id, severity, owner, trigger, covers[], decisions[]). Modules gain optional `healthContract`. New validator rules: `RUNBOOK_COVERAGE`, `RUNBOOK_BROKEN_LINK`.

## 0.3.0

### Minor Changes

- Add a production readiness profile that turns spec coverage, operational proof, error-mapping evidence, and optional drift checks into a release gate separate from default validation.
- Improve reverse code-scan imports, validator affordances, and scaffold warnings for production code snapshots.
