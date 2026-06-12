import type { Component, Model, Module, Space, Table } from '@pizza-doc/core'

/**
 * Flat iteration helpers. Use cases are full of nested loops (`for module
 * of space.modules; for domain; for component`) — centralising them keeps
 * the reporting commands terse and resistant to future schema changes
 * (e.g. another nesting level lands? one edit here).
 */

export interface ComponentCtx {
  component: Component
  module: Module
  domainId?: string
  ref: string
}
export interface ModelCtx {
  model: Model
  module: Module
  domainId?: string
  ref: string
}
export interface TableCtx {
  table: Table
  module: Module
  domainId?: string
  ref: string
}

export function* allComponents(space: Space): Generator<ComponentCtx> {
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

export function* allModels(space: Space): Generator<ModelCtx> {
  for (const mod of space.modules) {
    for (const m of mod.models) {
      yield { model: m, module: mod, ref: `module:${mod.id}/model:${m.id}` }
    }
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

export function* allTables(space: Space): Generator<TableCtx> {
  for (const mod of space.modules) {
    for (const t of mod.tables) {
      yield { table: t, module: mod, ref: `module:${mod.id}/table:${t.id}` }
    }
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

/** One `sourceRef` found in the space, tagged with a human-readable owner. */
export interface AnchorCtx {
  /** Owner label, e.g. `module:api/component:OrderController/method:create`. */
  ref: string
  /** The raw `sourceRef` string as authored (path, optionally `:line`). */
  sourceRef: string
}

/**
 * Yield every `sourceRef` in the space, wherever the schema allows one
 * (component / method / param / route / emit / subscribe; model / field;
 * table / column / migration; use case; module errorMapping + proof,
 * external-dep + preflight/drift/exec-contract, config + defaultSources,
 * state machine, health contract). `pd anchors` consumes this to check
 * each one resolves to a real file — the deterministic half of drift
 * detection that needs no language parser.
 *
 * Walks `allComponents/Models/Tables` so it inherits domain nesting for
 * free; module-level operations surfaces are iterated directly.
 */
export function* allSourceRefs(space: Space): Generator<AnchorCtx> {
  for (const { component, ref } of allComponents(space)) {
    if (component.sourceRef) yield { ref, sourceRef: component.sourceRef }
    for (const m of component.methods) {
      const mref = `${ref}/method:${m.name}`
      if (m.sourceRef) yield { ref: mref, sourceRef: m.sourceRef }
      for (const p of m.params) {
        if (p.sourceRef) yield { ref: `${mref}/param:${p.name}`, sourceRef: p.sourceRef }
      }
    }
    for (const r of component.routes) {
      if (r.sourceRef) yield { ref: `${ref}/route:${r.method} ${r.path}`, sourceRef: r.sourceRef }
    }
    for (const e of component.emits) {
      if (e.sourceRef) yield { ref: `${ref}/emits:${e.event}`, sourceRef: e.sourceRef }
    }
    for (const s of component.subscribes) {
      if (s.sourceRef) yield { ref: `${ref}/subscribes:${s.event}`, sourceRef: s.sourceRef }
    }
    if (component.entrypoint?.sourceRef) {
      yield { ref: `${ref}/entrypoint`, sourceRef: component.entrypoint.sourceRef }
    }
  }

  for (const { model, ref } of allModels(space)) {
    if (model.sourceRef) yield { ref, sourceRef: model.sourceRef }
    for (const f of model.fields) {
      if (f.sourceRef) yield { ref: `${ref}/field:${f.name}`, sourceRef: f.sourceRef }
    }
  }

  for (const { table, ref } of allTables(space)) {
    if (table.sourceRef) yield { ref, sourceRef: table.sourceRef }
    for (const c of table.columns) {
      if (c.sourceRef) yield { ref: `${ref}/column:${c.name}`, sourceRef: c.sourceRef }
    }
    for (const mig of table.migrations) {
      if (mig.sourceRef) yield { ref: `${ref}/migration:${mig.id}`, sourceRef: mig.sourceRef }
    }
  }

  for (const uc of space.useCases) {
    if (uc.sourceRef) yield { ref: `usecase:${uc.id}`, sourceRef: uc.sourceRef }
  }

  for (const mod of space.modules) {
    for (const em of mod.errorMapping) {
      const eref = `module:${mod.id}/errorMapping:${em.exception}`
      if (em.sourceRef) yield { ref: eref, sourceRef: em.sourceRef }
      if (em.implementationProof?.sourceRef) {
        yield { ref: `${eref}/proof`, sourceRef: em.implementationProof.sourceRef }
      }
    }
    for (const dep of mod.externalDeps) {
      const dref = `module:${mod.id}/external-dep:${dep.name}`
      if (dep.sourceRef) yield { ref: dref, sourceRef: dep.sourceRef }
      if (dep.kind === 'http-api') {
        if (dep.preflightCheck?.sourceRef) {
          yield { ref: `${dref}/preflight`, sourceRef: dep.preflightCheck.sourceRef }
        }
        if (dep.driftProbe?.sourceRef) {
          yield { ref: `${dref}/drift-probe`, sourceRef: dep.driftProbe.sourceRef }
        }
        if (dep.positionalArgs?.contractTest?.sourceRef) {
          yield {
            ref: `${dref}/arg-contract`,
            sourceRef: dep.positionalArgs.contractTest.sourceRef,
          }
        }
      }
    }
    for (const entry of mod.configMap) {
      const cref = `module:${mod.id}/config:${entry.key}`
      if (entry.sourceRef) yield { ref: cref, sourceRef: entry.sourceRef }
      for (const ds of entry.defaultSources) {
        if (ds.sourceRef) yield { ref: `${cref}/default`, sourceRef: ds.sourceRef }
      }
    }
    for (const sm of mod.stateMachines) {
      if (sm.sourceRef)
        yield { ref: `module:${mod.id}/state-machine:${sm.id}`, sourceRef: sm.sourceRef }
    }
    if (mod.healthContract?.sourceRef) {
      yield { ref: `module:${mod.id}/health-contract`, sourceRef: mod.healthContract.sourceRef }
    }
  }
}
