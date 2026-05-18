/**
 * AI export per page 07. One Markdown document with YAML-shaped codeblocks
 * for structured data. Flat and redundant (not nested) so LLMs can scan
 * without losing context; every cross-reference is wrapped in angle brackets
 * so agents can treat it as a navigable handle.
 *
 * Phase 9 implements the **full-space** scope. Use-case- and domain-scoped
 * exports are a v0.2 extension; the header button and the palette action
 * both call `exportSpaceForAi` with the whole space.
 */

import type {
  Actor,
  Column,
  Component,
  Domain,
  Model,
  Module,
  Space,
  Table,
  UseCase,
  UseCaseStep,
} from './schema.js'
import type { ValidationIssue } from './validator/types.js'

export interface AiExportOptions {
  /** Optional ISO timestamp; defaults to `new Date().toISOString()`. */
  timestamp?: string
  /** Optional framework version (goes into the header). Default: 0.1.0. */
  pizzaDocVersion?: string
  /** Validation issues for the Validation Summary section. */
  issues?: readonly ValidationIssue[]
}

export function exportSpaceForAi(space: Space, options: AiExportOptions = {}): string {
  const out: string[] = []
  const timestamp = options.timestamp ?? new Date().toISOString()
  const version = options.pizzaDocVersion ?? space.meta.pizzaDocVersion ?? '0.1.0'

  const counts = spaceCounts(space)

  out.push(`# Pizza Doc Export: ${space.meta.id}`)
  out.push('')
  out.push(`> Exported from space \`${space.meta.id}\` at ${timestamp} by Pizza Doc ${version}.`)
  out.push(
    `> Contains: ${counts.actors} actors · ${counts.modules} modules · ${counts.useCases} use cases · ${counts.components} components · ${counts.models} models · ${counts.tables} tables.`,
  )
  out.push('')
  out.push('---')
  out.push('')

  // ---------- Space metadata ----------
  out.push('## Space')
  out.push('')
  out.push(`**Name:** ${space.meta.name}  `)
  if (space.meta.description) {
    out.push(`**Description:** ${space.meta.description}`)
    out.push('')
  }
  out.push(`**Version:** ${space.meta.version}  `)
  out.push(`**Pizza Doc version:** ${space.meta.pizzaDocVersion}`)
  out.push('')
  out.push('---')
  out.push('')

  // ---------- Actors ----------
  out.push('## Actors')
  out.push('')
  if (space.actors.length === 0) {
    out.push('_No actors._')
  } else {
    for (const actor of space.actors) emitActor(out, actor, space)
  }
  out.push('')
  out.push('---')
  out.push('')

  // ---------- Modules ----------
  out.push('## Modules')
  out.push('')
  for (const module of space.modules) emitModule(out, module, space)
  out.push('---')
  out.push('')

  // ---------- Use Cases ----------
  out.push('## Use Cases')
  out.push('')
  if (space.useCases.length === 0) {
    out.push('_No use cases._')
  } else {
    for (const useCase of space.useCases) emitUseCase(out, useCase)
  }
  out.push('')
  out.push('---')
  out.push('')

  // ---------- Validation summary ----------
  const issues = options.issues ?? []
  const errors = issues.filter((i) => i.severity === 'error')
  const warnings = issues.filter((i) => i.severity === 'warning')
  const infos = issues.filter((i) => i.severity === 'info')
  out.push('## Validation summary')
  out.push('')
  if (issues.length === 0) {
    out.push('No errors. No warnings. No infos.')
  } else {
    out.push(`${errors.length} errors · ${warnings.length} warnings · ${infos.length} infos.`)
    out.push('')
    if (errors.length > 0) emitIssueGroup(out, 'Errors', errors)
    if (warnings.length > 0) emitIssueGroup(out, 'Warnings', warnings)
    if (infos.length > 0) emitIssueGroup(out, 'Infos', infos)
  }
  out.push('')
  out.push('---')
  out.push('')

  // ---------- Generation hints ----------
  out.push('## Generation hints for AI agents')
  out.push('')
  out.push(
    '- Cross-references wrapped in angle brackets (e.g. `<module:auth-api/component:UserService>`) are navigable handles — treat them as stable identifiers.',
  )
  out.push(
    '- Preserve dataFlow transforms literally. A transform like `via PasswordHasher.hash (bcrypt)` means the hashing step must happen between reading the source field and writing the target column.',
  )
  out.push(
    '- Respect invariants as contract tests you would write around the feature. Every declared error flow must be handled by any generated implementation.',
  )
  out.push(
    '- Method signatures are ground truth. If you must change one while implementing, also update this spec.',
  )
  out.push('')
  return out.join('\n')
}

