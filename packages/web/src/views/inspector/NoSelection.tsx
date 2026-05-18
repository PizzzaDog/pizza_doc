import { MousePointerClick } from 'lucide-react'

export function NoSelection() {
  return (
    <div className="flex h-full items-center justify-center px-6 py-8 text-center">
      <div className="flex flex-col items-center gap-2 text-fg-tertiary">
        <MousePointerClick className="h-4 w-4" strokeWidth={1.5} />
        <p className="text-ui">Select an entity to inspect it here.</p>
        <p className="max-w-[220px] text-meta text-fg-muted">
          Click an item in the sidebar, a node or edge on the use-case canvas, or open a detail
          view.
        </p>
      </div>
    </div>
  )
}
