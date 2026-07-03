---
id: stripe-declines-spike
title: Stripe decline rate spikes above baseline
severity: p2
owner: solo
trigger: place-order 402 STRIPE_DECLINED responses exceed ~5% of checkout attempts for 15+ minutes
covers: [stripe-declined]
decisions: [ADR-001]
---

## Detection

- A single decline is a normal user outcome (bad card) — do nothing.
- A *spike* is the signal: watch the ratio of 402 `STRIPE_DECLINED` to
  201 responses on `POST /api/orders`. Baseline is low single digits.

## Diagnosis

1. Check the [Stripe status page](https://status.stripe.com) — a Stripe
   incident declines everything with generic codes.
2. Check `reason` in our 402 payload (mirrors Stripe's `decline_code`,
   see `wire-captures/stripe/create-charge.txt`). One dominant reason =
   systematic cause, mixed reasons = customer-side noise.
3. `expired STRIPE_API_KEY` / key rotation gone wrong shows up as 401s
   from Stripe in api-server logs, not as declines — different failure,
   see external-deps failureMode.

## Fix

- Stripe incident: nothing to fix on our side; per ADR-001 there is NO
  retry — customers see the decline and may retry manually.
- Bad key after rotation: restore `STRIPE_API_KEY` from the Stripe
  dashboard (sourceOfTruth in config-map) and redeploy api-server.

## Verification

Decline ratio returns to baseline; a test charge with the Stripe test
card `4242…` succeeds end-to-end.

## Prevention

ADR-001 deliberately keeps the charge synchronous with no retry — do
not add blind retries here (double-charge risk); revisit the ADR
instead if spikes become chronic.
