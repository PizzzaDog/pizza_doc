import { cn } from '@/lib/utils'
import { useSpaceStore } from '@/store/space'
import type { Flow, LevelView, Model, SequenceModel, Space, UseCase } from '@pizza-doc/core'
import { buildSequenceModel, parseRef } from '@pizza-doc/core'
import { ChevronRight } from 'lucide-react'
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { DtoHoverCard } from './DtoHoverCard'
import { SequenceView } from './SequenceView'
import { layoutSequence } from './layout'

/**
 * Stateful wrapper around {@link SequenceView}. Owns:
 *
 *   - **Zoom focus** — four levels (L0 Tiers → L1 Modules → L2 Components
 *     → L3 Methods) via a small state machine. Switch via the top pill
 *     strip, the breadcrumb, double-click, or ⌘+↓/⌘+↑. Use-case change
 *     resets focus to Tiers.
 *   - **Error-flow tab selection** — the use case's `errorFlows` show up
 *     as peer tabs alongside "Main", rendered under the pill strip.
 *   - **Keyboard map** — ↑/↓ navigate messages, Enter selects, 1–9 jump
 *     to step N, ⌘↓ drill, ⌘↑ surface, Esc surface-or-clear-selection.
 *   - **Inspector integration** — clicking a message sets
 *     `store.selectedGraphRef` to the message's DTO (if any) or target
 *     entity, so the right panel opens the informational payload.
 *
 * Layout is recomputed via `layoutSequence` whenever the active level
 * view changes or the container width changes (ResizeObserver).
 */
