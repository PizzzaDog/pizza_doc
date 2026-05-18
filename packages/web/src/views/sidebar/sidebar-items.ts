/**
 * Flat-array model of the sidebar tree. Everything the sidebar renders or
 * walks with keyboard navigation is one of these items. Building the tree in
 * a single pass makes keyboard nav trivial (index++/index--) and keeps
 * rendering a straight map.
 */

import { encodeRefForRoute } from '@/lib/entity-ref'
import type { IssueIndex, NodeSeverity } from '@/lib/issue-index'
import type { Module, Space } from '@pizza-doc/core'

export type NavigateTarget =
  | { route: 'usecase'; useCaseId: string }
  | { route: 'entity'; refPath: string }

type Base = {
  id: string
  label: string
  level: number
  indent: number // pixel indent precomputed for render
  severity: NodeSeverity
  expandable: boolean
  expanded: boolean
  entityRef: string | null
  navigateTo: NavigateTarget | null
}

export type SectionItem = Base & {
  kind: 'section'
}

export type ActorGroupItem = Base & {
  kind: 'actor-group'
  actorType: Space['actors'][number]['type']
}

export type UsecaseItem = Base & {
  kind: 'usecase'
  touchedModuleTypes: Module['type'][]
}

export type ActorItem = Base & {
  kind: 'actor'
  actorType: Space['actors'][number]['type']
}

export type ModuleItem = Base & {
  kind: 'module'
  moduleType: Module['type']
}

export type DomainItem = Base & {
  kind: 'domain'
}

export type ElementGroupItem = Base & {
  kind: 'element-group'
  count: number
}

export type ComponentItem = Base & {
  kind: 'component'
  componentType: string
  participation: number
}

export type ModelItem = Base & {
  kind: 'model'
}

export type TableItem = Base & {
  kind: 'table'
}

export type EmptyStateItem = Base & {
  kind: 'empty'
}

export type Item =
  | SectionItem
  | ActorGroupItem
  | UsecaseItem
  | ActorItem
  | ModuleItem
  | DomainItem
  | ElementGroupItem
  | ComponentItem
  | ModelItem
  | TableItem
  | EmptyStateItem

const INDENT_STEP = 12 // px

const COMPONENT_GROUPS: ReadonlyArray<{ id: string; label: string; types: ReadonlySet<string> }> = [
  { id: 'controllers', label: 'controllers', types: new Set(['controller']) },
  { id: 'services', label: 'services', types: new Set(['service']) },
  { id: 'repositories', label: 'repositories', types: new Set(['repository']) },
  { id: 'infrastructure', label: 'infrastructure', types: new Set(['infrastructure']) },
  { id: 'pages', label: 'pages', types: new Set(['page']) },
  { id: 'widgets', label: 'widgets', types: new Set(['widget']) },
  { id: 'clients', label: 'clients', types: new Set(['client']) },
  { id: 'jobs', label: 'jobs', types: new Set(['job']) },
]

export interface BuildOptions {
  space: Space
  issues: IssueIndex
  expanded: ReadonlySet<string>
}

export function buildSidebarItems({ space, issues, expanded }: BuildOptions): Item[] {
  const out: Item[] = []

  pushUseCasesSection(out, space, issues, expanded)
  pushActorsSection(out, space, issues, expanded)
  pushModulesSection(out, space, issues, expanded)

  return out
}

function section(
  id: string,
  label: string,
  severity: NodeSeverity,
  expanded: boolean,
): SectionItem {
  return {
    kind: 'section',
    id,
    label,
    level: 0,
    indent: 0,
    severity,
    expandable: true,
    expanded,
    entityRef: null,
    navigateTo: null,
  }
}

// ---------- Use Cases ----------

