---
id: ADR-001
title: Charge Stripe synchronously inside checkout, no retry
status: accepted
date: 2026-07-03
decider: solo
---

# ADR-001 — Charge Stripe synchronously inside checkout, no retry

## Context

Checkout must decide, within one HTTP request, whether the order exists. The
alternatives were (a) synchronous charge before persist, (b) persist first +
charge asynchronously with a `pending` state, (c) an outbox/saga.

## Decision

Charge synchronously in `PaymentGateway.charge` **before** any row is
persisted, and do **not** retry a failed charge server-side.

- A decline maps to `402 STRIPE_DECLINED` (see the module `errorMapping`)
  and nothing is persisted — the invariant "no rows on decline" stays
  trivially true, no compensation logic exists.
- A network failure is treated exactly like a decline: the customer retries
  checkout. Stripe tokenised cards make the retry cheap.
- Consequence: checkout latency includes the Stripe round-trip (p99 ≈ 1.2s),
  accepted for a demo-scale shop.
- The post-commit `orders.placed` event (see `OrderPlaced`) is the only
  asynchronous leg, and it is at-least-once — consumers dedupe by `orderId`.

## Consequences

Orders are born in status `paid`; there is no `pending` state in the Order
state machine. If the shop outgrows single-request checkout, revisit with an
outbox — that supersedes this ADR rather than amending it.
