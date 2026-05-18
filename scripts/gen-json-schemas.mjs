// Emit JSON Schemas for every top-level Pizza Doc entity kind so editors
// (VS Code's built-in YAML extension in particular) can validate + autocomplete
// inline while you write. Run:
//   pnpm --filter @pizza-doc/core build
//   node scripts/gen-json-schemas.mjs
//
// Output: .pizza-doc/schemas/*.json (gitignored per-repo preference; the .vscode
// settings point at these files directly).
//
// The schemas are derived from the same Zod definitions the runtime validator
// uses, so there's no drift between "what the validator accepts" and "what the
// editor suggests". If a `.strict()` schema rejects a field, the IDE flags it
// instantly — agents lose the ability to invent `owner: foo` fields at their
// desks, and authors see errors without running the validator.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zodToJsonSchema } from 'zod-to-json-schema'

import {
  ActorSchema,
  ComponentSchema,
  DomainSchema,
  ModelSchema,
  ModuleSchema,
  SpaceFileSchema,
  TableSchema,
  UseCaseSchema,
} from '../packages/core/dist/schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '..', '.pizza-doc', 'schemas')
fs.mkdirSync(outDir, { recursive: true })

// Keep the JSON Schema draft + $id stable so editors cache reliably.
const common = { $schemaVersion: 'draft-07', name: 'pizza-doc' }

const schemas = {
  space: { zod: SpaceFileSchema, title: 'Pizza Doc space.yaml' },
  actor: { zod: ActorSchema, title: 'Pizza Doc actor' },
  module: { zod: ModuleSchema, title: 'Pizza Doc module.yaml' },
  domain: { zod: DomainSchema, title: 'Pizza Doc domain.yaml' },
  component: { zod: ComponentSchema, title: 'Pizza Doc component' },
  model: { zod: ModelSchema, title: 'Pizza Doc model' },
  table: { zod: TableSchema, title: 'Pizza Doc table' },
  usecase: { zod: UseCaseSchema, title: 'Pizza Doc use case' },
}

for (const [name, { zod, title }] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(zod, {
    name: title,
    target: 'jsonSchema7',
  })
  const file = path.join(outDir, `${name}.json`)
  fs.writeFileSync(file, `${JSON.stringify(jsonSchema, null, 2)}\n`)
  console.log(`wrote ${path.relative(path.resolve(__dirname, '..'), file)}`)
}

console.log(`\n${Object.keys(schemas).length} schemas written to ${path.relative(process.cwd(), outDir)}`)
console.log('Wire into .vscode/settings.json — see docs/site for the snippet.')
void common
