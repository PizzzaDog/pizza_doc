import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Copy } from 'lucide-react'
import type * as React from 'react'
import { toast } from 'sonner'

/**
 * Right-click actions for tree entries. Keep this menu limited to operations
 * that work in the current viewer/scalar-editor release.
 */
export function EntryContextMenu({
  children,
  entityRef,
  label,
}: {
  children: React.ReactNode
  entityRef: string | null
  label: string
}) {
  async function copyRef() {
    if (!entityRef) {
      toast('No reference URI to copy for this node.')
      return
    }
    try {
      await navigator.clipboard.writeText(entityRef)
      toast('Reference copied', {
        description: entityRef,
      })
    } catch {
      toast.error('Clipboard write failed.')
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>{label}</ContextMenuLabel>
        <ContextMenuItem onSelect={copyRef}>
          <Copy className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
          Copy Reference URI
          <ContextMenuShortcut>⌘⇧C</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
