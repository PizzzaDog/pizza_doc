import { cn } from '@/lib/utils'
import { GripVertical } from 'lucide-react'
import * as ResizablePrimitive from 'react-resizable-panels'

export const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
    {...props}
  />
)

export const ResizablePanel = ResizablePrimitive.Panel

export const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      'relative flex w-px items-center justify-center bg-border-subtle transition-colors duration-160',
      'focus-visible:outline-none focus-visible:ring-focus',
      'data-[resize-handle-state=hover]:bg-accent-muted data-[resize-handle-state=drag]:bg-accent',
      'data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full',
      className,
    )}
    {...props}
  >
    {withHandle ? (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border bg-bg-elevated">
        <GripVertical className="h-2.5 w-2.5 text-fg-tertiary" strokeWidth={1.5} />
      </div>
    ) : null}
  </ResizablePrimitive.PanelResizeHandle>
)
