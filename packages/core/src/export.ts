/**
 * AI-facing exporters — the ONE place Pizza Doc renders itself for an LLM.
 *
 * Two scopes share the same block emitters, so a component / model / table
 * always renders the same way (v0.6 — W3):
 *   - `exportSpaceForAi(space, options)` — the whole space (UI export
 *     button, `pd export ai`). Full fidelity: everything the schema knows
 *     is emitted — field validation, enum values, cardinality, state
 *     machines with scenarios, pub/sub edges, routes and auth, call
 *     credentials, wire captures, error mapping, config map, external
 *     deps, health contracts, table migrations, ADR / runbook indexes.
 *   - `renderImplementationBrief(space, uc, ctx, options)` — one use case,
 *     self-contained for a cheap implementer. Context comes from
 *     `collectBriefContext` (components on the path, transitive model
 *     closure, tables incl. persistedAs, config of involved consumers,
 *     decidedBy ADRs, unresolved-type self-check).
 *
 * Format: markdown with YAML-shaped code blocks. YAML rather than tables
 * because it is source-faithful — an agent can write a block back into the
 * spec — and because union types (`A | B`) would break a markdown table
 * cell. Every cross-reference is wrapped in angle brackets
 * (`<module:x/model:Y>`) so agents treat refs as navigable handles.
 *
 * Environment-agnostic on purpose (the web UI runs this in the browser):
 * no fs access here. ADR bodies come in via `space.decisions[].body` (when
 * the loader was asked for them) or the brief's `adrBodies` option — the
 * CLI reads them from disk and passes them in.
 */

import { buildRefIndex } from './ref.js'
import type {
  Actor,
  AdrRef,
  Column,
  Component,
  ConfigMapEntry,
  ErrorMapping,
  ExternalDepEntry,
  HealthContractFile,
  Method,
  Model,
  Module,
  Route,
  Space,
  StateMachine,
  StateMachineFile,
  StateMachineScenario,
  StateMachineTransition,
  Table,
  UseCase,
  UseCaseStep,
  Validation,
} from './schema.js'
import { isPrimitiveTypeName, typeLeafTokens } from './validator/semantic.js'
import type { ValidationIssue } from './validator/types.js'

export interface AiExportOptions {
  /** Optional ISO timestamp; defaults to `new Date().toISOString()`. */
  timestamp?: string
  /** Optional framework version (goes into the header). Default: 0.1.0. */
  pizzaDocVersion?: string
  /** Validation issues for the Validation Summary section. */
  issues?: readonly ValidationIssue[]
}

// ---------- local walkers ----------

interface ComponentCtx {
  component: Component
  module: Module
  ref: string
}
interface ModelCtx {
  model: Model
  module: Module
  ref: string
}
interface TableCtx {
  table: Table
  module: Module
  ref: string
}

function* allComponentCtxs(space: Space): Generator<ComponentCtx> {
  for (const mod of space.modules) {
    for (const c of mod.components) {
      yield { component: c, module: mod, ref: `module:${mod.id}/component:${c.id}` }
    }
    for (const d of mod.domains) {
      for (const c of d.components) {
        yield {
          component: c,
          module: mod,
          ref: `module:${mod.id}/domain:${d.id}/component:${c.id}`,
        }
      }
    }
  }
}

function* allModelCtxs(space: Space): Generator<ModelCtx> {
  for (const mod of space.modules) {
    for (const m of mod.models) {
      yield { model: m, module: mod, ref: `module:${mod.id}/model:${m.id}` }
    }
    for (const d of mod.domains) {
      for (const m of d.models) {
        yield { model: m, module: mod, ref: `module:${mod.id}/domain:${d.id}/model:${m.id}` }
      }
    }
  }
}

function* allTableCtxs(space: Space): Generator<TableCtx> {
  for (const mod of space.modules) {
    for (const t of mod.tables) {
      yield { table: t, module: mod, ref: `module:${mod.id}/table:${t.id}` }
    }
    for (const d of mod.domains) {
      for (const t of d.tables) {
        yield { table: t, module: mod, ref: `module:${mod.id}/domain:${d.id}/table:${t.id}` }
      }
    }
  }
}

// ---------- inline formatters ----------

/** `min=1, maxLen=64, format=email, enum=a|b` */
function fmtValidation(v: Validation): string {
  const bits: string[] = []
  if (v.format) bits.push(`format=${v.format}`)
  if (v.minLength !== undefined) bits.push(`minLen=${v.minLength}`)
  if (v.maxLength !== undefined) bits.push(`maxLen=${v.maxLength}`)
  if (v.min !== undefined) bits.push(`min=${v.min}`)
  if (v.max !== undefined) bits.push(`max=${v.max}`)
  if (v.pattern) bits.push(`pattern=${v.pattern}`)
  if (v.enumValues) bits.push(`enum=${v.enumValues.join('|')}`)
  return bits.join(', ')
}

