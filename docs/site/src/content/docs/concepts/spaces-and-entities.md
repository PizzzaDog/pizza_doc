---
title: Spaces and entities
description: The mental model — what a space is, what entities live inside it, and how they reference each other.
---

A **space** is a directory. Everything inside it — actors, modules, use
cases — is a Pizza Doc **entity**. Entities reference each other by **ref
URIs**. That's the whole model.

## Directory layout

```
<space-id>/
├── space.yaml                # meta: id, name, description, versions
├── actors/
│   └── <actor-id>.yaml
├── modules/
│   └── <module-id>/
│       ├── module.yaml       # or inline components/models/tables
│       ├── domains/
│       │   └── <domain-id>/
│       │       ├── domain.yaml
│       │       ├── components/
│       │       ├── models/
│       │       └── tables/
│       ├── components/
│       ├── models/
│       └── tables/
└── use-cases/
    └── <usecase-id>.yaml
```

Every entity file sets `kind: <actor|module|component|model|table|usecase>`
on its top level. The loader also cross-checks that the filename matches
the `id` field — if they drift you get `SCHEMA_FILENAME_ID_MISMATCH`.

## Entity kinds

| Kind | Purpose | Required fields |
| --- | --- | --- |
| `actor` | A person or external system that initiates use cases | `id`, `name`, `type` |
| `module` | A deployable unit: frontend, service, database, queue, external API | `id`, `name`, `type` |
| `domain` | Optional sub-folder inside a module (DDD-style grouping) | `id`, `name` |
| `component` | Controller, service, repository, page, widget, client, job, infra | `id`, `name`, `type` |
| `method` | A callable on a component — params, returns, calls, throws | `name`, `returns` |
| `model` | DTO, entity, value-object, or event — has typed fields | `id`, `name`, `modelKind`, `fields` |
| `table` | A DB table — columns with SQL types, indexes, FKs | `id`, `name`, `columns` |
| `usecase` | A business flow: actor → steps → terminal | `id`, `name`, `actor`, `trigger`, `steps` |

See [YAML format](/reference/yaml-format/) for every field.

## Ref URIs

A ref URI is a slash-separated path of `kind:id` segments.

```
actor:customer
module:api-server
module:api-server/domain:orders/component:OrderController
module:api-server/domain:orders/component:OrderController/method:place
usecase:place-order
```

Top-level kinds are `actor`, `module`, `usecase`. Everything else has to
be reached through a module (optionally via a domain). The grammar is
enforced by `RefSchema` in the core package — the validator rejects
malformed refs at Pass 1 with `SCHEMA_INVALID_REF_PATTERN`.

### Why flat-with-slashes and not nested YAML?

- **Refs are greppable.** You can find every use of `component:MenuService`
  with plain ripgrep.
- **Refs are diffable.** A wholesale rename shows up as a clean rename,
  not a subtree rewrite.
- **Refs compose.** `step.from`, `step.to`, `step.via`, `method.calls`,
  `column.foreignKey.table` all use the same grammar.

## Domains

A **domain** is an optional grouping inside a module. Use it when a
single module (e.g. `api-server`) has several coherent concerns
(`auth`, `menu`, `orders`, `payments`). Components, models, and tables
can live directly under a module or under a domain.

The loader accepts both shapes; the serializer writes back whatever
shape the file was loaded from.

## Where metadata lives

- **`meta:` block** in `space.yaml` — id, name, description, versions.
- **Per-entity description** — every entity has an optional `description`
  field. The AI exporter surfaces it; the UI renders it in the inspector.
- **No hidden state.** Everything Pizza Doc knows about your system
  comes from files. There's no database, no sidecar, no cache you
  have to invalidate.

## Next

- [Use cases](/concepts/use-cases/) — steps, error flows, data flow.
- [The validation pipeline](/concepts/validation-pipeline/) — how the
  three passes chain.
