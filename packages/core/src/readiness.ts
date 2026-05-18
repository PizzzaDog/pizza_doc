import type {
  Component,
  ErrorMapping,
  ExternalDepEntry,
  Method,
  Model,
  Module,
  Space,
  Table,
  UseCaseStep,
} from './schema.js'
import type { ValidationIssue, ValidationResult } from './validator/types.js'

export type ReadinessProfile = 'production'

export type ReadinessCode =
  | 'READINESS_VALIDATION_ERRORS'
  | 'READINESS_VALIDATION_WARNINGS'
  | 'READINESS_ENDPOINT_COVERAGE_BELOW_THRESHOLD'
  | 'READINESS_MODEL_COVERAGE_BELOW_THRESHOLD'
  | 'READINESS_TABLE_COVERAGE_BELOW_THRESHOLD'
  | 'READINESS_COMPONENT_COVERAGE_BELOW_THRESHOLD'
  | 'READINESS_ORPHAN_ENDPOINT'
  | 'READINESS_ORPHAN_MODEL'
  | 'READINESS_ORPHAN_TABLE'
  | 'READINESS_ORPHAN_COMPONENT'
  | 'READINESS_EXTERNAL_DEP_PROOF_MISSING'
  | 'READINESS_EXEC_ARG_CONTRACT_TEST_MISSING'
  | 'READINESS_ERROR_MAPPING_PROOF_MISSING'
  | 'READINESS_CONFIG_DEFAULT_DRIFT'

export interface ReadinessOptions {
  profile?: ReadinessProfile
  strictWarnings?: boolean
  minEndpointCoverage?: number
  minModelCoverage?: number
  minTableCoverage?: number
  minComponentCoverage?: number
}

export interface ReadinessIssue {
  severity: 'error' | 'warning'
  code: ReadinessCode
  message: string
  entityRef?: string
}

export interface ReadinessMetric {
  key: 'endpoints' | 'models' | 'tables' | 'components'
  used: number
  total: number
  ignored: number
  percent: number
  threshold: number
}

export interface ReadinessResult {
  profile: ReadinessProfile
  passed: boolean
  strictWarnings: boolean
  issues: ReadinessIssue[]
  metrics: ReadinessMetric[]
}

interface ComponentCtx {
  component: Component
  module: Module
  domainId?: string
  ref: string
}

interface ModelCtx {
  model: Model
  module: Module
  domainId?: string
  ref: string
}

interface TableCtx {
  table: Table
  module: Module
  domainId?: string
  ref: string
}

interface EndpointCtx {
  component: Component
  componentRef: string
  method: Method
  methodName: string
  methodRef: string
}

interface UsageIndex {
  componentUsedBy: Map<string, Set<string>>
  modelUsedBy: Map<string, Set<string>>
  tableUsedBy: Map<string, Set<string>>
  endpointsUsedBy: Map<string, Set<string>>
  endpoints: Map<string, EndpointCtx>
}

const PROOF_REQUIRED_PROTOCOLS = new Set(['device', 'exec', 'file'])

