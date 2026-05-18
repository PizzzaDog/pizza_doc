import type { Component, Method, Model, Module, Space, Table, UseCase } from '@pizza-doc/core'

/**
 * Precomputed usage relationships for the "Used in" panels across detail
 * views. Computed once per space load; O(N) over entities + use cases.
 */
export interface UsageIndex {
  /** usecase refs for each actor. */
  useCasesByActor: Map<string, string[]>
  /** usecase refs that touch this component (step.from/to/via) across all flows. */
  useCasesByComponent: Map<string, string[]>
  /** usecase refs in which this model appears as step.via. */
  useCasesByModelTransit: Map<string, string[]>
  /** usecase refs that reference this table in steps or dataFlow targets. */
  useCasesByTable: Map<string, string[]>
  /** methods (by full ref) that include this component-ref in their `calls`. */
  incomingCallsToComponent: Map<string, string[]>
  /** component refs whose methods have any param/return naming this model. */
  componentsReferencingModelByType: Map<string, string[]>
  /** table refs reached by following a model's persistedAs pointer. */
  modelsPersistedAsTable: Map<string, string[]>
  /** For each table ref, the (other) table refs that FK into it. */
  tablesWithFkToTable: Map<string, string[]>
  /** For each ref (module / domain / component / model / table) — all usecase refs touching it or any descendant. */
  useCasesByScope: Map<string, string[]>
}

export function buildUsageIndex(space: Space): UsageIndex {
  const useCasesByActor = new Map<string, string[]>()
  const useCasesByComponent = new Map<string, string[]>()
  const useCasesByModelTransit = new Map<string, string[]>()
  const useCasesByTable = new Map<string, string[]>()
  const useCasesByScope = new Map<string, string[]>()
  const incomingCallsToComponent = new Map<string, string[]>()
  const componentsReferencingModelByType = new Map<string, string[]>()
  const modelsPersistedAsTable = new Map<string, string[]>()
  const tablesWithFkToTable = new Map<string, string[]>()

  // Index components / methods / models / tables up front so per-use-case
  // walks can touch them in O(1).
  const modelNameToRef = new Map<string, string[]>()
  const allComponents: Array<{ ref: string; comp: Component }> = []
  const allTables: Array<{ ref: string; table: Table }> = []
  const allModels: Array<{ ref: string; model: Model }> = []

  for (const mod of space.modules) {
    indexModule(
      mod,
      `module:${mod.id}`,
      allComponents,
      allTables,
      allModels,
      modelNameToRef,
      modelsPersistedAsTable,
      tablesWithFkToTable,
    )
    for (const d of mod.domains) {
      indexModule(
        { ...mod, components: d.components, models: d.models, tables: d.tables, domains: [] },
        `module:${mod.id}/domain:${d.id}`,
        allComponents,
        allTables,
        allModels,
        modelNameToRef,
        modelsPersistedAsTable,
        tablesWithFkToTable,
      )
    }
  }

  // Methods of components that call other methods.
  for (const { ref: compRef, comp } of allComponents) {
    for (const method of comp.methods) {
      const methodRef = `${compRef}/method:${method.name}`
      for (const call of method.calls) {
        const callee = call.target
        const calleeComponent = callee.replace(/\/method:[^/]+$/, '')
        if (!calleeComponent) continue
        pushUnique(incomingCallsToComponent, calleeComponent, methodRef)
      }
      // Methods that accept or return a model — associate that model with
      // the enclosing component ref.
      const referencedModels = collectReferencedModelNames(method)
      for (const modelName of referencedModels) {
        for (const modelRef of modelNameToRef.get(modelName) ?? []) {
          pushUnique(componentsReferencingModelByType, modelRef, compRef)
        }
      }
    }
  }

  for (const uc of space.useCases) {
    const ucRef = `usecase:${uc.id}`
    pushUnique(useCasesByActor, uc.actor, ucRef)

    const scopesTouched = new Set<string>()
    const touched = new Set<string>()

    const visitStepRefs = (from?: string, to?: string, via?: string) => {
      for (const ref of [from, to, via]) {
        if (!ref) continue
        // Track any reference so we can roll up to ancestor refs later.
        touched.add(ref)
      }
    }

    for (const step of uc.steps) visitStepRefs(step.from, step.to, step.via)
    for (const flow of uc.errorFlows) {
      for (const step of flow.steps) visitStepRefs(step.from, step.to, step.via)
    }

    for (const ref of touched) {
      // Components in use-case steps.
      if (ref.includes('/component:')) {
        const componentRef = ref.replace(/\/method:[^/]+$/, '')
        pushUnique(useCasesByComponent, componentRef, ucRef)
        registerScope(scopesTouched, componentRef)
      }
      // Tables — step.to of `sql` steps lands on table refs directly.
      if (ref.includes('/table:')) {
        pushUnique(useCasesByTable, ref, ucRef)
        registerScope(scopesTouched, ref)
      }
      // Models — step.via typically points at these.
      if (ref.includes('/model:')) {
        pushUnique(useCasesByModelTransit, ref, ucRef)
        registerScope(scopesTouched, ref)
      }
    }

    for (const df of uc.dataFlow) {
      const m = df.targetField.match(/^([A-Za-z][A-Za-z0-9_-]*)\./)
      if (!m?.[1]) continue
      const tableName = m[1]
      for (const entry of allTables) {
        if (entry.table.name === tableName || entry.table.id === tableName) {
          pushUnique(useCasesByTable, entry.ref, ucRef)
          registerScope(scopesTouched, entry.ref)
        }
      }
    }

    for (const scope of scopesTouched) {
      pushUnique(useCasesByScope, scope, ucRef)
    }
  }

  return {
    useCasesByActor,
    useCasesByComponent,
    useCasesByModelTransit,
    useCasesByTable,
    incomingCallsToComponent,
    componentsReferencingModelByType,
    modelsPersistedAsTable,
    tablesWithFkToTable,
    useCasesByScope,
  }
}