export function SequenceCanvas({ useCase, space }: { useCase: UseCase; space: Space }) {
  const model = useMemo<SequenceModel>(() => buildSequenceModel(useCase, space), [useCase, space])

  const [focus, setFocus] = useState<SequenceFocus>({
    level: 0,
    errorFlowId: null,
    moduleId: null,
    componentRef: null,
  })
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<number | null>(null)
  const [hoverState, setHoverState] = useState<{
    model: Model
    anchor: { x: number; y: number }
  } | null>(null)

  // DTO lookup map: ref URI → Model. Built once per space so hover doesn't
  // re-walk the tree on every mouse move.
  const modelByRef = useMemo(() => buildModelIndex(space), [space])

  // Reset on use case change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focus / message reset is intentional only on use-case change
  useEffect(() => {
    setFocus({ level: 0, errorFlowId: null, moduleId: null, componentRef: null })
    setSelectedMessageIndex(null)
  }, [useCase.id])

  const setSelectedGraphRef = useSpaceStore((s) => s.setSelectedGraphRef)

  const containerRef = useRef<HTMLDivElement>(null)
  const panZoomRef = useRef<HTMLDivElement>(null)

  // Pan / zoom state — controlled here so the zoom badge and keyboard
  // zoom shortcuts can read/write it. Initial offset = a small inset so
  // the top-left of the diagram isn't flush against the chrome border.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 24, y: 16 })

  const flow = pickFlow(model, focus.errorFlowId)
  const level = pickLevel(flow, focus)

  // Strip inferred messages (auto-generated call-stack returns) — they add no
  // information to the diagram and create visual noise. Explicit steps and
  // their protocols / DTOs are the only arrows worth showing.
  const visibleLevel = useMemo(
    () => ({ ...level, messages: level.messages.filter((m) => !m.inferred) }),
    [level],
  )

  // Content-driven geometry — pan/zoom handles overflow, so the SVG sizes
  // to its own content only.
  const geometry = useMemo(() => layoutSequence(visibleLevel), [visibleLevel])

  // Reset pan/zoom on every level change so each zoom level starts at
  // origin (design precedent — avoids a drilled-in L3 inheriting an L1
  // pan that would offset it off-screen).
  // biome-ignore lint/correctness/useExhaustiveDependencies: level identity change is the trigger we want
  useEffect(() => {
    setZoom(1)
    setPan({ x: 24, y: 16 })
  }, [level])

  // ---------- Handlers ----------

  function drillIntoParticipant(participantId: string): void {
    if (focus.level === 0 && participantId.startsWith('tier:')) {
      // Tier → Modules. L1 shows every module touched by the flow (we
      // don't filter by tier in v0.2 — the tier pill selection only
      // changes which level view renders).
      setFocus({ ...focus, level: 1 })
      setSelectedMessageIndex(null)
      return
    }
    if (focus.level === 1 && participantId.startsWith('module:')) {
      const moduleId = participantId.slice('module:'.length)
      if (!flow.components.has(moduleId)) return
      setFocus({ ...focus, level: 2, moduleId, componentRef: null })
      setSelectedMessageIndex(null)
      return
    }
    if (focus.level === 2 && flow.methods.has(participantId)) {
      setFocus({ ...focus, level: 3, componentRef: participantId })
      setSelectedMessageIndex(null)
    }
  }

  function surface(): void {
    if (focus.level === 3) {
      setFocus({ ...focus, level: 2, componentRef: null })
      setSelectedMessageIndex(null)
      return
    }
    if (focus.level === 2) {
      setFocus({ ...focus, level: 1, moduleId: null, componentRef: null })
      setSelectedMessageIndex(null)
      return
    }
    if (focus.level === 1) {
      setFocus({ ...focus, level: 0, moduleId: null, componentRef: null })
      setSelectedMessageIndex(null)
    }
  }

  /**
   * Switch to an arbitrary level via the top pill strip. Picks a sensible
   * focused module / component when jumping deeper without context.
   */
  function goToLevel(nextLevel: 0 | 1 | 2 | 3): void {
    if (nextLevel === focus.level) return
    if (nextLevel === 0) {
      setFocus({ ...focus, level: 0, moduleId: null, componentRef: null })
      setSelectedMessageIndex(null)
      return
    }
    if (nextLevel === 1) {
      setFocus({ ...focus, level: 1, moduleId: null, componentRef: null })
      setSelectedMessageIndex(null)
      return
    }
    if (nextLevel === 2) {
      let moduleId = focus.moduleId && flow.components.has(focus.moduleId) ? focus.moduleId : null
      if (!moduleId) {
        const firstDeep = flow.modules.participants.find(
          (p) => p.id.startsWith('module:') && p.hasDeeper,
        )
        moduleId = firstDeep ? firstDeep.id.slice('module:'.length) : null
      }
      if (!moduleId) return // nothing to drill into — keep current level
      setFocus({ ...focus, level: 2, moduleId, componentRef: null })
      setSelectedMessageIndex(null)
      return
    }
    // L3 — pick first component with a method graph.
    let componentRef =
      focus.componentRef && flow.methods.has(focus.componentRef) ? focus.componentRef : null
    if (!componentRef) {
      // Prefer a component inside the currently-focused module, if any.
      if (focus.moduleId) {
        const view = flow.components.get(focus.moduleId)
        if (view) {
          const firstDeep = view.participants.find((p) => p.hasDeeper && p.ref)
          componentRef = firstDeep?.ref ?? null
        }
      }
      if (!componentRef) {
        const firstKey = flow.methods.keys().next().value
        componentRef = typeof firstKey === 'string' ? firstKey : null
      }
    }
    if (!componentRef) return
    setFocus({ ...focus, level: 3, componentRef })
    setSelectedMessageIndex(null)
  }

  const visibleMessages = visibleLevel.messages

  const handleMessageHover = useCallback(
    (messageIndex: number | null, event: React.MouseEvent<SVGElement> | null) => {
      if (messageIndex === null || !event) {
        setHoverState(null)
        return
      }
      const msg = visibleMessages[messageIndex]
      const dtoRef = msg?.viaDtoRef
      if (!dtoRef) {
        setHoverState(null)
        return
      }
      const resolved = lookupModel(dtoRef, modelByRef)
      if (!resolved) {
        setHoverState(null)
        return
      }
      setHoverState({ model: resolved, anchor: { x: event.clientX, y: event.clientY } })
    },
    [modelByRef, visibleMessages],
  )

  // Drop the hover when level / flow changes so stale popovers don't survive.
  // biome-ignore lint/correctness/useExhaustiveDependencies: effect intentionally tracks the level reference (which changes on focus/errorFlow swap)
  useEffect(() => {
    setHoverState(null)
  }, [level])

  function selectMessage(index: number): void {
    setSelectedMessageIndex(index)
    const msg = visibleLevel.messages[index]
    if (!msg) return
    // Priority: DTO carried by the message (shows its fields + shape) over
    // the plain target component. Clicking an arrow labelled `HTTP ·
    // CreatePizzaRequest` should open the DTO, not the controller — the DTO
    // is the informational payload; the target is a lookup the breadcrumb
    // already shows.
    if (msg.viaDtoRef && isInspectableRef(msg.viaDtoRef)) {
      setSelectedGraphRef(msg.viaDtoRef)
      return
    }
    const targetRef = msg.to.startsWith('gutter:') ? msg.to.slice('gutter:'.length) : msg.to
    if (isInspectableRef(targetRef)) setSelectedGraphRef(targetRef)
  }

  function clearCanvasSelection(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement | null
    if (target?.closest('[data-interactive]')) return
    setSelectedMessageIndex(null)
    setSelectedGraphRef(null)
  }

  function switchErrorFlow(errorFlowId: string | null): void {
    setFocus({ level: 0, errorFlowId, moduleId: null, componentRef: null })
    setSelectedMessageIndex(null)
  }

  // ---------- Keyboard ----------

  // Mounted on the canvas root; global `Esc` / `⌘↓` etc. fire only when the
  // canvas itself has focus so they don't fight the top-level shortcut map.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.metaKey || event.ctrlKey) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        tryDrillFromKeyboard()
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        surface()
        return
      }
    }

    if (event.altKey) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveSelection(+1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveSelection(-1)
      return
    }
    if (event.key === 'Enter' && selectedMessageIndex !== null) {
      event.preventDefault()
      selectMessage(selectedMessageIndex)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (selectedMessageIndex !== null) setSelectedMessageIndex(null)
      else surface()
      return
    }
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault()
      const n = Number(event.key)
      const row = geometry.rows.find((r) => {
        const m = level.messages[r.messageIndex]
        return m?.stepIndex === n
      })
      if (row) {
        setSelectedMessageIndex(row.messageIndex)
        panRowIntoView(panZoomRef.current, row.y, zoom, setPan)
      }
    }
  }

  function moveSelection(delta: number): void {
    const rows = geometry.rows
    if (rows.length === 0) return
    const current = selectedMessageIndex
    let idx = 0
    if (current !== null) {
      const pos = rows.findIndex((r) => r.messageIndex === current)
      idx = Math.max(0, Math.min(rows.length - 1, pos + delta))
    }
    const next = rows[idx]
    if (next) {
      setSelectedMessageIndex(next.messageIndex)
      panRowIntoView(panZoomRef.current, next.y, zoom, setPan)
    }
  }

  function tryDrillFromKeyboard(): void {
    // Prefer the participant under the currently-selected message's target.
    if (selectedMessageIndex !== null) {
      const msg = visibleLevel.messages[selectedMessageIndex]
      if (msg && !msg.to.startsWith('gutter:')) {
        drillIntoParticipant(msg.to)
        return
      }
    }
    // Fallback: the first participant with hasDeeper.
    const candidate = level.participants.find((p) => p.hasDeeper)
    if (candidate) drillIntoParticipant(candidate.id)
  }

  // ---------- Render ----------

  return (
    <div
      ref={containerRef}
      role="application"
      className="flex h-full min-h-0 flex-1 flex-col bg-bg-primary outline-none"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: role="application" canvas needs keyboard focus — that's the point
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Sequence diagram"
      aria-keyshortcuts="ArrowUp ArrowDown Enter Escape Meta+ArrowDown Meta+ArrowUp 1 2 3 4 5 6 7 8 9"
    >
      <SequenceHeader
        focus={focus}
        model={model}
        flow={flow}
        onSurface={surface}
        onSwitchErrorFlow={switchErrorFlow}
        onGoToLevel={goToLevel}
        flowAvailability={{
          hasComponents: flow.components.size > 0,
          hasMethods: flow.methods.size > 0,
        }}
      />
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users clear selection via Esc on the application root. */}
      <div
        ref={panZoomRef}
        className="pd-workspace-grid relative min-h-0 flex-1 overflow-hidden"
        onClick={clearCanvasSelection}
      >
        {level.participants.length === 0 ? (
          <EmptyState focus={focus} />
        ) : (
          <>
            <PanZoomCanvas zoom={zoom} pan={pan} onZoomChange={setZoom} onPanChange={setPan}>
              <SequenceView
                level={visibleLevel}
                geometry={geometry}
                selectedMessageIndex={selectedMessageIndex}
                onMessageClick={selectMessage}
                onMessageHover={handleMessageHover}
                onParticipantDrillIn={drillIntoParticipant}
              />
            </PanZoomCanvas>
            {visibleMessages.length === 0 ? <NoMessagesNotice focus={focus} /> : null}
            <ZoomBadge zoom={zoom} level={focus.level} />
          </>
        )}
      </div>
      <DtoHoverCard anchor={hoverState?.anchor ?? null} model={hoverState?.model ?? null} />
    </div>
  )
}

