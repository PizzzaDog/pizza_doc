import type {
  Component,
  Domain,
  Model,
  Module,
  RefIndex,
  Space,
  Table,
  UseCase,
  UseCaseStep,
} from '@pizza-doc/core'

/**
 * Flow-scoped view of a use case. Turns the selected flow's steps into a
 * graph model: nodes grouped by module, edges carrying step index + protocol
 * + optional `via` DTO. Nothing here knows about React Flow or ELK yet.
 */

export type FlowKind = { kind: 'happy' } | { kind: 'error'; id: string }

export interface FlowEntity {
  /** React Flow node id; equal to the entity ref. */
  id: string
  ref: string
  label: string
  kind: 'component' | 'table' | 'external' | 'module' | 'unknown'
  /** For component/table/external only — parent module ref. */
  moduleRef: string | null
  component?: Component
  table?: Table
  module?: Module
  domain?: Domain
}

export interface FlowModule {
  id: string
  ref: string
  label: string
  type: Module['type']
  module: Module
  /** Children of this module (entity ids). */
  childIds: string[]
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  stepIndex: number // 1-based; the index callers use for the 1–9 keyboard shortcut.
  protocol?: UseCaseStep['protocol']
  viaRef?: string
  viaLabel?: string
  viaModel?: Model
  description?: string
  isError: boolean
}

export interface BuiltFlow {
  nodes: FlowEntity[]
  modules: FlowModule[]
  edges: FlowEdge[]
  stepCount: number
}

/** List of flows available on a use case — happy plus one per error flow. */
export function availableFlows(
  useCase: UseCase,
): Array<{ key: string; label: string; kind: FlowKind }> {
  const out: Array<{ key: string; label: string; kind: FlowKind }> = [
    { key: 'happy', label: 'Happy path', kind: { kind: 'happy' } },
  ]
  for (const ef of useCase.errorFlows) {
    out.push({ key: ef.id, label: ef.id, kind: { kind: 'error', id: ef.id } })
  }
  return out
}

export function buildFlow(
  space: Space,
  index: RefIndex,
  useCase: UseCase,
  which: FlowKind,
): BuiltFlow {
  const steps =
    which.kind === 'happy'
      ? useCase.steps
      : (useCase.errorFlows.find((ef) => ef.id === which.id)?.steps ?? [])
  const isError = which.kind === 'error'

  const entities = new Map<string, FlowEntity>()
  const modules = new Map<string, FlowModule>()
  const edges: FlowEdge[] = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (!step) continue
    const source = ensureEntity(step.from, entities, modules, index)
    const target = ensureEntity(step.to, entities, modules, index)
    const edge: FlowEdge = {
      id: `step-${which.kind === 'happy' ? 'happy' : which.id}-${i}`,
      source: source.id,
      target: target.id,
      stepIndex: i + 1,
      ...(step.protocol !== undefined ? { protocol: step.protocol } : {}),
      isError,
      ...(step.description !== undefined ? { description: step.description } : {}),
    }
    if (step.via) {
      edge.viaRef = step.via
      const via = index.get(step.via)
      if (via?.kind === 'model') {
        edge.viaModel = via.entity
        edge.viaLabel = via.entity.name
      } else {
        edge.viaLabel = lastSegment(step.via)
      }
    }
    edges.push(edge)
  }

  // Void the unused `space` argument — kept in the signature for future
  // cross-module lookups.
  void space

  return {
    nodes: [...entities.values()],
    modules: [...modules.values()],
    edges,
    stepCount: steps.length,
  }
}

function ensureEntity(
  ref: string,
  entities: Map<string, FlowEntity>,
  modules: Map<string, FlowModule>,
  index: RefIndex,
): FlowEntity {
  const existing = entities.get(ref)
  if (existing) return existing

  const target = index.get(ref)
  const moduleRef = extractModuleRef(ref)
  let entity: FlowEntity

  if (!target) {
    entity = {
      id: ref,
      ref,
      label: lastSegment(ref),
      kind: 'unknown',
      moduleRef,
    }
  } else if (target.kind === 'component') {
    entity = {
      id: ref,
      ref,
      label: target.entity.name,
      kind: target.module.type === 'external' ? 'external' : 'component',
      moduleRef,
      component: target.entity,
      module: target.module,
      ...(target.domain ? { domain: target.domain } : {}),
    }
  } else if (target.kind === 'table') {
    entity = {
      id: ref,
      ref,
      label: target.entity.name,
      kind: 'table',
      moduleRef,
      table: target.entity,
      module: target.module,
      ...(target.domain ? { domain: target.domain } : {}),
    }
  } else if (target.kind === 'module') {
    entity = {
      id: ref,
      ref,
      label: target.entity.name,
      kind: 'module',
      moduleRef: null,
      module: target.entity,
    }
  } else {
    // actor / usecase / domain / model / method — should not appear as
    // step.from/to targets. Render as unknown leaf.
    entity = { id: ref, ref, label: lastSegment(ref), kind: 'unknown', moduleRef }
  }

  entities.set(ref, entity)

  if (entity.moduleRef && entity.module && entity.kind !== 'module') {
    ensureModule(entity.moduleRef, modules, entity.module).childIds.push(entity.id)
  }

  return entity
}

function ensureModule(ref: string, map: Map<string, FlowModule>, module: Module): FlowModule {
  const existing = map.get(ref)
  if (existing) return existing
  const created: FlowModule = {
    id: ref,
    ref,
    label: module.name,
    type: module.type,
    module,
    childIds: [],
  }
  map.set(ref, created)
  return created
}

function extractModuleRef(ref: string): string | null {
  const m = ref.match(/^(module:[^/]+)/)
  return m?.[1] ?? null
}

function lastSegment(ref: string): string {
  const seg = ref.split('/').pop() ?? ref
  const colon = seg.indexOf(':')
  return colon < 0 ? seg : seg.slice(colon + 1)
}
