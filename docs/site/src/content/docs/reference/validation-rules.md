---
title: Validation rules
description: Every code the Pizza Doc validator can emit. Severities and conditions sourced from packages/core/src/validator/.
---

The validator emits issues with a `code`, a `severity`, a `message`, and
optional `file` / `entityRef` / `suggestion` fields. This page lists every
code in issue-emission order.

Source of truth: `packages/core/src/validator/{types,schema,refs,semantic}.ts`.
When this page disagrees with the code, the code wins. Rule summaries are
maintained manually on release; a future task will auto-generate them
from rule-doc JSDoc blocks ([backlog item](https://github.com/pizza-doc/pizza-doc/blob/main/docs/backlog.md)).

## Summary

| Code | Severity | Pass |
| --- | --- | --- |
| `YAML_PARSE_ERROR` | error | 0 |
| `FILE_UNRECOGNIZED` | error | 0 |
| `SCHEMA_UNKNOWN_FIELD` | error | 1 |
| `SCHEMA_MISSING_REQUIRED` | error | 1 |
| `SCHEMA_WRONG_TYPE` | error | 1 |
| `SCHEMA_INVALID_VALUE` | error | 1 |
| `SCHEMA_INVALID_ID` | error | 1 |
| `SCHEMA_INVALID_REF_PATTERN` | error | 1 |
| `SCHEMA_UNKNOWN_MODULE_TYPE` | error | 1 |
| `SCHEMA_UNKNOWN_MODEL_KIND` | error | 1 |
| `SCHEMA_UNKNOWN_COMPONENT_TYPE` | error | 1 |
| `SCHEMA_FILENAME_ID_MISMATCH` | error | 1 |
| `REF_BROKEN` | error | 2 |
| `REF_WRONG_KIND` | error | 2 |
| `USECASE_NO_STEPS` | error | 3.1 |
| `USECASE_STEP_CHAIN_DISCONTINUITY` | warning / info | 3.1 |
| `USECASE_FIRST_STEP_NOT_FROM_FRONTEND` | warning | 3.1 |
| `USECASE_LAST_STEP_NOT_TERMINAL` | warning | 3.1 |
| `DTO_FLOW_VIA_TYPE_MISMATCH` | warning | 3.2 |
| `HTTP_STEP_TARGET_NOT_CONTROLLER` | error | 3.2 |
| `SQL_STEP_TARGET_NOT_DATABASE` | error | 3.2 |
| `DATAFLOW_SOURCE_FIELD_MISSING` | error | 3.3 |
| `DATAFLOW_TARGET_FIELD_MISSING` | error | 3.3 |
| `DATAFLOW_TYPE_INCOMPATIBLE` | warning | 3.3 |
| `DATAFLOW_TRANSFORM_MISSING` | warning | 3.3 |
| `DATAFLOW_UNUSED_DTO_FIELD` | warning | 3.3 |
| `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN` | error | 3.3 |
| `DUPLICATE_ID` | error | 3.4 |
| `CYCLIC_CALLS` | warning | 3.4 |
| `ACTOR_UNUSED` | warning | 3.4 |
| `COMPONENT_UNUSED` | warning | 3.4 |
| `DTO_UNUSED` | warning | 3.4 |
| `MODEL_FIELD_MISSING_COLUMN` | warning | 3.5 |
| `FK_COLUMN_MISSING` | error | 3.5 |

## Pass 0 — parse-level

### `YAML_PARSE_ERROR`
**Severity:** error

The file couldn't be parsed as YAML. The `yaml` library's error is
surfaced verbatim along with the offending line/column.

### `FILE_UNRECOGNIZED`
**Severity:** error

The file sits under a directory Pizza Doc scans but doesn't match any
known entity shape (missing `kind:`, or a `kind:` value the loader
doesn't recognise).

## Pass 1 — schema

All pass-1 codes are errors. Raised when the Zod schema for the entity
kind rejects the data.

### `SCHEMA_UNKNOWN_FIELD`
Extra field present that isn't in the schema. Schemas are `.strict()` so
typos can't slip through silently.

### `SCHEMA_MISSING_REQUIRED`
A required field is absent.

### `SCHEMA_WRONG_TYPE`
Type mismatch — e.g. `fields` present but not an array.

### `SCHEMA_INVALID_VALUE`
Catch-all for custom Zod `.refine()` violations and malformed strings.

### `SCHEMA_INVALID_ID`
An `id` field doesn't match `[a-zA-Z][a-zA-Z0-9_-]*`.

### `SCHEMA_INVALID_REF_PATTERN`
A ref URI doesn't match the grammar
`(module|usecase|actor):[a-zA-Z0-9_\-/:]+`.

### `SCHEMA_UNKNOWN_MODULE_TYPE`
`module.type` isn't one of `frontend | service | database | queue | external`.

### `SCHEMA_UNKNOWN_MODEL_KIND`
`model.modelKind` isn't one of `dto | entity | value-object | event`.

### `SCHEMA_UNKNOWN_COMPONENT_TYPE`
`component.type` isn't one of `controller | service | repository | infrastructure | page | widget | client | job`.

### `SCHEMA_FILENAME_ID_MISMATCH`
The file's on-disk name doesn't match the `id` field inside. If you
rename one, rename the other.

## Pass 2 — refs

### `REF_BROKEN`
**Severity:** error

A ref URI doesn't resolve to any indexed entity. The issue carries a
did-you-mean suggestion sourced from the closest Levenshtein match in
the ref index.

### `REF_WRONG_KIND`
**Severity:** error

A ref resolves but to the wrong kind for where it appears. Example: a
`method.calls` entry pointing at a table.

## Pass 3.1 — use case coherence

### `USECASE_NO_STEPS`
**Severity:** error

Use case has zero steps. A use case is a flow; no flow means no use case.

### `USECASE_STEP_CHAIN_DISCONTINUITY`
**Severity:** warning — or info when the preceding step ends at a
terminal (table / external module / frontend component). Some flows
legitimately branch or return; Pizza Doc can't always tell from the
YAML, so the rule softens severity when a terminal is reached.

Step N's `to` should equal step N+1's `from`.

### `USECASE_FIRST_STEP_NOT_FROM_FRONTEND`
**Severity:** warning

The first step should originate in a component belonging to a module
of `type: frontend`. Cron jobs and external-system triggers are
legitimate exceptions, hence warning rather than error.

### `USECASE_LAST_STEP_NOT_TERMINAL`
**Severity:** warning

The last step's `to` should be a terminal — a table, a component in an
external module, or a frontend component (the response round-trip).

## Pass 3.2 — DTO flow consistency

### `DTO_FLOW_VIA_TYPE_MISMATCH`
**Severity:** warning

A step carries `via: <DTO ref>` but the target method's first parameter
isn't that DTO. Either fix the DTO or fix the method signature.

### `HTTP_STEP_TARGET_NOT_CONTROLLER`
**Severity:** error

A step with `protocol: http` targets a component whose `type` isn't
`controller`. HTTP crossings should terminate at a controller.

### `SQL_STEP_TARGET_NOT_DATABASE`
**Severity:** error

A step with `protocol: sql` doesn't target a table. SQL should end at a
table entity in a `type: database` module.

## Pass 3.3 — data flow

### `DATAFLOW_SOURCE_FIELD_MISSING`
**Severity:** error

`sourceField` references a DTO or model that exists but a field that
doesn't — or references a DTO that isn't even carried by this use case.

### `DATAFLOW_TARGET_FIELD_MISSING`
**Severity:** error

Same story on the target side: the table or model exists but the
column/field doesn't.

### `DATAFLOW_TYPE_INCOMPATIBLE`
**Severity:** warning

Source field type and target field type aren't compatible under the
validator's coercion table (`string ↔ text/varchar`, `number ↔ int/bigint`,
`boolean ↔ bool`, etc.). Declare a `transform:` to acknowledge the cast.

### `DATAFLOW_TRANSFORM_MISSING`
**Severity:** warning

Types differ and no `transform:` note is declared.

### `DATAFLOW_UNUSED_DTO_FIELD`
**Severity:** warning

A DTO field that's required by the schema is not referenced anywhere in
the dataFlow entries, method params, or transform strings. Either wire
it up, mark it optional, or drop it.

Use `computed: server`, `computed: client`, or `computed: db` on fields
that are populated outside the explicit request payload.

### `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN`
**Severity:** error

A step ends at a table (i.e. the use case writes a row) but some
required, non-null, non-default column isn't covered by any `dataFlow`
entry.

Use `default` on the column for DB-side defaults (`DEFAULT now()` on
timestamps, `DEFAULT false` on flags).

## Pass 3.4 — structural hygiene

### `DUPLICATE_ID`
**Severity:** error

Two entities of the same kind inside the same parent have the same
`id`. IDs are unique per parent-kind bucket.

### `CYCLIC_CALLS`
**Severity:** warning

A cycle exists in the `method.calls` graph. The message lists the cycle
members. Legitimate cycles (bidirectional services) are rare; most are
drift.

### `ACTOR_UNUSED`
**Severity:** warning

An actor is defined but no use case references it as its `actor:`.

### `COMPONENT_UNUSED`
**Severity:** warning

A component isn't named in any step, method call, or DTO flow. Could be
genuinely unused code; could be a gap in your use-case coverage.

The demo space leaves `OrderHistoryPage` intentionally unused to show the
warning in action — a future `view-order-history` use case will cover it.

### `DTO_UNUSED`
**Severity:** warning

A DTO model isn't carried by any step, isn't a method parameter type,
and isn't referenced in any data flow.

## Pass 3.5 — cross-module consistency

### `MODEL_FIELD_MISSING_COLUMN`
**Severity:** warning

A `modelKind: entity` model declares `persistedAs: <table ref>` but one
of its fields has no corresponding column (by name match) in the table.

### `FK_COLUMN_MISSING`
**Severity:** error

A column's `foreignKey.column` doesn't exist on the referenced
foreignKey table.

## Adding a rule

See [CONTRIBUTING.md → adding a validation rule](https://github.com/pizza-doc/pizza-doc/blob/main/CONTRIBUTING.md#adding-a-validation-rule).