// ---------- State model helpers ----------

interface SequenceFocus {
  /** 0 = Tiers · 1 = Modules · 2 = Components · 3 = Methods (matches the design's pill vocabulary). */
  level: 0 | 1 | 2 | 3
  errorFlowId: string | null
  moduleId: string | null
  componentRef: string | null
}

function pickFlow(model: SequenceModel, errorFlowId: string | null): Flow {
  if (!errorFlowId) return model.main
  const ef = model.errorFlows.find((e) => e.id === errorFlowId)
  return ef?.flow ?? model.main
}

function pickLevel(flow: Flow, focus: SequenceFocus): LevelView {
  if (focus.level === 0) return flow.tiers
  if (focus.level === 2 && focus.moduleId) {
    const view = flow.components.get(focus.moduleId)
    if (view) return view
  }
  if (focus.level === 3 && focus.componentRef) {
    const view = flow.methods.get(focus.componentRef)
    if (view) return view
  }
  return flow.modules
}

function isInspectableRef(ref: string): boolean {
  return ref.startsWith('module:') || ref.startsWith('actor:') || ref.startsWith('usecase:')
}

/**
 * Flatten every Model in the space into a `refURI → Model` map. Supports
 * both module-level and domain-level models. Built once per space so the
 * hover handler is O(1) per mouse move.
 */