function indexModule(
  mod: Module,
  parentRef: string,
  allComponents: Array<{ ref: string; comp: Component }>,
  allTables: Array<{ ref: string; table: Table }>,
  allModels: Array<{ ref: string; model: Model }>,
  modelNameToRef: Map<string, string[]>,
  modelsPersistedAsTable: Map<string, string[]>,
  tablesWithFkToTable: Map<string, string[]>,
): void {
  for (const c of mod.components) {
    allComponents.push({ ref: `${parentRef}/component:${c.id}`, comp: c })
  }
  for (const m of mod.models) {
    const ref = `${parentRef}/model:${m.id}`
    allModels.push({ ref, model: m })
    pushUnique(modelNameToRef, m.name, ref)
    pushUnique(modelNameToRef, m.id, ref)
    if (m.persistedAs) {
      pushUnique(modelsPersistedAsTable, m.persistedAs, ref)
    }
  }
  for (const t of mod.tables) {
    const ref = `${parentRef}/table:${t.id}`
    allTables.push({ ref, table: t })
    for (const col of t.columns) {
      if (!col.foreignKey) continue
      pushUnique(tablesWithFkToTable, col.foreignKey.table, ref)
    }
  }
}

function collectReferencedModelNames(method: Method): string[] {
  const seen = new Set<string>()
  const add = (t: string | undefined) => {
    if (!t) return
    const base = extractBaseType(t)
    if (base) seen.add(base)
  }
  add(method.returns)
  for (const p of method.params) add(p.type)
  return [...seen]
}

function extractBaseType(t: string): string {
  const inner = t.match(/^[A-Za-z]+<([A-Za-z0-9_]+)>$/)
  if (inner?.[1]) return inner[1]
  return t
}

function pushUnique(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key)
  if (existing) {
    if (!existing.includes(value)) existing.push(value)
  } else {
    map.set(key, [value])
  }
}

/**
 * Register a "scope" ref and all its ancestors so a module / domain view can
 * surface descendant use-case usage.
 */
function registerScope(set: Set<string>, ref: string): void {
  const parts = ref.split('/')
  for (let i = 1; i <= parts.length; i++) {
    set.add(parts.slice(0, i).join('/'))
  }
}

// Silence unused-binding warnings in strict mode — UseCase is imported for
// type-narrowing comments in the doc comment above.
export type _UseCaseAlias = UseCase