/** `{ type: shared-secret, header: X-Api-Key, env: PAYMENT_KEY }` */
function fmtAuth(auth: {
  type: string
  header?: string | undefined
  env?: string | undefined
}): string {
  const bits = [`type: ${auth.type}`]
  if (auth.header) bits.push(`header: ${auth.header}`)
  if (auth.env) bits.push(`env: ${auth.env}`)
  return `{ ${bits.join(', ')} }`
}

// ---------- shared block emitters ----------

/**
 * Full component contract. `h` is the markdown heading prefix (`###` in a
 * brief, `######` inside the nested full-space export).
 */
function emitComponentBlock(out: string[], h: string, ref: string, c: Component): void {
  out.push(`${h} \`<${ref}>\` ${c.name} (${c.type})`)
  out.push('')
  if (c.description) {
    out.push(c.description)
    out.push('')
  }
  const hasFence =
    c.methods.length > 0 ||
    c.routes.length > 0 ||
    c.emits.length > 0 ||
    c.subscribes.length > 0 ||
    (c.composes?.length ?? 0) > 0
  if (hasFence) {
    out.push('```')
    if (c.methods.length > 0) {
      out.push('methods:')
      for (const m of c.methods) emitMethodLines(out, m)
    }
    if (c.routes.length > 0) {
      out.push('routes:')
      for (const r of c.routes) emitRouteLine(out, r)
    }
    if (c.emits.length > 0) {
      out.push('emits:')
      for (const e of c.emits) {
        out.push(`  - event: <${e.event}>`)
        if (e.to.length > 0) out.push(`    to: [${e.to.map((t) => `<${t}>`).join(', ')}]`)
        if (e.description) out.push(`    description: ${e.description}`)
      }
    }
    if (c.subscribes.length > 0) {
      out.push('subscribes:')
      for (const s of c.subscribes) {
        out.push(`  - event: <${s.event}>`)
        if (s.via) out.push(`    via: <${s.via}>`)
        if (s.idempotency) {
          const bits = [`key: ${s.idempotency.key}`]
          if (s.idempotency.strategy) bits.push(`strategy: ${s.idempotency.strategy}`)
          out.push(`    idempotency: { ${bits.join(', ')} }`)
        }
        if (s.description) out.push(`    description: ${s.description}`)
      }
    }
    if (c.composes && c.composes.length > 0) {
      out.push(`composes: [${c.composes.map((x) => `<${x}>`).join(', ')}]`)
    }
    out.push('```')
    out.push('')
  }
  const notes: string[] = []
  if (c.wireCapture) {
    const wc = c.wireCapture
    notes.push(
      `**Wire capture:** \`${wc.path}\` (${wc.source}, ${wc.capturedAt}${wc.capturedAgainst ? `, against ${wc.capturedAgainst}` : ''})`,
    )
  }
  if (c.decidedBy.length > 0) notes.push(`**Decisions:** ${c.decidedBy.join(', ')}`)
  if (c.entrypoint) notes.push(`**Entrypoint:** ${c.entrypoint.kind} — ${c.entrypoint.reason}`)
  if (notes.length > 0) {
    for (const n of notes) out.push(n)
    out.push('')
  }
}

function emitMethodLines(out: string[], m: Method): void {
  out.push(`  - name: ${m.name}`)
  if (m.httpMethod) out.push(`    httpMethod: ${m.httpMethod}`)
  if (m.httpPath) out.push(`    httpPath: ${m.httpPath}`)
  if (m.routeAuth) out.push(`    routeAuth: ${fmtAuth(m.routeAuth)}`)
  if (m.params.length > 0) {
    out.push('    params:')
    for (const p of m.params) {
      out.push(`      - name: ${p.name}`)
      out.push(`        type: ${p.type}`)
      if (p.cardinality === 'many') out.push('        cardinality: many')
      if (p.optional) out.push('        optional: true')
      if (p.validation) out.push(`        validation: ${fmtValidation(p.validation)}`)
      if (p.description) out.push(`        description: ${p.description}`)
    }
  }
  out.push(`    returns: ${m.returns}`)
  if (m.throws.length > 0) out.push(`    throws: [${m.throws.join(', ')}]`)
  if (m.calls.length > 0) {
    out.push('    calls:')
    for (const call of m.calls) {
      const extra: string[] = []
      if (call.method) extra.push(`method: ${call.method}`)
      if (call.path) extra.push(`path: ${call.path}`)
      if (call.credential) extra.push(`credential: ${fmtAuth(call.credential)}`)
      if (call.optional) extra.push('optional: true')
      if (call.description) extra.push(`description: ${JSON.stringify(call.description)}`)
      out.push(
        extra.length === 0
          ? `      - <${call.target}>`
          : `      - { target: <${call.target}>, ${extra.join(', ')} }`,
      )
    }
  }
  if (m.description) out.push(`    description: ${m.description}`)
}