// ---------- emitters ----------

function emitActor(out: string[], actor: Actor, space: Space): void {
  out.push(`### \`<actor:${actor.id}>\` ${actor.name}`)
  out.push('')
  out.push(`**Type:** ${actor.type}`)
  if (actor.description) {
    out.push('')
    out.push(actor.description)
  }
  const usecases = space.useCases.filter((u) => u.actor === `actor:${actor.id}`)
  if (usecases.length > 0) {
    out.push('')
    out.push(
      `Participates in use cases: ${usecases.map((u) => `\`<usecase:${u.id}>\``).join(', ')}`,
    )
  }
  out.push('')
}

function emitModule(out: string[], module: Module, space: Space): void {
  out.push(`### \`<module:${module.id}>\` ${module.name}`)
  out.push('')
  out.push(`**Type:** ${module.type}  `)
  if (module.techStack) out.push(`**Tech stack:** ${module.techStack}`)
  if (module.description) {
    out.push('')
    out.push(module.description)
  }
  out.push('')

  if (module.domains.length > 0) {
    out.push('#### Domains')
    out.push('')
    for (const domain of module.domains) emitDomain(out, module, domain)
  }

  if (module.components.length > 0) {
    out.push('#### Components (module-level)')
    out.push('')
    for (const comp of module.components) emitComponent(out, `module:${module.id}`, comp, space)
  }

  if (module.models.length > 0) {
    out.push('#### Models (module-level)')
    out.push('')
    for (const model of module.models) emitModel(out, `module:${module.id}`, model)
  }

  if (module.tables.length > 0) {
    out.push('#### Tables (module-level)')
    out.push('')
    for (const table of module.tables) emitTable(out, `module:${module.id}`, table)
  }

  out.push('---')
  out.push('')
}

