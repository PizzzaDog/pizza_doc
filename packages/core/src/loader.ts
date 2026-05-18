import { parseDocument, parse as parseYamlValue } from 'yaml'
import type { Document } from 'yaml'
import { classifyFile } from './classify.js'
import type { FileRole } from './classify.js'
import type { FileSystem } from './fs.js'
import {
  ActorSchema,
  AdrFrontmatterSchema,
  ComponentSchema,
  ConfigMapFileSchema,
  DomainSchema,
  ExternalDepsFileSchema,
  HealthContractFileSchema,
  ModelSchema,
  ModuleSchema,
  RunbookFrontmatterSchema,
  SpaceFileSchema,
  StateMachineFileSchema,
  TableSchema,
  UseCaseSchema,
} from './schema.js'
import type {
  Actor,
  AdrRef,
  Component,
  ConfigMapEntry,
  Domain,
  ExternalDepEntry,
  HealthContractFile,
  Model,
  Module,
  RunbookRef,
  Space,
  SpaceMeta,
  StateMachineFile,
  Table,
  UseCase,
} from './schema.js'
import { validateSchemaPass } from './validator/schema.js'
import type { ValidationIssue } from './validator/types.js'

export interface LoadedFile {
  path: string
  role: FileRole
  source: string
  document: Document.Parsed | null
  data: unknown
  parsed: unknown
}

export interface LoadResult {
  space: Space | null
  files: Map<string, LoadedFile>
  issues: ValidationIssue[]
}

/**
 * Load a single space from disk. Reads every .yaml file under `spaceDir`,
 * classifies it, parses YAML, runs Pass 1 schema + filename/id checks, and
 * assembles a Space object from successfully validated files.
 *
 * The returned `space` is null only if the root `space.yaml` is missing or
 * invalid. Missing sub-files produce issues but do not abort the load.
 */
export async function loadSpace(
  fs: FileSystem,
  spaceDir = '.',
  expectedSpaceId?: string,
): Promise<LoadResult> {
  const issues: ValidationIssue[] = []
  const files = new Map<string, LoadedFile>()

  const allPaths = await fs.listFiles(spaceDir)
  // Pizza Doc owns three file shapes:
  //   - YAML (.yaml / .yml) — every entity except ADRs
  //   - Markdown (.md)      — ADRs under decisions/
  // Anything else is silently ignored. The classifier sees both and
  // returns `kind: 'unknown'` for shapes it doesn't recognise.
  const candidatePaths = allPaths.filter(
    (p) => !isChangeSetFile(p) && (p.endsWith('.yaml') || p.endsWith('.yml') || p.endsWith('.md')),
  )

  for (const path of candidatePaths) {
    const source = await fs.readFile(joinPath(spaceDir, path))
    const role = classifyFile(path)

    if (role.kind === 'unknown') {
      issues.push({
        severity: 'info',
        code: 'FILE_UNRECOGNIZED',
        message: `File ${path} is not in a recognized Pizza Doc location; skipped.`,
        file: path,
      })
      files.set(path, { path, role, source, document: null, data: null, parsed: null })
      continue
    }

    if (role.kind === 'layout') {
      // Reserved for a later phase; pass through without schema validation.
      files.set(path, { path, role, source, document: null, data: null, parsed: null })
      continue
    }

    if (role.kind === 'decision') {
      // ADRs are markdown with YAML frontmatter — different parse path.
      const adr = parseAdrFile(path, source, role.id, issues)
      files.set(path, { path, role, source, document: null, data: adr, parsed: adr })
      continue
    }

    if (role.kind === 'runbook') {
      // v0.3 (A4) — runbooks share the ADR pattern: markdown + frontmatter.
      const rb = parseRunbookFile(path, source, role.id, issues)
      files.set(path, { path, role, source, document: null, data: rb, parsed: rb })
      continue
    }

    const document = parseDocument(source, { prettyErrors: true, keepSourceTokens: true })
    if (document.errors.length > 0) {
      for (const err of document.errors) {
        const issue: ValidationIssue = {
          severity: 'error',
          code: 'YAML_PARSE_ERROR',
          message: `YAML parse error: ${err.message}`,
          file: path,
        }
        const line = err.linePos?.[0]?.line
        const col = err.linePos?.[0]?.col
        if (typeof line === 'number') issue.line = line
        if (typeof col === 'number') issue.column = col
        issues.push(issue)
      }
      files.set(path, { path, role, source, document: null, data: null, parsed: null })
      continue
    }

    const data: unknown = document.toJS()
    const schemaIssues = validateSchemaPass(path, role, data, expectedSpaceId)
    issues.push(...schemaIssues)

    const parsed = hasError(schemaIssues) ? null : extractParsed(role, data)

    files.set(path, { path, role, source, document, data, parsed })
  }

  const space = assembleSpace(files)
  return { space, files, issues }
}