function emitRouteLine(out: string[], r: Route): void {
  const auth = r.auth ? `  # auth: ${fmtAuth(r.auth)}` : ''
  const desc = r.description ? `  # ${r.description}` : ''
  out.push(`  - ${r.method} ${r.path}${auth || desc}`)
}

/** Full model block: enum values, fields with validation, state machine. */
function emitModelBlock(out: string[], h: string, ref: string, m: Model): void {
  out.push(`${h} \`<${ref}>\` ${m.name} (${m.modelKind})`)
  out.push('')
  const meta: string[] = []
  if (m.persistedAs) meta.push(`**Persisted as:** \`<${m.persistedAs}>\``)
  if (m.topic) meta.push(`**Topic:** \`${m.topic}\``)
  if (m.delivery) {
    meta.push(
      `**Delivery:** ${m.delivery}${m.orderingKey ? `, ordered by \`${m.orderingKey}\`` : ''}`,
    )
  } else if (m.orderingKey) {
    meta.push(`**Ordered by:** \`${m.orderingKey}\``)
  }
  if (meta.length > 0) {
    for (const line of meta) out.push(line)
    out.push('')
  }
  if (m.description) {
    out.push(m.description)
    out.push('')
  }
  if ((m.values?.length ?? 0) > 0 || m.fields.length > 0) {
    out.push('```')
    if (m.values && m.values.length > 0) {
      out.push(`values: [${m.values.join(', ')}]`)
    }
    if (m.fields.length > 0) {
      out.push('fields:')
      for (const f of m.fields) {
        out.push(`  - name: ${f.name}`)
        out.push(`    type: ${f.type}`)
        if (f.cardinality === 'many') out.push('    cardinality: many')
        if (f.optional) out.push('    optional: true')
        if (!f.persisted) out.push('    persisted: false')
        if (f.validation) out.push(`    validation: ${fmtValidation(f.validation)}`)
        if (f.example !== undefined) out.push(`    example: ${JSON.stringify(f.example)}`)
        if (f.description) out.push(`    description: ${f.description}`)
      }
    }
    out.push('```')
    out.push('')
  }
  if (m.stateMachine) emitStateMachineLines(out, m.stateMachine)
}

function emitStateMachineLines(out: string[], sm: StateMachine): void {
  out.push(`**State machine on field \`${sm.field}\`:**`)
  out.push(`- states: ${sm.states.join(', ')}`)
  if (sm.initial) out.push(`- initial: ${sm.initial}`)
  if (sm.terminal.length > 0) out.push(`- terminal: ${sm.terminal.join(', ')}`)
  emitTransitionLines(out, sm.transitions)
  emitScenarioLines(out, sm.scenarios)
  out.push('')
}

