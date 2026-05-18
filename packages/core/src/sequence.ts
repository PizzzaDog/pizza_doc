/**
 * Sequence-view model. Derives the data a UML-ish sequence diagram needs
 * from a `UseCase` + its enclosing `Space`. Three zoom levels:
 *
 *   L1 — inter-module sequence (between modules, actor on the left)
 *   L2 — intra-module sequence (between components inside a module)
 *   L3 — intra-component method graph (method `calls` edges)
 *
 * Return arrows at L1/L2 are **inferred** via a call-stack simulation: when
 * step N+1's source isn't the same participant as step N's target, we pop
 * the stack back to step N+1's source, emitting a `return` message for
 * each pop. Returns at end-of-flow drain the stack back to the actor. The
 * v0.2 schema addition `returnsTo` / `implicitReturn` (see docs/backlog.md)
 * will let us stop inferring when authors mark returns explicitly.
 *
 * The model is UI-agnostic — no coordinates, no DOM. The layout pass lives
 * in the web package.
 */

import { parseRef } from './ref.js'
import type { Component, Module, Space, UseCase, UseCaseStep } from './schema.js'

// ---------- Public shapes ----------

export type Protocol =
  | 'http'
  | 'http-response'
  | 'sse'
  | 'websocket'
  | 'ws'
  | 'internal-call'
  | 'sql'
  | 'event'
  | 'external-api'

export type ParticipantTier = 'frontend' | 'backend' | 'database' | 'external' | 'queue'

export interface Participant {
  /** Stable id within the view; usually a ref URI, synthetic for actor/external markers. */
  id: string
  label: string
  kind: 'actor' | 'module' | 'component' | 'method' | 'table' | 'external'
  /** True when descending to the next level yields non-trivial content. */
  hasDeeper: boolean
  /** Ref URI the inspector should open; absent for synthetic participants. */
  ref?: string
  /**
   * Tier membership: the `Module.type` mapped onto the four design colours
   * (frontend/backend/database/external/queue). Populated at every level
   * where a participant maps to a module — so components and methods
   * inherit their parent module's tier. Actors and pure-synthetic
   * participants leave this undefined.
   */
  tier?: ParticipantTier
}

export interface Message {
  /**
   * 1-based step index from the YAML `steps` array. Absent for synthesized
   * messages (actor entry, inferred returns, L3's call-graph traversal).
   */
  stepIndex?: number
  /** Participant id of the sender. May point outside `participants` (ingress). */
  from: string
  /** Participant id of the receiver. May point outside `participants` (egress). */
  to: string
  kind: 'call' | 'return' | 'async'
  protocol?: Protocol
  /** Ref URI of the DTO carried by this message (step.via). */
  viaDtoRef?: string
  /** True when the message was synthesized (return inference, actor entry). */
  inferred?: boolean
  description?: string
}

export interface LevelView {
  participants: Participant[]
  messages: Message[]
}

export interface Flow {
  /**
   * L0 — collapsed to tiers (Frontend / Backend / Database / External /
   * Queue). Aggregates every cross-module edge into a cross-tier edge;
   * intra-tier hops are hidden. The Figma-style "show me the system" view.
   */
  tiers: LevelView
  /** L1 — collapsed to modules. */
  modules: LevelView
  /** L2 — keyed by module id. Only modules with ≥1 touched component appear. */
  components: Map<string, LevelView>
  /**
   * L3 — keyed by the component's canonical ref URI. Level 3 is
   * use-case-independent (shows the full `method.calls` graph of the
   * component) — the map only contains entries for components with at
   * least one method whose `calls` are non-empty.
   */
  methods: Map<string, LevelView>
}

export interface ErrorFlowView {
  id: string
  condition: string
  resultDescription?: string
  flow: Flow
}

export interface SequenceModel {
  useCase: { id: string; name: string }
  main: Flow
  errorFlows: ErrorFlowView[]
}

// ---------- Entry point ----------

