---
name: pd-port-from-legacy
description: >-
  Scaffold a port-audit.md classification table for a `legacy-archive/`
  directory before any greenfield migration begins. Every legacy artifact
  must be explicitly classified KEEP / ADAPT / REPLACE / DROP and mapped
  to a greenfield owner, home, and smoke check. Architect sign-off
  gates the new migration so asset pipeline gaps (host binaries,
  workflows, rootfs builds) cannot slip past silently.
---

# pd-port-from-legacy — greenfield migration gate

Run this **once** at the start of every greenfield rewrite, against the
`legacy-archive/` directory the team kept from the previous codebase.
Output is a markdown table the architect fills in by hand. Until the
table is signed off, the orchestrator does not let new migrations
start — this is the gate that catches asset pipeline gaps before they
ship to prod.

## When to use

- "we have a legacy-archive/ and we're about to write Phase 7 from scratch"
- "audit what we kept from the old repo before starting the rewrite"
- "the architect needs a checklist before signing off on migration X"
- Right after `git mv old-repo legacy-archive/` on a greenfield rewrite.

## What goes wrong without this

A motivating example: a team rewrites the firecracker host stack
greenfield, keeps the old code under `legacy-archive/acme-infra/`,
and Pizza Doc reported `0 warnings` while production was missing:

- `/opt/firecracker/golden.ext4` — the rootfs image (built by a script that
  was never ported to the new deploy workflow)
- `vmlinux` kernel binary (declared nowhere in the new spec)
- `e2tools`, `debootstrap` apt packages (assumed pre-installed on the host)
- The `rebuild-golden.yml` GitHub Action workflow (deleted, recoverable from
  git history but never replaced)

None of these failed `pd validate`. None of them showed up in drift. They
just weren't in the model because nobody walked `legacy-archive/` and asked
"what survives, what doesn't, who owns it now".

The port-audit table forces that walk before any migration starts.

## Inputs

1. **Archive path** — usually `legacy-archive/`, but any directory works.
2. **Greenfield team list** — names like `acme-infra`, `acme-devops`,
   `acme-backend`. The CLI infers a default owner from the top-level
   directory name in the archive; you override per row.

## Outputs

A markdown file (default `port-audit.md`) with this structure:

```markdown
# Port-from-legacy audit — legacy-archive/

| Legacy artifact | Path | KEEP / ADAPT / REPLACE / DROP | Greenfield owner | Greenfield home | Smoke check |
|---|---|---|---|---|---|
| setup-host.sh | `acme-infra/scripts/setup-host.sh` | ADAPT | acme-infra | acme-infra/scripts/setup-firecracker-host.sh | diagnose-firecracker-pipeline.sh §FIRECRACKER_ASSETS |
| build-golden.sh | `acme-infra/vm-agent/scripts/build-golden.sh` | KEEP | acme-infra | acme-infra/scripts/build-golden.sh | (same as above) |
| rebuild-golden.yml workflow | (deleted, recoverable from git history) | REPLACE | acme-devops | .github/workflows/firecracker-assets.yml | post-deploy smoke |
| vm-update-kernel.sh | `acme-infra/scripts/vm-update-kernel.sh` | DROP | n/a | n/a | kernel managed by setup-firecracker-assets.sh |

## Architect sign-off
- [ ] All items in legacy-archive/ classified
- [ ] All KEEP/ADAPT/REPLACE mapped to owner + home + smoke
- [ ] All DROP items have explicit reason
- [ ] Architect: <signature>
```

## How to run

### Option A — the CLI (simplest)

```bash
pd port-from-legacy legacy-archive/ --output port-audit.md
```

This scaffolds the table with one row per file in the archive, infers a
default owner from the top-level directory, and leaves the classification
columns blank for the architect.

### Option B — the skill (when you want to fill cells inline)

If the team prefers an agent to make initial guesses before the architect
reviews:

1. Run the CLI to generate the scaffold.
2. Open `port-audit.md` and, walking each row, propose a classification
   (KEEP / ADAPT / REPLACE / DROP) with one-line rationale comments.
3. Suggest greenfield home paths based on the new repo layout
   (`spaces/<id>/.pizza-doc/`, `apps/<service>/`, etc.).
4. For DROP rows, write the reason in the smoke-check column.
5. Hand the filled draft to the architect for final sign-off — they
   override any guesses they disagree with.

**Never** sign the architect line yourself. Leave it blank. The whole
point is that a human architect commits to the migration.

## Classification semantics

- **KEEP** — the file moves to the greenfield as-is. Reuse path, contents
  unchanged. Smoke check: a test (probably an integration test in the new
  repo) covers the kept behavior.

- **ADAPT** — the file's intent moves to the greenfield but the
  implementation needs rewriting (different language, different framework,
  different deploy target). Smoke check: the rewritten version is exercised
  by a test that didn't exist in the legacy repo.

- **REPLACE** — the legacy artifact is dead but the *function* it served
  now lives somewhere fundamentally different (a GitHub Actions workflow
  replaces a manual ssh script; a Pulumi module replaces a Terraform one;
  a managed service replaces a self-hosted one). Smoke check: the new
  surface is monitored or alerted.

- **DROP** — the legacy artifact's function is no longer needed at all
  (e.g. a script that fixed a one-time bug in the old codebase, a config
  for a feature the new product doesn't ship). Smoke check column: the
  reason it's dead.

## Smoke check column

Every KEEP / ADAPT / REPLACE row points at one concrete check the
architect (or CI) runs to confirm the artifact's behavior survived the
migration:

- A `diagnose-*.sh` script with a section header (`§FIRECRACKER_ASSETS`)
- A specific integration test path (`tests/integration/billing-flow.test.ts`)
- A post-deploy smoke gate (`.github/workflows/smoke.yml`)
- A monitor rule (`monitors/grafana/billing-error-rate.json`)

If a row's smoke check is "TBD" at sign-off time, the migration is not
ready. The point of the table is to make that visible.

## What this skill does NOT do

- It doesn't decide classifications for you. Defaults are blank for a
  reason.
- It doesn't write code. The audit is a checklist, not a migration plan.
- It doesn't gate `pd validate`. Pizza Doc itself doesn't know about
  `port-audit.md`; the orchestrator does.
- It doesn't replace ADRs. If a classification is non-obvious (e.g. why
  this `host-binary` got DROPped), record the rationale in an ADR and
  link it from the audit row.

## Refs

- Pizza-Doc Improvements Prompt v1, §A7
- Codex amendment C7 (this can ship as either CLI command or skill — the
  output format is the same either way)
- Firecracker host-stack rewrite post-mortem (the motivating gap)