function emitTransitionLines(out: string[], transitions: readonly StateMachineTransition[]): void {
  if (transitions.length === 0) return
  out.push('- transitions:')
  for (const t of transitions) {
    const tos = Array.isArray(t.to) ? t.to.join(' | ') : t.to
    const trigger = t.trigger ?? t.on
    out.push(
      `  - ${t.from} → ${tos}${trigger ? ` on \`${trigger}\`` : ''}${t.guard ? ` guard: ${t.guard}` : ''}`,
    )
  }
}

function emitScenarioLines(out: string[], scenarios: readonly StateMachineScenario[]): void {
  if (scenarios.length === 0) return
  out.push('- scenarios (contract tests):')
  for (const s of scenarios) {
    out.push(`  - ${s.id}: given ${s.given}; when ${s.when}; then: [${s.then.join('; ')}]`)
  }
}

/** Standalone state-machine file (module- or space-level). */
function emitStateMachineFileBlock(out: string[], h: string, sm: StateMachineFile): void {
  out.push(`${h} State machine: ${sm.name} (\`${sm.id}\`)`)
  out.push('')
  if (sm.description) {
    out.push(sm.description)
    out.push('')
  }
  if (sm.governs) out.push(`- governs: ${sm.governs}`)
  out.push(`- states: ${sm.states.join(', ')}`)
  if (sm.initial) out.push(`- initial: ${sm.initial}`)
  if (sm.terminal.length > 0) out.push(`- terminal: ${sm.terminal.join(', ')}`)
  emitTransitionLines(out, sm.transitions)
  emitScenarioLines(out, sm.scenarios)
  out.push('')
}

function emitTableBlock(out: string[], h: string, ref: string, t: Table): void {
  out.push(`${h} \`<${ref}>\` ${t.name}`)
  out.push('')
  if (t.description) {
    out.push(t.description)
    out.push('')
  }
  out.push('```')
  out.push('columns:')
  for (const c of t.columns) emitColumnLines(out, c)
  if (t.indexes.length > 0) {
    out.push('indexes:')
    for (const idx of t.indexes) {
      out.push(`  - name: ${idx.name}`)
      out.push(`    columns: [${idx.columns.join(', ')}]`)
      if (idx.unique) out.push('    unique: true')
    }
  }
  if (t.migrations.length > 0) {
    out.push('migrations:')
    for (const mig of t.migrations) {
      const cols = mig.columns.length > 0 ? `: [${mig.columns.join(', ')}]` : ''
      const desc = mig.description ? `  # ${mig.description}` : ''
      out.push(`  - ${mig.id} ${mig.action}${cols}${desc}`)
    }
  }
  out.push('```')
  out.push('')
}

function emitColumnLines(out: string[], column: Column): void {
  out.push(`  - name: ${column.name}`)
  out.push(`    sqlType: ${column.sqlType}`)
  if (column.primaryKey) out.push('    primaryKey: true')
  if (column.unique) out.push('    unique: true')
  if (column.nullable) out.push('    nullable: true')
  if (column.default !== undefined) out.push(`    default: ${column.default}`)
  if (column.foreignKey) {
    out.push(`    foreignKey: <${column.foreignKey.table}>.${column.foreignKey.column}`)
  }
  if (column.description) out.push(`    description: ${column.description}`)
}

/** Exception → HTTP status mapping. Table form — names never carry pipes. */
function emitErrorMappingTable(out: string[], mapping: readonly ErrorMapping[]): void {
  out.push('| exception | status | code |')
  out.push('|---|---|---|')
  for (const em of mapping) {
    out.push(`| ${em.exception} | ${em.httpStatus} | ${em.code ?? ''} |`)
  }
  out.push('')
}

function emitConfigEntryLines(out: string[], entry: ConfigMapEntry): void {
  out.push(
    `- \`${entry.key}\` — ${entry.type}, ${entry.lifecycle}, ${entry.mutability}; consumer \`<${entry.consumer.component}>\``,
  )
  const details: string[] = []
  if (entry.description) details.push(entry.description)
  if (entry.sourceOfTruth) details.push(`source of truth: ${entry.sourceOfTruth}`)
  if (entry.defaultValue !== undefined) details.push(`default: ${entry.defaultValue}`)
  if (details.length > 0) out.push(`  ${details.join('; ')}`)
}

function emitExternalDepLines(out: string[], dep: ExternalDepEntry): void {
  if (dep.kind === 'http-api' || dep.kind === undefined) {
    out.push(
      `- \`${dep.name}\` — ${dep.direction} ${dep.protocol} → ${dep.endpoint}; auth ${dep.auth}${dep.usesConfigKey ? ` (key \`${dep.usesConfigKey}\`)` : ''}; consumer \`<${dep.consumer}>\``,
    )
    const details: string[] = []
    if (dep.purpose) details.push(dep.purpose)
    if (dep.failureMode) details.push(`failure mode: ${dep.failureMode}`)
    if (details.length > 0) out.push(`  ${details.join('; ')}`)
    return
  }
  const where = dep.kind === 'apt-package' ? ` via ${dep.manager}` : ` @ ${dep.install_path}`
  const bits: string[] = []
  if (dep.lifecycle) bits.push(`lifecycle ${dep.lifecycle}`)
  if (dep.required_in_profiles.length > 0) {
    bits.push(`profiles [${dep.required_in_profiles.join(', ')}]`)
  }
  out.push(
    `- \`${dep.name}\` (${dep.kind})${where}${bits.length > 0 ? `; ${bits.join('; ')}` : ''}`,
  )
  if (dep.description) out.push(`  ${dep.description}`)
}

function emitHealthContractLines(out: string[], hc: HealthContractFile): void {
  out.push(`**Health contract:** \`${hc.path}\` → ${hc.okStatus}`)
  for (const f of hc.fields) {
    const en = f.enumValues ? ` enum [${f.enumValues.join(', ')}]` : ''
    out.push(`- ${f.name}: ${f.type}${f.required ? '' : ' (optional)'}${en}`)
  }
  out.push('')
}

// ---------- full-space export ----------

export function exportSpaceForAi(space: Space, options: AiExportOptions = {}): string {
  const out: string[] = []
  const timestamp = options.timestamp ?? new Date().toISOString()
  const version = options.pizzaDocVersion ?? space.meta.pizzaDocVersion ?? '0.1.0'

  const counts = spaceCounts(space)

  out.push(`# Pizza Doc Export: ${space.meta.id}`)
  out.push('')
  out.push(`> Exported from space \`${space.meta.id}\` at ${timestamp} by Pizza Doc ${version}.`)
  out.push(
    `> Contains: ${counts.actors} actors · ${counts.modules} modules · ${counts.useCases} use cases · ${counts.components} components · ${counts.models} models · ${counts.tables} tables · ${counts.decisions} decisions · ${counts.runbooks} runbooks.`,
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
  if (space.meta.implementationLanguage) {
    out.push(
      `**Implementation stack:** ${space.meta.implementationLanguage}${space.meta.implementationFramework ? `/${space.meta.implementationFramework}` : ''}`,
    )
  }
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
  for (const module of space.modules) emitModule(out, module)
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

  // ---------- Decisions / runbooks / cross-module state machines ----------
  const decisions = space.decisions ?? []
  if (decisions.length > 0) {
    out.push('## Decisions (ADRs)')
    out.push('')
    for (const adr of decisions) {
      out.push(`### ${adr.id} — ${adr.title} (${adr.status}${adr.date ? `, ${adr.date}` : ''})`)
      out.push('')
      if (adr.supersededBy) out.push(`_Superseded by ${adr.supersededBy}._`)
      // Bodies stay on disk by default; the loader populates `body` only
      // when an exporter asks for decisions to be included.
      out.push(adr.body ? adr.body : `_Body at \`${adr.path}\`._`)
      out.push('')
    }
    out.push('---')
    out.push('')
  }
  const runbooks = space.runbooks ?? []
  if (runbooks.length > 0) {
    out.push('## Runbooks')
    out.push('')
    for (const rb of runbooks) {
      const covers = rb.covers.length > 0 ? `; covers: [${rb.covers.join(', ')}]` : ''
      out.push(`- \`${rb.id}\` (${rb.severity}) — ${rb.title}${covers}`)
      if (rb.trigger) out.push(`  trigger: ${rb.trigger}`)
    }
    out.push('')
    out.push('---')
    out.push('')
  }
  const opSms = space.operationsStateMachines ?? []
  if (opSms.length > 0) {
    out.push('## Cross-module state machines')
    out.push('')
    for (const sm of opSms) emitStateMachineFileBlock(out, '###', sm)
    out.push('---')
    out.push('')
  }

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
    '- YAML-shaped code blocks are source-faithful: they mirror the spec files, so a changed block can be written back into the space.',
  )
  out.push(
    '- Preserve dataFlow transforms literally. A transform like `via PasswordHasher.hash (bcrypt)` means the hashing step must happen between reading the source field and writing the target column.',
  )
  out.push(
    '- Respect invariants and state-machine scenarios as contract tests you would write around the feature. Every declared error flow must be handled by any generated implementation.',
  )
  out.push(
    '- Method signatures are ground truth. If you must change one while implementing, also update this spec.',
  )
  out.push('')
  return out.join('\n')
}

// ---------- full-space emitters ----------

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

function emitModule(out: string[], module: Module): void {
  out.push(`### \`<module:${module.id}>\` ${module.name}`)
  out.push('')
  out.push(`**Type:** ${module.type}  `)
  if (module.techStack) out.push(`**Tech stack:** ${module.techStack}`)
  if (module.description) {
    out.push('')
    out.push(module.description)
  }
  out.push('')

  if (module.errorMapping.length > 0) {
    out.push('#### Exception → HTTP status mapping')
    out.push('')
    emitErrorMappingTable(out, module.errorMapping)
  }
  if (module.configMap.length > 0) {
    out.push('#### Configuration')
    out.push('')
    for (const entry of module.configMap) emitConfigEntryLines(out, entry)
    out.push('')
  }
  if (module.externalDeps.length > 0) {
    out.push('#### External dependencies')
    out.push('')
    for (const dep of module.externalDeps) emitExternalDepLines(out, dep)
    out.push('')
  }
  if (module.healthContract) emitHealthContractLines(out, module.healthContract)
  if (module.stateMachines.length > 0) {
    out.push('#### State machines')
    out.push('')
    for (const sm of module.stateMachines) emitStateMachineFileBlock(out, '#####', sm)
  }
  if (module.decisions.length > 0) {
    out.push(`**Decisions:** ${module.decisions.join(', ')}`)
    out.push('')
  }

  if (module.domains.length > 0) {
    out.push('#### Domains')
    out.push('')
    for (const domain of module.domains) {
      const dref = `module:${module.id}/domain:${domain.id}`
      out.push(`##### \`<${dref}>\` ${domain.name}`)
      out.push('')
      if (domain.description) {
        out.push(domain.description)
        out.push('')
      }
      for (const c of domain.components) {
        emitComponentBlock(out, '######', `${dref}/component:${c.id}`, c)
      }
      for (const m of domain.models) emitModelBlock(out, '######', `${dref}/model:${m.id}`, m)
      for (const t of domain.tables) emitTableBlock(out, '######', `${dref}/table:${t.id}`, t)
    }
  }

  if (module.components.length > 0) {
    out.push('#### Components (module-level)')
    out.push('')
    for (const c of module.components) {
      emitComponentBlock(out, '######', `module:${module.id}/component:${c.id}`, c)
    }
  }
  if (module.models.length > 0) {
    out.push('#### Models (module-level)')
    out.push('')
    for (const m of module.models) {
      emitModelBlock(out, '######', `module:${module.id}/model:${m.id}`, m)
    }
  }
  if (module.tables.length > 0) {
    out.push('#### Tables (module-level)')
    out.push('')
    for (const t of module.tables) {
      emitTableBlock(out, '######', `module:${module.id}/table:${t.id}`, t)
    }
  }

  out.push('---')
  out.push('')
}

function emitUseCase(out: string[], useCase: UseCase): void {
  out.push(`### \`<usecase:${useCase.id}>\` ${useCase.name}`)
  out.push('')
  out.push(`**Actor:** \`<${useCase.actor}>\`  `)
  out.push(`**Trigger:** ${useCase.trigger}`)
  if (useCase.perspective) out.push(`**Perspective:** ${useCase.perspective}`)
  if (useCase.description) {
    out.push('')
    out.push(useCase.description)
  }
  out.push('')

  if (useCase.requires.length > 0) {
    out.push('#### Requirements (guards)')
    out.push('')
    for (const r of useCase.requires) {
      const bits: string[] = []
      if (r.role) bits.push(`role=${r.role}`)
      if (r.tenantRole) bits.push(`tenantRole=${r.tenantRole}`)
      if (r.tenantContext !== undefined) bits.push(`tenantContext=${r.tenantContext}`)
      if (r.flag) bits.push(`flag=${r.flag}`)
      out.push(`- ${bits.join(', ')}${r.description ? ` — ${r.description}` : ''}`)
    }
    out.push('')
  }

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
      const arrow = df.cardinality === 'many' ? '⇉' : '→'
      out.push(`  - ${df.sourceField} ${arrow} ${df.targetField}`)
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
  if (step.kind) out.push(`    kind: ${step.kind}`)
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
    decisions: (space.decisions ?? []).length,
    runbooks: (space.runbooks ?? []).length,
  }
}

