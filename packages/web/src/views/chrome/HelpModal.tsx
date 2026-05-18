import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSpaceStore } from '@/store/space'

interface ShortcutRow {
  keys: string
  label: string
}

interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    rows: [
      { keys: '⌘K', label: 'Open command palette' },
      { keys: '⌘B', label: 'Toggle sidebar' },
      { keys: '⌘I', label: 'Toggle inspector' },
      { keys: '⌘E', label: 'Edit-mode in inspector' },
      { keys: '⌘/', label: 'YAML view in inspector' },
      { keys: '⌘S', label: 'Save (no-op — Pizza Doc auto-saves)' },
      { keys: '⌘Z', label: 'Undo' },
      { keys: '⌘⇧Z', label: 'Redo' },
      { keys: '?', label: 'Open this help modal' },
      { keys: 'Esc', label: 'Close overlay / clear canvas selection' },
    ],
  },
  {
    title: 'Canvas',
    rows: [
      { keys: '1–9', label: 'Jump to step N of the current flow' },
      { keys: 'F', label: 'Fit view' },
      { keys: '⌘scroll', label: 'Zoom (scroll alone pans)' },
      { keys: 'Esc', label: 'Deselect' },
    ],
  },
  {
    title: 'Sidebar',
    rows: [
      { keys: '↑ / ↓', label: 'Move focus' },
      { keys: '← / →', label: 'Collapse / expand (or move to parent)' },
      { keys: 'Enter', label: 'Activate (navigate or toggle)' },
      { keys: 'Space', label: 'Toggle expand (or activate leaf)' },
      { keys: 'Home / End', label: 'First / last item' },
    ],
  },
]

export function HelpModal() {
  const open = useSpaceStore((s) => s.helpOpen)
  const setOpen = useSpaceStore((s) => s.setHelpOpen)
  const version = useSpaceStore((s) => s.version)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Pizza Doc is keyboard-first. Press ? to reopen.</DialogDescription>
        </DialogHeader>
        <div className="font-mono text-[11px] text-fg-tertiary">pizza-doc v{version}</div>
        <div className="flex max-h-[60vh] flex-col gap-5 overflow-auto">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
                {group.title}
              </h3>
              <ul className="flex flex-col gap-1">
                {group.rows.map((row) => (
                  <li
                    key={row.keys}
                    className="flex items-baseline justify-between gap-3 text-ui text-fg-secondary"
                  >
                    <span className="font-mono text-[11px] text-fg-primary">{row.keys}</span>
                    <span className="truncate text-right">{row.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
