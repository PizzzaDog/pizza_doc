import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Component, Model, Space, Table } from '@pizza-doc/core'
import { parseSourceRef } from '../util/anchors.js'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { loadSpaceForCli } from '../util/load.js'
import { resolveSpaceDir } from '../util/space-path.js'
import { allComponents, allModels, allTables } from '../util/space-walk.js'

/**
 * `pd drift --from-jsonl <file> [spaces/<id>] [--json]`
 *
 * Reads a JSONL code-side snapshot (produced by a `pd-extract-<lang>`
 * agent skill running in read-only mode) and diffs it against the
 * current state of the target space. Emits an actionable drift report:
 * what the code has that the spec doesn't, what the spec claims that the
 * code lacks, and what's shared-but-drifted on the field level.
 *
 * Renames (v0.6 — code-anchoring Phase 3): tables/models match by id
 * first, then the unmatched leftovers are paired by `sourceRef` FILE
 * (line suffixes shift on every extract, so they are ignored). A pair
 * means the code renamed the symbol — one RENAME line instead of a fork
 * into codeOnly + spaceOnly, and field drift is still computed across
 * the pair.
 *
 * `--json` prints the full structured diff (review tooling / auto-apply)
 * instead of the human report; exit codes are unchanged.
 *
 * Exits:
 *   0 — in sync (green).
 *   1 — drift present (any category).
 *   2 — usage / parse error.
 */
