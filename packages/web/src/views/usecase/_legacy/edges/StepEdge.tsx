import { cn } from '@/lib/utils'
import { useSpaceStore } from '@/store/space'
import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from '@xyflow/react'
import type { FlowEdge } from '../build-graph'

export type StepFlowEdge = Edge<{ edge: FlowEdge }, 'step'>

/**
 * Bezier edge with three label overlays: a step-number badge at the source
 * end, a protocol + DTO pill at the centre, and an error-flow dashed
 * treatment when the underlying step came from an error flow.
 */
export function StepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<StepFlowEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const edge = data?.edge
  const isError = edge?.isError === true
  const selected = useSpaceStore((s) => s.selectedGraphRef === id)
  const hasLabel = Boolean(edge?.protocol || edge?.viaLabel)
  const labelOffsetY = hasLabel ? 42 : 28
  const strokeClass = selected
    ? 'stroke-accent'
    : isError
      ? 'stroke-error/70'
      : 'stroke-fg-tertiary'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        {...(markerEnd !== undefined ? { markerEnd } : {})}
        className={cn(strokeClass, 'transition-colors duration-120')}
        style={{
          strokeWidth: selected ? 2 : 1.5,
          ...(isError ? { strokeDasharray: '4 3' } : {}),
        }}
      />
      <EdgeLabelRenderer>
        {edge ? (
          <>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${sourceX + 14}px, ${sourceY - labelOffsetY + 8}px)`,
                pointerEvents: 'none',
              }}
              className="nodrag nopan flex h-5 w-5 items-center justify-center rounded-full border border-border bg-bg-elevated font-mono text-[10px] text-fg-secondary shadow-popover"
              aria-label={`step ${edge.stepIndex}`}
            >
              {edge.stepIndex}
            </div>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - labelOffsetY}px)`,
                pointerEvents: 'none',
              }}
              className="nodrag nopan flex items-center gap-1 rounded-full border border-border bg-bg-elevated px-2 py-1 font-mono text-[10px] text-fg-secondary shadow-popover"
            >
              {edge.protocol ? (
                <span className={cn('uppercase tracking-wide', protocolColor(edge.protocol))}>
                  {protocolLabel(edge.protocol)}
                </span>
              ) : null}
              {edge.protocol && edge.viaLabel ? <span className="text-fg-muted">·</span> : null}
              {edge.viaLabel ? (
                <span className="max-w-[160px] truncate text-fg-primary" title={edge.viaLabel}>
                  {edge.viaLabel}
                </span>
              ) : null}
            </div>
          </>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}

function protocolColor(protocol: NonNullable<FlowEdge['protocol']>): string {
  switch (protocol) {
    case 'http':
    case 'http-response':
    case 'sse':
    case 'websocket':
    case 'ws':
      return 'text-type-controller'
    case 'sql':
      return 'text-type-table'
    case 'external-api':
      return 'text-type-external'
    case 'event':
      return 'text-type-service'
    case 'internal-call':
      return 'text-fg-tertiary'
  }
}

function protocolLabel(protocol: NonNullable<FlowEdge['protocol']>): string {
  switch (protocol) {
    case 'internal-call':
      return 'call'
    case 'external-api':
      return 'ext-api'
    case 'event':
      return 'event'
    case 'http':
      return 'http'
    case 'http-response':
      return 'http-response'
    case 'sse':
      return 'sse'
    case 'websocket':
    case 'ws':
      return 'ws'
    case 'sql':
      return 'sql'
  }
}
