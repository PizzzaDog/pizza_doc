import { cn } from '@/lib/utils'
import { useSpaceStore } from '@/store/space'
import type { Node, NodeProps } from '@xyflow/react'
import type { FlowModule } from '../build-graph'

export type ModuleFlowNode = Node<{ module: FlowModule }, 'module'>

/**
 * Group-container node (page 11 "Module Node") — holds entity children via
 * React Flow's `parentId`. Dashed frame, transparent fill, subtle type
 * badge in the header. Not interactive itself.
 */
export function ModuleNode({ data, id }: NodeProps<ModuleFlowNode>) {
  const mod = data.module
  const selected = useSpaceStore((s) => s.selectedGraphRef === id)
  return (
    <div className="relative h-full w-full">
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[30px] border border-dashed border-border-subtle',
          'bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
          selected && 'ring-1 ring-accent/70',
        )}
      >
        <div className="absolute inset-x-0 top-0 h-24 rounded-t-[30px] bg-[radial-gradient(circle_at_top_left,rgba(91,127,255,0.14),transparent_72%)]" />
      </div>
      <div className="relative flex items-center justify-between gap-3 px-6 py-4">
        <span className="truncate font-sans text-[13px] font-medium tracking-[-0.02em] text-fg-secondary">
          {mod.label}
        </span>
        <span className="shrink-0 rounded-full border border-border-subtle bg-bg-secondary px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.18em] text-fg-tertiary">
          [{typeBadge(mod.type)}]
        </span>
      </div>
    </div>
  )
}

function typeBadge(type: FlowModule['type']): string {
  switch (type) {
    case 'frontend':
      return 'fe'
    case 'service':
      return 'sv'
    case 'database':
      return 'db'
    case 'queue':
      return 'mq'
    case 'external':
      return 'ext'
  }
}
