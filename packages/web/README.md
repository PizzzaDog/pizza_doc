# @pizza-doc/web

The Pizza Doc UI. Vite + React 18 + TypeScript, talking to your filesystem
through the File System Access API. No backend.

## Run locally

```bash
# from the repo root
pnpm install
pnpm --filter @pizza-doc/core build   # web imports the built core
pnpm --filter @pizza-doc/web dev
```

Open the URL Vite prints and click **Pick a folder** → select `spaces/`
(or any directory containing Pizza Doc spaces).

## Browser support

Requires the **File System Access API**: Chrome, Edge, Opera, and
Chromium-based browsers. Firefox and Safari don't implement it yet and
show a capability-gate screen. A Tauri desktop wrapper for those platforms
is in the backlog.

## What's where

```
src/
├── components/ui/          # shadcn primitives (Button, Dialog, Sheet, …)
├── fs/                     # FileSystem implementation over the browser API
├── lib/                    # tiny utilities (theme, entity-ref, zip-export,
│                           #   undo-stack, file-watcher, issue-index)
├── routes/                 # TanStack Router code-based routes
│   ├── Root.tsx            # top-level layout + Toaster
│   ├── Home.tsx            # space picker
│   ├── SpaceLayout.tsx     # 3-column shell + all global shortcuts
│   ├── EntityRoute.tsx     # /space/$id/entity/$refPath
│   └── UseCaseRoute.tsx    # /space/$id/usecase/$useCaseId
├── store/
│   └── space.ts            # Zustand store: load, watch, save, undo/redo
├── views/
│   ├── chrome/             # TopBar, HelpModal, ValidationBadge, ExportMenu,
│   │                       #   ThemeToggle, IssuesList
│   ├── sidebar/            # tree, keyboard nav, context menu
│   ├── entity/             # read-only detail views per entity kind
│   ├── inspector/          # right panel: Details / Edit / YAML tabs
│   ├── palette/            # ⌘K command palette (cmdk)
│   └── usecase/            # React Flow + elk.js graph canvas
├── main.tsx                # app entry
├── router.tsx              # route tree
└── styles.css              # Tailwind + page-11 CSS palette
```

## Architecture at a glance

- **Local-first.** The Zustand store is the single source of UI truth.
  Picking a folder yields a `FileSystemDirectoryHandle`; a `browserFileSystem()`
  wrapper adapts it to the `FileSystem` interface from `@pizza-doc/core`.
- **Strict-TS.** `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`.
  Optional props are typed `T | undefined` explicitly.
- **Router.** TanStack Router with code-based routes nested under
  `/space/$spaceId`.
- **Store.** One Zustand store owns loaded space, validation issues, panel
  state, theme, palette/help/issues open state, undo/redo stack, and a
  file-watcher handle.
- **Undo/redo.** Snapshots the whole space + source map per edit, capped at
  50 history entries. External disk edits clear the redo stack.
- **File watcher.** Polls `fs.mtime` every 2s; reloads on drift.
  `markOwnWrite(path, mtime)` suppresses re-reads of writes we just did.
- **Canvas.** React Flow 12 for interaction, elk.js for layout. Steps render
  as a Sankey-ish left-to-right graph; error flows are a separate channel.
- **Inspector.** Three tabs — Details (read-only render), Edit
  (react-hook-form + Zod resolver, autosave on valid blur), YAML (Monaco,
  read-only, syntax-highlighted).
- **Palette.** cmdk-powered ⌘K with fuzzy search over every entity plus
  shipped actions for validation, export, reload, theme, panels, and help.

## Build output

```bash
pnpm --filter @pizza-doc/web build
# → packages/web/dist/   static bundle, deploy anywhere
```

The release workflow publishes this bundle to GitHub Pages on every tagged
release. See [`.github/workflows/release.yml`](../../.github/workflows/release.yml).

## Design tokens

See `src/styles.css` and `tailwind.config.ts`. The palette is dark by
default with a `:root.light` override; `ThemeToggle` swaps classes on
`<html>`. All custom colour tokens (`bg-primary`, `fg-tertiary`,
`accent-muted`, etc.) are CSS variables so switching themes is free.

## Keyboard map

Press `?` anywhere for the live cheat sheet. Summary:

| Key | Action |
| --- | --- |
| ⌘K | Command palette |
| ⌘B | Toggle sidebar |
| ⌘I | Toggle inspector |
| ⌘E | Inspector → Edit tab |
| ⌘/ | Inspector → YAML tab |
| ⌘S | Toast "Pizza Doc auto-saves" (Monaco still gets the event) |
| ⌘Z / ⌘⇧Z | Undo / redo |
| 1–9 | Jump to step N on the use-case canvas |
| F | Fit view |
| Esc | Close overlay / clear canvas selection |
| ? | Open help modal |

## License

MIT.