export function buildSequenceModel(useCase: UseCase, space: Space): SequenceModel {
  const context = buildContext(space)

  const errorFlows: ErrorFlowView[] = useCase.errorFlows.map((ef) => {
    const view: ErrorFlowView = {
      id: ef.id,
      condition: ef.condition,
      flow: buildFlow(useCase.actor, ef.steps, context),
    }
    if (ef.resultDescription !== undefined) view.resultDescription = ef.resultDescription
    return view
  })

  return {
    useCase: { id: useCase.id, name: useCase.name },
    main: buildFlow(useCase.actor, useCase.steps, context),
    errorFlows,
  }
}

// ---------- Space context (precomputed lookups) ----------

interface SpaceContext {
  modules: Map<string, Module>
  /** `<moduleId>/<componentId>` or `<moduleId>/<domainId>/<componentId>` → component. */
  componentByRef: Map<string, { component: Component; moduleId: string; domainId?: string }>
  /** `<moduleId>/<domainId?>/<table|model>:<id>` → human label. */
  tableLabelByRef: Map<string, string>
  /** Actors keyed by their ref (actor:<id>). */
  actorLabel: (ref: string) => string
  /** `<moduleId>` → true if module.type === 'external'. */
  isExternalModule: (moduleId: string) => boolean
}

function buildContext(space: Space): SpaceContext {
  const modules = new Map<string, Module>()
  for (const m of space.modules) modules.set(m.id, m)

  const componentByRef = new Map<
    string,
    { component: Component; moduleId: string; domainId?: string }
  >()
  const tableLabelByRef = new Map<string, string>()

  for (const mod of space.modules) {
    for (const c of mod.components) {
      componentByRef.set(componentRefKey(mod.id, undefined, c.id), {
        component: c,
        moduleId: mod.id,
      })
    }
    for (const t of mod.tables) {
      tableLabelByRef.set(`module:${mod.id}/table:${t.id}`, t.name)
    }
    for (const d of mod.domains) {
      for (const c of d.components) {
        componentByRef.set(componentRefKey(mod.id, d.id, c.id), {
          component: c,
          moduleId: mod.id,
          domainId: d.id,
        })
      }
      for (const t of d.tables) {
        tableLabelByRef.set(`module:${mod.id}/domain:${d.id}/table:${t.id}`, t.name)
      }
    }
  }

  const actorById = new Map<string, string>()
  for (const a of space.actors) actorById.set(a.id, a.name)

  return {
    modules,
    componentByRef,
    tableLabelByRef,
    actorLabel: (ref) => {
      const id = ref.startsWith('actor:') ? ref.slice('actor:'.length) : ref
      return actorById.get(id) ?? id
    },
    isExternalModule: (moduleId) => modules.get(moduleId)?.type === 'external',
  }
}

function componentRefKey(
  moduleId: string,
  domainId: string | undefined,
  componentId: string,
): string {
  return domainId
    ? `module:${moduleId}/domain:${domainId}/component:${componentId}`
    : `module:${moduleId}/component:${componentId}`
}

// ---------- Flow assembly ----------

function buildFlow(actorRef: string, steps: readonly UseCaseStep[], ctx: SpaceContext): Flow {
  return {
    tiers: buildTiersLevel(actorRef, steps, ctx),
    modules: buildModulesLevel(actorRef, steps, ctx),
    components: buildComponentsLevel(steps, ctx),
    methods: buildMethodsLevel(steps, ctx),
  }
}

// ----- L0: tiers (Frontend / Backend / Database / External / Queue) ----------

/**
 * Tier of a module — derived from its `type`. `service` maps to Backend
 * because that's the user-facing label; `queue` is kept separate in case
 * a space has pub/sub infrastructure worth calling out, though we
 * collapse it under External in the renderer if it'd produce a lonely
 * single-lane.
 */
type Tier = 'frontend' | 'backend' | 'database' | 'external' | 'queue'

const TIER_LABELS: Record<Tier, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  external: 'External',
  queue: 'Queue',
}

function tierOf(moduleType: Module['type']): Tier {
  switch (moduleType) {
    case 'frontend':
      return 'frontend'
    case 'service':
      return 'backend'
    case 'database':
      return 'database'
    case 'external':
      return 'external'
    case 'queue':
      return 'queue'
  }
}

