import * as fs from 'node:fs'
import * as path from 'node:path'
import { stringify } from 'yaml'

/**
 * Serialise an entity object to YAML with Pizza Doc house style:
 * 2-space indent, no line-wrap on long strings, deterministic key order
 * (callers pass an object with keys already in the desired order — JS
 * preserves insertion order for string keys).
 *
 * Use for CLI scaffolds; the UI has its own writer for edit-in-place.
 */
export function toYaml(value: unknown): string {
  return stringify(value, {
    lineWidth: 0,
    indent: 2,
  })
}

/**
 * Write a YAML file, creating parent directories as needed. Refuses to
 * overwrite an existing file unless `force` is set — the CLI should never
 * silently clobber hand-edited specs.
 *
 * `schemaRef` (when set) emits a `# yaml-language-server: $schema=<path>`
 * comment on line 1 so VS Code's redhat YAML extension and JetBrains pick
 * up validation + autocomplete inline.
 */
export function writeYamlFile(
  filePath: string,
  value: unknown,
  options?: { force?: boolean; schemaRef?: string },
): { wrote: boolean; reason?: string } {
  if (fs.existsSync(filePath) && !options?.force) {
    return { wrote: false, reason: 'file exists — pass --force to overwrite' }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const pragma = options?.schemaRef ? `# yaml-language-server: $schema=${options.schemaRef}\n` : ''
  fs.writeFileSync(filePath, pragma + toYaml(value))
  return { wrote: true }
}