function hasError(issues: readonly ValidationIssue[]): boolean {
  for (const i of issues) if (i.severity === 'error') return true
  return false
}

function isChangeSetFile(path: string): boolean {
  return path === 'changes' || path.startsWith('changes/')
}

function extractParsed(role: FileRole, data: unknown): unknown {
  switch (role.kind) {
    case 'space': {
      const r = SpaceFileSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'actor': {
      const r = ActorSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'module': {
      const r = ModuleSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'domain': {
      const r = DomainSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'component': {
      const r = ComponentSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'model': {
      const r = ModelSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'table': {
      const r = TableSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'usecase': {
      const r = UseCaseSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'configMap': {
      const r = ConfigMapFileSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'externalDeps': {
      const r = ExternalDepsFileSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'stateMachine': {
      const r = StateMachineFileSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'opsStateMachine': {
      const r = StateMachineFileSchema.safeParse(data)
      return r.success ? r.data : null
    }
    case 'healthContract': {
      const r = HealthContractFileSchema.safeParse(data)
      return r.success ? r.data : null
    }
    default:
      return null
  }
}

/**
 * Parse an ADR markdown file into a typed AdrRef.
 *
 * Frontmatter must be a YAML block delimited by `---` lines at the top of
 * the file. We pull the title from the YAML if present, otherwise fall
 * through to the first `# Heading` in the body. Body itself is captured
 * but only used by exporters that ask for `--include-decisions`; default
 * loads carry it as a string for cheap retrieval, no parse pass.
 */
function parseAdrFile(
  filePath: string,
  source: string,
  roleId: string,
  issues: ValidationIssue[],
): AdrRef | null {
  const fmMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!fmMatch) {
    issues.push({
      severity: 'error',
      code: 'YAML_PARSE_ERROR',
      message: `ADR ${filePath} has no YAML frontmatter block. Expected --- ... --- at the top.`,
      file: filePath,
    })
    return null
  }
  const fmRaw = fmMatch[1] ?? ''
  const body = fmMatch[2] ?? ''
  let fmObj: unknown
  try {
    fmObj = parseYamlValue(fmRaw)
  } catch (err) {
    issues.push({
      severity: 'error',
      code: 'YAML_PARSE_ERROR',
      message: `ADR ${filePath} frontmatter parse error: ${(err as Error).message}`,
      file: filePath,
    })
    return null
  }
  const fm = AdrFrontmatterSchema.safeParse(fmObj)
  if (!fm.success) {
    issues.push({
      severity: 'error',
      code: 'SCHEMA_INVALID_VALUE',
      message: `ADR ${filePath} frontmatter is invalid: ${fm.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      file: filePath,
    })
    return null
  }
  if (fm.data.id !== roleId) {
    issues.push({
      severity: 'error',
      code: 'SCHEMA_FILENAME_ID_MISMATCH',
      message: `ADR file ${filePath} declares id '${fm.data.id}' but the filename starts with '${roleId}'. They must match.`,
      file: filePath,
      suggestion: `Rename the file to start with '${fm.data.id}-' or change the frontmatter id to '${roleId}'.`,
    })
    return null
  }
  const titleFromBody = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const out: AdrRef = {
    id: fm.data.id,
    title: fm.data.title ?? titleFromBody ?? fm.data.id,
    status: fm.data.status,
    supersedes: fm.data.supersedes,
    path: filePath,
    body,
  }
  if (fm.data.date !== undefined) out.date = fm.data.date
  if (fm.data.decider !== undefined) out.decider = fm.data.decider
  if (fm.data.supersededBy !== undefined) out.supersededBy = fm.data.supersededBy
  return out
}

/**
 * Parse a runbook markdown file (v0.3 — A4). Identical pattern to ADRs:
 * YAML frontmatter delimited by `---`, then free markdown body.
 */
function parseRunbookFile(
  filePath: string,
  source: string,
  roleId: string,
  issues: ValidationIssue[],
): RunbookRef | null {
  const fmMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!fmMatch) {
    issues.push({
      severity: 'error',
      code: 'YAML_PARSE_ERROR',
      message: `Runbook ${filePath} has no YAML frontmatter block. Expected --- ... --- at the top.`,
      file: filePath,
    })
    return null
  }
  const fmRaw = fmMatch[1] ?? ''
  const body = fmMatch[2] ?? ''
  let fmObj: unknown
  try {
    fmObj = parseYamlValue(fmRaw)
  } catch (err) {
    issues.push({
      severity: 'error',
      code: 'YAML_PARSE_ERROR',
      message: `Runbook ${filePath} frontmatter parse error: ${(err as Error).message}`,
      file: filePath,
    })
    return null
  }
  const fm = RunbookFrontmatterSchema.safeParse(fmObj)
  if (!fm.success) {
    issues.push({
      severity: 'error',
      code: 'SCHEMA_INVALID_VALUE',
      message: `Runbook ${filePath} frontmatter is invalid: ${fm.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
      file: filePath,
    })
    return null
  }
  if (fm.data.id !== roleId) {
    issues.push({
      severity: 'error',
      code: 'SCHEMA_FILENAME_ID_MISMATCH',
      message: `Runbook file ${filePath} declares id '${fm.data.id}' but the filename is '${roleId}.md'. They must match.`,
      file: filePath,
      suggestion: `Rename the file to '${fm.data.id}.md' or change the frontmatter id to '${roleId}'.`,
    })
    return null
  }
  const titleFromBody = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const out: RunbookRef = {
    id: fm.data.id,
    title: fm.data.title ?? titleFromBody ?? fm.data.id,
    severity: fm.data.severity,
    covers: fm.data.covers,
    decisions: fm.data.decisions,
    path: filePath,
    body,
  }
  if (fm.data.owner !== undefined) out.owner = fm.data.owner
  if (fm.data.trigger !== undefined) out.trigger = fm.data.trigger
  return out
}

function assembleSpace(files: Map<string, LoadedFile>): Space | null {
  let meta: SpaceMeta | null = null
  const actors: Actor[] = []
  const useCases: UseCase[] = []

  // module assembly state
  interface ModuleState {
    base: Module
    domains: Map<string, DomainState>
  }
  interface DomainState {
    base: Domain
    components: Component[]
    models: Model[]
    tables: Table[]
  }
  const modules = new Map<string, ModuleState>()
  const directComponents = new Map<string, Component[]>()
  const directModels = new Map<string, Model[]>()
  const directTables = new Map<string, Table[]>()
  // Sidecar config-map / external-deps files attach onto the assembled
  // module after we've seen its `module.yaml`. Storing per-module-id so
  // load order doesn't matter.
  const moduleConfigMap = new Map<string, ConfigMapEntry[]>()
  const moduleExternalDeps = new Map<string, ExternalDepEntry[]>()
  // v0.3 (A2) — standalone state-machines/<id>.yaml files attach onto the
  // assembled module (or domain), keyed by `<moduleId>` or `<moduleId>/<domainId>`.
  const moduleStateMachines = new Map<string, StateMachineFile[]>()
  // v0.3 (A4) — operations/ layer: runbooks, cross-module state machines, health contracts.
  const moduleHealthContracts = new Map<string, HealthContractFile>()
  const runbooks: RunbookRef[] = []
  const operationsStateMachines: StateMachineFile[] = []
  const decisions: AdrRef[] = []

  for (const file of files.values()) {
    if (file.parsed === null) continue
    const role = file.role

    switch (role.kind) {
      case 'space': {
        const sf = file.parsed as { meta: SpaceMeta }
        meta = sf.meta
        break
      }
      case 'actor':
        actors.push(file.parsed as Actor)
        break
      case 'usecase':
        useCases.push(file.parsed as UseCase)
        break
      case 'configMap': {
        moduleConfigMap.set(role.moduleId, file.parsed as ConfigMapEntry[])
        break
      }
      case 'externalDeps': {
        moduleExternalDeps.set(role.moduleId, file.parsed as ExternalDepEntry[])
        break
      }
      case 'stateMachine': {
        const sm = file.parsed as StateMachineFile
        const key = role.domainId ? `${role.moduleId}/${role.domainId}` : role.moduleId
        arrayPush(moduleStateMachines, key, sm)
        break
      }
      case 'opsStateMachine': {
        operationsStateMachines.push(file.parsed as StateMachineFile)
        break
      }
      case 'healthContract': {
        moduleHealthContracts.set(role.moduleId, file.parsed as HealthContractFile)
        break
      }
      case 'runbook': {
        runbooks.push(file.parsed as RunbookRef)
        break
      }
      case 'decision': {
        decisions.push(file.parsed as AdrRef)
        break
      }
      case 'module': {
        const mod = file.parsed as Module
        const existing = modules.get(role.moduleId)
        if (existing) existing.base = mod
        else modules.set(role.moduleId, { base: mod, domains: new Map() })
        break
      }
      case 'domain': {
        const dom = file.parsed as Domain
        const mod = ensureModule(modules, role.moduleId)
        const existing = mod.domains.get(role.domainId)
        if (existing) existing.base = dom
        else
          mod.domains.set(role.domainId, {
            base: dom,
            components: [],
            models: [],
            tables: [],
          })
        break
      }
      case 'component': {
        const comp = file.parsed as Component
        if (role.domainId) {
          const mod = ensureModule(modules, role.moduleId)
          const dom = ensureDomain(mod, role.domainId)
          dom.components.push(comp)
        } else {
          arrayPush(directComponents, role.moduleId, comp)
        }
        break
      }
      case 'model': {
        const mdl = file.parsed as Model
        if (role.domainId) {
          const mod = ensureModule(modules, role.moduleId)
          const dom = ensureDomain(mod, role.domainId)
          dom.models.push(mdl)
        } else {
          arrayPush(directModels, role.moduleId, mdl)
        }
        break
      }
      case 'table': {
        const tbl = file.parsed as Table
        if (role.domainId) {
          const mod = ensureModule(modules, role.moduleId)
          const dom = ensureDomain(mod, role.domainId)
          dom.tables.push(tbl)
        } else {
          arrayPush(directTables, role.moduleId, tbl)
        }
        break
      }
      default:
        break
    }
  }

  if (!meta) return null

  const assembledModules: Module[] = []
  for (const [moduleId, state] of modules) {
    const domainList: Domain[] = []
    for (const d of state.domains.values()) {
      domainList.push({
        ...d.base,
        components: [...(d.base.components ?? []), ...d.components],
        models: [...(d.base.models ?? []), ...d.models],
        tables: [...(d.base.tables ?? []), ...d.tables],
      })
    }
    // Sidecar files (config-map.yaml / external-deps.yaml) take precedence
    // over inline declarations. Concatenating preserves both, then we
    // de-dup by key/name so the validator can flag actual duplicates
    // without us silently dropping data.
    const cmFromSidecar = moduleConfigMap.get(moduleId) ?? []
    const cmFromInline = state.base.configMap ?? []
    const edFromSidecar = moduleExternalDeps.get(moduleId) ?? []
    const edFromInline = state.base.externalDeps ?? []
    const smFromSidecar = moduleStateMachines.get(moduleId) ?? []
    const smFromInline = state.base.stateMachines ?? []
    const healthContract = moduleHealthContracts.get(moduleId)
    const assembledModule: Module = {
      ...state.base,
      domains: [...(state.base.domains ?? []), ...domainList],
      components: [...(state.base.components ?? []), ...(directComponents.get(moduleId) ?? [])],
      models: [...(state.base.models ?? []), ...(directModels.get(moduleId) ?? [])],
      tables: [...(state.base.tables ?? []), ...(directTables.get(moduleId) ?? [])],
      configMap: [...cmFromInline, ...cmFromSidecar],
      externalDeps: [...edFromInline, ...edFromSidecar],
      decisions: state.base.decisions ?? [],
      stateMachines: [...smFromInline, ...smFromSidecar],
    }
    if (healthContract) assembledModule.healthContract = healthContract
    assembledModules.push(assembledModule)
  }
  // Lift sidecar configMap/externalDeps for modules that have NO module.yaml
  // (rare but legal: someone wrote config-map.yaml before the rest of the
  // module). They land as placeholder modules via ensureModule above.
  for (const moduleId of moduleConfigMap.keys()) {
    if (!modules.has(moduleId)) ensureModule(modules, moduleId)
  }
  for (const moduleId of moduleExternalDeps.keys()) {
    if (!modules.has(moduleId)) ensureModule(modules, moduleId)
  }
  for (const key of moduleStateMachines.keys()) {
    // key may be "<moduleId>" or "<moduleId>/<domainId>" — take the leading
    // segment to ensure the module exists.
    const moduleId = key.split('/')[0] ?? key
    if (!modules.has(moduleId)) ensureModule(modules, moduleId)
  }

  // Decisions are space-level: stable order by id so diffs/snapshots are
  // deterministic regardless of filesystem traversal order.
  decisions.sort((a, b) => a.id.localeCompare(b.id))
  // Same for runbooks + operations state machines (v0.3 — A4).
  runbooks.sort((a, b) => a.id.localeCompare(b.id))
  operationsStateMachines.sort((a, b) => a.id.localeCompare(b.id))

  return {
    meta,
    actors,
    modules: assembledModules,
    useCases,
    decisions,
    runbooks,
    operationsStateMachines,
  }
}

function ensureModule<T extends { base: Module; domains: Map<string, unknown> }>(
  modules: Map<string, T>,
  id: string,
): T {
  const existing = modules.get(id)
  if (existing) return existing
  // Placeholder module used only if module.yaml is missing; downstream Pass 2
  // still sees the children and can flag the missing container.
  const placeholder = {
    base: {
      kind: 'module' as const,
      id,
      name: id,
      type: 'service' as const,
      domains: [],
      components: [],
      models: [],
      tables: [],
    },
    domains: new Map(),
  } as unknown as T
  modules.set(id, placeholder)
  return placeholder
}

function ensureDomain<
  M extends { domains: Map<string, D> },
  D extends {
    base: Domain
    components: Component[]
    models: Model[]
    tables: Table[]
  },
>(module: M, id: string): D {
  const existing = module.domains.get(id)
  if (existing) return existing
  const placeholder = {
    base: {
      id,
      name: id,
      components: [],
      models: [],
      tables: [],
    },
    components: [],
    models: [],
    tables: [],
  } as unknown as D
  module.domains.set(id, placeholder)
  return placeholder
}

function arrayPush<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

function joinPath(a: string, b: string): string {
  if (!a || a === '.') return b
  if (!b) return a
  return `${a.replace(/\/+$/, '')}/${b}`
}