function buildTiersLevel(
  actorRef: string,
  steps: readonly UseCaseStep[],
  ctx: SpaceContext,
): LevelView {
  const participants: Participant[] = []
  const seen = new Set<string>()

  // Actor first.
  participants.push({
    id: actorRef,
    label: ctx.actorLabel(actorRef),
    kind: 'actor',
    hasDeeper: true,
    ref: actorRef,
  })
  seen.add(actorRef)

  // Collect tiers in step order.
  for (const step of steps) {
    for (const side of [step.from, step.to]) {
      const moduleId = moduleOfRef(side)
      if (!moduleId) continue
      const mod = ctx.modules.get(moduleId)
      if (!mod) continue
      const tier = tierOf(mod.type)
      const participantId = `tier:${tier}`
      if (seen.has(participantId)) continue
      participants.push({
        id: participantId,
        label: TIER_LABELS[tier],
        // `external` maps to the existing `external` participant kind so the
        // renderer gets the dashed-border treatment. Every other tier
        // renders as a plain `module`-kind participant header.
        kind: tier === 'external' ? 'external' : 'module',
        hasDeeper: true,
        ref: participantId,
        tier,
      })
      seen.add(participantId)
    }
  }

  const messages = simulateStackAtLevel(
    actorRef,
    steps,
    (step) => keyForTier(step.from, ctx),
    (step) => keyForTier(step.to, ctx),
    (id) => id,
    { skipSameKey: true },
  )

  return { participants, messages }
}

/**
 * Return the tier key for a ref (e.g. `tier:backend`), or `null` if the ref
 * doesn't resolve to a module we know about. Used by the L0 stack simulator.
 */
function keyForTier(ref: string, ctx: SpaceContext): string | null {
  const moduleId = moduleOfRef(ref)
  if (!moduleId) return null
  const mod = ctx.modules.get(moduleId)
  if (!mod) return null
  return `tier:${tierOf(mod.type)}`
}

// ----- L1: modules ------------------------------------------------------------

function buildModulesLevel(
  actorRef: string,
  steps: readonly UseCaseStep[],
  ctx: SpaceContext,
): LevelView {
  const participants: Participant[] = []
  const seen = new Set<string>()

  // Actor first.
  const actorParticipant: Participant = {
    id: actorRef,
    label: ctx.actorLabel(actorRef),
    kind: 'actor',
    hasDeeper: false,
    ref: actorRef,
  }
  participants.push(actorParticipant)
  seen.add(actorRef)

  // Collect modules in step order.
  for (const step of steps) {
    for (const side of [step.from, step.to]) {
      const moduleId = moduleOfRef(side)
      if (!moduleId) continue
      const participantId = `module:${moduleId}`
      if (seen.has(participantId)) continue
      const mod = ctx.modules.get(moduleId)
      if (!mod) continue
      participants.push({
        id: participantId,
        label: mod.name,
        kind: ctx.isExternalModule(moduleId) ? 'external' : 'module',
        hasDeeper: moduleHasComponentsInSteps(mod, steps),
        ref: participantId,
        tier: tierOf(mod.type),
      })
      seen.add(participantId)
    }
  }

  const messages = simulateStackAtLevel(
    actorRef,
    steps,
    (step) => moduleOfRef(step.from),
    (step) => moduleOfRef(step.to),
    (id) => `module:${id}`,
    { skipSameKey: true },
  )

  return { participants, messages }
}

function moduleHasComponentsInSteps(module: Module, steps: readonly UseCaseStep[]): boolean {
  let count = 0
  for (const step of steps) {
    for (const side of [step.from, step.to]) {
      if (moduleOfRef(side) === module.id) {
        const parsed = parseRef(side)
        if (parsed?.segments.some((s) => s.kind === 'component')) {
          count += 1
          if (count >= 1) return true
        }
      }
    }
  }
  return false
}

// ----- L2: components per module ---------------------------------------------