export function evaluateReadiness(
  space: Space,
  validation: ValidationResult,
  options: ReadinessOptions = {},
): ReadinessResult {
  const profile = options.profile ?? 'production'
  const strictWarnings = options.strictWarnings ?? profile === 'production'
  const thresholds = {
    endpoints: options.minEndpointCoverage ?? 100,
    models: options.minModelCoverage ?? 100,
    tables: options.minTableCoverage ?? 100,
    components: options.minComponentCoverage ?? 100,
  }

  const issues: ReadinessIssue[] = []
  const validationErrors = validation.issues.filter((i) => i.severity === 'error')
  const validationWarnings = validation.issues.filter((i) => i.severity === 'warning')
  const blockingValidationWarnings = validationWarnings.filter(
    (issue) => !isReadinessWaivedValidationWarning(space, issue),
  )
  if (validationErrors.length > 0) {
    issues.push({
      severity: 'error',
      code: 'READINESS_VALIDATION_ERRORS',
      message: `${validationErrors.length} validation error(s) must be fixed before readiness can pass.`,
    })
  }
  if (strictWarnings && blockingValidationWarnings.length > 0) {
    issues.push({
      severity: 'error',
      code: 'READINESS_VALIDATION_WARNINGS',
      message: `${blockingValidationWarnings.length} validation warning(s) are blocking under the production profile.`,
    })
  }

  const usage = buildUsageIndex(space)
  const components = [...allComponents(space)]
  const models = [...allModels(space)]
  const tables = [...allTables(space)]
  const endpoints = [...usage.endpoints.entries()]

  const enforceableComponents = components.filter((c) => !isComponentReadinessWaived(c.component))
  const enforceableModels = models.filter((m) => !hasOrphanReason(m.model))
  const enforceableTables = tables.filter((t) => !hasOrphanReason(t.table))
  const enforceableEndpoints = endpoints.filter(([, e]) => !hasOrphanReason(e.method))

  const componentMetric = metric(
    'components',
    enforceableComponents.filter((c) => usage.componentUsedBy.get(c.ref)?.size).length,
    enforceableComponents.length,
    components.length - enforceableComponents.length,
    thresholds.components,
  )
  const modelMetric = metric(
    'models',
    enforceableModels.filter((m) => usage.modelUsedBy.get(m.ref)?.size).length,
    enforceableModels.length,
    models.length - enforceableModels.length,
    thresholds.models,
  )
  const tableMetric = metric(
    'tables',
    enforceableTables.filter((t) => usage.tableUsedBy.get(t.ref)?.size).length,
    enforceableTables.length,
    tables.length - enforceableTables.length,
    thresholds.tables,
  )
  const endpointMetric = metric(
    'endpoints',
    enforceableEndpoints.filter(([key]) => usage.endpointsUsedBy.get(key)?.size).length,
    enforceableEndpoints.length,
    endpoints.length - enforceableEndpoints.length,
    thresholds.endpoints,
  )

  const metrics = [endpointMetric, modelMetric, tableMetric, componentMetric]
  pushCoverageIssues(issues, metrics)
  pushOrphanIssues(issues, usage, components, models, tables, endpoints)
  pushExternalDepProofIssues(issues, space)
  pushErrorMappingProofIssues(issues, space)
  pushConfigDefaultDriftIssues(issues, space)

  return {
    profile,
    passed: issues.every((i) => i.severity !== 'error'),
    strictWarnings,
    issues,
    metrics,
  }
}

function pushCoverageIssues(issues: ReadinessIssue[], metrics: ReadinessMetric[]): void {
  for (const m of metrics) {
    if (m.percent >= m.threshold) continue
    const code =
      m.key === 'endpoints'
        ? 'READINESS_ENDPOINT_COVERAGE_BELOW_THRESHOLD'
        : m.key === 'models'
          ? 'READINESS_MODEL_COVERAGE_BELOW_THRESHOLD'
          : m.key === 'tables'
            ? 'READINESS_TABLE_COVERAGE_BELOW_THRESHOLD'
            : 'READINESS_COMPONENT_COVERAGE_BELOW_THRESHOLD'
    issues.push({
      severity: 'error',
      code,
      message: `${m.key} coverage is ${m.percent}% (${m.used}/${m.total}) below production threshold ${m.threshold}%.`,
    })
  }
}

function pushOrphanIssues(
  issues: ReadinessIssue[],
  usage: UsageIndex,
  components: ComponentCtx[],
  models: ModelCtx[],
  tables: TableCtx[],
  endpoints: Array<[string, EndpointCtx]>,
): void {
  for (const c of components) {
    if (usage.componentUsedBy.get(c.ref)?.size) continue
    if (isComponentReadinessWaived(c.component)) continue
    issues.push({
      severity: 'error',
      code: 'READINESS_ORPHAN_COMPONENT',
      message: `Component '${c.component.name}' (${c.ref}) has no use-case, call, compose, or entrypoint proof.`,
      entityRef: c.ref,
    })
  }
  for (const m of models) {
    if (usage.modelUsedBy.get(m.ref)?.size) continue
    if (hasOrphanReason(m.model)) continue
    issues.push({
      severity: 'error',
      code: 'READINESS_ORPHAN_MODEL',
      message: `Model '${m.model.name}' (${m.ref}) is not covered by any use case, method signature, data flow, or explicit readiness.orphan reason.`,
      entityRef: m.ref,
    })
  }
  for (const t of tables) {
    if (usage.tableUsedBy.get(t.ref)?.size) continue
    if (hasOrphanReason(t.table)) continue
    issues.push({
      severity: 'error',
      code: 'READINESS_ORPHAN_TABLE',
      message: `Table '${t.table.name}' (${t.ref}) is not covered by any use case, persisted model, data flow, or explicit readiness.orphan reason.`,
      entityRef: t.ref,
    })
  }
  for (const [key, e] of endpoints) {
    if (usage.endpointsUsedBy.get(key)?.size) continue
    if (hasOrphanReason(e.method)) continue
    issues.push({
      severity: 'error',
      code: 'READINESS_ORPHAN_ENDPOINT',
      message: `Endpoint '${key}' (${e.methodRef}) is not covered by any use case or explicit readiness.orphan reason.`,
      entityRef: e.methodRef,
    })
  }
}

