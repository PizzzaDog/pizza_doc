---
title: Use cases
description: How a use case strings together steps, error flows, and data flow into one canonical view of a business operation.
---

A **use case** is the unit of Pizza Doc's "let me see what happens when
…" story. One use case = one actor + one trigger + an ordered chain of
steps that ends at a terminal (a DB table, an external system, or a
frontend response).

## Anatomy

```yaml
kind: usecase
id: place-order
name: Customer places an order
actor: actor:customer
trigger: Submitting the checkout form
description: The end-to-end order flow — cart → payment → DB write.
invariants:
  pre:
    - Customer is authenticated
    - Cart has at least one item
  post:
    - An `orders` row exists
    - Stripe has been charged
steps:
  - from: module:web-frontend/component:CheckoutPage
    to: module:web-frontend/component:orderClient
    protocol: internal-call
  - from: module:web-frontend/component:orderClient
    to: module:api-server/domain:orders/component:OrderController
    protocol: http
    via: module:api-server/domain:orders/model:PlaceOrderRequest
    description: POST /api/orders
  - from: module:api-server/domain:orders/component:OrderController
    to: module:api-server/domain:orders/component:OrderService
    protocol: internal-call
  # … more steps …
errorFlows:
  - id: payment-declined
    condition: Stripe returns a decline
    steps:
      - from: module:api-server/domain:payments/component:StripeClient
        to: module:api-server/domain:orders/component:OrderService
        protocol: internal-call
    resultDescription: User sees "card declined" with retry option.
dataFlow:
  - sourceField: PlaceOrderRequest.pizzaId
    targetField: orders.pizza_id
  - sourceField: PlaceOrderRequest.quantity
    targetField: orders.quantity
```

## Steps

Each step is an edge: from one component to another, with a **protocol**.

| Protocol | Meaning | What the validator checks |
| --- | --- | --- |
| `internal-call` | Direct function call inside a process | Nothing special |
| `http` | HTTP request crossing a module boundary | Target must be a `controller` component |
| `sql` | Database operation | Target must be a `table` |
| `event` | Pub/sub or queue | No target restriction |
| `external-api` | Call to a module with `type: external` | Target must be in an external module |

A step can carry a **`via:`** ref pointing at a DTO (`model`) that is
passed along the edge. When present, the DTO's type must match the
target method's first parameter — see the
[`DTO_FLOW_VIA_TYPE_MISMATCH`](/reference/validation-rules/#dto_flow_via_type_mismatch)
rule.

## Chain continuity

Steps form a chain. The validator enforces:

- **USECASE_NO_STEPS** — a use case with zero steps is an error.
- **USECASE_FIRST_STEP_NOT_FROM_FRONTEND** — the first step should
  originate in a frontend component (warning; sometimes you want a
  cron trigger).
- **USECASE_STEP_CHAIN_DISCONTINUITY** — step N's `to` should equal
  step N+1's `from`. Warning when it breaks — except when step N ends at
  a terminal, in which case it's info-level (the chain is legitimately
  branching or has returned).
- **USECASE_LAST_STEP_NOT_TERMINAL** — the final `to` should be a DB
  table, an external module's component, or a frontend component
  (signalling the response round-trip). Warning.

## Error flows

An `errorFlow` is a named branch — its own step chain that peels off
the main flow under a stated `condition`. It reuses the same step
grammar but is visualised separately on the canvas so the happy path
stays legible.

## Data flow

`dataFlow` is where you declare that a field from a DTO or model ends
up written into a column. The validator cross-checks that:

- The `sourceField` exists on one of the DTOs carried by the use case
  (or on a model the flow touches).
- The `targetField` exists on a column (or on a model field).
- Types are compatible — or if not, a `transform` is declared.
- Every required non-null column without a `default` that ends up written
  to has a `dataFlow` entry pointing at it.
- Every field of every DTO carried by the flow is referenced somewhere
  (otherwise it's noise).

See the [data-flow deep dive](/concepts/data-flow/) for the full rule set.

## Use case coherence

The validator's 3.1 bucket is specifically about making sure every use
case tells a complete, non-contradictory story — continuous chain,
plausible first step, terminal ending. The rules are warnings, not
errors: most real codebases have a few legitimate exceptions.

## Next

- [Data flow](/concepts/data-flow/) — the dataFlow rules in detail.
- [Validation pipeline](/concepts/validation-pipeline/) — how the passes
  chain.
- [YAML format: use cases](/reference/yaml-format/#usecase) — every field.
