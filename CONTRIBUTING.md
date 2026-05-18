# Contributing to Pizza Doc

Pizza Doc is a young project. The bar for contributions is "makes the
experience better and doesn't break existing tests." Everything below is
guidance, not bureaucracy.

## Development environment

**Prerequisites**

- Node 20+ (use `nvm` and `.nvmrc` — `nvm use` picks it up)
- pnpm 10+ (`corepack enable` + `corepack prepare pnpm@10 --activate`, or
  `brew install pnpm`)

**Clone and boot**

```bash
# Replace YOUR-USERNAME with your GitHub handle if working from a fork.
git clone https://github.com/YOUR-USERNAME/pizza_doc.git
cd pizza_doc
pnpm install
pnpm build
pnpm test
```

You should see 100+ tests pass. If anything is red on `main`, that's a bug
— please open an issue before starting on something else.

**Run the UI**

```bash
pnpm --filter @pizza-doc/web dev
```

Pick `spaces/` as the root directory to load the demo space.

**Run the docs site**

```bash
pnpm --filter pizza-doc-site dev
```

## Code style

Enforced by Biome (`biome.json`) and TypeScript (`tsconfig.base.json`).

- **Formatter.** 2-space indent, single quotes, no semicolons, trailing
  commas everywhere, 100-char line width. Run `pnpm check:fix` before
  committing.
- **Linter.** `recommended` + `noExplicitAny: error` +
  `useImportType: error` + `noNonNullAssertion: warn`.
- **TypeScript.** Strict mode, `exactOptionalPropertyTypes: true`,
  `noUncheckedIndexedAccess: true`. Optional props are typed
  `T | undefined` explicitly. No `any`; use `unknown` and narrow.
- **Imports.** Prefer type-only imports (`import type { … }`) when the
  binding is only used in a type position. Biome's `organizeImports`
  sorts automatically.

Before pushing:

```bash
pnpm typecheck && pnpm check && pnpm test && pnpm detect-slop
```

All four must pass. CI runs the same set.

### The Impeccable check

`pnpm detect-slop` runs [Impeccable](https://www.npmjs.com/package/impeccable)
over `packages/web/src/`. It catches AI-generated-slop patterns (empty
catch blocks, unnecessary comments restating code, vibes-y variable names).
If it flags something, either fix it or — if it's a false positive — push
back in the PR and we'll decide together.

## Testing

- **Unit tests.** Every new validation rule needs at least one positive
  fixture (passes the rule) and one negative fixture (triggers the rule),
  plus a test that asserts the exact issue code.
- **Integration.** The loader and pipeline tests in
  `packages/core/__tests__/` exercise the full path. Add to them when you
  change cross-pass behaviour.
- **UI.** No browser-driver tests yet — we rely on typecheck + manual
  verification against the demo space. If you land a UI change, describe
  the manual test plan in the PR.

## PR process

1. **Branch.** From `main`, prefix with `feat/`, `fix/`, or `docs/`.
2. **Commit messages.** Follow the existing convention: `type(scope):
   summary`. Scopes so far are `core`, `web`, `cli`, `demo`, `docs`.
   Keep the imperative mood ("add X", not "added X").
3. **PR description.** State what changed and *why*. If you touched the
   validator or schema, mention which rules/codes are affected. If you
   touched the UI, list the shortcuts/flows you manually verified.
4. **CI.** `ci.yml` runs on every PR. Required green checks: typecheck,
   biome, tests, impeccable, build.
5. **Review.** One approval + green CI = mergeable. Squash-merge is the
   default; rebase-merge is fine if you've kept the history clean.

## Commit message co-author

If you're using an AI assistant to help with the work, append a
`Co-Authored-By:` trailer. See the trailers on recent commits for the exact
format.

## Adding a validation rule

1. `packages/core/src/validator/types.ts` — add the code to
   `ValidationCode`.
2. `packages/core/src/validator/semantic.ts` — write the rule function and
   register it in the rules table at the top of the file. Copy an existing
   rule as a template; the function shape is stable.
3. `packages/core/__fixtures__/` — add a `space/` that triggers the rule
   and one that doesn't.
4. `packages/core/__tests__/validator.semantic.test.ts` — add assertions.
5. `docs/site/src/content/docs/reference/validation-rules.md` — add a row
   to the table, and a prose paragraph if the rule is subtle.

## Adding an entity kind

Heavier lift. Touch list:

- `packages/core/src/schema.ts` — Zod schema + exported type.
- `packages/core/src/classify.ts` — teach the classifier how to recognise
  the file role from its path.
- `packages/core/src/loader.ts` — assembly into the `Space` tree.
- `packages/core/src/ref.ts` — add to `RefKind` and `RefTarget`, and
  extend `buildRefIndex` to emit refs for the new kind.
- `packages/core/src/serializer.ts` — round-trip support.
- `packages/core/src/export.ts` — AI exporter section.
- `packages/web/src/views/entity/` — detail view.
- `packages/web/src/views/inspector/EditTab.tsx` — edit form.
- `packages/web/src/views/sidebar/sidebar-items.ts` — tree node.
- `packages/web/src/views/palette/CommandPalette.tsx` — `KindIcon` branch.
- `packages/web/src/lib/entity-ref.ts` — if the ref URI encoding changes.

Expect 10+ files to move. Worth pairing on.

## Releases

Releases are driven by [changesets](https://github.com/changesets/changesets).
When you land a user-visible change, run:

```bash
pnpm changeset
```

Pick the packages, choose patch/minor/major, and write a one-line summary
(which ends up in the release notes). Commit the generated file in
`.changeset/`. On merge, the release workflow bumps versions and publishes.

## Questions

Open an issue, or start a discussion on GitHub. For design questions that
don't fit an issue, feel free to open a draft PR with a `docs/` proposal —
low ceremony, easy to iterate.