function emitDomain(out: string[], module: Module, domain: Domain): void {
  const ref = `module:${module.id}/domain:${domain.id}`
  out.push(`##### \`<${ref}>\` ${domain.name}`)
  out.push('')
  if (domain.description) out.push(domain.description)
  if (domain.description) out.push('')

  if (domain.components.length > 0) {
    out.push(`**Components:** ${domain.components.map((c) => `\`${c.id}\``).join(', ')}`)
    out.push('')
    for (const comp of domain.components) emitComponent(out, ref, comp)
  }
  if (domain.models.length > 0) {
    out.push(`**Models:** ${domain.models.map((m) => `\`${m.id}\``).join(', ')}`)
    out.push('')
    for (const model of domain.models) emitModel(out, ref, model)
  }
  if (domain.tables.length > 0) {
    out.push(`**Tables:** ${domain.tables.map((t) => `\`${t.id}\``).join(', ')}`)
    out.push('')
    for (const table of domain.tables) emitTable(out, ref, table)
  }
}

function emitComponent(
  out: string[],
  parentRef: string,
  component: Component,
  _space?: Space,
): void {
  const ref = `${parentRef}/component:${component.id}`
  out.push(`###### \`<${ref}>\` ${component.name}`)
  out.push('')
  out.push(`**Type:** ${component.type}`)
  if (component.description) {
    out.push('')
    out.push(component.description)
  }
  out.push('')

  if (component.methods.length > 0) {
    out.push('```')
    out.push('methods:')
    for (const method of component.methods) {
      out.push(`  - name: ${method.name}`)
      if (method.httpMethod) out.push(`    httpMethod: ${method.httpMethod}`)
      if (method.httpPath) out.push(`    httpPath: ${method.httpPath}`)
      if (method.params.length > 0) {
        out.push('    params:')
        for (const p of method.params) {
          out.push(`      - name: ${p.name}`)
          out.push(`        type: ${p.type}`)
          if (p.optional) out.push('        optional: true')
        }
      }
      out.push(`    returns: ${method.returns}`)
      if (method.calls.length > 0) {
        out.push('    calls:')
        for (const c of method.calls) {
          // Emit the ref by itself when nothing else is set (legacy form),
          // otherwise render the object form inline so AI exports preserve
          // path/method/credential contract metadata.
          const isBare =
            c.optional === false && !c.path && !c.method && !c.credential && !c.description
          if (isBare) {
            out.push(`      - <${c.target}>`)
          } else {
            const parts: string[] = [`target: <${c.target}>`]
            if (c.method) parts.push(`method: ${c.method}`)
            if (c.path) parts.push(`path: ${c.path}`)
            if (c.credential?.type) {
              const cred: string[] = [`type=${c.credential.type}`]
              if (c.credential.header) cred.push(`header=${c.credential.header}`)
              if (c.credential.env) cred.push(`env=${c.credential.env}`)
              parts.push(`credential={${cred.join(', ')}}`)
            }
            if (c.optional) parts.push('optional=true')
            if (c.description) parts.push(`description=${JSON.stringify(c.description)}`)
            out.push(`      - { ${parts.join(', ')} }`)
          }
        }
      }
      if (method.throws.length > 0) {
        out.push(`    throws: [${method.throws.join(', ')}]`)
      }
      if (method.description) {
        out.push(`    description: ${method.description}`)
      }
    }
    out.push('```')
    out.push('')
  }
}

function emitModel(out: string[], parentRef: string, model: Model): void {
  const ref = `${parentRef}/model:${model.id}`
  out.push(`###### \`<${ref}>\` ${model.name}`)
  out.push('')
  out.push(`**Model kind:** ${model.modelKind}`)
  if (model.persistedAs) out.push(`**Persisted as:** \`<${model.persistedAs}>\``)
  if (model.description) {
    out.push('')
    out.push(model.description)
  }
  out.push('')
  out.push('```')
  out.push('fields:')
  for (const f of model.fields) {
    out.push(`  - name: ${f.name}`)
    out.push(`    type: ${f.type}`)
    if (f.optional) out.push('    optional: true')
    if (f.description) out.push(`    description: ${f.description}`)
  }
  out.push('```')
  out.push('')
}

function emitTable(out: string[], parentRef: string, table: Table): void {
  const ref = `${parentRef}/table:${table.id}`
  out.push(`###### \`<${ref}>\` ${table.name}`)
  out.push('')
  if (table.description) {
    out.push(table.description)
    out.push('')
  }
  out.push('```')
  out.push('columns:')
  for (const c of table.columns) emitColumn(out, c)
  if (table.indexes.length > 0) {
    out.push('indexes:')
    for (const idx of table.indexes) {
      out.push(`  - name: ${idx.name}`)
      out.push(`    columns: [${idx.columns.join(', ')}]`)
      if (idx.unique) out.push('    unique: true')
    }
  }
  out.push('```')
  out.push('')
}

function emitColumn(out: string[], column: Column): void {
  out.push(`  - name: ${column.name}`)
  out.push(`    sqlType: ${column.sqlType}`)
  if (column.primaryKey) out.push('    primaryKey: true')
  if (column.unique) out.push('    unique: true')
  if (column.nullable) out.push('    nullable: true')
  if (column.foreignKey) {
    out.push('    foreignKey:')
    out.push(`      table: <${column.foreignKey.table}>`)
    out.push(`      column: ${column.foreignKey.column}`)
  }
  if (column.description) out.push(`    description: ${column.description}`)
}

