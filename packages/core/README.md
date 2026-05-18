# @pizza-doc/core

Schemas, loader, validator, serializer, and AI exporter for Pizza Doc. Pure
TypeScript, no filesystem dependencies in the default entry (a Node-specific
helper is available from the `/node-io` subpath).

## Install

For a published package:

```bash
pnpm add @pizza-doc/core zod
```

Inside this monorepo, depend on the workspace package:

```json
"dependencies": {
  "@pizza-doc/core": "workspace:*",
  "zod": "^3.23.8"
}
```

## What's in it

### Schemas (`schema.ts`)

Zod schemas for every entity kind, exported both as values (so you can
`.parse` runtime data) and as inferred types. The shapes are the single
source of truth — the loader, validator, and serializer all work off them.

```ts
import { SpaceSchema, UseCaseSchema, type Space, type UseCase } from '@pizza-doc/core'
```

Top-level shapes: `Actor`, `Module`, `Domain`, `Component`, `Method`,
`Model`, `Table`, `UseCase`, `SpaceMeta`, `Space`.

### Loader (`loader.ts`)

```ts
import { loadSpace } from '@pizza-doc/core'

const result = await loadSpace(fs, '.', spaceId)
// → { space, files, issues }
```

Walks the `<spaceId>/` directory via a pluggable `FileSystem` abstraction,
classifies each file (actor, module, domain, component, model, table,
use case), parses YAML, and runs Pass 1 (Zod). Returns:

- `space` — the assembled `Space` tree, or `null` if fatal schema errors
  prevented assembly.
- `files` — map of `path → { source, data, role }`. The UI uses the
  source strings to preserve comments on round-trip and to drive the
  YAML tab in the inspector.
- `issues` — Pass 0 (YAML parse) and Pass 1 (schema) issues.

The `FileSystem` interface lives in `fs.ts`:

```ts
interface FileSystem {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  listDir(path: string): Promise<DirEntry[]>
  exists(path: string): Promise<boolean>
  mtime(path: string): Promise<number | null>
}
```

The web package implements it over the File System Access API. A Node
`fs.promises` implementation lives on the `/node-io` subpath so the main
entry stays browser-clean.

### Validator (`validator/`)

Three-pass pipeline. Each pass runs only if the previous one was clean of
errors — schema issues stop refs, refs stop semantic.

```ts
import { validate } from '@pizza-doc/core'

const result = validate(loadResult)
// → { issues, passes: { schema, refs, semantic } }
```

**Pass 1 — Schema.** Zod validates every file against its entity schema.
Also: filename ↔ `id` cross-check.

**Pass 2 — Refs.** Every `module:…/domain:…/component:…` style URI in the
space must resolve to an indexed entity, and the kind of the target must
match what the context expects.

**Pass 3 — Semantic.** 25+ rules across five buckets:

- **Use case coherence** — step chain continuity, first-step-from-frontend,
  last-step-terminal.
- **DTO flow consistency** — `step.via` type matches the target method's
  parameter, `protocol: http` targets controllers, `protocol: sql` targets
  tables.
- **Data flow** — source/target field existence, type compatibility,
  transform-required-when-types-differ, unused DTO fields, unwritten
  required columns.
- **Structural hygiene** — duplicate ids, cyclic calls, unused
  actors/components/DTOs.
- **Cross-module consistency** — model fields map to columns when
  `persistedAs` is set, FK column existence.

The full code list is in [`docs/site/src/content/docs/reference/validation-rules.md`](../../docs/site/src/content/docs/reference/validation-rules.md).
Run `pnpm --filter @pizza-doc/core test` to see every rule exercised.

### Serializer (`serializer.ts`)

Stringifies a `Space` back to a flat `path → string` map, round-trip clean
for the loader. Comments are preserved when the caller supplies the
original source strings (the web package does; programmatic consumers don't
have to).

### AI exporter (`export.ts`)

```ts
import { exportSpaceForAi } from '@pizza-doc/core'

const markdown = exportSpaceForAi(space, { issues })
```

Emits a single Markdown file designed for feeding to a language model —
flat headings, redundant cross-references, `<ref>`-in-angle-brackets ref
format, per-entity YAML codeblocks, plus a **Generation Hints** section
at the tail. Full format reference:
[`docs/site/src/content/docs/reference/ai-export.md`](../../docs/site/src/content/docs/reference/ai-export.md).

### Ref index (`ref.ts`)

`buildRefIndex(space)` returns a `RefIndex` that knows every addressable
entity in the space by its canonical URI. Both the validator and the UI
palette build on this.

### Levenshtein helpers (`levenshtein.ts`)

`closestMatches(query, candidates, n)` powers "did you mean?" suggestions
in validation issues.

## Entry points

```ts
import { ... } from '@pizza-doc/core'          // browser-safe
import { ... } from '@pizza-doc/core/node-io'  // Node fs-promises wrapper
```

The `/node-io` subpath is the only place `node:fs` is imported.

## Testing

```bash
pnpm --filter @pizza-doc/core test
```

Tests live under `__tests__/` and use fixtures in `__fixtures__/`. Every
validation rule has at least one positive and one negative fixture.

## Extending

Adding a new validation rule:

1. Add its code to `ValidationCode` in `validator/types.ts`.
2. Write the rule function in `validator/semantic.ts` (or a new pass-module).
3. Register it in the rules list at the top of that file.
4. Add positive + negative fixtures in `__fixtures__/` and a test.
5. Document it in `docs/site/src/content/docs/reference/validation-rules.md`.

Adding a new entity kind is more invasive — see
[`CONTRIBUTING.md`](../../CONTRIBUTING.md#adding-an-entity-kind) for the
full checklist.

## License

MIT.
