import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type EdgeTypes,
  MarkerType,
  MiniMap,
  type Node,
  type NodeTypes,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useSpaceStore } from '@/store/space'
import * as React from 'react'
import type { BuiltFlow, FlowEdge, FlowEntity } from './build-graph'
import { StepEdge } from './edges/StepEdge'
import { layoutFlow } from './elk-layout'
import { type EntityFlowNode, EntityNode } from './nodes/EntityNode'
import { type ModuleFlowNode, ModuleNode } from './nodes/ModuleNode'

// Stable identity — React Flow requires these to be non-rerendering references.
const NODE_TYPES: NodeTypes = {
  module: ModuleNode as unknown as NodeTypes[string],
  entity: EntityNode as unknown as NodeTypes[string],
}
const EDGE_TYPES: EdgeTypes = {
  step: StepEdge as unknown as EdgeTypes[string],
}

type FlowNode = ModuleFlowNode | EntityFlowNode

type FlowEdgeRf = Edge

interface Props {
  flow: BuiltFlow
  /**
   * Incremented by the parent when the keyboard handler wants the canvas to
   * focus a specific step. The effect picks the matching edge and calls
   * `fitView({ nodes: [src, target] })`.
   */
  focusStepIndex: number | null
  /**
   * Incremented by the parent when the user presses F. Separate from the
   * step handler so a repeated press doesn't confuse the effect.
   */
  fitViewTick: number
}

export function FlowGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <InnerFlow {...props} />
    </ReactFlowProvider>
  )
}

function InnerFlow({ flow, focusStepIndex, fitViewTick }: Props) {
  const selectedGraphRef = useSpaceStore((s) => s.selectedGraphRef)
  const setSelectedGraphRef = useSpaceStore((s) => s.setSelectedGraphRef)
  const [nodes, setNodes] = React.useState<FlowNode[]>([])
  const [edges, setEdges] = React.useState<FlowEdgeRf[]>([])
  const [laidOut, setLaidOut] = React.useState(false)
  const { fitView, getNode } = useReactFlow()

  // Recompute layout whenever the flow data changes. ELK is async; during
  // the initial compute we keep nodes hidden via opacity so they don't flash
  // at (0, 0).
  React.useEffect(() => {
    let cancelled = false
    setLaidOut(false)
    layoutFlow(flow)
      .then((laid) => {
        if (cancelled) return
        const byId = new Map(laid.nodes.map((n) => [n.id, n]))
        const moduleNodes: FlowNode[] = flow.modules.map((m) => ({
          id: m.id,
          type: 'module',
          position: { x: byId.get(m.id)?.x ?? 0, y: byId.get(m.id)?.y ?? 0 },
          data: { module: m },
          style: {
            width: byId.get(m.id)?.width,
            height: byId.get(m.id)?.height,
          },
          draggable: false,
          selectable: false,
        }))
        const entityNodes: FlowNode[] = flow.nodes
          .filter((e: FlowEntity) => e.kind !== 'module')
          .map((e) => {
            const laidEntity = byId.get(e.id)
            const base: EntityFlowNode & { parentId?: string } = {
              id: e.id,
              type: 'entity',
              position: { x: laidEntity?.x ?? 0, y: laidEntity?.y ?? 0 },
              data: { entity: e },
              style: {
                width: laidEntity?.width,
                height: laidEntity?.height,
              },
              draggable: false,
            }
            if (laidEntity?.parentId) base.parentId = laidEntity.parentId
            return base
          })
        const modulesFirst: FlowNode[] = [...moduleNodes, ...entityNodes]
        const builtEdges: FlowEdgeRf[] = flow.edges.map((edge: FlowEdge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'step',
          data: { edge },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: edge.isError ? 'rgba(239, 68, 68, 0.7)' : 'var(--fg-tertiary)',
          },
        }))
        setNodes(modulesFirst)
        setEdges(builtEdges)
        // Defer fitView to the next frame so the nodes are measured.
        queueMicrotask(() => {
          if (cancelled) return
          setLaidOut(true)
          fitView({ padding: 0.24, duration: 200, minZoom: 0.32 })
        })
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('elk layout failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [flow, fitView])

  // Step-focus effect: center on the Nth edge's endpoints.
  React.useEffect(() => {
    if (focusStepIndex === null || !laidOut) return
    const edge = edges.find((e) => {
      const d = e.data as { edge?: FlowEdge } | undefined
      return d?.edge?.stepIndex === focusStepIndex
    })
    if (!edge) return
    const src = getNode(edge.source)
    const dst = getNode(edge.target)
    if (!src || !dst) return
    setSelectedGraphRef(edge.id)
    fitView({ nodes: [src, dst], padding: 0.4, duration: 200, maxZoom: 1.4 })
  }, [focusStepIndex, edges, fitView, getNode, laidOut, setSelectedGraphRef])

  // biome-ignore lint/correctness/useExhaustiveDependencies: fitViewTick is a change trigger for the F key; not read in the body but must be in deps.
  React.useEffect(() => {
    if (!laidOut) return
    fitView({ padding: 0.24, duration: 200, minZoom: 0.32 })
  }, [fitViewTick, laidOut, fitView])

  const markedEdges = React.useMemo(
    () => edges.map((e) => ({ ...e, selected: e.id === selectedGraphRef })),
    [edges, selectedGraphRef],
  )
  const markedNodes = React.useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedGraphRef })),
    [nodes, selectedGraphRef],
  )

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(91,127,255,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] shadow-[0_20px_48px_rgba(0,0,0,0.16)] transition-opacity duration-160"
      style={{ opacity: laidOut ? 1 : 0 }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-[linear-gradient(180deg,rgba(8,9,10,0.06),transparent)]" />
      <ReactFlow
        nodes={markedNodes}
        edges={markedEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        className="usecase-flow"
        // Scroll = pan by default; Cmd+scroll = zoom, per page 11.
        panOnScroll
        zoomOnScroll
        zoomActivationKeyCode="Meta"
        zoomOnDoubleClick={false}
        minZoom={0.18}
        maxZoom={2}
        onlyRenderVisibleElements
        onNodeClick={(_event, node) => setSelectedGraphRef(node.id)}
        onEdgeClick={(_event, edge) => setSelectedGraphRef(edge.id)}
        onPaneClick={() => setSelectedGraphRef(null)}
        fitView
        fitViewOptions={{ padding: 0.24, minZoom: 0.32 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1}
          color="var(--border-default)"
        />
        <Controls
          position="bottom-right"
          showInteractive={false}
          className="!rounded-2xl !border !border-border !bg-bg-elevated !p-1 !shadow-popover"
        />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          nodeColor={(node) => {
            const id = String(node.id)
            if (id.startsWith('module:') && !id.includes('/')) return 'var(--bg-tertiary)'
            return 'var(--fg-muted)'
          }}
          maskColor="rgba(8, 9, 10, 0.75)"
          className="hidden !rounded-2xl !border !border-border !bg-bg-elevated !shadow-popover md:block"
        />
      </ReactFlow>
    </div>
  )
}
