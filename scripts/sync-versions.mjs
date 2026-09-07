// Keep the manifests changesets never versions — the workspace root and the
// private `@pizza-doc/web` / `pizza-doc-site` packages — in lockstep with the
// published ones, then re-format every manifest `changeset version` rewrote
// (it emits its own JSON layout, which `biome check` rejects). Runs as the
// second half of `pnpm version-packages`, the Release PR's version step:
//   changeset version && node scripts/sync-versions.mjs
// `scripts/check-versions.mjs` (part of `pnpm check`) enforces the result.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const version = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8')).version

const synced = ['package.json', 'packages/web/package.json', 'docs/site/package.json']
const published = ['packages/cli/package.json', 'packages/core/package.json', 'packages/mcp/package.json']

for (const rel of synced) {
  const file = join(root, rel)
  const text = readFileSync(file, 'utf8')
  const next = text.replace(/^  "version": "[^"]*"/m, `  "version": "${version}"`)
  if (next === text) throw new Error(`${rel}: no top-level "version" field to sync`)
  writeFileSync(file, next)
}

execFileSync('pnpm', ['exec', 'biome', 'format', '--write', ...synced, ...published], {
  cwd: root,
  stdio: 'inherit',
})

console.log(`manifests synced to ${version}`)
