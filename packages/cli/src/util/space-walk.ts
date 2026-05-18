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