function pushExternalDepProofIssues(issues: ReadinessIssue[], space: Space): void {
  for (const mod of space.modules) {
    for (const dep of mod.externalDeps) {
      // Host-installed deps use a different proof mechanism (`preflight`
      // command) — handled by v0.3 host-dep validator rules separately.
      // This readiness check covers only the http-api kind.
      if (dep.kind !== 'http-api') continue
      const protocol = dep.protocol.trim().toLowerCase()
      if (PROOF_REQUIRED_PROTOCOLS.has(protocol) && !hasDepCheck(dep)) {
        issues.push({
          severity: 'error',
          code: 'READINESS_EXTERNAL_DEP_PROOF_MISSING',
          message: `External dep '${dep.name}' in module '${mod.id}' uses protocol '${dep.protocol}' but has no preflightCheck.sourceRef or driftProbe.sourceRef.`,
          entityRef: `module:${mod.id}`,
        })
      }
      if (
        protocol === 'exec' &&
        dep.positionalArgs?.args.some((arg) => arg.required !== false) &&
        !dep.positionalArgs.contractTest?.sourceRef.trim()
      ) {
        issues.push({
          severity: 'error',
          code: 'READINESS_EXEC_ARG_CONTRACT_TEST_MISSING',
          message: `Exec dep '${dep.name}' in module '${mod.id}' has required positional args but no positionalArgs.contractTest.sourceRef.`,
          entityRef: `module:${mod.id}`,
        })
      }
    }
  }
}

function pushErrorMappingProofIssues(issues: ReadinessIssue[], space: Space): void {
  for (const mod of space.modules) {
    for (const mapping of mod.errorMapping) {
      if (hasErrorMappingProof(mapping)) continue
      issues.push({
        severity: 'error',
        code: 'READINESS_ERROR_MAPPING_PROOF_MISSING',
        message: `Module '${mod.id}' errorMapping '${mapping.exception}' -> ${mapping.httpStatus} has no sourceRef, handlerRef, or implementationProof evidence.`,
        entityRef: `module:${mod.id}`,
      })
    }
  }
}

function pushConfigDefaultDriftIssues(issues: ReadinessIssue[], space: Space): void {
  for (const mod of space.modules) {
    for (const entry of mod.configMap) {
      if (entry.defaultSources.length === 0) continue
      if (entry.defaultValue !== undefined) {
        for (const observed of entry.defaultSources) {
          if (observed.value === entry.defaultValue) continue
          issues.push({
            severity: 'error',
            code: 'READINESS_CONFIG_DEFAULT_DRIFT',
            message: `Module '${mod.id}' config '${entry.key}' declares default '${entry.defaultValue}', but ${observed.source ?? 'source'} ${observed.sourceRef} has '${observed.value}'.`,
            entityRef: `module:${mod.id}`,
          })
        }
        continue
      }

      const distinct = new Map<string, string[]>()
      for (const observed of entry.defaultSources) {
        const refs = distinct.get(observed.value) ?? []
        refs.push(observed.sourceRef)
        distinct.set(observed.value, refs)
      }
      if (distinct.size <= 1) continue
      const summary = [...distinct.entries()]
        .map(([value, refs]) => `'${value}' at ${refs.join(', ')}`)
        .join('; ')
      issues.push({
        severity: 'error',
        code: 'READINESS_CONFIG_DEFAULT_DRIFT',
        message: `Module '${mod.id}' config '${entry.key}' has conflicting observed defaults: ${summary}.`,
        entityRef: `module:${mod.id}`,
      })
    }
  }
}

