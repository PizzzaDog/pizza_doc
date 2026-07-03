---
id: out-of-stock-orders
title: Checkout rejected with OUT_OF_STOCK
severity: p2
owner: solo
trigger: place-order returns 409 OUT_OF_STOCK for pizzas the menu still displays as available
covers: [out-of-stock]
---

## Detection

409 `OUT_OF_STOCK` on `POST /api/orders` while the same pizza renders
as orderable on `/menu`. Occasional hits are a normal race (menu was
cached, stock flipped); a steady stream means the catalog is stale.

## Diagnosis

1. Compare `pizzas.available` in the DB with what `GET /api/menu`
   returns — MenuService caches in-process, so a stale cache serves
   sold-out pizzas as available.
2. Confirm which pizzaIds the 409 payload lists and whether the admin
   recently toggled them via update-pizza.

## Fix

- Stale in-process cache: restart api-server (cache is not shared, one
  instance can lag).
- Genuinely sold-out but still displayed: have the admin set
  `available=false` via the admin flow (admin-updates-pizza use case).

## Verification

`GET /api/menu` no longer lists the pizza; a checkout containing it
returns 409 (correct) and a checkout without it returns 201.

## Prevention

Keep menu cache TTL short; the browse-menu use case documents the
caching layers involved.
