---
name: pd-drift-auditor
description: >-
  Audit whether a Pizza Doc space still matches its source codebase, in
  any language. Delegates code-side extraction to the matching
  `pd-extract-<lang>` skill, then compares the extracted JSONL to the
  space's current state. Reports drift; suggests concrete re-sync
  commands. Read-only on both sides.
---

# pd-drift-auditor — doc ↔ code sync check (language-agnostic)

> **Layouts.** Examples below use `spaces/<id>/` (multi-space). For a user
> project on the new default `.pizza-doc/` layout, treat `.pizza-doc/` as
> the space dir — `pd <cmd>` with no path arg auto-detects from cwd.

Compare a Pizza Doc space against its source codebase and produce an
actionable drift report. **Read-only** — you don't modify either side.
The user decides what to re-sync.

## When to use

- "проверь что дока актуальна"
- "check if the spec is in sync with the code"
- "we refactored X, audit drift"
- Before a release / right after a large refactor.

## Inputs

1. **Space directory** — `spaces/<id>/`.
2. **Source codebase root** — the repo the space describes.
3. **Language** — from `space.yaml`'s `meta.implementationLanguage`, or
   ask the user.

## Algorithm

### Step 1 — Load the space

```bash
pnpm pd validate spaces/<id>
```

If the space has errors, **stop**. You can't audit drift against a
broken spec — fix the spec first via `pd-author` or manual repair.

### Step 2 — Extract a fresh JSONL snapshot of the code

Delegate to the matching extractor skill:

| Language | Skill |
|---|---|
| Java / Kotlin | `pd-extract-java` |
| TypeScript / JavaScript | `pd-extract-typescript` |
| Python | `pd-extract-python` |
| Go | `pd-extract-go` |

Ask the skill to emit to `/tmp/<spaceid>-code.jsonl`, **without** writing
to the space. Extractor skills all support a `--dry-run` / read-only
mode; they produce JSONL that you hold in memory or on disk but never
feed to `pd import`.

### Step 3 — Enumerate space-side inventories

From the validated Space object (read via `pnpm pd …` helpers or by
reading yaml files directly):

- Tables: `id`, `columns`.
- Models: `id`, `modelKind`, `fields`.
- Components: `id`, `type`, `methods` (each with `name`, `httpMethod`,
  `httpPath`, `params`, `returns`).
- Endpoints: every `method` with `httpMethod` + `httpPath`, keyed as
  `METHOD /path`.

### Step 4 — Diff side-by-side

Emit three diff-buckets:

**Tables diff:**
- code-only: tables in DB but not in space.
- space-only: tables in space but not in DB.
- drifted: shared tables with column differences.

**Endpoints diff:**
- code-only: endpoints the server exposes, space doesn't describe.
- space-only: endpoints the space claims exist, code doesn't back up.

**Models diff:**
- code-only: DTO/entity classes with no matching model yaml.
- drifted: shared models with field differences.

### Step 5 — Report

Severity-grouped markdown. Template:

```
drift report: spaces/<id>  vs  <code-dir>
language: <lang>/<framework>

CRITICAL (code present, space missing):
  endpoints:
    - POST /v1/auth/reset-password   (<extractor-source-hint>)
  tables:
    - audit_logs  (<migration-file>)

CRITICAL (space claims, code missing):
  endpoints:
    - POST /v1/payments/refund   (claimed by <ComponentRef>.<method> — no handler found!)

MEDIUM (shared but drifted):
  model 'CreateOrderRequest':
    - added in code:     shippingAddress: string
    - removed in code:   couponCode: string

LOW:
  - 3 endpoints in code have no use case coverage: (list)
```

### Step 6 — Suggest fixes

For each critical drift, include a concrete command:

**Code has entity, space doesn't:**
```
→ Run `pd-extract-<lang>` skill in add-mode, emit a JSONL with just
  the new entities, review, then `pnpm pd import --from-jsonl <file>`.
```

**Space has entity, code doesn't:**
```
→ Options:
  (a) Delete from the yaml if the feature was un-deployed.
  (b) Leave it and open an issue: "feature X is specified but not
      implemented yet — owner: ...".
  Never auto-delete — the user may be mid-refactor.
```

**Drifted fields:**
```
→ Edit the yaml manually OR re-extract and `pd import --force`.
```

### Step 7 — Don't modify

You **suggest commands**. Running them is the user's call — they may
prefer to sync the code to the spec rather than vice versa.

## Output contract

One markdown-formatted report, ≤100 lines for a medium project. Always
include:

- One-line verdict: `✓ in sync`, `⚠ minor drift`, `✗ significant drift`.
- Counts: tables matched/drifted, endpoints matched/drifted, models
  matched/drifted.
- Top-3 most urgent items with suggested `pd` or manual commands.

## Failure modes

- **False positives from path parameters.** Normalize `/v1/users/{id}`
  vs `/v1/users/:id` before comparing.
- **Shadow DTOs (nested classes/records).** Focus on field-level diff,
  not file count.
- **Generated code.** Skip `dist/`, `build/`, `target/`, `__generated__/`,
  `node_modules/`, `vendor/`.
- **Assuming a parser's file mapping.** A model YAML may aggregate
  several small classes. Use content comparison, not filename.
- **Inferring language from file extensions alone.** Check
  `meta.implementationLanguage` first.

## What you don't do

- Don't rewrite the code. Not your job.
- Don't rewrite the space. Suggest only.
- Don't attempt to fix drift "automatically" in bulk. Each drift has
  judgment calls — user decides direction.
