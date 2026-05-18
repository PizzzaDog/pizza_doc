import ELK from 'elkjs/lib/elk.bundled.js'
import type { BuiltFlow, FlowEdge, FlowEntity, FlowModule } from './build-graph'

/**
 * Hierarchical horizontal-layered layout. Module nodes are ELK parents;
 * component / table / external nodes are their children. ELK returns each
 * child's (x, y) relative to its parent — exactly what React Flow wants
 * when a node has a `parentId`.
 */

const elk = new ELK()

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.spacing.nodeNodeBetweenLayers': '180',
  'elk.spacing.nodeNode': '96',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.semiInteractive': 'true',
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.padding': '[top=52,left=40,right=40,bottom=40]',
}

export interface NodeDimensions {
  module: {
    paddingX: number
    paddingY: number
    headerHeight: number
    nodeGap: number
    layerGap: number
  }
  entity: {
    minWidth: number
    maxWidth: number
    minHeight: number
    titleCharWidth: number
    metaCharWidth: number
    headerHeight: number
    bodyPadding: number
  }
  table: {
    rowHeight: number
    chromeWidth: number
  }
}

const DEFAULT_DIMS: NodeDimensions = {
  module: {
    paddingX: 28,
    paddingY: 36,
    headerHeight: 58,
    nodeGap: 32,
    layerGap: 88,
  },
  entity: {
    minWidth: 220,
    maxWidth: 340,
    minHeight: 108,
    titleCharWidth: 8.9,
    metaCharWidth: 7,
    headerHeight: 48,
    bodyPadding: 16,
  },
  table: {
    rowHeight: 18,
    chromeWidth: 36,
  },
}

export interface LaidOutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  parentId: string | null
}

export interface LaidOutEdge {
  id: string
}

export interface LaidOutGraph {
  nodes: LaidOutNode[]
  edges: LaidOutEdge[]
}

export async function layoutFlow(
  flow: BuiltFlow,
  dims: NodeDimensions = DEFAULT_DIMS,
): Promise<LaidOutGraph> {
  const elkNodes = flow.modules.map((m) => buildModule(m, flow.nodes, dims))
  // Unparented entities (refs that resolved to an unknown kind or to a
  // module with no parent module context) become top-level leaves.
  for (const entity of flow.nodes) {
    if (!entity.moduleRef || entity.kind === 'module') {
      const size = estimateEntitySize(entity, dims)
      elkNodes.push({
        id: entity.id,
        width: size.width,
        height: size.height,
      })
    }
  }

  const elkEdges = flow.edges.map((e: FlowEdge) => ({
    id: e.id,
    sources: [e.source],
    targets: [e.target],
  }))

  const result = await elk.layout({
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: elkNodes,
    edges: elkEdges,
  })

  const nodes: LaidOutNode[] = []
  for (const child of result.children ?? []) {
    nodes.push({
      id: String(child.id),
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: child.width ?? dims.entity.minWidth,
      height: child.height ?? dims.entity.minHeight,
      parentId: null,
    })
    for (const grand of child.children ?? []) {
      nodes.push({
        id: String(grand.id),
        x: grand.x ?? 0,
        y: grand.y ?? 0,
        width: grand.width ?? dims.entity.minWidth,
        height: grand.height ?? dims.entity.minHeight,
        parentId: String(child.id),
      })
    }
  }

  const edges: LaidOutEdge[] = (result.edges ?? []).map((e) => ({ id: String(e.id) }))
  return { nodes, edges }
}

type ElkNode = {
  id: string
  width?: number
  height?: number
  layoutOptions?: Record<string, string>
  children?: ElkNode[]
}

function buildModule(module: FlowModule, allEntities: FlowEntity[], dims: NodeDimensions): ElkNode {
  const children: ElkNode[] = []
  for (const childId of module.childIds) {
    const entity = allEntities.find((e) => e.id === childId)
    if (!entity) continue
    const size = estimateEntitySize(entity, dims)
    children.push({
      id: entity.id,
      width: size.width,
      height: size.height,
    })
  }
  return {
    id: module.id,
    layoutOptions: {
      'elk.padding': `[top=${dims.module.headerHeight + dims.module.paddingY},left=${dims.module.paddingX},right=${dims.module.paddingX},bottom=${dims.module.paddingY}]`,
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': String(dims.module.nodeGap),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(dims.module.layerGap),
    },
    children,
  }
}

function estimateEntitySize(
  entity: FlowEntity,
  dims: NodeDimensions,
): { width: number; height: number } {
  const labelWidth = estimateWidth(
    entity.label,
    dims.entity.titleCharWidth,
    dims.entity.minWidth,
    dims.entity.maxWidth,
    dims.entity.bodyPadding * 2 + 34,
  )
  const metaWidth = estimateWidth(
    entityMeta(entity),
    dims.entity.metaCharWidth,
    dims.entity.minWidth,
    dims.entity.maxWidth,
    dims.entity.bodyPadding * 2 + 20,
  )
  const tableWidth =
    entity.kind === 'table' && entity.table
      ? entity.table.columns.reduce(
          (max, col) =>
            Math.max(
              max,
              estimateWidth(
                col.name,
                dims.entity.metaCharWidth,
                dims.entity.minWidth,
                dims.entity.maxWidth,
                dims.entity.bodyPadding * 2 + dims.table.chromeWidth,
              ),
            ),
          dims.entity.minWidth,
        )
      : dims.entity.minWidth

  return {
    width: Math.max(labelWidth, metaWidth, tableWidth),
    height: entityHeight(entity, dims),
  }
}

function entityHeight(entity: FlowEntity, dims: NodeDimensions): number {
  if (entity.kind === 'table' && entity.table) {
    const rows = entity.table.columns.length
    return Math.max(
      dims.entity.minHeight,
      dims.entity.headerHeight + dims.entity.bodyPadding + rows * dims.table.rowHeight + 14,
    )
  }
  return dims.entity.minHeight
}

function estimateWidth(
  text: string,
  charWidth: number,
  minWidth: number,
  maxWidth: number,
  chromeWidth: number,
): number {
  return clamp(Math.round(text.length * charWidth + chromeWidth), minWidth, maxWidth)
}

function entityMeta(entity: FlowEntity): string {
  if (entity.kind === 'component' && entity.component) {
    const firstMethod = entity.component.methods[0]?.name
    return firstMethod ? `${entity.component.type} · ${firstMethod}()` : entity.component.type
  }
  if (entity.kind === 'external' && entity.component) {
    return `external · ${entity.component.type}`
  }
  if (entity.kind === 'table' && entity.table) {
    return `${entity.table.columns.length} columns`
  }
  return entity.kind
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
