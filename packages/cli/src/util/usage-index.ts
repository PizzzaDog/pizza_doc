import type { Component, Model, Space, Table, UseCaseStep } from '@pizza-doc/core'
import { allComponents, allModels, allTables } from './space-walk.js'

/**
 * Build a `ref → Set<usecase-id>` map so every report can answer "who uses
 * me?" in O(1). Walks all use-case steps (including error flows), all
 * dataFlow entries, and all component method calls.
 *
 * A component is considered "used" if:
 *   - any use-case step's from/to/via mentions it,
 *   - any other component calls one of its methods.
 * A model is "used" if mentioned in a method signature, a step's via, or
 * a dataFlow source/target type.
 * A table is "used" if any dataFlow writes to it or any step terminates
 * there.
 */
export interface UsageIndex {
  componentUsedBy: Map<string, Set<string>>
  modelUsedBy: Map<string, Set<string>>
  tableUsedBy: Map<string, Set<string>>
  componentMethodUsedBy: Map<string, Set<string>>
  /** Top-level endpoints: `METHOD /path` → use-case ids that exercise them. */
  endpointsUsedBy: Map<string, Set<string>>
  /** Every component method with an httpMethod+httpPath, keyed as above. */
  endpoints: Map<string, { componentRef: string; methodName: string }>
}

export function buildUsageIndex(space: Space): UsageIndex {
  const componentUsedBy = new Map<string, Set<string>>()
  const modelUsedBy = new Map<string, Set<string>>()
  const tableUsedBy = new Map<string, Set<string>>()
  const componentMethodUsedBy = new Map<string, Set<string>>()
  const endpointsUsedBy = new Map<string, Set<string>>()
  const endpoints = new Map<string, { componentRef: string; methodName: string }>()

  const modelByName = new Map<string, string>() // name → ref
  for (const { model, ref } of allModels(space)) modelByName.set(model.name, ref)

  const tableByName = new Map<string, string>()
  for (const { table, ref } of allTables(space)) tableByName.set(table.name, ref)

  // Discover public endpoints + components that call other methods. Endpoint
  // coverage is about inbound HTTP surface, so only controllers participate;
  // frontend clients and external SDK wrappers may carry http metadata too,
  // but they are consumers of endpoints, not endpoints themselves.
  for (const { component, ref } of allComponents(space)) {
    for (const m of component.methods) {
      if (component.type === 'controller' && m.httpMethod && m.httpPath) {
        const key = endpointKey(m.httpMethod, m.httpPath)
        endpoints.set(key, { componentRef: ref, methodName: m.name })
      }
      for (const call of m.calls) {
        // Track the called method's owning component.
        const target = call.target
        const ownerRef = target.split('/method:')[0]
        if (ownerRef) {
          add(componentUsedBy, ownerRef, ref)
          add(componentMethodUsedBy, target, ref)
        }
      }
      // Method parameter + return types — might reference a model by name.
      for (const p of m.params) registerTypeHits(p.type, modelByName, modelUsedBy, ref)
      if (m.returns) registerTypeHits(m.returns, modelByName, modelUsedBy, ref)
    }
  }
  // Model field types can reference other models.
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

    // Endpoint coverage: step where target is a controller method or HTTP hop.
    for (const step of uc.steps) {
      if (step.protocol !== 'http') continue
      // Match the step.description-declared path, or infer from the target
      // component's methods if description is unset.
      const descMatch = step.description?.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/)
      if (descMatch) {
        const [, method, rawPath] = descMatch
        if (method && rawPath) add(endpointsUsedBy, endpointKey(method, rawPath), useCaseRef)
      } else {
        // Fall back: any endpoint whose componentRef === step.to.
        for (const [key, info] of endpoints) {
          if (info.componentRef === step.to) add(endpointsUsedBy, key, useCaseRef)
        }
      }
    }
  }

  function addStepRef(ref: string, useCaseRef: string): void {
    // Strip /method:foo for usage accounting, but still track method call.
    const head = ref.split('/method:')[0]
    if (!head) return
    add(componentUsedBy, head, useCaseRef)
    if (ref !== head) add(componentMethodUsedBy, ref, useCaseRef)
    if (ref.includes('/table:')) add(tableUsedBy, ref, useCaseRef)
    if (ref.includes('/model:')) add(modelUsedBy, ref, useCaseRef)
  }

  return {
    componentUsedBy,
    modelUsedBy,
    tableUsedBy,
    componentMethodUsedBy,
    endpointsUsedBy,
    endpoints,
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
  if (!m) return null
  const [, type, field] = m
  if (!type || !field) return null
  return { type, field }
}
