import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSpaceStore } from '@/store/space'
import { Link } from '@tanstack/react-router'
import { GitBranch, HelpCircle } from 'lucide-react'
import { ExportMenu } from './ExportMenu'
import { ThemeToggle } from './ThemeToggle'
import { ValidationBadge } from './ValidationBadge'

/**
 * Thin top bar shared by every space route. Breadcrumb on the left, chrome
 * actions on the right. Page 06 lists the shape: space name · breadcrumbs ·
 * validation badge · theme toggle · export menu. Help button sits here too
 * so `?` has a discoverable counterpart.
 */
export function TopBar({ spaceId }: { spaceId: string }) {
  const current = useSpaceStore((s) => s.current)
  const changes = useSpaceStore((s) => s.changes)
  const activeChangeId = useSpaceStore((s) => s.activeChangeId)
  const setActiveChangeId = useSpaceStore((s) => s.setActiveChangeId)
  const version = useSpaceStore((s) => s.version)
  const setHelpOpen = useSpaceStore((s) => s.setHelpOpen)
  const clearCurrent = useSpaceStore((s) => s.clearCurrent)

  return (
    <header
      className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-bg-secondary/95 px-3 backdrop-blur-xl"
      aria-label="Top bar"
    >
      <Link
        to="/"
        onClick={() => clearCurrent()}
        className="inline-flex items-center rounded-md border border-transparent px-2 py-1 font-mono text-[11px] text-fg-tertiary transition-all duration-160 hover:border-border hover:bg-bg-tertiary hover:text-fg-primary focus-visible:outline-none focus-visible:ring-focus"
        title="Back to space picker"
      >
        Pizza Doc
      </Link>
      <span className="text-fg-muted/80">›</span>
      <span
        className="truncate rounded-md border border-border-subtle bg-bg-tertiary/50 px-2 py-1 font-mono text-[11px] text-fg-primary"
        title={spaceId}
      >
        {current?.space.meta.name ?? spaceId}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <ChangeSetSelect
          changes={changes}
          value={activeChangeId}
          onChange={(id) => void setActiveChangeId(id)}
        />
        <ValidationBadge spaceId={spaceId} />
        <span className="hidden rounded-md px-2 py-1 font-mono text-[11px] text-fg-tertiary sm:inline-flex">
          v{version}
        </span>
        <ThemeToggle />
        <ExportMenu />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost-subtle"
              size="icon"
              onClick={() => setHelpOpen(true)}
              aria-label="Keyboard shortcuts help"
            >
              <HelpCircle className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Shortcuts (?)</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

function ChangeSetSelect({
  changes,
  value,
  onChange,
}: {
  changes: Array<{ id: string; title: string; status: string }>
  value: string | null
  onChange: (id: string | null) => void
}) {
  if (changes.length === 0) return null
  return (
    <label className="inline-flex h-8 items-center gap-1 rounded-md border border-border-subtle bg-bg-tertiary/50 px-2 text-fg-secondary">
      <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? event.target.value : null)}
        className="h-7 max-w-[220px] bg-transparent font-mono text-[11px] text-fg-primary outline-none"
        aria-label="Change set"
      >
        <option value="">baseline</option>
        {changes.map((change) => (
          <option key={change.id} value={change.id}>
            {change.id} · {change.status}
          </option>
        ))}
      </select>
    </label>
  )
}