// ---------- implementation brief (per-use-case scope) ----------

export interface BriefComponent {
  ref: string
  component: Component
  module: Module
}

export interface BriefContext {
  /** Concrete components the steps touch, in first-encounter order. */
  components: BriefComponent[]
  /** Transitive model closure: via + signatures + dataFlow + field types. */
  models: Array<{ ref: string; model: Model }>
  /** Sql-step targets, dataFlow targets, `persistedAs` of included models. */
  tables: Array<{ ref: string; table: Table }>
  errorMapping: ErrorMapping[]
  configEntries: Array<{ module: Module; entry: ConfigMapEntry }>
  decisions: AdrRef[]
  /**
   * Type names used by the rendered contracts that resolve to nothing —
   * same exemptions as TYPE_UNRESOLVED (primitives, errorMapping
   * exceptions, external-module surfaces). Non-empty ⇒ the brief is not
   * self-contained; `pd export implementation-brief` exits 1 on it.
   */
  unresolvedTypes: string[]
}

export function collectBriefContext(space: Space, uc: UseCase): BriefContext {
  const index = buildRefIndex(space)
  const allSteps = [...uc.steps, ...uc.errorFlows.flatMap((ef) => ef.steps)]

  // -- Components: every step endpoint that resolves to a component (or a
  // method — normalized to its owner), in step order.
  const componentRefs = new Set<string>()
  const components: BriefComponent[] = []
  const addComponent = (ref: string): void => {
    const target = index.get(ref)
    const compRef =
      target?.kind === 'component'
        ? ref
        : target?.kind === 'method'
          ? ref.slice(0, ref.lastIndexOf('/method:'))
          : null
    if (!compRef || componentRefs.has(compRef)) return
    const comp = index.get(compRef)
    if (comp?.kind !== 'component') return
    componentRefs.add(compRef)
    components.push({ ref: compRef, component: comp.entity, module: comp.module })
  }
  for (const s of allSteps) {
    addComponent(s.from)
    addComponent(s.to)
  }

  // -- Model closure: seeds (via refs, dataFlow names, involved
  // signatures), then a fixpoint over the fields of every included model.
  const modelCtxByRef = new Map<string, ModelCtx>()
  const modelCtxsByName = new Map<string, ModelCtx[]>()
  for (const mctx of allModelCtxs(space)) {
    modelCtxByRef.set(mctx.ref, mctx)
    for (const key of [mctx.model.id, mctx.model.name]) {
      const list = modelCtxsByName.get(key) ?? []
      list.push(mctx)
      modelCtxsByName.set(key, list)
    }
  }
  const exceptionNames = new Set<string>()
  for (const mod of space.modules) {
    for (const em of mod.errorMapping) exceptionNames.add(em.exception)
  }

  const includedModelRefs = new Set<string>()
  const models: Array<{ ref: string; model: Model }> = []
  const queue: ModelCtx[] = []
  const unresolved = new Set<string>()
  const includeModel = (mctx: ModelCtx): void => {
    if (includedModelRefs.has(mctx.ref)) return
    includedModelRefs.add(mctx.ref)
    models.push({ ref: mctx.ref, model: mctx.model })
    queue.push(mctx)
  }
  const includeModelsNamed = (token: string): boolean => {
    const ctxs = modelCtxsByName.get(token)
    if (!ctxs || ctxs.length === 0) return false
    for (const mctx of ctxs) includeModel(mctx)
    return true
  }
  const harvestType = (declared: string, fromExternal: boolean): void => {
    for (const token of typeLeafTokens(declared)) {
      if (isPrimitiveTypeName(token)) continue
      if (includeModelsNamed(token)) continue
      if (exceptionNames.has(token)) continue
      if (!fromExternal) unresolved.add(token)
    }
  }

  for (const s of allSteps) {
    if (!s.via) continue
    const mctx = modelCtxByRef.get(s.via)
    if (mctx) includeModel(mctx)
  }
  for (const df of uc.dataFlow) {
    const src = df.sourceField.split('.')[0]
    const tgt = df.targetField.split('.')[0]
    if (src) includeModelsNamed(src)
    if (tgt) includeModelsNamed(tgt) // may be a table name — tables below
  }
  for (const bc of components) {
    const fromExternal = bc.module.type === 'external'
    for (const m of bc.component.methods) {
      harvestType(m.returns, fromExternal)
      for (const p of m.params) harvestType(p.type, fromExternal)
    }
  }
  while (queue.length > 0) {
    const mctx = queue.shift() as ModelCtx
    const fromExternal = mctx.module.type === 'external'
    for (const f of mctx.model.fields) harvestType(f.type, fromExternal)
  }

  // -- Tables.
  const tableCtxByRef = new Map<string, TableCtx>()
  const tableCtxsByName = new Map<string, TableCtx[]>()
  for (const tctx of allTableCtxs(space)) {
    tableCtxByRef.set(tctx.ref, tctx)
    for (const key of [tctx.table.id, tctx.table.name]) {
      const list = tableCtxsByName.get(key) ?? []
      list.push(tctx)
      tableCtxsByName.set(key, list)
    }
  }
  const includedTableRefs = new Set<string>()
  const tables: Array<{ ref: string; table: Table }> = []
  const includeTable = (tctx: TableCtx | undefined): void => {
    if (!tctx || includedTableRefs.has(tctx.ref)) return
    includedTableRefs.add(tctx.ref)
    tables.push({ ref: tctx.ref, table: tctx.table })
  }
  for (const s of allSteps) {
    for (const ref of [s.from, s.to]) {
      if (index.get(ref)?.kind === 'table') includeTable(tableCtxByRef.get(ref))
    }
  }
  for (const df of uc.dataFlow) {
    const tgt = df.targetField.split('.')[0]
    if (!tgt) continue
    for (const tctx of tableCtxsByName.get(tgt) ?? []) includeTable(tctx)
  }
  for (const ref of includedModelRefs) {
    const persisted = modelCtxByRef.get(ref)?.model.persistedAs
    if (persisted) includeTable(tableCtxByRef.get(persisted))
  }

  // -- Module-scoped context: errorMapping + config of involved modules.
  const errorMapping: ErrorMapping[] = []
  const configEntries: Array<{ module: Module; entry: ConfigMapEntry }> = []
  const seenModules = new Set<string>()
  for (const bc of components) {
    if (seenModules.has(bc.module.id)) continue
    seenModules.add(bc.module.id)
    errorMapping.push(...bc.module.errorMapping)
    for (const entry of bc.module.configMap) {
      const consumer = entry.consumer.component
      if (consumer === `module:${bc.module.id}` || componentRefs.has(consumer)) {
        configEntries.push({ module: bc.module, entry })
      }
    }
  }

  // -- ADRs anchored to the involved components.
  const adrIds = new Set<string>()
  for (const bc of components) {
    for (const id of bc.component.decidedBy) adrIds.add(id)
  }
  const decisions = (space.decisions ?? []).filter((d) => adrIds.has(d.id))

  return {
    components,
    models,
    tables,
    errorMapping,
    configEntries,
    decisions,
    unresolvedTypes: [...unresolved].sort(),
  }
}

