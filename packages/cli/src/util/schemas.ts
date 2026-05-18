import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ActorSchema,
  AdrFrontmatterSchema,
  ComponentSchema,
  ConfigMapFileSchema,
  DomainSchema,
  ExternalDepsFileSchema,
  ModelSchema,
  ModuleSchema,
  SpaceFileSchema,
  TableSchema,
  UseCaseSchema,
} from '@pizza-doc/core'
import type { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

const SCHEMAS: Record<string, { zod: z.ZodTypeAny; title: string }> = {
  space: { zod: SpaceFileSchema, title: 'Pizza Doc space.yaml' },
  actor: { zod: ActorSchema, title: 'Pizza Doc actor' },
  module: { zod: ModuleSchema, title: 'Pizza Doc module.yaml' },
  domain: { zod: DomainSchema, title: 'Pizza Doc domain.yaml' },
  component: { zod: ComponentSchema, title: 'Pizza Doc component' },
  model: { zod: ModelSchema, title: 'Pizza Doc model' },
  table: { zod: TableSchema, title: 'Pizza Doc table' },
  usecase: { zod: UseCaseSchema, title: 'Pizza Doc use case' },
  // v0.3 operations layer.
  'config-map': {
    zod: ConfigMapFileSchema,
    title: 'Pizza Doc config-map.yaml',
  },
  'external-deps': {
    zod: ExternalDepsFileSchema,
    title: 'Pizza Doc external-deps.yaml',
  },
  // ADR frontmatter is YAML inside markdown, but a JSON Schema for it
  // still helps tools that lint frontmatter blocks (eg. dprint plugins).
  'adr-frontmatter': {
    zod: AdrFrontmatterSchema,
    title: 'Pizza Doc ADR frontmatter',
  },
}

/**
 * Emit JSON Schemas for every Pizza Doc entity kind into
 * `<spaceDir>/schemas/`. Editors with a YAML language server (VS Code's
 * redhat extension, JetBrains' built-in YAML) read the per-file
 * `# yaml-language-server: $schema=...` pragma and provide autocomplete +
 * inline error highlighting derived from the same Zod source the runtime
 * validator uses — so there's no drift.
 */
export function generateSchemas(spaceDir: string): { written: number; outDir: string } {
  const outDir = path.join(spaceDir, 'schemas')
  fs.mkdirSync(outDir, { recursive: true })
  let written = 0
  for (const [name, { zod, title }] of Object.entries(SCHEMAS)) {
    const json = zodToJsonSchema(zod, { name: title, target: 'jsonSchema7' })
    fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`)
    written++
  }
  return { written, outDir }
}

/**
 * Compute a `$schema=<rel>` value for a YAML file at `targetFile`, pointing
 * at the right JSON schema for its entity kind under `<spaceDir>/schemas/`.
 * The path is relative so the spec is portable — moving the project
 * doesn't break the editor integration.
 */
export function schemaRefFor(
  spaceDir: string,
  targetFile: string,
  kind: keyof typeof SCHEMAS,
): string {
  const schemaFile = path.join(spaceDir, 'schemas', `${kind}.json`)
  let rel = path.relative(path.dirname(targetFile), schemaFile)
  // Always emit forward slashes — JSON schema URIs use POSIX separators
  // and Windows readers accept them.
  if (path.sep === '\\') rel = rel.split(path.sep).join('/')
  // Make sure relative refs that don't start with ../ have ./ prefix so
  // editors don't try to resolve them as URLs.
  if (!rel.startsWith('.')) rel = `./${rel}`
  return rel
}
