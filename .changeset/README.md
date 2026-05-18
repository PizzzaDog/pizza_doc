# Changesets

This directory is managed by [changesets](https://github.com/changesets/changesets).

## Workflow

When you land a user-visible change, run:

```bash
pnpm changeset
```

Pick the package(s) affected, choose patch / minor / major, and write a
one-line summary. The CLI writes a Markdown file under `.changeset/`;
commit it alongside your code.

On merge to `main`, the release workflow opens or updates a "Version
Packages" PR. Merging that PR bumps the package versions, writes
`CHANGELOG.md` entries, and publishes public packages to npm.

## Ignored packages

`config.json` marks `@pizza-doc/web` and `pizza-doc-site` as ignored.
They don't publish to npm. The web bundle is attached to the GitHub
Release; the docs site deploys via the Pages job in `release.yml`.