function buildUsageIndex(space: Space): UsageIndex {
  const componentUsedBy = new Map<string, Set<string>>()
  const modelUsedBy = new Map<string, Set<string>>()
  const tableUsedBy = new Map<string, Set<string>>()
  const endpointsUsedBy = new Map<string, Set<string>>()
  const endpoints = new Map<string, EndpointCtx>()

  const modelByName = new Map<string, string>()
  for (const { model, ref } of allModels(space)) modelByName.set(model.name, ref)

  const tableByName = new Map<string, string>()
  for (const { table, ref } of allTables(space)) tableByName.set(table.name, ref)

  for (const { component, ref } of allComponents(space)) {
    for (const m of component.methods) {
      const methodRef = `${ref}/method:${m.name}`
      if (component.type === 'controller' && m.httpMethod && m.httpPath) {
        endpoints.set(endpointKey(m.httpMethod, m.httpPath), {
          component,
          componentRef: ref,
          method: m,
          methodName: m.name,
          methodRef,
        })
      }
      for (const call of m.calls) {
        const ownerRef = call.target.split('/method:')[0]
        if (ownerRef) add(componentUsedBy, ownerRef, ref)
      }
      for (const p of m.params) registerTypeHits(p.type, modelByName, modelUsedBy, ref)
      if (m.returns) registerTypeHits(m.returns, modelByName, modelUsedBy, ref)
    }
    for (const child of component.composes ?? []) add(componentUsedBy, child, ref)
  }

  for (const { model, ref } of allModels(space)) {
    for (const f of model.fields) registerTypeHits(f.type, modelByName, modelUsedBy, ref)
    if (model.persistedAs) add(tableUsedBy, model.persistedAs, ref)
  }

  for (const uc of space.useCases) {
    const useCaseRef = `usecase:${uc.id}`
    const steps: UseCaseStep[] = [...uc.steps, ...uc.errorFlows.flatMap((ef) => ef.steps)]
    for (const step of steps) {
      addStepRef(step.from, useCaseRef)
      addStepRef(step.to, useCaseRef)
      if (step.via) addStepRef(step.via, useCaseRef)
    }
    for (const df of uc.dataFlow) {
      const src = splitFieldQualifier(df.sourceField)
      if (src) {
        const modelRef = modelByName.get(src.type)
        if (modelRef) add(modelUsedBy, modelRef, useCaseRef)
      }
      const tgt = splitFieldQualifier(df.targetField)
      if (tgt) {
        const tableRef = tableByName.get(tgt.type)
        if (tableRef) add(tableUsedBy, tableRef, useCaseRef)
        const modelRef = modelByName.get(tgt.type)
        if (modelRef) add(modelUsedBy, modelRef, useCaseRef)
      }
    }
    for (const step of steps) {
      if (step.protocol !== 'http') continue
      const descMatch = step.description?.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/)
      if (descMatch) {
        const [, method, rawPath] = descMatch
        if (method && rawPath) add(endpointsUsedBy, endpointKey(method, rawPath), useCaseRef)
        continue
      }
      const targetHead = step.to.split('/method:')[0]
      const targetMethod = step.to.includes('/method:') ? step.to.split('/method:')[1] : undefined
      for (const [key, info] of endpoints) {
        if (info.componentRef !== targetHead) continue
        if (targetMethod && info.methodName !== targetMethod) continue
        add(endpointsUsedBy, key, useCaseRef)
      }
    }
  }

  function addStepRef(ref: string, useCaseRef: string): void {
    const head = ref.split('/method:')[0]
    if (!head) return
    add(componentUsedBy, head, useCaseRef)
    if (ref.includes('/table:')) add(tableUsedBy, ref, useCaseRef)
    if (ref.includes('/model:')) add(modelUsedBy, ref, useCaseRef)
  }

  return { componentUsedBy, modelUsedBy, tableUsedBy, endpointsUsedBy, endpoints }
}

function* allComponents(space: Space): Generator<ComponentCtx> {
  for (const mod of space.modules) {
    for (const c of mod.components) {
      yield { component: c, module: mod, ref: `module:${mod.id}/component:${c.id}` }
    }
    for (const d of mod.domains) {
      for (const c of d.components) {
        yield {
          component: c,
          module: mod,
          domainId: d.id,
          ref: `module:${mod.id}/domain:${d.id}/component:${c.id}`,
        }
      }
    }
  }
}

