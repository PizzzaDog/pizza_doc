import { closestMatches } from '../levenshtein.js'
import type { RefIndex, RefKind } from '../ref.js'
import { buildRefIndex } from '../ref.js'
import type { Space } from '../schema.js'
import type { ValidationIssue } from './types.js'

export interface RefsPassResult {
  issues: ValidationIssue[]
  index: RefIndex
}

/**
 * Pass 2: reference resolution.
 *
 * Walks every RefSchema-typed field in the space and confirms the ref exists
 * in the index and points at an entity of the expected kind. Close-match
 * suggestions come from Levenshtein distance over the ref universe.
 */
export function validateRefsPass(space: Space): RefsPassResult {
  const index = buildRefIndex(space)
  const issues: ValidationIssue[] = []
  const allRefs = [...index.refs()]

  for (const module of space.modules) {
    walkModule(module, index, allRefs, issues)
  }
  for (const useCase of space.useCases) {
    walkUseCase(useCase, index, allRefs, issues)
  }

  return { issues, index }
}

function walkModule(
  module: Space['modules'][number],
  index: RefIndex,
  allRefs: string[],
  issues: ValidationIssue[],
): void {
  const moduleRef = `module:${module.id}`
  walkComponents(module.components, moduleRef, `module '${module.id}'`, index, allRefs, issues)
  walkModels(module.models, moduleRef, `module '${module.id}'`, index, allRefs, issues)
  walkTables(module.tables, moduleRef, `module '${module.id}'`, index, allRefs, issues)
  walkErrorMappings(module, index, allRefs, issues)
  for (const domain of module.domains) {
    const domainRef = `${moduleRef}/domain:${domain.id}`
    const label = `module '${module.id}' / domain '${domain.id}'`
    walkComponents(domain.components, domainRef, label, index, allRefs, issues)
    walkModels(domain.models, domainRef, label, index, allRefs, issues)
    walkTables(domain.tables, domainRef, label, index, allRefs, issues)
  }
}

function walkErrorMappings(
  module: Space['modules'][number],
  index: RefIndex,
  allRefs: string[],
  issues: ValidationIssue[],
): void {
  const moduleRef = `module:${module.id}`
  const errorMapping = module.errorMapping ?? []
  for (let i = 0; i < errorMapping.length; i++) {
    const mapping = errorMapping[i]
    if (!mapping) continue
    const refs = [mapping.handlerRef, mapping.implementationProof?.handlerRef].filter(
      (ref): ref is string => Boolean(ref),
    )
    for (const ref of refs) {
      checkRef(ref, index, allRefs, issues, {
        entityRef: moduleRef,
        expectedKinds: ['component', 'method'],
        context: `module '${module.id}' errorMapping[${i}] handlerRef`,
      })
    }
  }
}

function walkComponents(
  components: Space['modules'][number]['components'],
  parentRef: string,
  parentLabel: string,
  index: RefIndex,
  allRefs: string[],
  issues: ValidationIssue[],
): void {
  for (const component of components) {
    const compRef = `${parentRef}/component:${component.id}`
    const label = `${parentLabel} / component '${component.id}'`
    for (const method of component.methods) {
      const methodLabel = `${label} / method '${method.name}'`
      for (let i = 0; i < method.calls.length; i++) {
        const call = method.calls[i]
        if (!call) continue
        checkRef(call.target, index, allRefs, issues, {
          entityRef: `${compRef}/method:${method.name}`,
          expectedKinds: ['method', 'component'],
          context: `${methodLabel} calls[${i}]`,
        })
      }
    }
    // v0.5 (B2) — walk pub/sub edges so REF_BROKEN catches dangling event
    // refs alongside calls. Component reachability via these edges is
    // handled by ruleComponentUnused; here we only resolve the refs.
    const emits = component.emits ?? []
    for (let i = 0; i < emits.length; i++) {
      const edge = emits[i]
      if (!edge) continue
      checkRef(edge.event, index, allRefs, issues, {
        entityRef: compRef,
        expectedKinds: ['model'],
        context: `${label} emits[${i}].event`,
      })
      for (let j = 0; j < edge.to.length; j++) {
        const dest = edge.to[j]
        if (!dest) continue
        checkRef(dest, index, allRefs, issues, {
          entityRef: compRef,
          expectedKinds: ['component', 'method'],
          context: `${label} emits[${i}].to[${j}]`,
        })
      }
    }
    const subscribes = component.subscribes ?? []
    for (let i = 0; i < subscribes.length; i++) {
      const edge = subscribes[i]
      if (!edge) continue
      checkRef(edge.event, index, allRefs, issues, {
        entityRef: compRef,
        expectedKinds: ['model'],
        context: `${label} subscribes[${i}].event`,
      })
      if (edge.via) {
        checkRef(edge.via, index, allRefs, issues, {
          entityRef: compRef,
          expectedKinds: ['component'],
          context: `${label} subscribes[${i}].via`,
        })
      }
    }
  }
}

