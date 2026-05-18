---
title: Your first space
description: Hand-author a minimal Pizza Doc space from an empty directory.
---

This guide walks through authoring a tiny space by hand — three files, one
module, one use case — so you understand what Pizza Doc is reading. Once
you've got a feel for it, the demo space (`spaces/pizza-shop-demo/`) is a
much richer reference.

## 1. Make the directory

The fast path is `pd init my-first` (creates `.pizza-doc/space.yaml` and
sibling folders for you), but to see the bones we'll do it by hand:

```bash
mkdir -p my-first/{actors,modules/app,use-cases}
cd my-first
```

The path `my-first/` is just for this tutorial. The real defaults:

- single-space: `<your-repo>/.pizza-doc/` (what `pd init <id>` makes)
- multi-space: `<your-repo>/spaces/<id>/` (`pd init <id> --multi`)

## 2. `space.yaml` — the meta file

Every space starts with a `space.yaml` at its root.

```yaml
# my-first/space.yaml
meta:
  id: my-first
  name: My First Space
  description: A one-module, one-use-case space.
  version: 0.1.0
  pizzaDocVersion: 0.1.0
```

## 3. Add an actor

```yaml
# my-first/actors/user.yaml
kind: actor
id: user
name: End user
type: user
description: The person clicking buttons in the app.
```

Filename and `id` have to match. The classifier keys off both.

## 4. Add a module with one component

```yaml
# my-first/modules/app/module.yaml
kind: module
id: app
name: App
type: frontend
components:
  - kind: component
    id: HomePage
    name: HomePage
    type: page
    methods: []
```

Components can also live in their own file under
`modules/app/components/HomePage.yaml` — the loader accepts both shapes.
For a one-component module, inline is fine.

## 5. Add a use case

```yaml
# my-first/use-cases/view-home.yaml
kind: usecase
id: view-home
name: User views home page
actor: actor:user
trigger: Navigating to /
steps:
  - from: module:app/component:HomePage
    to: module:app/component:HomePage
    protocol: internal-call
    description: Renders the welcome text.
```

The `actor:` and `module:…/component:…` URIs are **refs**. The validator
resolves them against the indexed entities and complains if any point
at nothing.

## 6. Load it in the UI

Start the dev server:

```bash
pnpm --filter @pizza-doc/web dev
```

Pick the **parent** of `my-first` (e.g. wherever you created it), and
choose `my-first` in the space list.

You should see:

- One actor, one module (with one component), one use case.
- A validation badge that says "All clear" — or, if you mistyped a ref,
  a warning with a quick-navigate link to the offending file.

## 7. Break something on purpose

Open the use-case YAML and change `actor: actor:user` → `actor:
actor:someone-else`. Save.

The file watcher reloads the space within 2s. The validation badge
turns red:

> **REF_BROKEN** `Use case 'view-home' references 'actor:someone-else'
> which does not exist.`

Click the badge to see the issue details, then fix it.

## 8. Iterate

- Add a second component and a `calls:` entry on the first to wire them
  up. The validator will enforce that the callee actually exists.
- Add a table and a repository component. Set `protocol: sql` on the
  step from repo to table.
- Add a DTO `model` with `kind: 'model'` and list it as `via:` on a
  step. The validator checks that the target method's first parameter
  is that DTO.

For the full field reference, see
[YAML format](/reference/yaml-format/).

## Next

- [The validation pipeline](/concepts/validation-pipeline/) — how the
  three passes chain.
- [Validation rules](/reference/validation-rules/) — every issue the
  validator can emit, with examples.
