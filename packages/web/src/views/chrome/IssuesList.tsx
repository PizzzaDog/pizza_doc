import { encodeRefForRoute } from '@/lib/entity-ref'
import { cn } from '@/lib/utils'
import type { Severity, ValidationIssue } from '@pizza-doc/core'
import { Link } from '@tanstack/react-router'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

/**
 * Flat list of validation issues with a quick-navigate Link per row. Used
 * inside the validation sheet, but kept in a standalone component so the
 * command palette's "Validate space" result view can reuse it later.
 */
export function IssuesList({
  spaceId,
  issues,
  onNavigate,
}: {
  spaceId: string
  issues: readonly ValidationIssue[]
  onNavigate?: () => void
}) {
  if (issues.length === 0) {
    return <p className="text-ui text-fg-tertiary">No validation issues. Space is clean.</p>
  }
  const sorted = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((issue, i) => (
        <li
          key={`${issue.code}-${i}`}
          className="flex items-start gap-2 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2"
        >
          <Icon severity={issue.severity} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wide text-fg-tertiary">
                {issue.code}
              </span>
              {issue.file ? (
                <span
                  className="truncate font-mono text-[10px] text-fg-tertiary"
                  title={issue.file}
                >
                  {issue.file}
                  {issue.line ? `:${issue.line}` : ''}
                </span>
              ) : null}
            </div>
            <p className="text-ui text-fg-primary">{issue.message}</p>
            {issue.suggestion ? (
              <p className="mt-0.5 text-meta text-fg-tertiary">→ {issue.suggestion}</p>
            ) : null}
            {issue.entityRef ? (
              <NavigateLink spaceId={spaceId} entityRef={issue.entityRef} onNavigate={onNavigate} />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Icon({ severity }: { severity: Severity }) {
  const common = 'mt-0.5 h-3.5 w-3.5 shrink-0'
  if (severity === 'error')
    return <CircleAlert className={cn(common, 'text-error')} strokeWidth={1.5} />
  if (severity === 'warning')
    return <TriangleAlert className={cn(common, 'text-warning')} strokeWidth={1.5} />
  return <Info className={cn(common, 'text-fg-tertiary')} strokeWidth={1.5} />
}

function NavigateLink({
  spaceId,
  entityRef,
  onNavigate,
}: {
  spaceId: string
  entityRef: string
  onNavigate?: (() => void) | undefined
}) {
  const className =
    'mt-1 inline-flex font-mono text-meta text-accent underline-offset-2 hover:underline'
  if (entityRef.startsWith('usecase:')) {
    return (
      <Link
        to="/space/$spaceId/usecase/$useCaseId"
        params={{ spaceId, useCaseId: entityRef.slice('usecase:'.length) }}
        className={className}
        onClick={() => onNavigate?.()}
      >
        {entityRef}
      </Link>
    )
  }
  return (
    <Link
      to="/space/$spaceId/entity/$refPath"
      params={{ spaceId, refPath: encodeRefForRoute(entityRef) }}
      className={className}
      onClick={() => onNavigate?.()}
    >
      {entityRef}
    </Link>
  )
}
