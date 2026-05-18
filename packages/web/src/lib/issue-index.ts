import type { Severity, Space, ValidationIssue } from '@pizza-doc/core'

export type NodeSeverity = Severity | null

/**
 * A lookup keyed by entity ref. Self-severity is the worst severity of issues
 * whose `entityRef` exactly matches. Aggregate is the worst across self and
 * all descendants (so a module header shows yellow if something nested has a
 * warning). Nodes with no issues and no affected descendants return null.
 */
export interface IssueIndex {
  self: (ref: string) => NodeSeverity
  aggregate: (ref: string) => NodeSeverity
  useCaseParticipation: (componentRef: string) => number
}

const SEVERITY_RANK: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1,
}

function worst(a: NodeSeverity, b: NodeSeverity): NodeSeverity {
  if (!a) return b
  if (!b) return a
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b
}

export function buildIssueIndex(space: Space, issues: readonly ValidationIssue[]): IssueIndex {
  const selfMap = new Map<string, NodeSeverity>()
  for (const issue of issues) {
    if (!issue.entityRef) continue
    selfMap.set(issue.entityRef, worst(selfMap.get(issue.entityRef) ?? null, issue.severity))
  }

  // Every ref we know about (so aggregate() can walk children cheaply).
  const allRefs = new Set<string>()
  for (const actor of space.actors) allRefs.add(`actor:${actor.id}`)
  for (const uc of space.useCases) allRefs.add(`usecase:${uc.id}`)
  for (const mod of space.modules) {
    const moduleRef = `module:${mod.id}`
    allRefs.add(moduleRef)
    for (const c of mod.components) {
      const ref = `${moduleRef}/component:${c.id}`
      allRefs.add(ref)
      for (const m of c.methods) allRefs.add(`${ref}/method:${m.name}`)
    }
    for (const m of mod.models) allRefs.add(`${moduleRef}/model:${m.id}`)
    for (const t of mod.tables) allRefs.add(`${moduleRef}/table:${t.id}`)
    for (const d of mod.domains) {
      const dref = `${moduleRef}/domain:${d.id}`
      allRefs.add(dref)
      for (const c of d.components) {
        const ref = `${dref}/component:${c.id}`
        allRefs.add(ref)
        for (const m of c.methods) allRefs.add(`${ref}/method:${m.name}`)
      }
      for (const m of d.models) allRefs.add(`${dref}/model:${m.id}`)
      for (const t of d.tables) allRefs.add(`${dref}/table:${t.id}`)
    }
  }

  const aggregateCache = new Map<string, NodeSeverity>()
  function aggregate(ref: string): NodeSeverity {
    if (aggregateCache.has(ref)) return aggregateCache.get(ref) ?? null
    let worstSoFar: NodeSeverity = selfMap.get(ref) ?? null
    // Descendant scan: any known ref that starts with `${ref}/` is a descendant.
    // O(N) per call but cached; overall O(N) across the whole tree.
    for (const candidate of allRefs) {
      if (candidate === ref) continue
      if (!candidate.startsWith(`${ref}/`)) continue
      const childSelf = selfMap.get(candidate)
      if (childSelf) worstSoFar = worst(worstSoFar, childSelf)
    }
    aggregateCache.set(ref, worstSoFar)
    return worstSoFar
  }

  // Use-case participation: for every step from/to/via, record the component ref.
  const participation = new Map<string, Set<string>>()
  for (const uc of space.useCases) {
    const walk = (from?: string, to?: string, via?: string) => {
      addPartic(participation, from, uc.id)
      addPartic(participation, to, uc.id)
      addPartic(participation, via, uc.id)
    }
    for (const s of uc.steps) walk(s.from, s.to, s.via)
    for (const ef of uc.errorFlows) {
      for (const s of ef.steps) walk(s.from, s.to, s.via)
    }
  }

  return {
    self: (ref) => selfMap.get(ref) ?? null,
    aggregate,
    useCaseParticipation: (componentRef) => participation.get(componentRef)?.size ?? 0,
  }
}

function addPartic(
  map: Map<string, Set<string>>,
  ref: string | undefined,
  useCaseId: string,
): void {
  if (!ref) return
  // Only count component participation (strip `/method:xxx` if present).
  const methodIdx = ref.indexOf('/method:')
  const key = methodIdx > 0 ? ref.slice(0, methodIdx) : ref
  // We only care about components specifically.
  if (!key.includes('/component:')) return
  const existing = map.get(key)
  if (existing) existing.add(useCaseId)
  else map.set(key, new Set([useCaseId]))
}