export async function cmdDrift(args: ParsedArgs): Promise<number> {
  const jsonlFlag = args.flags['from-jsonl']
  if (typeof jsonlFlag !== 'string') {
    console.error(red('usage: pd drift --from-jsonl <file> [spaces/<id>] [--json]'))
    return 2
  }
  if (!fs.existsSync(jsonlFlag)) {
    console.error(red(`file not found: ${jsonlFlag}`))
    return 1
  }

  const { space } = await loadSpaceForCli(resolveSpaceDir(args.positional[0]))
  const codeSide = readJsonl(jsonlFlag)

  const spaceInv = indexSpace(space)
  const codeInv = indexCode(codeSide)

  // v0.6 (code-anchoring Phase 3): a renamed code symbol used to fork the
  // report into codeOnly + spaceOnly; pair the leftovers by sourceRef file.
  const tableDiff = pairRenames(
    spaceInv.tables,
    codeInv.tables,
    diffById(spaceInv.tables, codeInv.tables),
  )
  const modelDiff = pairRenames(
    spaceInv.models,
    codeInv.models,
    diffById(spaceInv.models, codeInv.models),
  )
  const endpointDiff = diffByKey(spaceInv.endpoints, codeInv.endpoints)

  // Field comparison follows the rename pairs: the renamed code entity is
  // re-keyed to its space id so `OrderDto → OrderResponse` still gets a
  // field-level diff.
  const fieldDiffs = computeFieldDiffs(
    spaceInv.models,
    applyRenames(codeInv.models, modelDiff.renamed),
  )
  const columnDiffs = computeColumnDiffs(
    spaceInv.tables,
    applyRenames(codeInv.tables, tableDiff.renamed),
  )

  // v0.3 ops drift: code-side config refs and external calls compared
  // against per-module config-map / external-deps in the spec.
  const configRefs = computeConfigRefDrift(space, codeSide)
  const externalCalls = computeExternalCallDrift(space, codeSide)

  // v0.3 (A6) contract-layer drift: 4 new dimensions on top of
  // existing config/external-call drift. Each consumes a distinct JSONL
  // entry kind emitted by `pd-extract-<lang>` skills.
  const routes = computeRouteDrift(space, codeSide)
  const outboundCalls = computeOutboundCallDrift(space, codeSide)
  const stateEnums = computeStateEnumDrift(space, codeSide)
  const hostAssetPaths = computeHostAssetPathDrift(space, codeSide)

  const renameCount = tableDiff.renamed.length + modelDiff.renamed.length

  const total =
    renameCount +
    tableDiff.codeOnly.length +
    tableDiff.spaceOnly.length +
    modelDiff.codeOnly.length +
    modelDiff.spaceOnly.length +
    endpointDiff.codeOnly.length +
    endpointDiff.spaceOnly.length +
    fieldDiffs.length +
    columnDiffs.length +
    configRefs.length +
    externalCalls.length +
    routes.length +
    outboundCalls.length +
    stateEnums.length +
    hostAssetPaths.length

  // Renames count as significant: every ref in the space still points at
  // the old id, so the spec stays broken until the rename is applied.
  const significant =
    renameCount +
    tableDiff.codeOnly.length +
    modelDiff.codeOnly.length +
    endpointDiff.codeOnly.length +
    configRefs.length +
    externalCalls.length +
    routes.length +
    outboundCalls.length +
    stateEnums.length +
    hostAssetPaths.length

  const verdictKind = total === 0 ? 'in-sync' : significant > 0 ? 'significant' : 'minor'

  // v0.6 (code-anchoring Phase 3) — structured diff for review tooling
  // and auto-apply. Same exit semantics as the human report.
  if (args.flags.json === true) {
    console.log(
      JSON.stringify(
        {
          space: space.meta.id,
          jsonl: path.relative(process.cwd(), jsonlFlag),
          verdict: verdictKind,
          tables: tableDiff,
          models: modelDiff,
          endpoints: endpointDiff,
          fieldDrift: fieldDiffs,
          columnDrift: columnDiffs,
          configRefs,
          externalCalls,
          routes,
          outboundCalls,
          stateEnums,
          hostAssetPaths,
        },
        null,
        2,
      ),
    )
    return total === 0 ? 0 : 1
  }

  const verdict =
    verdictKind === 'in-sync'
      ? green('✓ in sync')
      : verdictKind === 'significant'
        ? red('✗ significant drift')
        : yellow('⚠ minor drift')

  console.log(
    `${bold(cyan(`drift report: ${space.meta.id}`))}  vs  ${dim(path.relative(process.cwd(), jsonlFlag))}`,
  )
  console.log(`  verdict: ${verdict}`)
  console.log(
    `  counts: tables ${tableDiff.codeOnly.length}/${tableDiff.spaceOnly.length}/${columnDiffs.length}  ·  ` +
      `models ${modelDiff.codeOnly.length}/${modelDiff.spaceOnly.length}/${fieldDiffs.length}  ·  ` +
      `renames ${renameCount}  ·  ` +
      `endpoints ${endpointDiff.codeOnly.length}/${endpointDiff.spaceOnly.length}  ·  ` +
      `config-refs ${configRefs.length}  ·  ext-calls ${externalCalls.length}`,
  )
  if (routes.length + outboundCalls.length + stateEnums.length + hostAssetPaths.length > 0) {
    console.log(
      `  contracts (v0.3): routes ${routes.length}  ·  outbound-calls ${outboundCalls.length}  ·  ` +
        `state-enums ${stateEnums.length}  ·  host-asset-paths ${hostAssetPaths.length}`,
    )
  }
  console.log(dim('  (columns/fields above: code-only / space-only / drifted)'))

  // CRITICAL — code present, space missing.
  printBlock(red('CRITICAL — code has, space missing:'), [
    ...tableDiff.codeOnly.map((id) => `table: ${id}`),
    ...modelDiff.codeOnly.map((id) => `model: ${id}`),
    ...endpointDiff.codeOnly.map((k) => `endpoint: ${k}`),
  ])

  printBlock(red('CRITICAL — space claims, code missing:'), [
    ...tableDiff.spaceOnly.map((id) => `table: ${id}`),
    ...modelDiff.spaceOnly.map((id) => `model: ${id}`),
    ...endpointDiff.spaceOnly.map((k) => `endpoint: ${k}`),
  ])

  printBlock(yellow('RENAME — same sourceRef file, different id (code renamed the symbol):'), [
    ...tableDiff.renamed.map((r) => `table: ${r.from} → ${r.to}  (${r.file})`),
    ...modelDiff.renamed.map((r) => `model: ${r.from} → ${r.to}  (${r.file})`),
  ])

  printBlock(
    yellow('MEDIUM — drifted fields:'),
    fieldDiffs.map((d) => fmtFieldDiff(d)),
  )
  printBlock(
    yellow('MEDIUM — drifted columns:'),
    columnDiffs.map((d) => fmtColumnDiff(d)),
  )

  printBlock(
    red('CRITICAL — CONFIG_REF_NOT_IN_SPEC (code reads a config key the spec does not declare):'),
    configRefs.map(fmtConfigRefDrift),
  )
  printBlock(
    red('CRITICAL — EXTERNAL_CALL_NOT_IN_SPEC (code calls an endpoint the spec does not declare):'),
    externalCalls.map(fmtExternalCallDrift),
  )
  // v0.3 (A6) — contract drift output blocks.
  printBlock(
    red('CRITICAL — ROUTE_NOT_IN_SPEC (code serves an HTTP route the spec does not declare):'),
    routes.map(fmtRouteDrift),
  )
  printBlock(
    red('CRITICAL — CALL_NOT_IN_SPEC (code makes a path call the spec does not declare):'),
    outboundCalls.map(fmtOutboundCallDrift),
  )
  printBlock(
    red('CRITICAL — STATE_ENUM_DRIFT (code uses a state value the state machine does not list):'),
    stateEnums.map(fmtStateEnumDrift),
  )
  printBlock(
    red(
      'CRITICAL — HOST_DEP_PATH_DRIFT (deploy/code installs an asset the spec does not declare):',
    ),
    hostAssetPaths.map(fmtHostAssetPathDrift),
  )

  if (total === 0) {
    console.log(`\n${green('No drift detected. Space matches the code.')}`)
    return 0
  }

  // Suggestions.
  console.log(`\n${bold('suggested next steps:')}`)
  if (
    tableDiff.codeOnly.length > 0 ||
    modelDiff.codeOnly.length > 0 ||
    endpointDiff.codeOnly.length > 0
  ) {
    console.log(
      dim('  · for code-only items: review the JSONL, then `pd import --from-jsonl <file>`'),
    )
  }
  if (tableDiff.spaceOnly.length + modelDiff.spaceOnly.length + endpointDiff.spaceOnly.length > 0) {
    console.log(
      dim('  · for space-only items: delete stale yaml OR track as "not yet implemented"'),
    )
  }
  if (fieldDiffs.length + columnDiffs.length > 0) {
    console.log(
      dim('  · for drifted fields/columns: edit yaml by hand OR re-extract + `pd import --force`'),
    )
  }
  if (renameCount > 0) {
    console.log(
      dim(
        '  · for renames: change the yaml id AND every ref pointing at the old id (grep for it) — `pd import` refuses to fork a detected rename',
      ),
    )
  }
  // v0.3 (A6) — `--fail-on-error` ensures CI gating semantics. Without
  // the flag, drift still exits non-zero (existing behavior); with it,
  // we double-down on the contract that drift = build failure.
  if (args.flags['fail-on-error'] === true && significant > 0) return 1
  return 1
}

