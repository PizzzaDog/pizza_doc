---
name: pd-author
description: >-
  Design a Pizza Doc space from scratch, before any code exists. Use when
  the user wants to spec a new service / feature / product — "let's design
  X", "let me describe what we want to build". Top-down flow: actors →
  use cases → models → tables. The opposite direction of pd-scanner.
---

# pd-author — design-first space authoring

Guide the user through designing a **new** service / product **before**
a line of implementation code is written. Output is a validated space that
serves as the implementation spec.

> **Layouts.** Examples below use `spaces/<id>/` (multi-space, what this
> dev repo uses for `pizza-shop-demo` etc.). For a user project on the new
> default `.pizza-doc/` layout, drop the path arg — `pd <cmd>` auto-detects
> from cwd. `pd init <id>` makes `.pizza-doc/`; pass `--multi` to get
> `spaces/<id>/` instead.

## When to use

User says:
- "давай спроектируем новый сервис / фичу X"
- "I want to design an app that does …"
- "how would we model a …"
- "spec-first please"

**Not** for existing code — that's `pd-scanner`.

## Core difference from pd-scanner

Scanner goes **bottom-up** (tables first — they're "known"). Author goes
**top-down**: start from the user, write the use cases, then derive the
models / tables / components needed to support them. Early steps are
conversations, not YAML.

## Algorithm

### Step 1 — Elicit the product (conversation, no files yet)

Ask the user, in this order:

1. **What does it do, in one sentence?** Write it down — this becomes
   `meta.description`.
2. **Who uses it?** List the actors. Push back if there are >5 — that's
   a sign of undergrouped roles.
3. **What's the one action that has to work on day one?** This is the
   golden-path use case. If they give you three, still pick one to go
   first.
4. **What data does that action touch?** Rough bullets. Becomes the seed
   for the first DTO(s) and table(s).
5. **Does it persist? Does it call external APIs? Does it fan out to a
   queue?** Informs module-type choices.

**Do not write YAML until the user has answered all five.** Otherwise
you'll be restructuring on every reply.

### Step 2 — Scaffold the skeleton

```bash
pnpm pd init <space-id>
pnpm pd add actor <id> --type user|system|scheduler
pnpm pd add module <id> --type service|frontend|database|queue|external
```

Ballpark: 1 frontend, 1 service, 1 database. Add external/queue modules
as needed. Domains only if >8 components are likely — skip for now.

### Step 3 — Write the golden-path use case FIRST

Unlike the scanner. Here the use case is the **driver**: everything else
exists to serve it.

Write the steps in plain English in your head:
1. User does X on screen Y.
2. Frontend calls backend endpoint Z with payload W.
3. Backend validates, queries DB, maybe calls an external API.
4. DB writes / reads.
5. Response flows back to the user.

**Before putting this in YAML**, ask: "what components do these steps
imply?" List them:
- `LoginPage` (frontend)
- `apiClient` (frontend)
- `AuthController` + method `login` (backend)
- `AuthService.login` (backend)
- `UserRepository.findByEmail` (backend)
- `users` table (database)

### Step 4 — Scaffold those components (stubs)

```bash
pnpm pd add component <id> --type <t> --module <m>
pnpm pd add component <id> --type <t> --module <m> --domain <d>
```

Keep methods minimal at first — just names + rough return types. Refine
after the use case is drafted.

### Step 5 — Models for each DTO / entity the use case touches

```bash
pnpm pd add model <id> --module <m> --kind dto
pnpm pd add model <id> --module <m> --kind entity
```

For each DTO: list fields with types + optional `validation:` (format,
min/max, pattern). Put the validation rules **now** — they're cheap to
write and hugely valuable when implementation happens.

Keep `modelKind: dto` for request/response payloads and
`modelKind: entity` when there's a `persistedAs:` table. `event` for
queue messages. `value-object` for things like `CurrentUser`.

### Step 6 — Tables for each entity

```bash
pnpm pd add table <id> --module <db-module> --domain <d>
```

Edit the generated YAML: one column per field + the DB-boilerplate
(`id uuid pk default gen_random_uuid()`, `created_at timestamptz default
now()`, etc.). Use `default:` to signal DB-filled columns.

**For NOT NULL columns without defaults that you'll write from the DTO:**
add a `dataFlow` entry in the use case (Step 7) linking source field to
column. Otherwise `DATAFLOW_UNWRITTEN_REQUIRED_COLUMN` will fire.

### Step 7 — Finalize the use case

Now write out the use case YAML:

```yaml
kind: usecase
id: <slug>
name: <human-readable>
actor: actor:<id>
trigger: <what user action>
description: One paragraph.
steps:
  - from: ...
    to: ...
    via: ...
    protocol: http | http-response | internal-call | sql | event | external-api
    description: <optional, e.g. HTTP method + path for http steps>
errorFlows:
  - id: <slug>
    condition: <business-level>
    steps: [...]
    resultDescription: "HTTP 4xx ..."
invariants:
  pre:  [...]
  post: [...]
dataFlow:
  - sourceField: <Model>.<field>
    targetField: <table>.<column>
    transform: <optional, human-readable>
    cardinality: one | many     # many = fan-out, one DTO field → N rows
```

### Step 8 — Validate early

```bash
pnpm pd validate spaces/<id>
```

Expect errors — you'll likely have typos and missing stubs. Fix them
**before** moving to the next use case.

### Step 9 — Next use cases

For each subsequent use case, ask the user:
- "What actor does this?"
- "What's the trigger?"
- "What happens end-to-end?"

Then: reuse existing components/models wherever possible. Only add new
ones when the use case genuinely requires them.

### Step 10 — Completeness gates

Before declaring done:

```bash
pnpm pd validate spaces/<id>
pnpm pd coverage spaces/<id>
pnpm pd orphans spaces/<id>
pnpm pd endpoints spaces/<id> --orphans
```

For a design-first space, the goal is:
- **coverage: 100%.** You built everything to serve a use case, so
  everything should be referenced.
- **orphans: 0.** If you have unused components/models, they're over-design
  — delete or find the missing use case.

### Step 11 — Handoff

Summary for the user:
- "We designed N use cases spanning M actors and K modules."
- "Every endpoint has a covering use case."
- "Here's the implementation brief: open `spaces/<id>` in the web UI or
  read `pnpm pd … --help` for trace commands."

Point them to `pd-implementer` for "now please code this up".

## Conversation discipline

- **Push back on scope.** "Let's add OAuth, MFA, social login, password
  reset all now" → "pick one. We can add the rest as separate use cases
  once the first is solid."
- **Say no to modelling internal helpers as components.** "Do I add a
  `PasswordHasher` component?" → "no. Add it to `AuthService.register`'s
  description. Component = something another component calls by name."
- **Say no to premature validation rules.** Schema-level validation
  (email format, min length) is good; business validation like "password
  must match previous 4 passwords" goes in invariants.

## Failure modes

- **Designing the schema before the use case.** The use case is the
  product. Tables exist to serve it. Reversed order = YAGNI.
- **Writing one use case with 12 steps and 3 error flows.** Split.
- **Over-specification — every button, every CRUD combo.** Design the
  essential flows. `pd coverage` will tell you later if you forgot
  anything important.
- **Not writing the first use case in YAML because it feels incomplete.**
  Commit a first pass, validate, iterate. Perfect is the enemy of a
  passing `pd validate`.

## What you don't do

- Don't generate actual code. That's `pd-implementer`.
- Don't scan existing code. That's `pd-scanner`.
- Don't invent schema fields not in `packages/core/src/schema.ts`.

## v0.2 contract extensions — capture during design

Design-first's biggest lever: capture these **now**, at the whiteboard
stage. They're near-free to write and hugely expensive to recover if
the code ships without them.

### `Field.validation`

When you write a DTO field, ask the user its constraints. Rough list:
- string → format (email / uri / uuid / phone) + minLength/maxLength
- number → min/max
- strings that are identifiers → pattern (slug, subdomain, handle)

Put them under `validation:`. See `ValidationSchema` in
`packages/core/src/schema.ts` for the exact shape.

### `Model.stateMachine`

When the user describes an entity with a lifecycle ("order is created,
then sent, then delivered or cancelled…"), lift it into
`stateMachine:` on the entity model right then. States, transitions,
terminal, initial. The validator rule `STATE_MACHINE_INCOHERENT` will
catch any mismatch between `states` and `transitions`.

### `Module.errorMapping`

For each service module, ask: "what exceptions do you throw, and what
HTTP status codes do clients see?" Canonical answers:
- `EntityNotFoundException → 404`
- `InvalidStateException → 409`
- `ForbiddenException → 403`
- domain-specific `PaymentDeclined → 402`

Emit under `errorMapping:` on the module yaml.

### `UseCase.requires`

For each use case, ask: "what role / tenant / flag is needed?" Emit
under `requires:`. This is the permission matrix the implementer will
turn into guards.

### `Model.topic` (event-kind)

When a use case ends in `protocol: event`, note the event's DTO
(modelKind: event) and put the `topic:` on it. E.g.
`order-created-events`, `user-registered-events`.

### `sourceRef`

Don't bother in design mode — the file doesn't exist yet. The
implementer populates it after the first codegen run.
