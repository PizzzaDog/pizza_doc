import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ensureRefIndex } from '@/lib/entity-lookup'
import { useSpaceStore } from '@/store/space'
import type { UseCase } from '@pizza-doc/core'
import * as React from 'react'
import { EmptyUseCase } from '../EmptyUseCase'
import { FlowGraph } from './FlowGraph'
import { type FlowKind, availableFlows, buildFlow } from './build-graph'

/**
 * Top-level use-case canvas. Owns flow-tab selection plus the keyboard
 * shortcuts that drive the embedded FlowGraph (1–9 jump to step N, F fits
 * the view).
 */
export function UseCaseGraph({ useCase }: { useCase: UseCase }) {
  const space = useSpaceStore((s) => s.current?.space)
  const [activeKey, setActiveKey] = React.useState('happy')
  const [focusStep, setFocusStep] = React.useState<number | null>(null)
  const [fitTick, setFitTick] = React.useState(0)
  const flows = React.useMemo(() => availableFlows(useCase), [useCase])

  const index = React.useMemo(() => (space ? ensureRefIndex(space) : null), [space])

  const activeFlowKind = React.useMemo<FlowKind>(() => {
    if (activeKey === 'happy') return { kind: 'happy' }
    return { kind: 'error', id: activeKey }
  }, [activeKey])

  const built = React.useMemo(() => {
    if (!space || !index) return null
    return buildFlow(space, index, useCase, activeFlowKind)
  }, [space, index, useCase, activeFlowKind])

  // 1–9 → jump to step; F → fit view; Esc → clear selection.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && isEditable(target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key >= '1' && event.key <= '9') {
        const n = Number(event.key)
        event.preventDefault()
        setFocusStep(null)
        queueMicrotask(() => setFocusStep(n))
        return
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        setFitTick((t) => t + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeKey drives the reset; it isn't read inside the body but the change is the trigger.
  React.useEffect(() => {
    setFocusStep(null)
  }, [activeKey])

  if (!built) return null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={activeKey} onValueChange={setActiveKey} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border-subtle px-4 pb-3 pt-4 md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <TabsList className="w-full justify-start rounded-2xl border border-border-subtle bg-bg-secondary p-1 md:w-auto">
              {flows.map((f) => (
                <TabsTrigger key={f.key} value={f.key}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="text-[11px] text-fg-tertiary">
              <span className="font-mono">1-9</span> focus step
              <span className="mx-2 text-fg-muted">·</span>
              <span className="font-mono">F</span> fit canvas
            </div>
          </div>
        </div>
        {flows.map((f) => (
          <TabsContent
            key={f.key}
            value={f.key}
            className="min-h-0 flex-1 px-4 pb-4 pt-3 md:px-6 md:pb-6"
          >
            {f.key === activeKey ? (
              built.stepCount === 0 ? (
                <EmptyUseCase useCaseId={useCase.id} flowLabel={f.label} />
              ) : (
                <FlowGraph flow={built} focusStepIndex={focusStep} fitViewTick={fitTick} />
              )
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function isEditable(el: HTMLElement): boolean {
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}