function buildComponentsLevel(
  steps: readonly UseCaseStep[],
  ctx: SpaceContext,
): Map<string, LevelView> {
  const moduleIds = new Set<string>()
  for (const step of steps) {
    const fm = moduleOfRef(step.from)
    const tm = moduleOfRef(step.to)
    if (fm) moduleIds.add(fm)
    if (tm) moduleIds.add(tm)
  }

  const out = new Map<string, LevelView>()
  for (const moduleId of moduleIds) {
    const view = buildModuleComponentsView(moduleId, steps, ctx)
    if (view) out.set(moduleId, view)
  }
  return out
}

function buildModuleComponentsView(
  moduleId: string,
  steps: readonly UseCaseStep[],
  ctx: SpaceContext,
): LevelView | null {
  const participants: Participant[] = []
  const seen = new Set<string>()

  function addParticipant(p: Participant): void {
    if (seen.has(p.id)) return
    participants.push(p)
    seen.add(p.id)
  }

  const leftContextModuleIds: string[] = []
  const rightContextModuleIds: string[] = []
  const contextSeen = new Set<string>()

  function addContextModule(contextModuleId: string, side: 'left' | 'right'): void {
    if (contextModuleId === moduleId || contextSeen.has(contextModuleId)) return
    contextSeen.add(contextModuleId)
    if (side === 'left') leftContextModuleIds.push(contextModuleId)
    else rightContextModuleIds.push(contextModuleId)
  }

  for (const step of steps) {
    const fromModule = moduleOfRef(step.from)
    const toModule = moduleOfRef(step.to)
    if (!fromModule || !toModule) continue
    if (toModule === moduleId && fromModule !== moduleId) addContextModule(fromModule, 'left')
    if (fromModule === moduleId && toModule !== moduleId) addContextModule(toModule, 'right')
  }

  for (const contextModuleId of leftContextModuleIds) {
    const p = refToContextModuleParticipant(contextModuleId, ctx)
    if (p) addParticipant(p)
  }

  // Collect components in step order. Tables belonging to this module are
  // also valid participants (at L2 of a database module you want to see the
  // tables explicitly).
  for (const step of steps) {
    for (const side of [step.from, step.to]) {
      if (moduleOfRef(side) !== moduleId) continue
      const p = refToL2Participant(side, moduleId, ctx)
      if (p) addParticipant(p)
    }
  }

  for (const contextModuleId of rightContextModuleIds) {
    const p = refToContextModuleParticipant(contextModuleId, ctx)
    if (p) addParticipant(p)
  }

  if (participants.length === 0) return null

  const contextModuleParticipantIds = new Set([...leftContextModuleIds, ...rightContextModuleIds])
  const messages = simulateStackAtLevel(
    /* actorRef */ null,
    steps,
    (step) =>
      keyForL2(
        step.from,
        moduleId,
        ctx,
        contextModuleParticipantIds,
        stepTouchesModule(step, moduleId),
      ),
    (step) =>
      keyForL2(
        step.to,
        moduleId,
        ctx,
        contextModuleParticipantIds,
        stepTouchesModule(step, moduleId),
      ),
    (id) => id,
    { skipSameKey: false, skipBothExternal: true },
  )

  return { participants, messages }
}

/**
 * At L2, the key of a ref is:
 *   - its component/table ref URI (participant id) when the ref is in `moduleId`
 *   - a synthetic ingress/egress id (`ingress:<moduleId>` / `egress:<moduleId>`)
 *     when the ref is outside `moduleId` — this produces gutter markers in
 *     the renderer.
 */
function keyForL2(
  ref: string,
  moduleId: string,
  ctx: SpaceContext,
  contextModuleParticipantIds: ReadonlySet<string>,
  stepTouchesFocusedModule: boolean,
): string | null {
  const refModule = moduleOfRef(ref)
  if (!refModule) return null
  if (refModule === moduleId) {
    const p = refToL2Participant(ref, moduleId, ctx)
    return p?.id ?? null
  }
  if (stepTouchesFocusedModule && contextModuleParticipantIds.has(refModule)) {
    return `module:${refModule}`
  }
  return `gutter:module:${refModule}`
}

function stepTouchesModule(step: UseCaseStep, moduleId: string): boolean {
  return moduleOfRef(step.from) === moduleId || moduleOfRef(step.to) === moduleId
}

