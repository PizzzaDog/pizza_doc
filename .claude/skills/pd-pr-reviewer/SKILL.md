---
name: pd-pr-reviewer
description: >-
  Review a pull request (or a branch) that changes a Pizza Doc space.
  Runs validate / coverage / orphans / diff, flags breaking changes,
  surfaces orphaned endpoints, and posts a structured review comment.
  Use when the user says "review this PR against the spec", "ревью спека",
  "какие breaking changes в этой ветке".
---

# pd-pr-reviewer — review spec changes

> **Layouts.** Examples below use `spaces/<id>/` (multi-space). For a user
> project on the new default `.pizza-doc/` layout, swap `spaces/<id>` →
> `.pizza-doc` in commands and grep patterns (e.g.
> `grep -E '^\.pizza-doc/'` instead of `grep -E '^spaces/'`). `pd <cmd>`
> with no path arg auto-detects from cwd.

Produce a **structured review** of changes to a Pizza Doc space on a
feature branch / PR. Goals:
1. Block clearly-broken specs from merge (errors, coverage drop).
2. Surface breaking model changes.
3. Flag design smells (orphaned endpoints, silent model field removals).
4. Leave the final merge decision to humans — you report, you don't
   approve.

## When to use

- "review the PR changing spaces/restik"
- "что поменяли в спеке? какие breaking?"
- Pre-merge checklist on any branch touching `spaces/**`.

## Inputs

1. **PR branch or git ref** to compare against. Default: `origin/main`.
2. **Space directory** — the one with changes. If multiple, iterate.

## Algorithm

### Step 1 — Confirm the branch has changes to a space

```bash
git diff --name-only origin/main...HEAD | grep -E '^spaces/'
```

If empty: nothing to review, stop. Tell the user.

### Step 2 — Run the quality gates on the CURRENT state

```bash
pnpm pd validate  spaces/<id> --strict-warnings
pnpm pd coverage  spaces/<id>
pnpm pd orphans   spaces/<id>
pnpm pd endpoints spaces/<id> --orphans
```

Capture exit codes and outputs. Any `validate` error → this is a **block**.

### Step 3 — Run the quality gates on the BASE state

Checkout the base ref into a scratch dir (or use `git worktree add`) and
run the same four commands. Capture outputs for comparison.

```bash
# Low-tech: git archive the old state
git archive origin/main -- spaces/<id>/ | tar -x -C /tmp/pd-review-base
pnpm pd coverage /tmp/pd-review-base/spaces/<id>
# ...repeat for other commands
```

### Step 4 — Structural diff

```bash
pnpm pd diff origin/main spaces/<id>
```

Read the output — it already has:
- added / removed components, models, tables, use cases,
- per-model field additions and **removals marked `(breaking)`**.

### Step 5 — Classify findings

Group into buckets:

**🔴 BLOCK (merge-stopping):**
- `validate` has errors.
- Coverage dropped below thresholds that the base passed.
- Model fields removed that were used in any dataFlow or method signature
  on the base side → breaking change with no caller mitigation.
- Endpoints removed from the spec without corresponding use case removal.

**🟡 REVIEW (needs human eyes):**
- New model fields without `optional: true` and without a dataFlow entry
  — means someone ships a breaking change and forgot to feed it.
- New endpoints with zero use-case coverage.
- New use cases with `USECASE_STEP_CHAIN_DISCONTINUITY` warning — likely
  a forgotten call.
- Coverage dropped but still above threshold.

**🟢 FYI:**
- Added components / models / tables without issues.
- New or renamed use cases.
- Documentation-only changes (description / name tweaks).

### Step 6 — Write the review

One structured markdown comment. Template:

```markdown
## Pizza Doc review — spaces/<id>

**Verdict:** 🔴 block / 🟡 review / 🟢 ready

### Validation
- base: <passes/fails, counts>
- head: <passes/fails, counts>
- delta: <+X errors, -Y warnings>

### Coverage
| category    | base  | head  | Δ   |
|------------ |------ |------ |-----|
| components  |  98%  | 100%  | +2  |
| models      |  90%  |  88%  | -2  |
| tables      | 100%  | 100%  |  0  |
| endpoints   |  45%  |  34%  | -11 |

### Structural diff
<paste `pd diff` output, trimmed>

### 🔴 Blocking
- (list with file:line refs)

### 🟡 Review
- (list with file:line refs)

### Suggested actions
- `pnpm pd orphans spaces/<id> --kind endpoints`
- Add use case for `POST /v1/orders/cancel`
- ...
```

### Step 7 — Do not merge, do not approve

You do NOT run `gh pr merge` or `gh pr review --approve`. The review
artifact is a markdown comment OR terminal output. Humans decide.

Allowed (if the user explicitly asks):
- `gh pr comment <num> --body-file <file>` — post the review to the PR.
- Nothing else.

## Failure modes

- **Approving a broken spec because the diff looks clean.** The diff can
  be clean and the spec still be broken (e.g. validate fails on master
  too, but this PR didn't cause it). Always run **both** sides; compare.
- **Missing breaking changes in dataFlow.** A removed sourceField is a
  silent behaviour change. Cross-check: if a field is removed from a
  model, did any use case's dataFlow reference it? That's a block.
- **False positives on description-only changes.** YAML reorders + whitespace
  drown the signal. `pd diff` handles this for you — trust it over raw
  `git diff`.
- **Noisy reviews.** Don't list every added property. Summarize in the
  table; call out what matters.

## Output modes

Two supported output modes:

1. **Terminal** — print the review to stdout. Default.
2. **PR comment** — if user passes `--pr <number>`, save the markdown to
   a tmp file and hand the path to the user; they (or you with confirmation)
   post it via `gh pr comment`.

## What you don't do

- Don't fix the spec yourself. You review; the author fixes.
- Don't merge or approve.
- Don't audit drift against the codebase here — that's `pd-drift-auditor`.
- Don't rewrite the author's descriptions "for clarity" unless asked.