export interface BriefRenderOptions {
  /**
   * ADR bodies keyed by ADR id, frontmatter already stripped. The CLI
   * reads these from disk; the web UI can supply them from its file
   * handles. Falls back to `AdrRef.body`, then to a path reference.
   */
  adrBodies?: ReadonlyMap<string, string>
}

export function renderImplementationBrief(
  space: Space,
  uc: UseCase,
  ctx: BriefContext,
  options: BriefRenderOptions = {},
): string {
  const lines: string[] = []
  const push = (...xs: string[]) => lines.push(...xs)

  // ----- Header -----
  push(`# Implementation brief: ${uc.name}`, '')
  push(`> Use case id: \`${uc.id}\``)
  push(`> Actor: \`${uc.actor}\``)
  push(`> Trigger: ${uc.trigger}`)
  if (space.meta.implementationLanguage) {
    push(
      `> Target stack: ${space.meta.implementationLanguage}${space.meta.implementationFramework ? `/${space.meta.implementationFramework}` : ''}`,
    )
  }
  push('')
  if (uc.description) push(uc.description, '')

  // ----- Requires -----
  if (uc.requires.length > 0) {
    push('## Requirements (guards)', '')
    for (const r of uc.requires) {
      const bits: string[] = []
      if (r.role) bits.push(`global role = ${r.role}`)
      if (r.tenantRole) bits.push(`tenant role = ${r.tenantRole}`)
      if (r.tenantContext !== undefined) bits.push(`tenantContext = ${r.tenantContext}`)
      if (r.flag) bits.push(`feature flag = ${r.flag}`)
      push(`- ${bits.join(', ')}${r.description ? ` — ${r.description}` : ''}`)
    }
    push('')
  }

  // ----- Steps -----
  push('## Happy path', '')
  for (const [i, s] of uc.steps.entries()) {
    const via = s.via ? ` via \`<${s.via}>\`` : ''
    const proto = s.protocol ? ` [${s.protocol}]` : ''
    const kind = s.kind && s.kind !== 'sync' ? ` (${s.kind})` : ''
    push(`${i + 1}. \`<${s.from}>\` → \`<${s.to}>\`${via}${proto}${kind}`)
    if (s.description) push(`   ${s.description}`)
  }
  push('')

  // ----- Error flows -----
  if (uc.errorFlows.length > 0) {
    push('## Error flows', '')
    for (const ef of uc.errorFlows) {
      push(`### ${ef.id}`, '', `**Condition:** ${ef.condition}`, '')
      for (const [i, s] of ef.steps.entries()) {
        push(
          `${i + 1}. \`<${s.from}>\` → \`<${s.to}>\`${s.description ? ` — ${s.description}` : ''}`,
        )
      }
      if (ef.resultDescription) push('', `**Result:** ${ef.resultDescription}`)
      push('')
    }
  }

  // ----- Invariants -----
  if (uc.invariants.pre.length > 0 || uc.invariants.post.length > 0) {
    push('## Invariants', '')
    if (uc.invariants.pre.length > 0) {
      push('**Pre:**')
      for (const x of uc.invariants.pre) push(`- ${x}`)
      push('')
    }
    if (uc.invariants.post.length > 0) {
      push('**Post:**')
      for (const x of uc.invariants.post) push(`- ${x}`)
      push('')
    }
  }

  // ----- Data flow -----
  if (uc.dataFlow.length > 0) {
    push('## Data flow (field → column / DTO)', '')
    for (const df of uc.dataFlow) {
      const arrow = df.cardinality === 'many' ? '⇉' : '→'
      push(
        `- \`${df.sourceField}\` ${arrow} \`${df.targetField}\`${df.transform ? ` — ${df.transform}` : ''}`,
      )
    }
    push('')
  }

  // ----- Components on the path (full contracts) -----
  if (ctx.components.length > 0) {
    push('## Components & contracts', '')
    push(
      'Every component the steps touch, with its full method contracts. Method signatures are ground truth — if the implementation needs to deviate, update the spec first.',
      '',
    )
    for (const bc of ctx.components) emitComponentBlock(lines, '###', bc.ref, bc.component)
  }

  // ----- Referenced entities (transitive closure) -----
  if (ctx.models.length > 0) {
    push('## Models referenced (transitive closure)', '')
    for (const { ref, model } of ctx.models) emitModelBlock(lines, '###', ref, model)
  }
  if (ctx.tables.length > 0) {
    push('## Tables referenced', '')
    for (const { ref, table } of ctx.tables) emitTableBlock(lines, '###', ref, table)
  }
  if (ctx.errorMapping.length > 0) {
    push('## Exception → HTTP status mapping', '')
    emitErrorMappingTable(lines, ctx.errorMapping)
  }

  // ----- Configuration -----
  if (ctx.configEntries.length > 0) {
    push('## Configuration read by these components', '')
    for (const { entry } of ctx.configEntries) emitConfigEntryLines(lines, entry)
    push('')
  }

  // ----- Decisions -----
  if (ctx.decisions.length > 0) {
    push('## Decisions (ADRs) binding these components', '')
    for (const adr of ctx.decisions) {
      push(`### ${adr.id} — ${adr.title} (${adr.status})`, '')
      const body = options.adrBodies?.get(adr.id) ?? adr.body ?? null
      push(body ?? `_Body at \`${adr.path}\`._`, '')
    }
  }

  // ----- Self-check -----
  if (ctx.unresolvedTypes.length > 0) {
    push('## ⚠ UNRESOLVED TYPES — fix the spec before handing off', '')
    push(
      'These names appear in the contracts above but resolve to no model in the space (`pd validate` flags them as TYPE_UNRESOLVED):',
      '',
    )
    for (const t of ctx.unresolvedTypes) push(`- \`${t}\``)
    push('')
  }

  push('---')
  push(
    '',
    `Generated by \`pd export implementation-brief ${uc.id}\`. This brief is self-contained — everything the implementer needs to write correct-first-time code for this use case lives in this file.`,
  )

  return lines.join('\n')
}
