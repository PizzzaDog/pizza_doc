// Ad-hoc space validator used until the CLI lands. Run:
//   node scripts/validate-space.mjs spaces/pizza-shop-demo

import { loadSpace, validate } from '../packages/core/dist/index.js'
import { nodeFileSystem } from '../packages/core/dist/node-io.js'
import * as path from 'node:path'

const [, , dirArg] = process.argv
if (!dirArg) {
  console.error('usage: validate-space.mjs <space-dir>')
  process.exit(2)
}
const spaceDir = path.resolve(dirArg)
const spaceId = path.basename(spaceDir)

const fs = nodeFileSystem(spaceDir)
const loadResult = await loadSpace(fs, '.', spaceId)
const result = validate(loadResult)

const errors = result.issues.filter((i) => i.severity === 'error')
const warnings = result.issues.filter((i) => i.severity === 'warning')
const infos = result.issues.filter((i) => i.severity === 'info')

console.log(`\n── passes: schema=${result.passes.schema} refs=${result.passes.refs} semantic=${result.passes.semantic}`)
console.log(`── entities loaded: ${loadResult.files.size} files`)
if (loadResult.space) {
  const s = loadResult.space
  let comps = 0
  let models = 0
  let tables = 0
  let methods = 0
  for (const m of s.modules) {
    comps += m.components.length
    models += m.models.length
    tables += m.tables.length
    for (const c of m.components) methods += c.methods.length
    for (const d of m.domains) {
      comps += d.components.length
      models += d.models.length
      tables += d.tables.length
      for (const c of d.components) methods += c.methods.length
    }
  }
  console.log(
    `── counts: ${s.modules.length} modules, ${s.actors.length} actors, ${comps} components (${methods} methods), ${models} models, ${tables} tables, ${s.useCases.length} use cases`,
  )
}
console.log(`── issues: ${errors.length} errors · ${warnings.length} warnings · ${infos.length} infos\n`)

function printIssues(label, issues) {
  if (issues.length === 0) return
  console.log(`\n=== ${label} (${issues.length}) ===`)
  for (const i of issues) {
    const loc = i.file ? `  [${i.file}${i.line ? `:${i.line}` : ''}]` : ''
    console.log(`  ${i.code}${loc}`)
    console.log(`    ${i.message}`)
    if (i.suggestion) console.log(`    → ${i.suggestion}`)
    if (i.entityRef) console.log(`    ref: ${i.entityRef}`)
  }
}

printIssues('ERRORS', errors)
printIssues('WARNINGS', warnings)
printIssues('INFOS', infos)

process.exit(errors.length > 0 ? 1 : 0)
