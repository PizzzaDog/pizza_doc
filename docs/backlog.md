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

Multi-repo workspaces (space in an aggregate root, modules as separate
checkouts in subfolders): repeatable `--module-root <id>=<dir>` maps a
module to its own root. That module's anchors try the module root first,
then fall back to `--code-root` — real spaces mix module-relative refs
(`src/main/java/...`) with workspace-relative ones (`backend/src/...`).
Mapping an id that matches no module warns (typo guard). Same flag works in
`pd readiness`'s anchor gate. Proven on HoraLab: 355/355 anchors resolve
with the mapping vs 305/355 from the aggregate root alone. Possible
follow-up: persist the mapping in the space itself (`meta.moduleRoots`?) —
that's a schema addition, so it needs its own migration decision here
first.

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

### Phase 3 — rename-safe drift + machine diff  (done)

`pd drift` used to match tables/models by `id` only, so a renamed code
symbol forked the report into codeOnly + spaceOnly (and `pd import` then
forked the spec itself). Now: after the id pass, unmatched leftovers are
paired by `sourceRef` FILE (line suffix stripped — lines shift on every
extract) and reported as one RENAME line; field/column drift is still
computed across the pair. Pairing is conservative — only when the file
maps to exactly one unmatched entity per side, so multi-entity files
degrade to the old report instead of guessing. Renames count as
*significant* drift (refs still point at the old id). `pd import` grew
the same detection as a **rename guard**: an incoming NEW entity whose
sourceRef file an existing same-kind entity (different id, not part of
the import) already cites is skipped with a rename hint instead of
written. `pd drift --json` emits the full structured diff (verdict,
per-kind codeOnly/spaceOnly/renamed, field/column drift, all v0.3
contract dimensions) for review tooling / auto-apply. `sourceRef` is now
a REQUIRED part of the extractor JSONL contract (skills README + all
four `pd-extract-*` SKILL.md files say so, with the rename rationale).

### Phase 4 — honest gates  (done)

`pd validate` prints a scope footer on clean runs ("spec↔code parity NOT
checked — run `pd anchors` (deterministic) or `pd drift --from-jsonl`
(needs a code extract)") so 0/0 stops reading as "done". The `pd doctor
--fix-ci` workflow template now scaffolds a live `pd anchors` step — it
needs no LLM so it belongs in default CI (a design-first space with no
sourceRefs passes trivially); `pd drift` stays a commented suggestion.

## Doc-first hard wiring (spec → cheap implementer)

Goal (2026-07-02 product analysis): an agent designs the system in Pizza
Doc, reviews and iterates there, and only then hands each use case to a
cheap implementer — who must not be able to screw it up if they follow the
doc. The schema already carries most of the wiring (calls with
credentials, emits/subscribes, via, persistedAs, state machines, field
validation); what was missing is *closure*: types were free strings, steps
and calls were two unlinked records of the same edge, and the LLM-facing
exports drop data the schema knows. Use cases are NOT replaced by wiring —
they're the scenario layer (acceptance, error flows, dataFlow lineage,
coverage), now hard-linked to it.

### W1 — type closure + wiring parity  (done)

`TYPE_UNRESOLVED` (error): every non-primitive leaf type in method
params/returns and model fields must resolve to a model by id/name.
Generics/arrays/unions are decomposed, wrapper names (`List<…>`,
`Page<…>`) are not checked, dotted FQNs skip. `errorMapping[].exception`
names count as known types; `type: external` modules are exempt (vendor
surface — wireCapture pins that contract instead).
`WIRING_STEP_WITHOUT_CALL` (warning): an http/internal-call step must
match a declared `calls`/`composes` edge at component granularity — error
flows may walk the edge in reverse (exception unwind); an `event` step
needs an emits/subscribes pair on the same event model.
`WIRING_CALL_WITHOUT_STEP` (info): a declared call edge no use case
walks. `STEP_VIA_MISSING` (info): http/event step without a payload
model. `--strict-wiring` escalates the step-parity pair to error. The via
rule now accepts a `returns` match (via-as-response, GET flows) and is an
*error* when the step binds a method directly. The demo now models full
client wiring (clients declare calls; GET steps carry via).

### W2 — implementation-brief closure  (done)

`pd export implementation-brief` is now self-contained: a "Components &
contracts" section renders the full method contracts (params with
validation, returns, throws, httpMethod/httpPath, routeAuth, calls with
credentials, routes, emits/subscribes, wireCapture, composes) of every
component the steps touch; the model section is a transitive closure over
via refs + signatures + field types (enum values and `cardinality: many`
now render); tables include `persistedAs` targets; config keys are
filtered to involved consumers (module-wide keys included when the module
is on the path); ADR bodies for `decidedBy` components are inlined from
disk. Self-check: type names resolving to nothing (same exemptions as
TYPE_UNRESOLVED) get an "UNRESOLVED TYPES" section and the command exits
1 — the brief is still written, but a handoff artifact with phantom types
must not pass a pipeline.

### W3 — one exporter, full fidelity  (done)

`packages/core/src/export.ts` is now the ONE place Pizza Doc renders
itself for an LLM: shared block emitters (component contract, model,
table, state machine, error mapping, config, external deps, health
contract) feed both scopes — `exportSpaceForAi` (full space; UI button
and the new `pd export ai`) and `renderImplementationBrief` +
`collectBriefContext` (per use case; `pd export implementation-brief`
wraps them, reading ADR bodies from disk since core stays fs-free for the
browser). Full-space export now emits everything the schema knows: field
validation, enum values, cardinality, persisted flags, topics, state
machines with scenarios, pub/sub edges, routes/auth, call credentials,
wire captures, error mapping, config map, external deps (all kinds),
health contracts, table defaults/migrations, use-case requires and step
concurrency kind, ADR index (bodies when loaded), runbook index,
cross-module state machines, implementation stack. Entity blocks are
YAML-shaped (source-faithful; markdown tables would break on `A | B`
union types). Fidelity pinned by `packages/core/__tests__/export.test.ts`.

### W4 — event delivery contract  (done)

Schema addition (the only one in the W1–W8 series). Migration decision:
all three fields are optional and additive — existing spaces parse
unchanged, no codemod needed. On event models: `delivery`
(at-least-once / at-most-once / exactly-once) and `orderingKey` (event
field that partitions/orders delivery — Kafka key / FIFO group). On
`subscribes[]` entries: `idempotency: { key, strategy: dedupe-store |
upsert | natural, description }`. Retry/DLQ topology was deliberately
left out — it's transport configuration, not a payload contract; add it
when a real space needs it. Rules: `EVENT_IDEMPOTENCY_MISSING`
(warning — subscriber of an at-least-once event without declared
idempotency; undeclared `delivery` doesn't arm the rule),
`EVENT_KEY_FIELD_UNKNOWN` (error — orderingKey / idempotency.key names
no field on the event model, with near-match suggestions),
`EVENT_DELIVERY_ON_NON_EVENT` (error — transport fields on a
dto/entity). Exporter + brief render both ends (`**Delivery:** …,
ordered by \`k\``; `idempotency: { key, strategy }` on subscribes).

