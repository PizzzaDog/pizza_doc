import * as fs from 'node:fs'
import * as path from 'node:path'
import { stringify } from 'yaml'

/**
 * Mirror of the CLI's writeYamlFile so MCP write tools produce byte-for-byte
 * identical scaffolds (pragma comment, deterministic key order, refusal to
 * clobber). Keeping a small copy here avoids a dependency from `@pizza-doc/mcp`
 * onto `@pizza-doc/cli`'s internals.
 */
export function writeYamlFile(
  filePath: string,
  value: unknown,
  options?: { force?: boolean; schemaRef?: string },
): { wrote: boolean; reason?: string } {
  if (fs.existsSync(filePath) && !options?.force) {
    return { wrote: false, reason: 'file exists — pass force=true to overwrite' }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const pragma = options?.schemaRef ? `# yaml-language-server: $schema=${options.schemaRef}\n` : ''
  const yaml = stringify(value, { lineWidth: 0, indent: 2 })
  fs.writeFileSync(filePath, pragma + yaml)
  return { wrote: true }
}

/**
 * Compute a relative `$schema=` path from a target YAML file to the space's
 * `schemas/<kind>.json`. Same logic as the CLI's `schemaRefFor`.
 */
export function schemaRefFor(spaceDir: string, targetFile: string, kind: string): string {
  const schemaFile = path.join(spaceDir, 'schemas', `${kind}.json`)
  let rel = path.relative(path.dirname(targetFile), schemaFile)
  if (path.sep === '\\') rel = rel.split(path.sep).join('/')
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}
