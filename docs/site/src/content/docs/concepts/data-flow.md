---
title: Data flow
description: How Pizza Doc checks that a DTO field actually ends up in the column you think it does.
---

`dataFlow` entries are how you declare that a field from a DTO ends up
written into a column somewhere down the chain. The validator's 3.3
bucket cross-checks that every claim you make is real.

## Why it matters

The most common drift in real codebases is "I added a field to the
request DTO and forgot to wire it up through to the DB." Pizza Doc's
data-flow rules make that drift visible — before code review, before
CI, before a user hits the production bug.

## The shape

Inside a use case:

```yaml
dataFlow:
  - sourceField: PlaceOrderRequest.pizzaId
    targetField: orders.pizza_id
  - sourceField: PlaceOrderRequest.quantity
    targetField: orders.quantity
  - sourceField: PlaceOrderRequest.notes
    targetField: orders.notes
    transform: trim + truncate to 500 chars
```

`sourceField` is `<DTO id>.<field name>`. `targetField` is either
`<table id>.<column name>` or `<model id>.<field name>` when the data is
flowing into an intermediate model.

A `transform` is free-text — it's a hook for the AI exporter and the UI.
The validator doesn't try to parse it.

## The rules

### `DATAFLOW_SOURCE_FIELD_MISSING`

You wrote `PlaceOrderRequest.pizaId` (typo). There's no `pizaId` on
`PlaceOrderRequest`.

### `DATAFLOW_TARGET_FIELD_MISSING`

You wrote `orders.piza_id`. Same story on the table side.

### `DATAFLOW_TYPE_INCOMPATIBLE`

Source field is `string`, target column is `integer`. The validator's
compatibility table covers the common cases — string→varchar, number→int,
boolean→bool, and so on. If types are genuinely different, declare a
`transform:` to acknowledge it.

### `DATAFLOW_TRANSFORM_MISSING`

Types differ and no `transform:` is declared. Warning: add a transform
note describing the coercion.

### `DATAFLOW_UNUSED_DTO_FIELD`

The use case carries `PlaceOrderRequest` (as a step `via:`), but one of
its required fields isn't referenced in any `dataFlow` entry, method
param, or transform string. Either wire it up or remove it from the DTO.

### `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN`

A step ends at table `orders` — presumably writing a row — but the
dataFlow entries don't cover every required non-null column without a
default. Either add the missing entries or mark the column as having a
`default`.

Use `default` on the column for DB-side defaults (`DEFAULT now()`,
`DEFAULT false`) so this rule does not require application dataFlow for
values the database fills in.

## Working with the rules

The point of these rules isn't to punish you — it's to catch the thing
you would have missed on a Friday. Treat them like a well-tuned linter:
if the rule is wrong more than it's right, that's a validator bug worth
filing. If it's right more than half the time, live with the false
positive and move on.

Pragma-style suppressions (`# pizza-doc-ignore: RULE_CODE`) are not yet
supported; we'd rather tune rule fidelity before adding escapes.

## Next

- [Validation rules](/reference/validation-rules/) — every rule with
  exact conditions.
- [Use cases](/concepts/use-cases/) — how dataFlow fits inside the
  use-case anatomy.