// ---------- JSONL reader ----------

interface CodeEntry {
  kind?: string
  id?: string
  name?: string
  sourceRef?: string
  fields?: Array<{ name?: string; type?: string }>
  /**
   * Column attrs are tri-state (v0.6 — pizza-shop audit follow-up):
   * `default`: string = this DDL default, null = explicitly NO default,
   * key missing = unknown (table inferred from ORM entities, not DDL).
   * Same for `nullable`. Unknown attrs are skipped by the diff, so
   * entity-derived extracts don't false-positive every column.
   */
  columns?: Array<{ name?: string; sqlType?: string; default?: string | null; nullable?: boolean }>
  methods?: Array<{
    name?: string
    httpMethod?: string
    httpPath?: string
  }>
  [key: string]: unknown
}

function readJsonl(file: string): CodeEntry[] {
  const lines = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
  const out: CodeEntry[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    try {
      out.push(JSON.parse(line) as CodeEntry)
    } catch (e) {
      throw new Error(`invalid JSON on line ${i + 1}: ${(e as Error).message}`)
    }
  }
  return out
}

// ---------- indexing ----------

interface Inventory {
  tables: Map<string, TableShape>
  models: Map<string, ModelShape>
  endpoints: Map<string, EndpointShape>
}
interface ColumnShape {
  sqlType: string
  /** string = default expr, null = known-none, undefined = unknown. */
  default?: string | null
  /** undefined = unknown (code side only; the spec is always concrete). */
  nullable?: boolean
}
interface TableShape {
  id: string
  columns: Map<string, ColumnShape>
  /** Declaration file — the rename-pairing key (line suffix ignored). */
  sourceRef?: string
}
interface ModelShape {
  id: string
  fields: Map<string, string> // name → type
  sourceRef?: string
}
interface EndpointShape {
  key: string // METHOD path
  componentRef?: string
  methodName?: string
}

function indexSpace(space: Space): Inventory {
  const tables = new Map<string, TableShape>()
  for (const { table } of allTables(space)) tables.set(table.id, tableShape(table))
  const models = new Map<string, ModelShape>()
  for (const { model } of allModels(space)) models.set(model.id, modelShape(model))
  const endpoints = new Map<string, EndpointShape>()
  for (const { component, ref } of allComponents(space)) {
    for (const m of component.methods) {
      if (!m.httpMethod || !m.httpPath) continue
      endpoints.set(endpointKey(m.httpMethod, m.httpPath), {
        key: endpointKey(m.httpMethod, m.httpPath),
        componentRef: ref,
        methodName: m.name,
      })
    }
  }
  return { tables, models, endpoints }
}

function indexCode(entries: CodeEntry[]): Inventory {
  const tables = new Map<string, TableShape>()
  const models = new Map<string, ModelShape>()
  const endpoints = new Map<string, EndpointShape>()
  for (const e of entries) {
    if (e.kind === 'table' && e.id) {
      const cols = new Map<string, ColumnShape>()
      for (const c of e.columns ?? []) {
        if (!c.name) continue
        const col: ColumnShape = { sqlType: c.sqlType ?? '' }
        if ('default' in c) col.default = c.default ?? null
        if (typeof c.nullable === 'boolean') col.nullable = c.nullable
        cols.set(c.name, col)
      }
      const shape: TableShape = { id: e.id, columns: cols }
      if (typeof e.sourceRef === 'string') shape.sourceRef = e.sourceRef
      tables.set(e.id, shape)
    } else if (e.kind === 'model' && e.id) {
      const fs = new Map<string, string>()
      for (const f of e.fields ?? []) if (f.name) fs.set(f.name, f.type ?? '')
      const shape: ModelShape = { id: e.id, fields: fs }
      if (typeof e.sourceRef === 'string') shape.sourceRef = e.sourceRef
      models.set(e.id, shape)
    } else if (e.kind === 'component') {
      for (const m of e.methods ?? []) {
        if (m.httpMethod && m.httpPath) {
          const key = endpointKey(m.httpMethod, m.httpPath)
          const shape: EndpointShape = { key }
          if (m.name) shape.methodName = m.name
          endpoints.set(key, shape)
        }
      }
    }
  }
  return { tables, models, endpoints }
}

function tableShape(t: Table): TableShape {
  const cols = new Map<string, ColumnShape>()
  for (const c of t.columns) {
    // Spec side is the contract: an absent `default` MEANS none, and
    // `nullable` is always concrete (the schema defaults it to false).
    cols.set(c.name, { sqlType: c.sqlType, default: c.default ?? null, nullable: c.nullable })
  }
  const shape: TableShape = { id: t.id, columns: cols }
  if (t.sourceRef) shape.sourceRef = t.sourceRef
  return shape
}
function modelShape(m: Model): ModelShape {
  const fields = new Map<string, string>()
  for (const f of m.fields) fields.set(f.name, f.type)
  const shape: ModelShape = { id: m.id, fields }
  if (m.sourceRef) shape.sourceRef = m.sourceRef
  return shape
}

function endpointKey(method: string, pathSpec: string): string {
  // Normalise Express-style `:id` to `{id}` so both sides line up.
  const normalised = pathSpec.replace(/:(\w+)/g, '{$1}')
  return `${method.toUpperCase()} ${normalised}`
}

// ---------- diffs ----------

