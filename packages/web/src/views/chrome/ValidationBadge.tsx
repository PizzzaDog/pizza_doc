import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useSpaceStore } from '@/store/space'
import type { Severity, ValidationIssue } from '@pizza-doc/core'
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { IssuesList } from './IssuesList'

/**
 * Top-bar pill: compact counts + accent colour that matches the worst
 * severity present. Click opens the issues sheet (a right-anchored panel
 * with every issue and a quick-navigate link).
 */
export function ValidationBadge({ spaceId }: { spaceId: string }) {
  const current = useSpaceStore((s) => s.current)
  const issuesOpen = useSpaceStore((s) => s.issuesOpen)
  const setIssuesOpen = useSpaceStore((s) => s.setIssuesOpen)
  if (!current) return null

  const counts = countBy(current.issues)
  const worst = worstSeverity(current.issues)

  return (
    <>
      <button
        type="button"
        onClick={() => setIssuesOpen(true)}
        aria-label="Show validation issues"
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-meta transition-colors duration-120',
          'hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-focus',
          toneClass(worst),
        )}
      >
        {worst === 'error' ? (
          <CircleAlert className="h-3.5 w-3.5" strokeWidth={1.5} />
        ) : worst === 'warning' ? (
          <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.5} />
        ) : worst === 'info' ? (
          <Info className="h-3.5 w-3.5" strokeWidth={1.5} />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        )}
        <span className="font-mono">{summary(counts)}</span>
      </button>

      <Sheet open={issuesOpen} onOpenChange={setIssuesOpen}>
        <SheetContent side="right" className="w-[min(520px,90vw)]">
          <SheetHeader>
            <SheetTitle>Validation issues</SheetTitle>
            <SheetDescription>
              {issuesOpen
                ? `${counts.error} errors · ${counts.warning} warnings · ${counts.info} infos`
                : null}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <IssuesList
              spaceId={spaceId}
              issues={current.issues}
              onNavigate={() => setIssuesOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function countBy(issues: readonly ValidationIssue[]): Record<Severity, number> {
  const out: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const i of issues) out[i.severity] += 1
  return out
}

function summary(counts: Record<Severity, number>): string {
  if (counts.error > 0) return `${counts.error} error${counts.error === 1 ? '' : 's'}`
  if (counts.warning > 0) return `${counts.warning} warning${counts.warning === 1 ? '' : 's'}`
  if (counts.info > 0) return `${counts.info} info`
  return 'All clear'
}

function worstSeverity(issues: readonly ValidationIssue[]): Severity | 'clean' {
  let worst: Severity | 'clean' = 'clean'
  const rank: Record<Severity, number> = { error: 3, warning: 2, info: 1 }
  for (const i of issues) {
    if (worst === 'clean' || rank[i.severity] > rank[worst as Severity]) worst = i.severity
  }
  return worst
}

function toneClass(worst: Severity | 'clean'): string {
  switch (worst) {
    case 'error':
      return 'border-error/40 bg-error/5 text-error'
    case 'warning':
      return 'border-warning/40 bg-warning/5 text-warning'
    case 'info':
      return 'border-border bg-bg-secondary text-fg-tertiary'
    case 'clean':
      return 'border-success/30 bg-success/5 text-success'
  }
}