### W5 — THROWS_UNMAPPED  (done)

Every `throws` on an http-reachable method (httpMethod set) needs a row
in the module's `errorMapping` — otherwise the wire-level outcome of the
failure is undeclared. Warning by default; `--strict-contracts`
escalates (same family as CONTRACT_CALL_*). Exemptions: internal
methods (the mapping matters where the exception meets the wire),
`client`/`page`/`widget` components (their httpMethod documents the
*outgoing* request — the apiClient idiom), `type: external` modules.
First demo run found 9 real gaps (7 unmapped exceptions) in the
canonical space.

### W6 — handoff gate  (done)

`pd handoff <usecase> [dir] [--json]`: 0 validation errors (incl.
fs-level wire-capture checks) + brief type closure + step↔call parity +
via on http/event steps + THROWS_UNMAPPED and EVENT_IDEMPOTENCY_MISSING
clean on the components the use case touches. Checks 3–6 are scoped to
the use case (a neighbour mid-design doesn't block); errors are never
scoped. Exit 0 ⇒ safe to hand `pd export implementation-brief` to a
cheap implementer; slots into the ChangeSet flow at `design-approved →
implementing`. `--json` for CI.

### W7 — close the loop after implementation  (done via code-anchoring)

Code-anchoring Phases 3–4 shipped 2026-07-03: rename-safe drift + rename
guard on import + `pd drift --json`; honest validate footer + `pd anchors`
in the default CI template. The remaining adjacent item is native
extractor binaries (Author / scanner UX section) — an ergonomics
improvement, not a gate: the LLM extractor skills already close the loop.

### W8 — dogfood the demo  (done)

pizza-shop-demo now exercises every rail: module `errorMapping` (8 rows
matching every errorFlow's resultDescription), an event flow
(`OrderPlaced` at-least-once event with orderingKey → new
`notification-worker` module with an idempotent `KitchenNotifier`
consumer + an `event`/`spawn` step in place-order), `user-jwt`
credentials + `routeAuth` on every authenticated client↔controller pair,
a state machine with 3 scenarios on `Order` (incl. a
redelivery-idempotency scenario), `config-map.yaml` (secret
sourceOfTruth), `external-deps.yaml` (stripe, bearer via
STRIPE_API_KEY), a wire capture for the Stripe charge, and ADR-001
(synchronous charge, no retry) wired via `decidedBy`. All 7 use cases
pass `pd handoff`; validate stays 0 errors / 0 warnings, including under
`--strict-contracts --strict-wiring --check-orphan-paths`.

Follow-up 2026-07-03: the demo is now **0 errors / 0 warnings / 0
infos** under ALL strict flags — three runbooks in
`operations/runbooks/` cover every errorFlow (stripe-declines-spike p2 +
ADR-001, out-of-stock-orders p2, user-input-rejections
validation-error), and the three declared-but-unwalked call edges
(UserService→PasswordHasher, CartPage→CartSummary, MenuPage→PizzaCard)
became use-case steps. Site docs stopped lagging by construction:
`reference/validation-rules.md` and `reference/cli.md` are GENERATED
(`pnpm gen:rules-doc` from lint.ts DOCS — 80 codes; `pnpm gen:cli-doc`
from `pd --help`), and `reference/yaml-format.md` was rewritten against
the v0.6 schema (routeAuth, object calls + credentials, wireCapture,
emits/subscribes + idempotency, delivery/orderingKey, SM + scenarios,
decidedBy, ADR/runbook/health-contract file formats, sourceRef rail).

## UI

The web UI ships viewer + scalar editor. Bigger ergonomic improvements
sit here:

- State-machine diagram on entity pages (currently just a list of
  transitions)
- Per-DTO-field validation chips on the canvas
- `decidedBy` / ADR chips on component nodes
- "Implementation status" overlay (`draft | verified | implemented`)
  driven by frontmatter