function buildModelIndex(space: Space): Map<string, Model> {
  const out = new Map<string, Model>()
  for (const mod of space.modules) {
    for (const m of mod.models) {
      out.set(`module:${mod.id}/model:${m.id}`, m)
    }
    for (const d of mod.domains) {
      for (const m of d.models) {
        out.set(`module:${mod.id}/domain:${d.id}/model:${m.id}`, m)
      }
    }
  }
  return out
}

/**
 * Some DTO refs in steps include more segments than our flat map covers
 * (e.g. `module:api/domain:orders/model:Order`). `parseRef` + rebuilding
 * from segments is robust to any segment ordering.
 */
function lookupModel(ref: string, index: Map<string, Model>): Model | null {
  if (index.has(ref)) return index.get(ref) ?? null
  const parsed = parseRef(ref)
  if (!parsed) return null
  const modelSeg = parsed.segments.find((s) => s.kind === 'model')
  const moduleSeg = parsed.segments.find((s) => s.kind === 'module')
  const domainSeg = parsed.segments.find((s) => s.kind === 'domain')
  if (!modelSeg || !moduleSeg) return null
  const key = domainSeg
    ? `module:${moduleSeg.id}/domain:${domainSeg.id}/model:${modelSeg.id}`
    : `module:${moduleSeg.id}/model:${modelSeg.id}`
  return index.get(key) ?? null
}

// ---------- Header ----------

const LEVEL_PILLS = [
  { n: 0 as const, label: 'Tiers' },
  { n: 1 as const, label: 'Modules' },
  { n: 2 as const, label: 'Components' },
  { n: 3 as const, label: 'Methods' },
]

interface FlowAvailability {
  hasComponents: boolean
  hasMethods: boolean
}

