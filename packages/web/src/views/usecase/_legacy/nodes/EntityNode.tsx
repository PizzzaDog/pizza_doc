import { cn } from '@/lib/utils'
import { useSpaceStore } from '@/store/space'
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react'
import { Database, ExternalLink, FileCode2 } from 'lucide-react'
import type { FlowEntity } from '../build-graph'

export type EntityFlowNode = Node<{ entity: FlowEntity }, 'entity'>

/**
 * Leaf node used for component / table / external refs. Page 11 technically
 * defines three shapes; keeping them as one React Flow node type that
 * branches on `entity.kind` simplifies the type registration.
 */
export function EntityNode({ data, id }: NodeProps<EntityFlowNode>) {
  const entity = data.entity
  const isTable = entity.kind === 'table'
  const selected = useSpaceStore((s) => s.selectedGraphRef === id)
  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-[18px] border transition-all duration-160',
        'bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] shadow-[0_14px_34px_rgba(0,0,0,0.14)]',
        'hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.11),rgba(255,255,255,0.04))] hover:shadow-[0_18px_42px_rgba(0,0,0,0.18)]',
        selected
          ? 'border-accent ring-2 ring-[color:var(--accent-muted)] shadow-[0_18px_46px_rgba(75,110,232,0.18)]'
          : 'border-border-default',
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-1 !w-1 !bg-fg-muted" />
      <Handle type="source" position={Position.Right} className="!h-1 !w-1 !bg-fg-muted" />
      <div className="absolute inset-x-0 top-0 h-14 bg-[radial-gradient(circle_at_top_left,rgba(91,127,255,0.16),transparent_72%)] opacity-90" />
      <div className="relative flex h-full flex-col px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-bg-secondary text-fg-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <KindIcon entity={entity} />
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate font-sans text-[14px] font-medium tracking-[-0.02em] text-fg-primary"
              title={entity.label}
            >
              {entity.label}
            </div>
            <div className="mt-1 inline-flex items-center rounded-full border border-border-subtle bg-bg-secondary px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-fg-secondary">
              {kindLabel(entity)}
            </div>
          </div>
        </div>
        {isTable && entity.table ? (
          <ul className="mt-3 space-y-1.5 rounded-2xl border border-border-subtle bg-bg-secondary px-3 py-2.5 text-[10px] leading-[14px]">
            {entity.table.columns.map((col) => (
              <li key={col.name} className="flex items-center gap-1.5 font-mono text-fg-secondary">
                <ColumnGlyph column={col} />
                <span className="truncate">{col.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3 rounded-2xl border border-border-subtle bg-bg-secondary px-3 py-2 text-[11px] leading-[1.45] text-fg-secondary">
            <span className="block truncate" title={subline(entity)}>
              {subline(entity)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function KindIcon({ entity }: { entity: FlowEntity }) {
  const cls = 'h-3.5 w-3.5 text-fg-tertiary'
  if (entity.kind === 'table') return <Database className={cls} strokeWidth={1.5} aria-hidden />
  if (entity.kind === 'external')
    return <ExternalLink className={cls} strokeWidth={1.5} aria-hidden />
  return <FileCode2 className={cls} strokeWidth={1.5} aria-hidden />
}

function ColumnGlyph({
  column,
}: {
  column: { primaryKey?: boolean; foreignKey?: unknown; nullable?: boolean }
}) {
  if (column.primaryKey) return <span className="text-[9px] text-type-table">#</span>
  if (column.foreignKey) return <span className="text-[9px] text-type-external">↗</span>
  if (column.nullable) return <span className="text-[9px] text-fg-muted">◇</span>
  return <span className="text-[9px] text-fg-muted">·</span>
}

function subline(entity: FlowEntity): string {
  if (entity.kind === 'component' && entity.component) {
    const typeLabel = entity.component.type
    if (entity.component.methods.length > 0) {
      return `${typeLabel} · ${entity.component.methods[0]?.name ?? ''}()`
    }
    return typeLabel
  }
  if (entity.kind === 'external' && entity.component) {
    return `external · ${entity.component.type}`
  }
  return entity.kind
}

function kindLabel(entity: FlowEntity): string {
  switch (entity.kind) {
    case 'component':
      return entity.component?.type ?? 'component'
    case 'table':
      return 'table'
    case 'external':
      return 'external'
    case 'module':
      return 'module'
    default:
      return 'entity'
  }
}