function pushUseCasesSection(
  out: Item[],
  space: Space,
  issues: IssueIndex,
  expanded: ReadonlySet<string>,
): void {
  const sectionId = 'section:useCases'
  const sectionExpanded = expanded.has(sectionId)
  const sectionSeverity = worstSeverity(space.useCases.map((uc) => issues.self(`usecase:${uc.id}`)))
  out.push(section(sectionId, 'Flows', sectionSeverity, sectionExpanded))
  if (!sectionExpanded) return

  if (space.useCases.length === 0) {
    pushEmpty(out, `${sectionId}/empty`, 1, 'No use cases yet.')
    return
  }

  // Group by actor. Preserve actor declaration order; append any "orphan"
  // actor refs (used by a usecase but missing from space.actors) at the end.
  const actorOrder: string[] = space.actors.map((a) => `actor:${a.id}`)
  const byActor = new Map<string, string[]>()
  for (const uc of space.useCases) {
    const key = uc.actor
    const list = byActor.get(key)
    if (list) list.push(uc.id)
    else byActor.set(key, [uc.id])
  }
  const orderedKeys = [
    ...actorOrder.filter((k) => byActor.has(k)),
    ...[...byActor.keys()].filter((k) => !actorOrder.includes(k)),
  ]

  for (const actorRef of orderedKeys) {
    const actorId = actorRef.replace(/^actor:/, '')
    const actor = space.actors.find((a) => a.id === actorId)
    const groupId = `${sectionId}/actor:${actorId}`
    const groupExpanded = expanded.has(groupId)
    const useCaseIds = byActor.get(actorRef) ?? []
    const groupSeverity = worstSeverity(useCaseIds.map((id) => issues.self(`usecase:${id}`)))
    out.push({
      kind: 'actor-group',
      id: groupId,
      label: actorId,
      actorType: actor?.type ?? 'system',
      level: 1,
      indent: INDENT_STEP,
      severity: groupSeverity,
      expandable: true,
      expanded: groupExpanded,
      entityRef: null,
      navigateTo: null,
    })
    if (!groupExpanded) continue

    for (const useCaseId of useCaseIds) {
      const useCase = space.useCases.find((uc) => uc.id === useCaseId)
      out.push({
        kind: 'usecase',
        id: `usecase:${useCaseId}`,
        label: useCaseId,
        touchedModuleTypes: useCase ? collectTouchedModuleTypes(useCase, space) : [],
        level: 2,
        indent: INDENT_STEP * 2,
        severity: issues.self(`usecase:${useCaseId}`),
        expandable: false,
        expanded: false,
        entityRef: `usecase:${useCaseId}`,
        navigateTo: { route: 'usecase', useCaseId },
      })
    }
  }
}

// ---------- Actors ----------

function pushActorsSection(
  out: Item[],
  space: Space,
  issues: IssueIndex,
  expanded: ReadonlySet<string>,
): void {
  const sectionId = 'section:actors'
  const sectionExpanded = expanded.has(sectionId)
  const sectionSeverity = worstSeverity(space.actors.map((a) => issues.self(`actor:${a.id}`)))
  out.push(section(sectionId, 'Actors & Systems', sectionSeverity, sectionExpanded))
  if (!sectionExpanded) return

  if (space.actors.length === 0) {
    pushEmpty(out, `${sectionId}/empty`, 1, 'No actors yet.')
    return
  }

  for (const actor of space.actors) {
    const ref = `actor:${actor.id}`
    out.push({
      kind: 'actor',
      id: ref,
      label: actor.id,
      actorType: actor.type,
      level: 1,
      indent: INDENT_STEP,
      severity: issues.self(ref),
      expandable: false,
      expanded: false,
      entityRef: ref,
      navigateTo: { route: 'entity', refPath: encodeRefForRoute(ref) },
    })
  }
}

// ---------- Modules ----------

function pushModulesSection(
  out: Item[],
  space: Space,
  issues: IssueIndex,
  expanded: ReadonlySet<string>,
): void {
  const sectionId = 'section:modules'
  const sectionExpanded = expanded.has(sectionId)
  const sectionSeverity = worstSeverity(
    space.modules.map((m) => issues.aggregate(`module:${m.id}`)),
  )
  out.push(section(sectionId, 'System Map', sectionSeverity, sectionExpanded))
  if (!sectionExpanded) return

  if (space.modules.length === 0) {
    pushEmpty(out, `${sectionId}/empty`, 1, 'No modules yet.')
    return
  }

  for (const mod of space.modules) {
    pushModule(out, mod, issues, expanded)
  }
}

function pushModule(
  out: Item[],
  mod: Module,
  issues: IssueIndex,
  expanded: ReadonlySet<string>,
): void {
  const moduleRef = `module:${mod.id}`
  const moduleExpanded = expanded.has(moduleRef)
  out.push({
    kind: 'module',
    id: moduleRef,
    label: mod.id,
    moduleType: mod.type,
    level: 1,
    indent: INDENT_STEP,
    severity: issues.aggregate(moduleRef),
    expandable: true,
    expanded: moduleExpanded,
    entityRef: moduleRef,
    navigateTo: { route: 'entity', refPath: encodeRefForRoute(moduleRef) },
  })
  if (!moduleExpanded) return

  if (mod.domains.length > 0) {
    for (const domain of mod.domains) {
      const domainRef = `${moduleRef}/domain:${domain.id}`
      const domainExpanded = expanded.has(domainRef)
      out.push({
        kind: 'domain',
        id: domainRef,
        label: domain.id,
        level: 2,
        indent: INDENT_STEP * 2,
        severity: issues.aggregate(domainRef),
        expandable: true,
        expanded: domainExpanded,
        entityRef: domainRef,
        navigateTo: { route: 'entity', refPath: encodeRefForRoute(domainRef) },
      })
      if (!domainExpanded) continue
      pushElementGroups(
        out,
        domainRef,
        domain.components,
        domain.models,
        domain.tables,
        issues,
        expanded,
        3,
      )
    }
  }

  pushElementGroups(out, moduleRef, mod.components, mod.models, mod.tables, issues, expanded, 2)
}

