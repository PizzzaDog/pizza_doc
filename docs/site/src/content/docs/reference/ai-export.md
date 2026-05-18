---
title: AI export format
description: The flat Markdown format emitted by exportSpaceForAi() — what goes in, why, and how to consume it.
---

`exportSpaceForAi()` emits a single Markdown file per space. The format is
intentionally flat, redundant, and uses `<ref:uri>` angle brackets so an
LLM can scan for entity boundaries without misinterpreting slashes.

## Who it's for

Language models dropped into a codebase, told "make this change." Typical
flow:

```
read spec (this file) → reason about scope → read only the
source files actually implicated → apply change
```

The export isn't optimised for humans — humans have the UI. It's
optimised for models that need to reason about the whole system inside a
single context window.

## Structure

```markdown
# <space:my-space> My Space

*Pizza Doc export · generated YYYY-MM-DDTHH:MM:SSZ · pizzaDocVersion 0.1.0*

> One-paragraph description from `space.meta.description`.

## Actors

### <actor:customer> Customer
…

## Modules

### <module:api-server> API Server
**Type:** service · **Tech:** Node 20 + Fastify

**Components:** `AuthController`, `MenuController`, …
**Models:** `…`
**Tables:** `…`

#### <module:api-server/domain:orders> Orders (domain)
…
##### <…/component:OrderController> OrderController
**Type:** controller

- `POST /api/orders → placeOrder(request: PlaceOrderRequest): OrderConfirmation`
  Calls: `<…/service:OrderService>`, `…`
  Throws: `PaymentDeclined`, `OutOfStock`
…

## Use Cases

### <usecase:place-order> Customer places an order

**Actor:** `<actor:customer>`
**Trigger:** Submitting the checkout form

Description paragraph.

**Steps:**
1. `<from:…CheckoutPage>` → `<to:…orderClient>` (internal-call)
2. `<from:…orderClient>` → `<to:…OrderController>` (http, via `<model:PlaceOrderRequest>`) — POST /api/orders
…

**Data flow:**
- `PlaceOrderRequest.pizzaId` → `orders.pizza_id`
- `PlaceOrderRequest.quantity` → `orders.quantity` (transform: coerce to int)
…

**Error flows:**
- **payment-declined** when Stripe returns a decline → …

## Validation summary

- 0 errors · 2 warnings · 1 info
- `COMPONENT_UNUSED` on `<…/component:OrderHistoryPage>`
- …

## Generation hints

- Persist `orders.created_at` via DB default (`DEFAULT now()`) — not in `dataFlow`.
- `OrderService.placeOrder` is the entry point for modifications.
…
```

## Design choices

**Flat.** Every entity appears at the top of the flow that touches it,
even if that means a component is described twice. Repetition is cheap;
deep nesting that forces a model to jump around is expensive in tokens.

**Angle brackets for refs.** `<ref:thing>` is scannable both for the
model (grep-style) and for downstream tools (regex-findable). It doesn't
collide with YAML or Markdown syntax.

**Backticks for ids-in-prose.** Component and model names inside prose
are in backticks so they look like identifiers. Refs (with URI prefix)
get angle brackets.

**Include validation issues.** The exporter takes the current
`ValidationIssue[]` and emits a "Validation summary" section. That way
an agent can see "don't bother fixing X, the framework already flagged
it" instead of re-diagnosing.

**Generation hints.** A free-form section at the tail where
hand-authored guidance can live ("don't split this service without
asking"). Currently empty on exports; will be driven by an optional
`hints:` field in `space.yaml` in a later version.

## Call it programmatically

```ts
import { exportSpaceForAi, loadSpace, validate } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'

const fs = nodeFileSystem(process.cwd())
const loadResult = await loadSpace(fs, '.', 'my-space')
const { issues } = validate(loadResult)
const markdown = exportSpaceForAi(loadResult.space!, { issues })

process.stdout.write(markdown)
```

## From the UI

Top bar → **⋯ export menu** → **Export for AI**. Writes to
`exports/<YYYYMMDD-HHMMSS>-<spaceId>.md` in the space folder and copies
the contents to your clipboard.

## Scope

**v0.1 supports only whole-space export.** Per-use-case and per-domain
slices are planned for v0.2. The rationale is that cross-cutting flows
(a use case spans three modules) are where drift lives — and where
agents need the most context.
