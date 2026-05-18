import type { NodeSeverity } from '@/lib/issue-index'
import { cn } from '@/lib/utils'
import type { Severity } from '@pizza-doc/core'

const TONE_CLASS: Record<Severity, string> = {
  error: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-fg-muted',
}

const TONE_LABEL: Record<Severity, string> = {
  error: 'has error',
  warning: 'has warning',
  info: 'informational',
}

/**
 * 6px colored dot. Renders empty space when `severity` is null so the
 * right-rail column stays aligned across rows.
 */
export function ValidationDot({
  severity,
  className,
}: {
  severity: NodeSeverity
  className?: string
}) {
  if (!severity) {
    return <span aria-hidden className={cn('inline-block h-1.5 w-1.5', className)} />
  }
  return (
    <span
      role="img"
      aria-label={TONE_LABEL[severity]}
      className={cn('inline-block h-1.5 w-1.5 rounded-full', TONE_CLASS[severity], className)}
    />
  )
}