function walkModels(
  models: Space['modules'][number]['models'],
  parentRef: string,
  parentLabel: string,
  index: RefIndex,
  allRefs: string[],
  issues: ValidationIssue[],
): void {
  for (const model of models) {
    if (model.persistedAs) {
      checkRef(model.persistedAs, index, allRefs, issues, {
        entityRef: `${parentRef}/model:${model.id}`,
        expectedKinds: ['table'],
        context: `${parentLabel} / model '${model.id}' persistedAs`,
      })
    }
  }
}

function walkTables(
  tables: Space['modules'][number]['tables'],
  parentRef: string,
  parentLabel: string,
  index: RefIndex,
  allRefs: string[],
  issues: ValidationIssue[],
): void {
  for (const table of tables) {
    const tableRef = `${parentRef}/table:${table.id}`
    for (let i = 0; i < table.columns.length; i++) {
      const column = table.columns[i]
      if (!column?.foreignKey) continue
      checkRef(column.foreignKey.table, index, allRefs, issues, {
        entityRef: tableRef,
        expectedKinds: ['table'],
        context: `${parentLabel} / table '${table.id}' columns[${i}].foreignKey.table`,
      })
    }
  }
}

function walkUseCase(
  useCase: Space['useCases'][number],
  index: RefIndex,
  allRefs: string[],
  issues: ValidationIssue[],
): void {
  const useCaseRef = `usecase:${useCase.id}`
  const useCaseLabel = `usecase '${useCase.id}'`

  checkRef(useCase.actor, index, allRefs, issues, {
    entityRef: useCaseRef,
    expectedKinds: ['actor'],
    context: `${useCaseLabel} actor`,
  })

  for (let i = 0; i < useCase.steps.length; i++) {
    const step = useCase.steps[i]
    if (!step) continue
    checkRef(step.from, index, allRefs, issues, {
      entityRef: useCaseRef,
      expectedKinds: null,
      context: `${useCaseLabel} steps[${i}].from`,
    })
    checkRef(step.to, index, allRefs, issues, {
      entityRef: useCaseRef,
      expectedKinds: null,
      context: `${useCaseLabel} steps[${i}].to`,
    })
    if (step.via) {
      checkRef(step.via, index, allRefs, issues, {
        entityRef: useCaseRef,
        expectedKinds: ['model'],
        context: `${useCaseLabel} steps[${i}].via`,
      })
    }
  }

  for (const flow of useCase.errorFlows) {
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i]
      if (!step) continue
      const ctxBase = `${useCaseLabel} errorFlow '${flow.id}' steps[${i}]`
      checkRef(step.from, index, allRefs, issues, {
        entityRef: useCaseRef,
        expectedKinds: null,
        context: `${ctxBase}.from`,
      })
      checkRef(step.to, index, allRefs, issues, {
        entityRef: useCaseRef,
        expectedKinds: null,
        context: `${ctxBase}.to`,
      })
      if (step.via) {
        checkRef(step.via, index, allRefs, issues, {
          entityRef: useCaseRef,
          expectedKinds: ['model'],
          context: `${ctxBase}.via`,
        })
      }
    }
  }
}

interface CheckOpts {
  entityRef: string
  expectedKinds: readonly RefKind[] | null
  context: string
}

function checkRef(
  ref: string,
  index: RefIndex,
  allRefs: string[],
  issues: ValidationIssue[],
  opts: CheckOpts,
): void {
  const target = index.get(ref)
  if (!target) {
    const suggestions = closestMatches(ref, allRefs, 1)
    const issue: ValidationIssue = {
      severity: 'error',
      code: 'REF_BROKEN',
      message: `${opts.context} references '${ref}' which does not exist.`,
      entityRef: opts.entityRef,
    }
    if (suggestions.length > 0) issue.suggestion = `Did you mean '${suggestions[0]}'?`
    issues.push(issue)
    return
  }
  if (opts.expectedKinds && !opts.expectedKinds.includes(target.kind as RefKind)) {
    issues.push({
      severity: 'error',
      code: 'REF_WRONG_KIND',
      message: `${opts.context} expected ${opts.expectedKinds.join(' or ')} but '${ref}' is a ${target.kind}.`,
      entityRef: opts.entityRef,
    })
  }
}
