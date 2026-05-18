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

## UI

The web UI ships viewer + scalar editor. Bigger ergonomic improvements
sit here:

- State-machine diagram on entity pages (currently just a list of
  transitions)
- Per-DTO-field validation chips on the canvas
- `decidedBy` / ADR chips on component nodes
- "Implementation status" overlay (`draft | verified | implemented`)
  driven by frontmatter