function pushElementGroups(
  out: Item[],
  parentRef: string,
  components: ReadonlyArray<Module['components'][number]>,
  models: ReadonlyArray<Module['models'][number]>,
  tables: ReadonlyArray<Module['tables'][number]>,
  issues: IssueIndex,
  expanded: ReadonlySet<string>,
  level: 2 | 3,
): void {
  const indent = INDENT_STEP * level
  const childIndent = INDENT_STEP * (level + 1)

  for (const spec of COMPONENT_GROUPS) {
    const matching = components.filter((c) => spec.types.has(c.type))
    if (matching.length === 0) continue
    const groupId = `${parentRef}/group:${spec.id}`
    const groupExpanded = expanded.has(groupId)
    out.push({
      kind: 'element-group',
      id: groupId,
      label: spec.label,
      count: matching.length,
      level,
      indent,
      severity: worstSeverity(matching.map((c) => issues.self(`${parentRef}/component:${c.id}`))),
      expandable: true,
      expanded: groupExpanded,
      entityRef: null,
      navigateTo: null,
    })
    if (!groupExpanded) continue
    for (const comp of matching) {
      const compRef = `${parentRef}/component:${comp.id}`
      out.push({
        kind: 'component',
        id: compRef,
        label: comp.id,
        componentType: comp.type,
        participation: issues.useCaseParticipation(compRef),
        level: level + 1,
        indent: childIndent,
        severity: issues.self(compRef),
        expandable: false,
        expanded: false,
        entityRef: compRef,
        navigateTo: { route: 'entity', refPath: encodeRefForRoute(compRef) },
      })
    }
  }

  if (models.length > 0) {
    const groupId = `${parentRef}/group:models`
    const groupExpanded = expanded.has(groupId)
    out.push({
      kind: 'element-group',
      id: groupId,
      label: 'models',
      count: models.length,
      level,
      indent,
      severity: worstSeverity(models.map((m) => issues.self(`${parentRef}/model:${m.id}`))),
      expandable: true,
      expanded: groupExpanded,
      entityRef: null,
      navigateTo: null,
    })
    if (groupExpanded) {
      for (const model of models) {
        const ref = `${parentRef}/model:${model.id}`
        out.push({
          kind: 'model',
          id: ref,
          label: model.id,
          level: level + 1,
          indent: childIndent,
          severity: issues.self(ref),
          expandable: false,
          expanded: false,
          entityRef: ref,
          navigateTo: { route: 'entity', refPath: encodeRefForRoute(ref) },
        })
      }
    }
  }

  if (tables.length > 0) {
    const groupId = `${parentRef}/group:tables`
    const groupExpanded = expanded.has(groupId)
    out.push({
      kind: 'element-group',
      id: groupId,
      label: 'tables',
      count: tables.length,
      level,
      indent,
      severity: worstSeverity(tables.map((t) => issues.self(`${parentRef}/table:${t.id}`))),
      expandable: true,
      expanded: groupExpanded,
      entityRef: null,
      navigateTo: null,
    })
    if (groupExpanded) {
      for (const table of tables) {
        const ref = `${parentRef}/table:${table.id}`
        out.push({
          kind: 'table',
          id: ref,
          label: table.id,
          level: level + 1,
          indent: childIndent,
          severity: issues.self(ref),
          expandable: false,
          expanded: false,
          entityRef: ref,
          navigateTo: { route: 'entity', refPath: encodeRefForRoute(ref) },
        })
      }
    }
  }
}

function pushEmpty(out: Item[], id: string, level: number, label: string): void {
  out.push({
    kind: 'empty',
    id,
    label,
    level,
    indent: INDENT_STEP * level,
    severity: null,
    expandable: false,
    expanded: false,
    entityRef: null,
    navigateTo: null,
  })
}

function collectTouchedModuleTypes(
  useCase: Space['useCases'][number],
  space: Space,
): Module['type'][] {
  const typeByModule = new Map(space.modules.map((mod) => [mod.id, mod.type]))
  const seen = new Set<Module['type']>()
  const out: Module['type'][] = []

  const visitRef = (ref: string | undefined) => {
    const moduleId = ref?.match(/^module:([^/]+)/)?.[1]
    if (!moduleId) return
    const type = typeByModule.get(moduleId)
    if (!type || seen.has(type)) return
    seen.add(type)
    out.push(type)
  }

  const visitStep = (step: Space['useCases'][number]['steps'][number]) => {
    visitRef(step.from)
    visitRef(step.via)
    visitRef(step.to)
  }

  for (const step of useCase.steps) visitStep(step)
  for (const flow of useCase.errorFlows) {
    for (const step of flow.steps) visitStep(step)
  }

  return out
}

function worstSeverity(list: ReadonlyArray<NodeSeverity>): NodeSeverity {
  let current: NodeSeverity = null
  for (const s of list) {
    if (!s) continue
    if (!current) {
      current = s
      continue
    }
    const rank: Record<NonNullable<NodeSeverity>, number> = { error: 3, warning: 2, info: 1 }
    if (rank[s] > rank[current]) current = s
  }
  return current
}