function SequenceHeader({
  focus,
  model,
  flow,
  onSurface,
  onSwitchErrorFlow,
  onGoToLevel,
  flowAvailability,
}: {
  focus: SequenceFocus
  model: SequenceModel
  flow: Flow
  onSurface: () => void
  onSwitchErrorFlow: (id: string | null) => void
  onGoToLevel: (level: 0 | 1 | 2 | 3) => void
  flowAvailability: FlowAvailability
}) {
  const drillCrumbs = buildDrillBreadcrumbs(focus, flow)
  const hasErrorFlows = model.errorFlows.length > 0
  const hasDrillCrumbs = drillCrumbs.length > 0

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-bg-secondary/80 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 items-stretch">
        {/* Level pill strip — always visible. */}
        <div className="inline-flex items-stretch" role="tablist" aria-label="Zoom level">
          {LEVEL_PILLS.map((p) => {
            const active = focus.level === p.n
            const disabled =
              (p.n === 2 && !flowAvailability.hasComponents) ||
              (p.n === 3 && !flowAvailability.hasMethods)
            return (
              <button
                key={p.n}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => onGoToLevel(p.n)}
                className={cn(
                  'relative inline-flex h-11 items-center gap-1.5 rounded-t-lg border-x border-t border-transparent px-3 font-mono text-[11px] transition-all duration-160',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  active
                    ? 'border-border-subtle bg-bg-primary text-fg-primary'
                    : 'text-fg-tertiary hover:bg-bg-tertiary hover:text-fg-secondary',
                )}
              >
                <span
                  className={cn('font-mono text-[10px]', active ? 'text-accent' : 'text-fg-muted')}
                >
                  L{p.n + 1}
                </span>
                {p.label}
              </button>
            )
          })}
        </div>

        {hasDrillCrumbs ? (
          <div className="flex items-center gap-1 font-mono text-[11px] text-fg-tertiary">
            <ChevronRight className="h-3 w-3 text-fg-muted" strokeWidth={1.5} />
            {drillCrumbs.map((crumb, i) => (
              <div key={`${crumb.level}-${crumb.label}`} className="flex items-center gap-1">
                {i > 0 ? (
                  <ChevronRight className="h-3 w-3 text-fg-muted" strokeWidth={1.5} />
                ) : null}
                {crumb.level < focus.level ? (
                  <button
                    type="button"
                    onClick={onSurface}
                    className="rounded-sm px-1 py-0.5 transition-colors duration-120 hover:bg-bg-tertiary hover:text-fg-primary"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="px-1 py-0.5 text-fg-primary">{crumb.label}</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {hasErrorFlows ? (
        <div className="flex min-w-0 items-stretch overflow-x-auto">
          <ErrorTab
            label="Main"
            active={focus.errorFlowId === null}
            onClick={() => onSwitchErrorFlow(null)}
          />
          {model.errorFlows.map((ef) => (
            <ErrorTab
              key={ef.id}
              label={`Err: ${ef.id}`}
              active={focus.errorFlowId === ef.id}
              onClick={() => onSwitchErrorFlow(ef.id)}
            />
          ))}
        </div>
      ) : null}
    </header>
  )
}

function ErrorTab({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative inline-flex h-11 shrink-0 items-center rounded-t-lg border-x border-t border-transparent px-3 font-mono text-[11px] transition-all duration-160',
        active
          ? 'border-border-subtle bg-bg-primary text-fg-primary'
          : 'text-fg-tertiary hover:bg-bg-tertiary hover:text-fg-secondary',
      )}
    >
      {label}
    </button>
  )
}

interface Crumb {
  level: 1 | 2 | 3
  label: string
}

/**
 * Crumbs shown after drilling — intentionally omits the use-case crumb
 * because the outer EntityHeader already owns that label.
 */
function buildDrillBreadcrumbs(focus: SequenceFocus, flow: Flow): Crumb[] {
  const crumbs: Crumb[] = []
  if (focus.level >= 2 && focus.moduleId) {
    const moduleLabel = resolveModuleLabel(flow, focus.moduleId)
    crumbs.push({ level: 2, label: moduleLabel })
  }
  if (focus.level === 3 && focus.componentRef) {
    const tail = focus.componentRef.split('/').pop() ?? focus.componentRef
    crumbs.push({ level: 3, label: tail.replace(/^component:/, '') })
  }
  return crumbs
}

function resolveModuleLabel(flow: Flow, moduleId: string): string {
  const participantId = `module:${moduleId}`
  const p = flow.modules.participants.find((x) => x.id === participantId)
  return p?.label ?? moduleId
}

// ---------- Empty state ----------

function EmptyState({ focus }: { focus: SequenceFocus }) {
  const msg =
    focus.level === 3
      ? 'This component has no method-level calls to render.'
      : focus.level === 2
        ? 'This module has no components involved in the use case.'
        : focus.level === 1
          ? 'This use case has no steps.'
          : 'This use case touches no modules — nothing to aggregate at the tier level.'
  return (
    <div className="flex h-full items-center justify-center px-6 py-12 text-center">
      <div className="rounded-xl border border-border-subtle bg-bg-secondary/70 px-5 py-4 shadow-popover backdrop-blur-xl">
        <p className="text-ui text-fg-secondary">{msg}</p>
      </div>
    </div>
  )
}

// ---------- Pan / zoom + scroll helpers ----------

/**
 * Interactive canvas wrapper around {@link SequenceView}. Wraps the SVG in
 * a scrollable, pan- and zoom-capable surface — drag to pan, ⌘/ctrl +
 * scroll to zoom around cursor, plain scroll to pan. Mirrors the Claude
 * Design prototype's `Canvas` behaviour.
 *
 * Children are rendered inside a translated + scaled layer. The outer
 * container draws the dotted grid background, which itself scales with
 * zoom so the dot density stays visually stable.
 */
function PanZoomCanvas({
  zoom,
  pan,
  onZoomChange,
  onPanChange,
  children,
}: {
  zoom: number
  pan: { x: number; y: number }
  onZoomChange: (next: number) => void
  onPanChange: (next: { x: number; y: number }) => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })

  // Wheel: ⌘/ctrl + scroll = zoom around cursor; plain scroll = pan.
  // `passive: false` is required so we can `preventDefault()` and stop the
  // page from scrolling behind us.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    function onWheel(event: WheelEvent): void {
      const rect = el?.getBoundingClientRect()
      if (!rect) return
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const cx = event.clientX - rect.left
        const cy = event.clientY - rect.top
        const factor = event.deltaY < 0 ? 1.08 : 0.93
        const next = Math.min(3, Math.max(0.3, zoom * factor))
        if (next === zoom) return
        const k = next / zoom
        onPanChange({ x: cx - (cx - pan.x) * k, y: cy - (cy - pan.y) * k })
        onZoomChange(next)
      } else {
        event.preventDefault()
        onPanChange({ x: pan.x - event.deltaX, y: pan.y - event.deltaY })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, pan, onZoomChange, onPanChange])

  function onMouseDown(event: React.MouseEvent<HTMLDivElement>): void {
    // Left / middle button only. Interactive children opt out via
    // `data-interactive` — click-through to their handlers, no drag.
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target as HTMLElement | SVGElement | null
    if (target && 'closest' in target && target.closest('[data-interactive]')) return
    setDragging(true)
    dragStart.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }
  }

  function onMouseMove(event: React.MouseEvent<HTMLDivElement>): void {
    if (!dragging) return
    const dx = event.clientX - dragStart.current.x
    const dy = event.clientY - dragStart.current.y
    onPanChange({ x: dragStart.current.px + dx, y: dragStart.current.py + dy })
  }

  function stopDrag(): void {
    if (dragging) setDragging(false)
  }

  const cursor = dragging ? 'grabbing' : 'grab'

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      style={{ cursor }}
    >
      <div
        className="origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ---------- Floating chrome ----------

