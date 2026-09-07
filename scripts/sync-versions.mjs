// Keep everything changesets never versions in lockstep with the published
// packages: the workspace root and the private `@pizza-doc/web` /
// `pizza-doc-site` manifests, plus the human-facing docs that quote the
// version on a `<!-- pd:version -->` line (README / OVERVIEW / INSTALL —
// `packages/cli/__tests__/version.test.ts` asserts those). Then re-format
// every manifest `changeset version` rewrote
// (it emits its own JSON layout, which `biome check` rejects). Runs as the
// second half of `pnpm version-packages`, the Release PR's version step:
//   changeset version && node scripts/sync-versions.mjs
// `scripts/check-versions.mjs` (part of `pnpm check`) enforces the result.
// The two private packages keep a stub CHANGELOG.md: changesets/action reads
// `<pkg>/CHANGELOG.md` for every package whose version moved, and fails
// the Release PR step on ENOENT otherwise.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const version = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8')).version

const synced = ['package.json', 'packages/web/package.json', 'docs/site/package.json']
const published = ['packages/cli/package.json', 'packages/core/package.json', 'packages/mcp/package.json']
const versionedDocs = ['README.md', 'OVERVIEW.md', 'INSTALL.md']
const MARKER = '<!-- pd:version -->'
const SEMVER = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/

for (const rel of synced) {
  const file = join(root, rel)
  const text = readFileSync(file, 'utf8')
  const next = text.replace(/^  "version": "[^"]*"/m, `  "version": "${version}"`)
  if (next === text) throw new Error(`${rel}: no top-level "version" field to sync`)
  writeFileSync(file, next)
}

for (const rel of versionedDocs) {
  const file = join(root, rel)
  const lines = readFileSync(file, 'utf8').split('\n')
  let marked = 0
  const next = lines.map((line) => {
    if (!line.includes(MARKER)) return line
    marked++
    return line.replace(SEMVER, version)
  })
  if (marked === 0) throw new Error(`${rel}: no ${MARKER} line to sync`)
  writeFileSync(file, next.join('\n'))
}

execFileSync('pnpm', ['exec', 'biome', 'format', '--write', ...synced, ...published], {
  cwd: root,
  stdio: 'inherit',
})

console.log(`manifests synced to ${version}`)
