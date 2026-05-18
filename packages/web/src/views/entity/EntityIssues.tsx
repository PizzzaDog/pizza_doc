import { cn } from '@/lib/utils'
import type { Severity, ValidationIssue } from '@pizza-doc/core'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

export function EntityIssues({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null

  const sorted = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return (
    <section aria-label="Validation issues">
      <SectionHeading>Validation</SectionHeading>
      <ul className="flex flex-col gap-1.5">
        {sorted.map((issue, i) => (
          <IssueRow key={`${issue.code}-${i}`} issue={issue} />
        ))}
      </ul>
    </section>
  )
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-md border border-border-subtle bg-bg-secondary px-3 py-2',
      )}
    >
      <IssueIcon severity={issue.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-fg-tertiary">
            {issue.code}
          </span>
          {issue.file ? (
            <span className="truncate font-mono text-[10px] text-fg-tertiary" title={issue.file}>
              {issue.file}
              {issue.line ? `:${issue.line}` : ''}
            </span>
          ) : null}
        </div>
        <p className="text-ui text-fg-primary">{issue.message}</p>
        {issue.suggestion ? (
          <p className="mt-0.5 text-meta text-fg-tertiary">→ {issue.suggestion}</p>
        ) : null}
      </div>
    </li>
  )
}

function IssueIcon({ severity }: { severity: Severity }) {
  const common = 'mt-0.5 h-3.5 w-3.5 shrink-0'
  if (severity === 'error') {
    return <CircleAlert className={cn(common, 'text-error')} strokeWidth={1.5} aria-label="error" />
  }
  if (severity === 'warning') {
    return (
      <TriangleAlert
        className={cn(common, 'text-warning')}
        strokeWidth={1.5}
        aria-label="warning"
      />
    )
  }
  return <Info className={cn(common, 'text-fg-tertiary')} strokeWidth={1.5} aria-label="info" />
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-fg-tertiary">
      {children}
    </h3>
  )
}