/**
 * Floating badge bottom-left of the canvas — shows the current zoom level
 * and percentage without teaching chrome inside the diagram.
 */
function ZoomBadge({ zoom, level }: { zoom: number; level: 0 | 1 | 2 | 3 }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-secondary/90 px-2.5 py-1 text-meta shadow-popover backdrop-blur-md">
      <span className="font-mono font-[600] text-accent">L{level + 1}</span>
      <span className="h-3.5 w-px bg-border" aria-hidden />
      <span className="font-mono text-fg-tertiary">{Math.round(zoom * 100)}%</span>
    </div>
  )
}

function NoMessagesNotice({ focus }: { focus: SequenceFocus }) {
  const suggestedLevel = focus.level < 2 ? 3 : Math.min(4, focus.level + 2)
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-subtle bg-bg-secondary/90 px-4 py-3 text-center shadow-popover backdrop-blur-xl">
      <p className="text-ui text-fg-secondary">No messages at this level</p>
      <p className="mt-1 text-meta text-fg-tertiary">
        This flow is internal to another level. Try L{suggestedLevel}.
      </p>
    </div>
  )
}

/**
 * Re-centre the viewport on a given canvas-y by adjusting pan.y (we own
 * pan, not DOM scroll position). x stays where it is so horizontal
 * drag-state survives step jumps.
 */
function panRowIntoView(
  container: HTMLDivElement | null,
  y: number,
  zoom: number,
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>,
): void {
  if (!container) return
  const viewportHeight = container.clientHeight
  if (viewportHeight <= 0) return
  const nextY = viewportHeight / 2 - y * zoom
  setPan((p) => ({ x: p.x, y: nextY }))
}