function refToContextModuleParticipant(moduleId: string, ctx: SpaceContext): Participant | null {
  const mod = ctx.modules.get(moduleId)
  if (!mod) return null
  const tier = tierOf(mod.type)
  return {
    id: `module:${moduleId}`,
    label: mod.name,
    kind: ctx.isExternalModule(moduleId) ? 'external' : 'module',
    hasDeeper: false,
    ref: `module:${moduleId}`,
    tier,
  }
}

function refToL2Participant(ref: string, moduleId: string, ctx: SpaceContext): Participant | null {
  const parsed = parseRef(ref)
  if (!parsed) return null
  const segments = parsed.segments
  // Tier is the parent module's tier — components and tables inherit so
  // drill-in views stay visually tied to where the user came from.
  const parentMod = ctx.modules.get(moduleId)
  const tier = parentMod ? tierOf(parentMod.type) : undefined
  // component?
  const componentSeg = segments.find((s) => s.kind === 'component')
  if (componentSeg) {
    const domainSeg = segments.find((s) => s.kind === 'domain')
    const key = componentRefKey(moduleId, domainSeg?.id, componentSeg.id)
    const lookup = ctx.componentByRef.get(key)
    if (!lookup) return null
    const p: Participant = {
      id: key,
      label: lookup.component.name,
      kind: 'component',
      hasDeeper: componentHasCalls(lookup.component),
      ref: key,
    }
    if (tier) p.tier = tier
    return p
  }
  // table?
  const tableSeg = segments.find((s) => s.kind === 'table')
  if (tableSeg) {
    const domainSeg = segments.find((s) => s.kind === 'domain')
    const key = domainSeg
      ? `module:${moduleId}/domain:${domainSeg.id}/table:${tableSeg.id}`
      : `module:${moduleId}/table:${tableSeg.id}`
    const label = ctx.tableLabelByRef.get(key) ?? tableSeg.id
    const p: Participant = {
      id: key,
      label,
      kind: 'table',
      hasDeeper: false,
      ref: key,
    }
    if (tier) p.tier = tier
    return p
  }
  return null
}

function componentHasCalls(component: Component): boolean {
  for (const m of component.methods) {
    if (m.calls.length > 0) return true
  }
  return false
}

// ----- L3: methods per component ---------------------------------------------

function buildMethodsLevel(
  steps: readonly UseCaseStep[],
  ctx: SpaceContext,
): Map<string, LevelView> {
  const touchedComponents = new Set<string>()
  for (const step of steps) {
    for (const side of [step.from, step.to]) {
      const parsed = parseRef(side)
      if (!parsed) continue
      const moduleSeg = parsed.segments.find((s) => s.kind === 'module')
      const domainSeg = parsed.segments.find((s) => s.kind === 'domain')
      const componentSeg = parsed.segments.find((s) => s.kind === 'component')
      if (!moduleSeg || !componentSeg) continue
      touchedComponents.add(componentRefKey(moduleSeg.id, domainSeg?.id, componentSeg.id))
    }
  }

  const out = new Map<string, LevelView>()
  for (const key of touchedComponents) {
    const lookup = ctx.componentByRef.get(key)
    if (!lookup) continue
    if (!componentHasCalls(lookup.component)) continue
    const parentMod = ctx.modules.get(lookup.moduleId)
    const tier = parentMod ? tierOf(parentMod.type) : undefined
    out.set(key, buildComponentMethodsView(key, lookup.component, ctx, tier))
  }
  return out
}

