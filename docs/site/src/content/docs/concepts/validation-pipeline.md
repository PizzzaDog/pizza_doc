---
title: The validation pipeline
description: Three passes, strictly ordered. Each one runs only if the previous was clean of errors.
---

Pizza Doc validates a space in three passes. The important design
property: **each pass assumes the previous one was clean of errors.**
A broken ref at Pass 2 stops Pass 3 from running, because semantic rules
that assume "this component exists" would flood the user with false
positives if it doesn't.

## Pass 1 — Schema

Run by the **loader**. Every file is parsed as YAML, then the data is
validated against a Zod schema keyed to its `kind`. The pass is
file-local: one bad file doesn't stop others from being parsed.

Codes emitted:

- `YAML_PARSE_ERROR` — couldn't parse the YAML at all.
- `SCHEMA_UNKNOWN_FIELD` — extra field not in the schema (all schemas
  are `.strict()` so typos don't slip through).
- `SCHEMA_MISSING_REQUIRED` — required field absent.
- `SCHEMA_WRONG_TYPE` / `SCHEMA_INVALID_VALUE` — type mismatch or value
  outside allowed set.
- `SCHEMA_INVALID_ID` — id doesn't match the `[a-zA-Z][a-zA-Z0-9_-]*` regex.
- `SCHEMA_INVALID_REF_PATTERN` — ref URI malformed.
- `SCHEMA_UNKNOWN_MODULE_TYPE` / `SCHEMA_UNKNOWN_MODEL_KIND` /
  `SCHEMA_UNKNOWN_COMPONENT_TYPE` — enum violations.
- `SCHEMA_FILENAME_ID_MISMATCH` — filename doesn't match the `id` field.
- `FILE_UNRECOGNIZED` — file isn't one of the known entity shapes.

If any Pass 1 error fires, Pass 2 is skipped.

## Pass 2 — Reference resolution

Runs once Pass 1 is clean. Builds a `RefIndex` keyed on every canonical
URI in the space, then checks that every ref-shaped string in the data
resolves and points at the kind the context expects.

Codes emitted:

- `REF_BROKEN` — ref doesn't resolve to any indexed entity.
- `REF_WRONG_KIND` — ref resolves but to the wrong kind (e.g. a `calls:`
  entry that points at a table).

Broken refs include a **did-you-mean** suggestion computed via
Levenshtein against every indexed ref. Useful when you've just renamed
something.

## Pass 3 — Semantic rules

Runs once Pass 2 is clean. This is the big one — 25+ rules across five
buckets. All rules are either warnings or info; semantic issues never
block the UI from loading, but the top-bar badge turns yellow.

### 3.1 Use case coherence

- `USECASE_NO_STEPS`
- `USECASE_STEP_CHAIN_DISCONTINUITY`
- `USECASE_FIRST_STEP_NOT_FROM_FRONTEND`
- `USECASE_LAST_STEP_NOT_TERMINAL`

### 3.2 DTO flow consistency

- `DTO_FLOW_VIA_TYPE_MISMATCH`
- `HTTP_STEP_TARGET_NOT_CONTROLLER`
- `SQL_STEP_TARGET_NOT_DATABASE`

### 3.3 Data flow

- `DATAFLOW_SOURCE_FIELD_MISSING`
- `DATAFLOW_TARGET_FIELD_MISSING`
- `DATAFLOW_TYPE_INCOMPATIBLE`
- `DATAFLOW_TRANSFORM_MISSING`
- `DATAFLOW_UNUSED_DTO_FIELD`
- `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN`

### 3.4 Structural hygiene

- `DUPLICATE_ID`
- `CYCLIC_CALLS`
- `ACTOR_UNUSED`
- `COMPONENT_UNUSED`
- `DTO_UNUSED`

### 3.5 Cross-module consistency

- `MODEL_FIELD_MISSING_COLUMN`
- `FK_COLUMN_MISSING`

See the [validation rules reference](/reference/validation-rules/) for
exact definitions and examples.

## Severities

| Severity | What the UI does | What CI should do |
| --- | --- | --- |
| `error` | Red badge, the space can still load (no fatal errors) | Fail the build |
| `warning` | Yellow badge | Don't fail — surface in PR comment |
| `info` | Fg-tertiary badge | Report in a summary step |

The store's `revalidate()` action re-runs Pass 2 + Pass 3 against the
already-loaded files without touching the FS. That's what the ⌘K
"Validate space" action triggers.

## Running validation outside the UI

The validator is a pure function — give it a `LoadResult`, get back a
`ValidationResult`.

```ts
import { loadSpace, validate } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'

const fs = nodeFileSystem(process.cwd())
const loadResult = await loadSpace(fs, '.', 'pizza-shop-demo')
const { issues, passes } = validate(loadResult)

for (const issue of issues) {
  console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.message}`)
}

if (issues.some((i) => i.severity === 'error')) process.exit(1)
```

The repo-local CLI wraps this flow:

```bash
pnpm build
pnpm pd validate spaces/pizza-shop-demo --strict-warnings
```

## Validate vs readiness

`pd validate` answers: **is the YAML internally coherent?** It checks
schema shape, refs, semantic consistency, and warnings that help authors
spot likely gaps.

`pd readiness --profile production` answers: **is this spec releasable?**
It runs validation first, then fails on production gates that are too
strong for default validation:

- endpoint/model/table/component coverage below configured thresholds;
- orphan endpoints, models, tables, or components unless locally justified;
- `file`, `device`, or `exec` external dependencies without
  `preflightCheck.sourceRef` or `driftProbe.sourceRef`;
- `exec` positional-arg contracts without a contract-test source ref;
- `errorMapping` rows without implementation evidence;
- config defaults that drift between the spec and recorded code/workflow
  sources.

Wire readiness into CI as the release gate:

```bash
pnpm pd validate .pizza-doc --strict-warnings
pnpm pd readiness .pizza-doc --profile production
pnpm pd readiness .pizza-doc --profile production --drift-from-jsonl code-extract.jsonl
```

The CLI package is published as `@pizza-doc/cli`. In consumer repos, use the
`pizza-doc` or `pd` binary for validation, coverage, endpoint, export, and
exploration commands.