interface IdDiff {
  codeOnly: string[]
  spaceOnly: string[]
}
function diffById<T>(space: Map<string, T>, code: Map<string, T>): IdDiff {
  const codeOnly = [...code.keys()].filter((k) => !space.has(k)).sort()
  const spaceOnly = [...space.keys()].filter((k) => !code.has(k)).sort()
  return { codeOnly, spaceOnly }
}
function diffByKey<T>(space: Map<string, T>, code: Map<string, T>): IdDiff {
  return diffById(space, code)
}

// ---------- rename pairing (v0.6 — code-anchoring Phase 3) ----------

interface RenamePair {
  /** Space-side id (the stale one). */
  from: string
  /** Code-side id (what the symbol is called now). */
  to: string
  /** The shared sourceRef file that made the pair. */
  file: string
}

interface PairedDiff extends IdDiff {
  renamed: RenamePair[]
}

/**
 * Pair unmatched space/code entities citing the SAME `sourceRef` file —
 * that's a rename, not an add+delete. Line suffixes are stripped (they
 * shift on every extract). Conservative on purpose: a pair forms only
 * when the file maps to exactly one unmatched entity on each side, so a
 * multi-entity file (`models.py`) degrades to the plain
 * codeOnly/spaceOnly report instead of guessing.
 */
function pairRenames<T extends { sourceRef?: string }>(
  space: Map<string, T>,
  code: Map<string, T>,
  diff: IdDiff,
): PairedDiff {
  const byFile = (ids: string[], side: Map<string, T>): Map<string, string[]> => {
    const out = new Map<string, string[]>()
    for (const id of ids) {
      const ref = side.get(id)?.sourceRef
      if (!ref) continue
      const file = parseSourceRef(ref).filePath
      out.set(file, [...(out.get(file) ?? []), id])
    }
    return out
  }
  const spaceFiles = byFile(diff.spaceOnly, space)
  const codeFiles = byFile(diff.codeOnly, code)
  const renamed: RenamePair[] = []
  const claimedFrom = new Set<string>()
  const claimedTo = new Set<string>()
  for (const [file, fromIds] of spaceFiles) {
    const toIds = codeFiles.get(file)
    if (!toIds || fromIds.length !== 1 || toIds.length !== 1) continue
    const from = fromIds[0]
    const to = toIds[0]
    if (!from || !to) continue
    renamed.push({ from, to, file })
    claimedFrom.add(from)
    claimedTo.add(to)
  }
  renamed.sort((a, b) => a.from.localeCompare(b.from))
  return {
    renamed,
    codeOnly: diff.codeOnly.filter((id) => !claimedTo.has(id)),
    spaceOnly: diff.spaceOnly.filter((id) => !claimedFrom.has(id)),
  }
}

/**
 * Re-key renamed code entities to their space id so the field/column
 * comparison still runs across the pair.
 */
function applyRenames<T>(code: Map<string, T>, renamed: RenamePair[]): Map<string, T> {
  if (renamed.length === 0) return code
  const out = new Map(code)
  for (const r of renamed) {
    const entity = out.get(r.to)
    if (entity !== undefined) {
      out.set(r.from, entity)
      out.delete(r.to)
    }
  }
  return out
}

interface FieldDiff {
  ownerId: string
  addedInCode: string[]
  removedInCode: string[]
  typeChanged: Array<{ name: string; space: string; code: string }>
}
function computeFieldDiffs(
  spaceModels: Map<string, ModelShape>,
  codeModels: Map<string, ModelShape>,
): FieldDiff[] {
  const out: FieldDiff[] = []
  for (const [id, codeM] of codeModels) {
    const spaceM = spaceModels.get(id)
    if (!spaceM) continue
    const addedInCode = [...codeM.fields.keys()].filter((k) => !spaceM.fields.has(k))
    const removedInCode = [...spaceM.fields.keys()].filter((k) => !codeM.fields.has(k))
    const typeChanged: FieldDiff['typeChanged'] = []
    for (const [name, type] of spaceM.fields) {
      const codeType = codeM.fields.get(name)
      if (codeType !== undefined && codeType !== type) {
        typeChanged.push({ name, space: type, code: codeType })
      }
    }
    if (addedInCode.length || removedInCode.length || typeChanged.length) {
      out.push({ ownerId: id, addedInCode, removedInCode, typeChanged })
    }
  }
  return out
}
interface ColumnAttrDiff {
  name: string
  attr: 'default' | 'nullable'
  space: string
  code: string
}
interface ColumnDiff extends FieldDiff {
  attrChanged: ColumnAttrDiff[]
}

function computeColumnDiffs(
  spaceTables: Map<string, TableShape>,
  codeTables: Map<string, TableShape>,
): ColumnDiff[] {
  const out: ColumnDiff[] = []
  for (const [id, codeT] of codeTables) {
    const spaceT = spaceTables.get(id)
    if (!spaceT) continue
    const addedInCode = [...codeT.columns.keys()].filter((k) => !spaceT.columns.has(k))
    const removedInCode = [...spaceT.columns.keys()].filter((k) => !codeT.columns.has(k))
    const typeChanged: FieldDiff['typeChanged'] = []
    const attrChanged: ColumnAttrDiff[] = []
    for (const [name, spaceCol] of spaceT.columns) {
      const codeCol = codeT.columns.get(name)
      if (!codeCol) continue
      if (codeCol.sqlType !== spaceCol.sqlType) {
        typeChanged.push({ name, space: spaceCol.sqlType, code: codeCol.sqlType })
      }
      // v0.6 — the created_at class (pizza-shop audit): spec declares
      // DEFAULT now(), code DDL has none, and the first INSERT that omits
      // the column dies at runtime. Attrs are compared only when the code
      // side KNOWS them (tri-state in CodeEntry.columns) — an
      // entity-derived table reports nothing and stays silent here.
      if (
        codeCol.default !== undefined &&
        !sqlDefaultEq(spaceCol.default ?? null, codeCol.default)
      ) {
        attrChanged.push({
          name,
          attr: 'default',
          space: spaceCol.default ?? 'none',
          code: codeCol.default ?? 'none',
        })
      }
      if (
        codeCol.nullable !== undefined &&
        spaceCol.nullable !== undefined &&
        codeCol.nullable !== spaceCol.nullable
      ) {
        attrChanged.push({
          name,
          attr: 'nullable',
          space: String(spaceCol.nullable),
          code: String(codeCol.nullable),
        })
      }
    }
    if (addedInCode.length || removedInCode.length || typeChanged.length || attrChanged.length) {
      out.push({ ownerId: id, addedInCode, removedInCode, typeChanged, attrChanged })
    }
  }
  return out
}