function buildComponentMethodsView(
  componentKey: string,
  component: Component,
  ctx: SpaceContext,
  tier?: Tier,
): LevelView {
  const participants: Participant[] = []
  const seenParticipants = new Set<string>()

  function addParticipant(participant: Participant): void {
    if (seenParticipants.has(participant.id)) return
    participants.push(participant)
    seenParticipants.add(participant.id)
  }

  for (const m of component.methods) {
    const id = methodId(componentKey, m.name)
    const p: Participant = {
      id,
      label: m.name,
      kind: 'method',
      hasDeeper: false,
      ref: id,
    }
    if (tier) p.tier = tier
    addParticipant(p)
  }

  const ownMethodIds = new Set(participants.map((p) => p.id))
  const messages: Message[] = []

  for (const method of component.methods) {
    const fromId = methodId(componentKey, method.name)
    for (const callEntry of method.calls) {
      const callRef = callEntry.target
      const parsed = parseRef(callRef)
      if (!parsed) continue
      const methodSeg = parsed.segments.find((s) => s.kind === 'method')
      const componentSeg = parsed.segments.find((s) => s.kind === 'component')
      const moduleSeg = parsed.segments.find((s) => s.kind === 'module')
      const domainSeg = parsed.segments.find((s) => s.kind === 'domain')

      if (methodSeg && componentSeg && moduleSeg) {
        const targetKey = componentRefKey(moduleSeg.id, domainSeg?.id, componentSeg.id)
        const targetMethodId = methodId(targetKey, methodSeg.id)
        if (!ownMethodIds.has(targetMethodId)) {
          const targetParticipant = methodCallTargetParticipant(
            targetKey,
            methodSeg.id,
            moduleSeg.id,
            ctx,
          )
          if (targetParticipant) addParticipant(targetParticipant)
        }
        messages.push({
          from: fromId,
          to: targetMethodId,
          kind: 'call',
          protocol: 'internal-call',
          description: methodCallLabel(targetKey, methodSeg.id, ctx),
        })
      } else if (componentSeg && moduleSeg) {
        // Call to a component (no specific method) in another place.
        const targetKey = componentRefKey(moduleSeg.id, domainSeg?.id, componentSeg.id)
        const targetParticipant = componentCallTargetParticipant(targetKey, moduleSeg.id, ctx)
        if (targetParticipant) addParticipant(targetParticipant)
        messages.push({
          from: fromId,
          to: targetKey,
          kind: 'call',
          protocol: 'internal-call',
          description: componentCallLabel(targetKey, ctx),
        })
      }
      // Refs that don't point at a component/method are skipped at L3.
    }
  }

  return { participants, messages }
}

function methodId(componentKey: string, methodName: string): string {
  return `${componentKey}/method:${methodName}`
}

function methodCallTargetParticipant(
  componentKey: string,
  methodName: string,
  moduleId: string,
  ctx: SpaceContext,
): Participant | null {
  const lookup = ctx.componentByRef.get(componentKey)
  const parentMod = ctx.modules.get(moduleId)
  if (!lookup || !parentMod) return null
  const id = methodId(componentKey, methodName)
  const p: Participant = {
    id,
    label: `${lookup.component.name}.${methodName}`,
    kind: 'method',
    hasDeeper: false,
    ref: id,
    tier: tierOf(parentMod.type),
  }
  return p
}

function componentCallTargetParticipant(
  componentKey: string,
  moduleId: string,
  ctx: SpaceContext,
): Participant | null {
  const lookup = ctx.componentByRef.get(componentKey)
  const parentMod = ctx.modules.get(moduleId)
  if (!lookup || !parentMod) return null
  return {
    id: componentKey,
    label: lookup.component.name,
    kind: 'component',
    hasDeeper: false,
    ref: componentKey,
    tier: tierOf(parentMod.type),
  }
}

function methodCallLabel(componentKey: string, methodName: string, ctx: SpaceContext): string {
  const lookup = ctx.componentByRef.get(componentKey)
  return lookup ? `${lookup.component.name}.${methodName}` : methodName
}

function componentCallLabel(componentKey: string, ctx: SpaceContext): string {
  return ctx.componentByRef.get(componentKey)?.component.name ?? componentKey
}

// ---------- Stack simulation ----------

interface SimulateOptions {
  /** Skip steps whose computed from-key equals their to-key (used at L1 to hide intra-module hops). */
  skipSameKey: boolean
  /**
   * Skip steps where both from-key and to-key are `gutter:*` sentinels —
   * i.e. the step doesn't touch the current level's focused participant
   * set. Used at L2 so "sibling-module only" steps don't render as
   * full-width gutter→gutter arrows.
   */
  skipBothExternal?: boolean
}

