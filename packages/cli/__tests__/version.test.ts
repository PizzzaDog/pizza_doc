import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// Reach into MCP source directly — adding @pizza-doc/mcp as a CLI dep just
// for one test would pull the MCP SDK into the CLI install graph.
import { SERVER_VERSION } from '../../mcp/src/version.js'
import { CLI_VERSION } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '../../..')

const MANIFESTS = [
  'package.json',
  'packages/cli/package.json',
  'packages/core/package.json',
  'packages/mcp/package.json',
  'packages/web/package.json',
  'docs/site/package.json',
]

/**
 * Human-facing docs that quote the current version inline.
 *
 * To keep them in sync without parsing prose, every such doc carries an
 * HTML comment marker `<!-- pd:version -->` on the same line as the
 * version string. The test extracts whatever sits between the marker
 * pair and asserts it matches the CLI version.
 *
 *   ## v0.5.1 <!-- pd:version -->
 *
 * Embed the marker right after the version token on the same line and
 * keep the line short. The regex below is intentionally loose about
 * surrounding text so authors can phrase the line however they like.
 */
const VERSIONED_DOCS = ['README.md', 'OVERVIEW.md', 'INSTALL.md']

describe('version source of truth', () => {
  it('keeps CLI, UI, docs, and package manifests on one semver', () => {
    const cliPackage = readPackage('packages/cli/package.json')
    expect(CLI_VERSION).toBe(cliPackage.version)

    for (const manifest of MANIFESTS) {
      expect(readPackage(manifest).version, manifest).toBe(cliPackage.version)
    }
  })

  it('keeps the MCP server version aligned with the CLI version', () => {
    const cliPackage = readPackage('packages/cli/package.json')
    expect(SERVER_VERSION, 'packages/mcp SERVER_VERSION').toBe(cliPackage.version)
  })

  it('keeps human-facing docs aligned with the CLI version', () => {
    const cliPackage = readPackage('packages/cli/package.json')
    const expected = cliPackage.version

    for (const doc of VERSIONED_DOCS) {
      const text = readFileSync(path.join(repoRoot, doc), 'utf8')
      const occurrences = extractMarkedVersions(text)
      expect(occurrences.length, `${doc}: missing <!-- pd:version --> marker`).toBeGreaterThan(0)
      for (const version of occurrences) {
        expect(version, `${doc} @ <!-- pd:version --> line`).toBe(expected)
      }
    }
  })
})

function readPackage(rel: string): { version: string } {
  return JSON.parse(readFileSync(path.join(repoRoot, rel), 'utf8')) as { version: string }
}

/**
 * Pulls every semver token from lines tagged with `<!-- pd:version -->`.
 * The marker may sit before or after the version on the same line, with
 * optional `v` prefix and surrounding backticks / parentheses.
 */
function extractMarkedVersions(text: string): string[] {
  const versions: string[] = []
  for (const line of text.split('\n')) {
    if (!line.includes('<!-- pd:version -->')) continue
    const match = line.match(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/)
    if (match) versions.push(match[1])
  }
  return versions
}