function* allModels(space: Space): Generator<ModelCtx> {
  for (const mod of space.modules) {
    for (const m of mod.models)
      yield { model: m, module: mod, ref: `module:${mod.id}/model:${m.id}` }
    for (const d of mod.domains) {
      for (const m of d.models) {
        yield {
          model: m,
          module: mod,
          domainId: d.id,
          ref: `module:${mod.id}/domain:${d.id}/model:${m.id}`,
        }
      }
    }
  }
}

function* allTables(space: Space): Generator<TableCtx> {
  for (const mod of space.modules) {
    for (const t of mod.tables)
      yield { table: t, module: mod, ref: `module:${mod.id}/table:${t.id}` }
    for (const d of mod.domains) {
      for (const t of d.tables) {
        yield {
          table: t,
          module: mod,
          domainId: d.id,
          ref: `module:${mod.id}/domain:${d.id}/table:${t.id}`,
        }
      }
    }
  }
}

function metric(
  key: ReadinessMetric['key'],
  used: number,
  total: number,
  ignored: number,
  threshold: number,
): ReadinessMetric {
  return {
    key,
    used,
    total,
    ignored,
    threshold,
    percent: total === 0 ? 100 : Math.round((used / total) * 100),
  }
}

function add(map: Map<string, Set<string>>, key: string, value: string): void {
  const cur = map.get(key)
  if (cur) cur.add(value)
  else map.set(key, new Set([value]))
}

function endpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path.replace(/[).,;:]+$/, '')}`
}

function registerTypeHits(
  type: string,
  modelByName: Map<string, string>,
  modelUsedBy: Map<string, Set<string>>,
  user: string,
): void {
  for (const tok of type.split(/[<>,\s[\]()?]+/).filter(Boolean)) {
    const ref = modelByName.get(tok)
    if (ref) add(modelUsedBy, ref, user)
  }
}

function splitFieldQualifier(s: string): { type: string; field: string } | null {
  const m = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(.+)$/)
  const [, type, field] = m ?? []
  if (!type || !field) return null
  return { type, field }
}

function isComponentReadinessWaived(component: Component): boolean {
  return hasReason(component.entrypoint?.reason) || hasOrphanReason(component)
}

function isReadinessWaivedValidationWarning(space: Space, issue: ValidationIssue): boolean {
  if (!issue.entityRef) return false
  if (issue.code === 'COMPONENT_UNUSED') {
    const component = findComponent(space, issue.entityRef)
    return component ? isComponentReadinessWaived(component) : false
  }
  if (issue.code === 'DTO_UNUSED') {
    const model = findModel(space, issue.entityRef)
    return model ? hasOrphanReason(model) : false
  }
  return false
}

function findComponent(space: Space, ref: string): Component | undefined {
  for (const c of allComponents(space)) if (c.ref === ref) return c.component
  return undefined
}

function findModel(space: Space, ref: string): Model | undefined {
  for (const m of allModels(space)) if (m.ref === ref) return m.model
  return undefined
}

function hasOrphanReason(entity: {
  readiness?: { orphan?: { reason: string } | undefined } | undefined
}): boolean {
  return hasReason(entity.readiness?.orphan?.reason)
}

function hasDepCheck(dep: ExternalDepEntry): boolean {
  // http-api kind carries preflightCheck/driftProbe (legacy v0.2 shape).
  // Host-installed kinds use the new `preflight: {command, expected}`
  // shape; their proof story is checked by v0.3 host-dep rules elsewhere.
  if (dep.kind !== 'http-api') return false
  return hasReason(dep.preflightCheck?.sourceRef) || hasReason(dep.driftProbe?.sourceRef)
}

function hasErrorMappingProof(mapping: ErrorMapping): boolean {
  return (
    hasReason(mapping.sourceRef) ||
    hasReason(mapping.handlerRef) ||
    hasReason(mapping.implementationProof?.sourceRef) ||
    hasReason(mapping.implementationProof?.handlerRef)
  )
}

function hasReason(value: string | undefined): boolean {
  return Boolean(value?.trim())
}
