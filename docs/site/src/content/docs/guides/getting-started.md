---
title: Getting started
description: Install Pizza Doc, run the UI, and load the demo space.
---

Three commands get you from clone to running UI.

## Prerequisites

- **Node 20+.** Use `nvm` if you can — the repo has an `.nvmrc`.
- **pnpm 10+.** `corepack enable && corepack prepare pnpm@10 --activate`
  is the safest path.
- **A Chromium-based browser.** The UI uses the
  [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
  which Firefox and Safari don't implement yet. Chrome, Edge, Brave,
  Arc, Opera all work.

## Install and boot

```bash
git clone https://github.com/pizza-doc/pizza-doc.git
cd pizza-doc
pnpm install
pnpm build
pnpm --filter @pizza-doc/web dev
```

Vite will print a URL — open it. You'll see the space picker.

## Load the demo

1. Click **Pick a folder**.
2. Choose the `spaces/` directory inside the repo.
3. Grant read/write access when the browser asks.
4. Pick `pizza-shop-demo` from the list.

You should see:

- The left **sidebar** with actors (3), modules (4), and use cases (5).
- A green **"All clear"** badge in the top bar (or a few info-level
  warnings — the demo is tuned to demonstrate a couple on purpose).
- The top bar with a breadcrumb, theme toggle, export menu, and `?`
  button.

## Click around

- **Click a use case in the sidebar** — e.g. `place-order` — to open the
  graph canvas. Steps render left-to-right; click a node to open it in
  the inspector.
- **Click an entity** (module, component, model, table) to open its
  detail view.
- **Press ⌘K** to open the command palette. Type a few letters — every
  entity is fuzzy-searchable by name, ref, or description.
- **Press `?`** for the full keyboard cheat sheet.

## Export something

In the top-bar **⋯ export menu**:

- **Export for AI** writes `exports/<timestamp>-<spaceId>.md` into the
  space folder and copies it to your clipboard.
- **Export as ZIP** bundles the whole space folder and triggers a
  browser download.

## Next

- [Your first space](/guides/your-first-space/) — hand-author a space
  from scratch.
- [YAML format reference](/reference/yaml-format/) — every field on every
  entity.

## If something goes wrong

- **"The File System Access API isn't supported."** Switch to a
  Chromium-based browser.
- **"Failed to load space: no space.yaml"** — you picked the space
  folder instead of its parent. Go up one level.
- **Build fails complaining about `@pizza-doc/core/dist`.** Run
  `pnpm --filter @pizza-doc/core build` once; web imports core's built
  output.
- **Biome or TypeScript red on `main`.** Open an issue — that's a bug.
