import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSpaceStore } from '@/store/space'
import { Download, FileDown, MoreHorizontal, RefreshCcw, ShieldCheck } from 'lucide-react'

/**
 * Top-bar overflow menu — Export for AI / Export as ZIP / Reload / Validate.
 * Keeps the bar itself clean (one affordance instead of four).
 */
export function ExportMenu() {
  const exportToDisk = useSpaceStore((s) => s.exportSpaceToDisk)
  const downloadZip = useSpaceStore((s) => s.downloadSpaceZip)
  const reload = useSpaceStore((s) => s.reloadCurrentSpace)
  const revalidate = useSpaceStore((s) => s.revalidate)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost-subtle" size="icon" aria-label="Export menu">
          <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Export</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void exportToDisk()}>
          <FileDown className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
          Export for AI
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void downloadZip()}>
          <Download className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
          Export as ZIP
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Space</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void revalidate()}>
          <ShieldCheck className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
          Validate space
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void reload()}>
          <RefreshCcw className="h-3.5 w-3.5 text-fg-tertiary" strokeWidth={1.5} />
          Reload from disk
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