function emitUseCase(out: string[], useCase: UseCase): void {
  out.push(`### \`<usecase:${useCase.id}>\` ${useCase.name}`)
  out.push('')
  out.push(`**Actor:** \`<${useCase.actor}>\`  `)
  out.push(`**Trigger:** ${useCase.trigger}`)
  if (useCase.description) {
    out.push('')
    out.push(useCase.description)
  }
  out.push('')

  if (useCase.invariants.pre.length > 0 || useCase.invariants.post.length > 0) {
    out.push('#### Invariants')
    out.push('')
    if (useCase.invariants.pre.length > 0) {
      out.push('**Preconditions:**')
      for (const p of useCase.invariants.pre) out.push(`- ${p}`)
      out.push('')
    }
    if (useCase.invariants.post.length > 0) {
      out.push('**Postconditions:**')
      for (const p of useCase.invariants.post) out.push(`- ${p}`)
      out.push('')
    }
  }

  if (useCase.steps.length > 0) {
    out.push('#### Happy path')
    out.push('')
    out.push('```')
    out.push('steps:')
    useCase.steps.forEach((step, i) => emitStep(out, step, i + 1))
    out.push('```')
    out.push('')
  }

  if (useCase.errorFlows.length > 0) {
    out.push('#### Error flows')
    out.push('')
    for (const flow of useCase.errorFlows) {
      out.push(`**${flow.id}:** ${flow.condition}`)
      if (flow.resultDescription) out.push(`Result: ${flow.resultDescription}`)
      out.push('')
      out.push('```')
      out.push('steps:')
      flow.steps.forEach((step, i) => emitStep(out, step, i + 1))
      out.push('```')
      out.push('')
    }
  }

  if (useCase.dataFlow.length > 0) {
    out.push('#### Data flow')
    out.push('')
    out.push('```')
    out.push('dataFlow:')
    for (const df of useCase.dataFlow) {
      out.push(`  - ${df.sourceField} → ${df.targetField}`)
      if (df.transform) out.push(`    transform: ${df.transform}`)
    }
    out.push('```')
    out.push('')
  }

  out.push('---')
  out.push('')
}

function emitStep(out: string[], step: UseCaseStep, index: number): void {
  out.push(`  - step: ${index}`)
  out.push(`    from: <${step.from}>`)
  out.push(`    to: <${step.to}>`)
  if (step.via) out.push(`    via: <${step.via}>`)
  if (step.protocol) out.push(`    protocol: ${step.protocol}`)
  if (step.description) out.push(`    description: ${step.description}`)
}

function emitIssueGroup(out: string[], label: string, issues: readonly ValidationIssue[]): void {
  out.push(`### ${label}`)
  out.push('')
  for (const issue of issues) {
    const loc = issue.file ? ` (\`${issue.file}${issue.line ? `:${issue.line}` : ''}\`)` : ''
    const scope = issue.entityRef ? ` [ref: \`<${issue.entityRef}>\`]` : ''
    out.push(`- **${issue.code}**${scope}${loc}: ${issue.message}`)
    if (issue.suggestion) out.push(`  - → ${issue.suggestion}`)
  }
  out.push('')
}

function spaceCounts(space: Space) {
  let components = 0
  let models = 0
  let tables = 0
  for (const mod of space.modules) {
    components += mod.components.length
    models += mod.models.length
    tables += mod.tables.length
    for (const d of mod.domains) {
      components += d.components.length
      models += d.models.length
      tables += d.tables.length
    }
  }
  return {
    actors: space.actors.length,
    modules: space.modules.length,
    components,
    models,
    tables,
    useCases: space.useCases.length,
  }
}
