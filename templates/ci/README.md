# Pizza Doc CI templates

Drop-in starters for consumer projects (the repos that *use* Pizza Doc
to document their app). Copy the file you want into the right location
in your repo.

| File | Where to put it | What it does |
|---|---|---|
| [`github-action-pizza-doc.yml`](./github-action-pizza-doc.yml) | `.github/workflows/pizza-doc.yml` | On every PR that touches `spaces/**`, runs `pd validate --strict-warnings` + `pd coverage` + `pd endpoints --orphans` for each space. Fails the build on any issue. |
| [`pre-commit`](./pre-commit) | `.git/hooks/pre-commit` (+ `chmod +x`) | Local guard: runs `pd validate --strict-warnings` on spaces that have staged changes. Aborts commit on failure. |

## Quick setup

```bash
# 1. Add pizza-doc CLI as a dev dep in your consumer repo:
pnpm add -D @pizza-doc/cli

# 2. Copy the gh action:
cp -n templates/ci/github-action-pizza-doc.yml .github/workflows/pizza-doc.yml

# 3. Install the pre-commit hook:
cp templates/ci/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

After this, both local commits and PRs enforce:

- spaces that touch main must have **0 errors, 0 warnings**.
- coverage thresholds (components ≥ 80%, models ≥ 70%, tables ≥ 80%, endpoints ≥ 80%).
- every declared HTTP endpoint is covered by at least one use case.

## Custom thresholds

Tune per-category coverage in the GH action step:

```yaml
- run: |
    pnpm pd coverage "spaces/${id}" \
      --min-components 90 \
      --min-models 80 \
      --min-tables 90 \
      --min-endpoints 100
```

## Husky / lint-staged variant

If you're already using [lint-staged](https://github.com/okonet/lint-staged):

```json
{
  "lint-staged": {
    "spaces/**/*.yaml": ["pnpm pd validate --strict-warnings"]
  }
}
```

No separate hook file needed.
