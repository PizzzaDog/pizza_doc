## Backlog

Open work items not currently scheduled. The `v0.1` / `v0.2` backlog that
used to live here is mostly shipped — see [`CHANGELOG.md`](../CHANGELOG.md)
for the per-release narrative through `v0.5.1`. This file tracks what's
genuinely still ahead.

## Author / scanner UX

### Second demo space, `pizza-shop-demo-with-issues/`

A copy of the canonical demo with four planted bugs (broken ref, unused
DTO field, missing dataFlow entry, cyclic call). Test asserts the validator
flags exactly those four codes. Useful both as a regression fixture for the
core validator and as a teaching example.

### Native extractor binaries

`pd-extract-{typescript, python, go, java}` are agent skills today —
LLM reads source and emits JSONL. Useful, but blocks CI-only drift checks
where no LLM is available. Goal: a standalone `npx pd-extract-typescript
<dir>` binary that runs the same heuristics deterministically with
`ts-morph` / equivalent per language. Same JSONL contract; same
`pd import --from-jsonl` consumer.

### More language extractors

Skills cover JS/TS, Python, Go, Java/Kotlin. Reasonable next: Rust, C#,
Ruby, Swift. Each is one more `.claude/skills/pd-extract-<lang>/SKILL.md`
plus a section in the orchestrator skills.

## Schema

### Cross-space references

`module:<id>` resolves within the current space. A microservice mesh
spans multiple spaces and wants to reference modules from siblings.
Probably an explicit `space:<id>/module:<id>` ref grammar plus a
`meta.federation` block on each space.

### Schema migration framework

Codemod-style `pd migrate v0.X-to-v0.Y` for breaking changes. Today's
`pd migrate v0.2-to-v0.3` is hand-rolled; this would be the harness for
future migrations to plug into.

## Spec ↔ code binding (code-anchoring)

`pd validate` proves the spec is internally consistent; it never reads
code. The only spec↔code check is `pd drift`, which needs an LLM-extracted
JSONL and is run by hand. So a spec can be 0/0-valid yet fully diverged from
the code, and the one field that binds them (`sourceRef`) sits at ~0
adoption — the demo and this repo's own `.pizza-doc/` carry none. This is
the root cause of "contracts drift in real projects": two sources of truth
joined only by a probabilistic LLM pass. Close it with a deterministic rail.

### Phase 1 — `pd anchors` (deterministic sourceRef resolver)

New read-only command. Walks every `sourceRef` in the space and checks it
resolves to a real file under `--code-root` (default: git toplevel, else
cwd), and — when a `:line` suffix is present — that the file is long
enough. No LLM, no language parser: runs in any CI, unlike `pd drift`.
Catches the #1 silent drift (code renamed / moved / deleted out from under
a spec entity). Exit 1 on a broken anchor. `--require-all` additionally
flags component / model / table entities that carry NO sourceRef (adoption
gate; off by default so design-first spaces still pass). `--json` for
machine output.

### Phase 2 — anchor-aware readiness  (done)

`pd readiness` gained an opt-in anchor gate (`runAnchorGate` in
commands/readiness.ts, reusing util/anchors.ts): `--check-anchors` resolves
every sourceRef and fails on a broken one; `--code-root` sets the root;
`--require-anchors` also fails on code-backed entities with no sourceRef.
Opt-in on purpose — like `--strict-contracts` etc — because many specs cite
code outside the checkout, so resolving by default would be wrong. Default
`pd readiness` is unchanged.

### Phase 2b — dogfood adoption (not started)

The rail is only exercised on synthetic data so far. Give a real space real
sourceRefs and gate it. The demo is design-first (no code to point at) and
restik has no code alongside, so the honest dogfood target is Pizza Doc
itself: scan packages/core + packages/cli into `.pizza-doc/` (currently
empty), populate sourceRefs, and run `pd anchors --require-all` +
`pd readiness --check-anchors` in this repo's own CI. This is the Tier-5
"dogfood" item from the framework analysis; it's a `pd-scanner` run, not a
rail change, so it's scoped separately.

### Phase 3 — rename-safe drift + machine diff

`pd drift` and `pd import --merge` match by `id`, so a renamed code symbol
forks the spec (old entity lingers, new one added, no error — see
`drift.ts` diffById / `import.ts` mergeArrays). Match by `sourceRef` first:
same sourceRef + changed id ⇒ RENAME, reported as one line instead of
codeOnly + spaceOnly. Add `pd drift --json` (structured diff for review /
auto-apply). Requires extractors to emit `sourceRef` in the JSONL — make it
part of the contract, not "should".

### Phase 4 — honest gates

`pd validate` footer: "spec internally consistent; spec↔code parity NOT
checked — run `pd anchors` (deterministic) / `pd drift` (needs extract)" so
0/0 stops reading as "done". Add `pd anchors` to the `pd doctor --fix-ci`
workflow template — it needs no LLM, so it belongs in the default CI, unlike
the commented-out `pd drift` line.

## UI

The web UI ships viewer + scalar editor. Bigger ergonomic improvements
sit here:

- State-machine diagram on entity pages (currently just a list of
  transitions)
- Per-DTO-field validation chips on the canvas
- `decidedBy` / ADR chips on component nodes
- "Implementation status" overlay (`draft | verified | implemented`)
  driven by frontmatter