/**
 * Walk steps in order maintaining an activation stack at a given granularity
 * (module id, component id, or whatever the key extractor returns). Emits:
 *
 *   - a synthesised call from actor to the first step's participant (when
 *     `actorRef` is non-null — actor entry lives at L1 only);
 *   - one forward message per step;
 *   - inferred return messages whenever step N+1's source doesn't equal the
 *     current stack top;
 *   - drain returns at end-of-flow back to the actor (when `actorRef` non-null).
 *
 * `protocol: event` steps are treated as async: they emit a call and do not
 * push onto the stack, so no return is synthesised for them.
 */
function simulateStackAtLevel(
  actorRef: string | null,
  steps: readonly UseCaseStep[],
  fromKey: (step: UseCaseStep) => string | null,
  toKey: (step: UseCaseStep) => string | null,
  participantIdFromKey: (key: string) => string,
  options: SimulateOptions,
): Message[] {
  const messages: Message[] = []
  const stack: string[] = actorRef ? [actorRef] : []

  // Synth actor entry at L1.
  const firstStep = steps[0]
  if (actorRef !== null && firstStep) {
    const firstFrom = fromKey(firstStep)
    if (firstFrom) {
      const firstParticipantId = participantIdFromKey(firstFrom)
      messages.push({
        from: actorRef,
        to: firstParticipantId,
        kind: 'call',
        inferred: true,
      })
      stack.push(firstParticipantId)
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (!step) continue
    const fromK = fromKey(step)
    const toK = toKey(step)
    if (!fromK || !toK) continue

    // At L1 we skip intra-module hops; they're detail for L2.
    if (options.skipSameKey && fromK === toK) continue
    // At L2 we skip steps whose both sides are in sibling modules — they
    // don't touch our focused module, so rendering them as a full-width
    // gutter→gutter arrow is noise.
    if (options.skipBothExternal && fromK.startsWith('gutter:') && toK.startsWith('gutter:')) {
      continue
    }

    const fromParticipantId = participantIdFromKey(fromK)
    const toParticipantId = participantIdFromKey(toK)

    // Navigate the stack back to fromParticipantId.
    while (stack.length > (actorRef ? 1 : 0) && stack[stack.length - 1] !== fromParticipantId) {
      const popped = stack.pop()
      const below = stack[stack.length - 1]
      if (!popped || !below) break
      messages.push({ from: popped, to: below, kind: 'return', inferred: true })
    }

    if (stack[stack.length - 1] !== fromParticipantId) {
      // The source isn't in the stack at all — a genuine discontinuity. Push
      // it without a prior return; it'll look slightly off at the canvas,
      // which is intentional (mirrors the USECASE_STEP_CHAIN_DISCONTINUITY
      // validator signal).
      stack.push(fromParticipantId)
    }

    const kind: Message['kind'] = step.protocol === 'event' ? 'async' : 'call'
    const message: Message = {
      stepIndex: i + 1,
      from: fromParticipantId,
      to: toParticipantId,
      kind,
    }
    if (step.protocol !== undefined) message.protocol = step.protocol
    if (step.via !== undefined) message.viaDtoRef = step.via
    if (step.description !== undefined) message.description = step.description

    messages.push(message)

    if (kind !== 'async') stack.push(toParticipantId)
  }

  // Drain stack back to actor with inferred returns.
  const floor = actorRef ? 1 : 0
  while (stack.length > floor) {
    const popped = stack.pop()
    const below = stack[stack.length - 1] ?? actorRef
    if (!popped || !below) break
    messages.push({ from: popped, to: below, kind: 'return', inferred: true })
  }

  return messages
}

// ---------- Ref helpers ----------

/**
 * Extract the `module` segment id from a ref URI, if any. Returns `null`
 * for non-module refs (actor:*, usecase:*) or malformed refs.
 */
function moduleOfRef(ref: string): string | null {
  const parsed = parseRef(ref)
  if (!parsed) return null
  const moduleSeg = parsed.segments.find((s) => s.kind === 'module')
  return moduleSeg?.id ?? null
}