/** Case-insensitive, whitespace-trimmed SQL default comparison. */
function sqlDefaultEq(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function fmtFieldDiff(d: FieldDiff): string {
  const lines = [`model '${d.ownerId}':`]
  for (const f of d.addedInCode) lines.push(`  + added in code: ${f}`)
  for (const f of d.removedInCode) lines.push(`  - removed in code: ${f}`)
  for (const t of d.typeChanged) lines.push(`  ~ ${t.name}: space=${t.space} code=${t.code}`)
  return lines.join('\n    ')
}
function fmtColumnDiff(d: ColumnDiff): string {
  const lines = [`table '${d.ownerId}':`]
  for (const f of d.addedInCode) lines.push(`  + added in code: ${f}`)
  for (const f of d.removedInCode) lines.push(`  - removed in code: ${f}`)
  for (const t of d.typeChanged) lines.push(`  ~ ${t.name}: space=${t.space} code=${t.code}`)
  for (const a of d.attrChanged) {
    lines.push(`  ~ ${a.name} ${a.attr}: space=${a.space} code=${a.code}`)
  }
  return lines.join('\n    ')
}

function printBlock(title: string, items: string[]): void {
  if (items.length === 0) return
  console.log(`\n${title}`)
  for (const it of items) console.log(`  ${it}`)
}

// ---------- v0.3 operations drift ----------

interface ConfigRefDrift {
  module: string
  key: string
  callsites: Array<{ file?: string; line?: number }>
}

interface ExternalCallDrift {
  module: string
  endpoint: string
  protocol?: string
  callsites: Array<{ file?: string; line?: number }>
}

interface PlacementHint {
  module?: string
  file?: string
  line?: number
}

interface ConfigRefEntry extends CodeEntry {
  kind: 'config-ref'
  key?: string
  _placement?: PlacementHint
}

interface ExternalCallEntry extends CodeEntry {
  kind: 'external-call'
  endpoint?: string
  protocol?: string
  _placement?: PlacementHint
}

/**
 * For each `{ kind: 'config-ref', _placement: { module: M }, key: K }` in
 * the JSONL, check whether `space.modules[M].configMap` declares `K`. If
 * not, that's drift. We aggregate by (module, key) so a hot config key
 * read at 50 call-sites doesn't produce 50 separate report lines —
 * the agent or CI maintainer wants one line saying "STRIPE_API_KEY is
 * read 50× and not in the spec".
 */
export function computeConfigRefDrift(
  space: { modules: Array<{ id: string; configMap: Array<{ key: string }> }> },
  entries: CodeEntry[],
): ConfigRefDrift[] {
  const moduleKeys = new Map<string, Set<string>>()
  for (const m of space.modules) {
    moduleKeys.set(m.id, new Set(m.configMap.map((c) => c.key)))
  }
  const drift = new Map<string, ConfigRefDrift>()
  for (const raw of entries) {
    if (raw.kind !== 'config-ref') continue
    const e = raw as ConfigRefEntry
    const moduleId = e._placement?.module
    const key = e.key
    if (!moduleId || !key) continue
    const declared = moduleKeys.get(moduleId)
    if (declared?.has(key)) continue
    const id = `${moduleId}/${key}`
    let drifted = drift.get(id)
    if (!drifted) {
      drifted = { module: moduleId, key, callsites: [] }
      drift.set(id, drifted)
    }
    const cs: { file?: string; line?: number } = {}
    if (e._placement?.file) cs.file = e._placement.file
    if (typeof e._placement?.line === 'number') cs.line = e._placement.line
    if (cs.file || cs.line) drifted.callsites.push(cs)
  }
  return [...drift.values()].sort(
    (a, b) => a.module.localeCompare(b.module) || a.key.localeCompare(b.key),
  )
}

/**
 * For each `{ kind: 'external-call', _placement: { module: M }, endpoint: E }`
 * check whether any `space.modules[M].externalDeps[i].endpoint` matches.
 * Match logic is fuzzy by design: spec says `api.stripe.com`, code might
 * call `https://api.stripe.com/v1/charges`. Substring match in either
 * direction passes. Aggregation by (module, endpoint) is the same idea
 * as configs — collapse hot call-sites into one line per endpoint.
 */
export function computeExternalCallDrift(
  space: {
    modules: Array<{
      id: string
      // v0.3 (A3): externalDeps is a discriminated union. Only http-api kind
      // has an `endpoint`; host-installed kinds (host-binary/artifact/apt)
      // are out of scope for external-call drift. Accept `unknown` and
      // narrow at the call site.
      externalDeps: ReadonlyArray<unknown>
    }>
  },
  entries: CodeEntry[],
): ExternalCallDrift[] {
  const moduleEndpoints = new Map<string, string[]>()
  for (const m of space.modules) {
    moduleEndpoints.set(
      m.id,
      m.externalDeps
        .map((d) => {
          if (d && typeof d === 'object' && 'endpoint' in d) {
            const ep = (d as { endpoint?: unknown }).endpoint
            return typeof ep === 'string' ? ep.toLowerCase() : null
          }
          return null
        })
        .filter((e): e is string => typeof e === 'string'),
    )
  }
  const drift = new Map<string, ExternalCallDrift>()
  for (const raw of entries) {
    if (raw.kind !== 'external-call') continue
    const e = raw as ExternalCallEntry
    const moduleId = e._placement?.module
    const endpoint = e.endpoint
    if (!moduleId || !endpoint) continue
    const declared = moduleEndpoints.get(moduleId) ?? []
    const probe = endpoint.toLowerCase()
    const matched = declared.some((d) => d.includes(probe) || probe.includes(d))
    if (matched) continue
    const id = `${moduleId}/${endpoint}`
    let drifted = drift.get(id)
    if (!drifted) {
      drifted = { module: moduleId, endpoint, callsites: [] }
      if (e.protocol) drifted.protocol = e.protocol
      drift.set(id, drifted)
    }
    const cs: { file?: string; line?: number } = {}
    if (e._placement?.file) cs.file = e._placement.file
    if (typeof e._placement?.line === 'number') cs.line = e._placement.line
    if (cs.file || cs.line) drifted.callsites.push(cs)
  }
  return [...drift.values()].sort(
    (a, b) => a.module.localeCompare(b.module) || a.endpoint.localeCompare(b.endpoint),
  )
}

function fmtConfigRefDrift(d: ConfigRefDrift): string {
  const sites =
    d.callsites.length === 0
      ? ''
      : `\n    seen at: ${d.callsites
          .slice(0, 3)
          .map((c) => `${c.file ?? '?'}${c.line ? `:${c.line}` : ''}`)
          .join(', ')}${d.callsites.length > 3 ? ` (+${d.callsites.length - 3} more)` : ''}`
  return `module:${d.module} reads '${d.key}' (${d.callsites.length} call-site${d.callsites.length === 1 ? '' : 's'})${sites}`
}

function fmtExternalCallDrift(d: ExternalCallDrift): string {
  const sites =
    d.callsites.length === 0
      ? ''
      : `\n    seen at: ${d.callsites
          .slice(0, 3)
          .map((c) => `${c.file ?? '?'}${c.line ? `:${c.line}` : ''}`)
          .join(', ')}${d.callsites.length > 3 ? ` (+${d.callsites.length - 3} more)` : ''}`
  const proto = d.protocol ? ` (${d.protocol})` : ''
  return `module:${d.module} calls '${d.endpoint}'${proto} (${d.callsites.length} call-site${d.callsites.length === 1 ? '' : 's'})${sites}`
}

// ---------- v0.3 (A6) contract drift ----------

interface RouteDrift {
  module: string
  method: string
  path: string
  callsites: Array<{ file?: string; line?: number }>
}

interface OutboundCallDrift {
  module: string
  method: string
  targetPath: string
  callsites: Array<{ file?: string; line?: number }>
  // When `headerDrift` is set, the call site attaches a header but spec
  // declares a different one (or none). The drift is the header mismatch.
  headerDrift?: { codeHeader?: string; specHeader?: string }
}

interface StateEnumDrift {
  module: string
  model: string
  field: string
  value: string
  callsites: Array<{ file?: string; line?: number }>
}

interface HostAssetPathDrift {
  module: string
  installPath: string
  source: string
}

interface RouteEntry extends CodeEntry {
  kind: 'route'
  path?: string
  method?: string
  _placement?: PlacementHint
}

interface OutboundCallEntry extends CodeEntry {
  kind: 'outbound-call'
  target_path?: string
  method?: string
  headers?: string[]
  _placement?: PlacementHint
}

interface StateEnumValueEntry extends CodeEntry {
  kind: 'state-enum-value'
  model?: string
  field?: string
  value?: string
  _placement?: PlacementHint
}

interface HostAssetPathEntry extends CodeEntry {
  kind: 'host-asset-path'
  path?: string
  source?: string
  _placement?: PlacementHint
}

/**
 * For each `{ kind: 'route', _placement: { module: M }, path: P, method: V }`
 * in the JSONL, check whether any component in module M declares the route
 * (either via `routes[]` or via `method.httpPath`/`httpMethod`). Routes
 * served by code but absent from the spec are drift.
 */
export function computeRouteDrift(space: Space, entries: CodeEntry[]): RouteDrift[] {
  const moduleRoutes = new Map<string, Set<string>>()
  for (const m of space.modules) {
    const declared = new Set<string>()
    const collect = (components: ReadonlyArray<Component>): void => {
      for (const c of components) {
        for (const r of c.routes) declared.add(`${r.method.toUpperCase()} ${r.path}`)
        for (const meth of c.methods) {
          if (meth.httpMethod && meth.httpPath) {
            declared.add(`${meth.httpMethod.toUpperCase()} ${meth.httpPath}`)
          }
        }
      }
    }
    collect(m.components)
    for (const d of m.domains) collect(d.components)
    moduleRoutes.set(m.id, declared)
  }
  const drift = new Map<string, RouteDrift>()
  for (const raw of entries) {
    if (raw.kind !== 'route') continue
    const e = raw as RouteEntry
    const moduleId = e._placement?.module
    const path = e.path
    const method = e.method?.toUpperCase()
    if (!moduleId || !path || !method) continue
    if (moduleRoutes.get(moduleId)?.has(`${method} ${path}`)) continue
    const id = `${moduleId}/${method} ${path}`
    let drifted = drift.get(id)
    if (!drifted) {
      drifted = { module: moduleId, method, path, callsites: [] }
      drift.set(id, drifted)
    }
    const cs: { file?: string; line?: number } = {}
    if (e._placement?.file) cs.file = e._placement.file
    if (typeof e._placement?.line === 'number') cs.line = e._placement.line
    if (cs.file || cs.line) drifted.callsites.push(cs)
  }
  return [...drift.values()].sort(
    (a, b) =>
      a.module.localeCompare(b.module) ||
      a.method.localeCompare(b.method) ||
      a.path.localeCompare(b.path),
  )
}

/**
 * Component types whose method-level httpMethod/httpPath describe the
 * OUTGOING request they make, not a route they serve — mirrors
 * HTTP_CALLER_SIDE_TYPES in the semantic validator (W5).
 */
const CALLER_SIDE_TYPES: ReadonlySet<string> = new Set(['client', 'page', 'widget'])

/**
 * For each `{ kind: 'outbound-call' }`, check whether any caller method's
 * `calls[]` declares the target_path/method pair. Object-form (v0.3 — A1)
 * `{target, path, method}` calls match exactly; legacy ref-only calls
 * cannot match a path — but on client/page/widget components the
 * method's own httpMethod/httpPath count as the declared outgoing
 * request (see CALLER_SIDE_TYPES). Header drift is emitted when the
 * code attaches a header the spec doesn't list (or vice versa).
 */
export function computeOutboundCallDrift(space: Space, entries: CodeEntry[]): OutboundCallDrift[] {
  // Index declared calls per module: `${MODULE}|${METHOD} ${PATH}` →
  // { credentialHeader? }
  const moduleCalls = new Map<string, { header?: string }>()
  for (const m of space.modules) {
    const collect = (components: ReadonlyArray<Component>): void => {
      for (const c of components) {
        for (const meth of c.methods) {
          for (const call of meth.calls) {
            if (!call.path || !call.method) continue
            const key = `${m.id}|${call.method.toUpperCase()} ${call.path}`
            const entry: { header?: string } = {}
            if (call.credential?.header) entry.header = call.credential.header
            moduleCalls.set(key, entry)
          }
          // v0.6 (pizza-shop audit follow-up) — the apiClient idiom: on
          // client/page/widget components, method-level httpMethod/httpPath
          // document the OUTGOING request (the same convention
          // THROWS_UNMAPPED exempts). Index them so a legacy ref-only
          // `calls:` entry doesn't turn a perfectly documented client call
          // into CALL_NOT_IN_SPEC. Object-form entries win on collision —
          // they carry the credential.
          if (CALLER_SIDE_TYPES.has(c.type) && meth.httpMethod && meth.httpPath) {
            const key = `${m.id}|${meth.httpMethod.toUpperCase()} ${meth.httpPath}`
            if (!moduleCalls.has(key)) moduleCalls.set(key, {})
          }
        }
      }
    }
    collect(m.components)
    for (const d of m.domains) collect(d.components)
  }
  const drift = new Map<string, OutboundCallDrift>()
  for (const raw of entries) {
    if (raw.kind !== 'outbound-call') continue
    const e = raw as OutboundCallEntry
    const moduleId = e._placement?.module
    const targetPath = e.target_path
    const method = e.method?.toUpperCase()
    if (!moduleId || !targetPath || !method) continue
    const key = `${moduleId}|${method} ${targetPath}`
    const declared = moduleCalls.get(key)
    // Two flavors of drift: path absent, or path present but header diverges.
    let headerDrift: { codeHeader?: string; specHeader?: string } | undefined
    if (declared) {
      const codeHeader = e.headers?.[0]
      const specHeader = declared.header
      if (codeHeader && specHeader && codeHeader !== specHeader) {
        headerDrift = { codeHeader, specHeader }
      } else if (codeHeader && !specHeader) {
        headerDrift = { codeHeader }
      } else if (!codeHeader && specHeader) {
        headerDrift = { specHeader }
      } else {
        // In sync — skip.
        continue
      }
    }
    const id = `${moduleId}|${method} ${targetPath}`
    let drifted = drift.get(id)
    if (!drifted) {
      drifted = { module: moduleId, method, targetPath, callsites: [] }
      if (headerDrift) drifted.headerDrift = headerDrift
      drift.set(id, drifted)
    }
    const cs: { file?: string; line?: number } = {}
    if (e._placement?.file) cs.file = e._placement.file
    if (typeof e._placement?.line === 'number') cs.line = e._placement.line
    if (cs.file || cs.line) drifted.callsites.push(cs)
  }
  return [...drift.values()].sort(
    (a, b) =>
      a.module.localeCompare(b.module) ||
      a.method.localeCompare(b.method) ||
      a.targetPath.localeCompare(b.targetPath),
  )
}

/**
 * For each `{ kind: 'state-enum-value', model: M, field: F, value: V }`,
 * check that V appears in `<model M>.stateMachine.states[]` (when
 * stateMachine.field === F). If the model has no state machine at all the
 * entry is skipped (no false positives on plain enum types).
 */
export function computeStateEnumDrift(space: Space, entries: CodeEntry[]): StateEnumDrift[] {
  // Index: `${MODULE}|${MODEL}|${FIELD}` → declared states[]
  const sm = new Map<string, Set<string>>()
  for (const m of space.modules) {
    const collect = (models: ReadonlyArray<Model>): void => {
      for (const md of models) {
        if (!md.stateMachine) continue
        sm.set(`${m.id}|${md.id}|${md.stateMachine.field}`, new Set(md.stateMachine.states))
      }
    }
    collect(m.models)
    for (const d of m.domains) collect(d.models)
    // Standalone state machines (v0.3 — A2) declare their `governs:` field;
    // when it points at a model.field, expose those states too.
    for (const stand of m.stateMachines) {
      if (!stand.governs) continue
      // Parse `module:X/model:Y.field` style refs into our composite key.
      const m1 = stand.governs.match(/^module:([^/]+)\/(?:domain:[^/]+\/)?model:([^.]+)\.(.+)$/)
      if (!m1) continue
      const [, mod, mdl, field] = m1
      if (!mod || !mdl || !field) continue
      sm.set(`${mod}|${mdl}|${field}`, new Set(stand.states))
    }
  }
  const drift = new Map<string, StateEnumDrift>()
  for (const raw of entries) {
    if (raw.kind !== 'state-enum-value') continue
    const e = raw as StateEnumValueEntry
    const moduleId = e._placement?.module
    const model = e.model
    const field = e.field
    const value = e.value
    if (!moduleId || !model || !field || !value) continue
    const declared = sm.get(`${moduleId}|${model}|${field}`)
    if (!declared) continue // no state machine → skip
    if (declared.has(value)) continue
    const id = `${moduleId}|${model}.${field}=${value}`
    let drifted = drift.get(id)
    if (!drifted) {
      drifted = { module: moduleId, model, field, value, callsites: [] }
      drift.set(id, drifted)
    }
    const cs: { file?: string; line?: number } = {}
    if (e._placement?.file) cs.file = e._placement.file
    if (typeof e._placement?.line === 'number') cs.line = e._placement.line
    if (cs.file || cs.line) drifted.callsites.push(cs)
  }
  return [...drift.values()].sort(
    (a, b) =>
      a.module.localeCompare(b.module) ||
      a.model.localeCompare(b.model) ||
      a.field.localeCompare(b.field) ||
      a.value.localeCompare(b.value),
  )
}

/**
 * For each `{ kind: 'host-asset-path' }`, check whether any
 * `host-binary`/`host-artifact` in the module declares the same
 * install_path. Catches the firecracker-rewrite class: deploy workflow
 * fetches `/opt/firecracker/golden.ext4` but spec doesn't model the asset.
 */
export function computeHostAssetPathDrift(
  space: Space,
  entries: CodeEntry[],
): HostAssetPathDrift[] {
  const declared = new Map<string, Set<string>>()
  for (const m of space.modules) {
    const set = new Set<string>()
    for (const dep of m.externalDeps) {
      if (dep.kind === 'host-binary' || dep.kind === 'host-artifact') {
        set.add(dep.install_path)
      }
    }
    declared.set(m.id, set)
  }
  const drift = new Map<string, HostAssetPathDrift>()
  for (const raw of entries) {
    if (raw.kind !== 'host-asset-path') continue
    const e = raw as HostAssetPathEntry
    const moduleId = e._placement?.module
    const installPath = e.path
    const source = e.source ?? ''
    if (!moduleId || !installPath) continue
    if (declared.get(moduleId)?.has(installPath)) continue
    const id = `${moduleId}|${installPath}`
    if (!drift.has(id)) {
      drift.set(id, { module: moduleId, installPath, source })
    }
  }
  return [...drift.values()].sort(
    (a, b) => a.module.localeCompare(b.module) || a.installPath.localeCompare(b.installPath),
  )
}

function fmtRouteDrift(d: RouteDrift): string {
  const sites = formatCallsites(d.callsites)
  return `module:${d.module} serves ${d.method} ${d.path} (${d.callsites.length} site${d.callsites.length === 1 ? '' : 's'})${sites}`
}

function fmtOutboundCallDrift(d: OutboundCallDrift): string {
  const sites = formatCallsites(d.callsites)
  const head = d.headerDrift
    ? d.headerDrift.codeHeader && d.headerDrift.specHeader
      ? `  header drift: code=${d.headerDrift.codeHeader}  spec=${d.headerDrift.specHeader}`
      : d.headerDrift.codeHeader
        ? `  header not in spec: ${d.headerDrift.codeHeader}`
        : `  header missing in code: spec wants ${d.headerDrift.specHeader}`
    : ''
  return `module:${d.module} calls ${d.method} ${d.targetPath}${head ? `\n   ${head}` : ''}${sites}`
}

function fmtStateEnumDrift(d: StateEnumDrift): string {
  const sites = formatCallsites(d.callsites)
  return `module:${d.module} ${d.model}.${d.field} = '${d.value}' not in stateMachine.states${sites}`
}

function fmtHostAssetPathDrift(d: HostAssetPathDrift): string {
  const src = d.source ? ` (declared at ${d.source})` : ''
  return `module:${d.module} installs '${d.installPath}'${src}`
}

function formatCallsites(callsites: Array<{ file?: string; line?: number }>): string {
  if (callsites.length === 0) return ''
  return `\n    seen at: ${callsites
    .slice(0, 3)
    .map((c) => `${c.file ?? '?'}${c.line ? `:${c.line}` : ''}`)
    .join(', ')}${callsites.length > 3 ? ` (+${callsites.length - 3} more)` : ''}`
}
