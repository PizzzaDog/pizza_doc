import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = readPackage('packages/cli/package.json')
const expected = source.version

const manifests = [
  'package.json',
  'packages/cli/package.json',
  'packages/core/package.json',
  'packages/mcp/package.json',
  'packages/web/package.json',
  'docs/site/package.json',
]

const mismatches = manifests
  .map((manifest) => ({ manifest, version: readPackage(manifest).version }))
  .filter((entry) => entry.version !== expected)

if (mismatches.length > 0) {
  console.error(`Version mismatch: packages/cli/package.json is ${expected}`)
  for (const entry of mismatches) {
    console.error(`  ${entry.manifest}: ${entry.version}`)
  }
  process.exit(1)
}

console.log(`pizza-doc version ${expected}`)

function readPackage(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'))
}
