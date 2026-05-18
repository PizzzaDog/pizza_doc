import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { allComponents, allModels, allTables } from '../util/space-walk.js'
import { buildUsageIndex } from '../util/usage-index.js'

/**
 * `pd explain <ref> [spaces/<id>]`
 *
 * One-shot walk through any entity: what it is, which use cases touch
 * it, which components call its methods, what persists it / what it
 * persists. Useful for live architecture discussions when you need a
 * cheat-sheet for a single ref.
 */
export async function cmdExplain(args: ParsedArgs): Promise<number> {
  const ref = args.positional[0]
  if (!ref) {
    console.error(red('usage: pd explain <ref> [spaces/<id>]'))
    console.error(dim('  refs look like: module:backend/component:AuthController'))
    console.error(dim('                  module:backend/domain:inventory/model:Order'))
    console.error(dim('                  usecase:user-registers'))
    return 2
  }
  const { space } = await loadSpaceForCli(resolveSpaceDir(args.positional[1]))
  const usage = buildUsageIndex(space)

  // Use case?
  const uc = space.useCases.find((u) => `usecase:${u.id}` === ref)
  if (uc) {
    console.log(`${bold(cyan(`usecase:${uc.id}`))} — ${uc.name}`)
    console.log(`  actor: ${uc.actor}`)
    console.log(`  trigger: ${uc.trigger}`)
    if (uc.description) console.log(`  ${dim(uc.description)}`)
    console.log(`  steps: ${uc.steps.length}`)
    console.log(`  errorFlows: ${uc.errorFlows.length}`)
    console.log(`  dataFlow: ${uc.dataFlow.length}`)
    if (uc.requires.length > 0) {
      console.log(`  ${yellow('requires:')}`)
      for (const r of uc.requires) console.log(`    - ${JSON.stringify(r)}`)
    }
    return 0
  }

  // Component?
  for (const { component, ref: cref } of allComponents(space)) {
    if (cref !== ref) continue
    const users = [...(usage.componentUsedBy.get(cref) ?? [])]
    console.log(`${bold(cyan(cref))} — ${component.name} (${component.type})`)
    if (component.description) console.log(`  ${dim(component.description)}`)
    console.log(`  methods (${component.methods.length}):`)
    for (const m of component.methods) {
      const http = m.httpMethod ? ` ${green(m.httpMethod)} ${m.httpPath}` : ''
      console.log(`    · ${m.name}${http}  returns: ${m.returns}`)
      if (m.calls.length > 0) {
        console.log(dim(`      calls: ${m.calls.length}`))
      }
    }
    if (users.length > 0) {
      console.log(`  ${yellow('used by:')} ${users.length}`)
      for (const u of users) console.log(`    · ${u}`)
    }
    return 0
  }

  // Model?
  for (const { model, ref: mref } of allModels(space)) {
    if (mref !== ref) continue
    const users = [...(usage.modelUsedBy.get(mref) ?? [])]
    console.log(`${bold(cyan(mref))} — ${model.name} (${model.modelKind})`)
    if (model.description) console.log(`  ${dim(model.description)}`)
    if (model.persistedAs) console.log(`  persistedAs: ${model.persistedAs}`)
    if (model.topic) console.log(`  topic: ${model.topic}`)
    console.log(`  fields (${model.fields.length}):`)
    for (const f of model.fields) {
      const opt = f.optional ? dim(' optional') : ''
      const pers = f.persisted === false ? dim(' non-persisted') : ''
      console.log(`    · ${f.name}: ${f.type}${opt}${pers}`)
    }
    if (model.stateMachine) {
      console.log(
        `  ${yellow('stateMachine')} on '${model.stateMachine.field}': ${model.stateMachine.states.join(' → ')}`,
      )
    }
    if (users.length > 0) {
      console.log(`  ${yellow('used by:')} ${users.length}`)
      for (const u of users) console.log(`    · ${u}`)
    }
    return 0
  }

  // Table?
  for (const { table, ref: tref } of allTables(space)) {
    if (tref !== ref) continue
    const users = [...(usage.tableUsedBy.get(tref) ?? [])]
    console.log(`${bold(cyan(tref))} — ${table.name}`)
    if (table.description) console.log(`  ${dim(table.description)}`)
    console.log(`  columns (${table.columns.length}):`)
    for (const c of table.columns) {
      const flags: string[] = []
      if (c.primaryKey) flags.push('pk')
      if (c.nullable) flags.push('null')
      if (c.unique) flags.push('unique')
      if (c.default) flags.push(`default=${c.default}`)
      console.log(
        `    · ${c.name}: ${c.sqlType}${flags.length ? ` ${dim(`[${flags.join(', ')}]`)}` : ''}`,
      )
    }
    if (users.length > 0) {
      console.log(`  ${yellow('used by:')} ${users.length}`)
      for (const u of users) console.log(`    · ${u}`)
    }
    return 0
  }

  console.error(red(`no entity matches ref: ${ref}`))
  return 1
}
