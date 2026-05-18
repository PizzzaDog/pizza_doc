import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbStep {
  label: string
  // When present, the crumb is a clickable TanStack Router link.
  to?:
    | { route: 'entity'; refPath: string }
    | { route: 'usecase'; useCaseId: string }
    | { route: 'space' }
}

/**
 * Shared header for every Mode-B detail view: name, optional type badge,
 * breadcrumb, and optional short description line.
 */
export function EntityHeader({
  spaceId,
  crumbs,
  name,
  typeLabel,
  typeTone = 'default',
  subtitle,
  description,
}: {
  spaceId: string
  crumbs: BreadcrumbStep[]
  name: string
  typeLabel?: string | undefined
  typeTone?: 'default' | 'accent' | undefined
  subtitle?: string | undefined
  description?: string | undefined
}) {
  return (
    <header className="border-b border-border-subtle px-8 pb-5 pt-6">
      <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1">
        {crumbs.map((c, i) => (
          <Crumb
            key={`${i}-${c.label}`}
            spaceId={spaceId}
            crumb={c}
            isLast={i === crumbs.length - 1}
          />
        ))}
      </nav>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-[18px] font-[450] tracking-tight text-fg-primary">{name}</h2>
        {typeLabel ? (
          <Badge variant={typeTone === 'accent' ? 'accent' : 'default'}>{typeLabel}</Badge>
        ) : null}
        {subtitle ? <span className="font-mono text-meta text-fg-tertiary">{subtitle}</span> : null}
      </div>
      {description ? (
        <p className="mt-3 max-w-2xl text-ui text-fg-secondary">{description}</p>
      ) : null}
    </header>
  )
}

function Crumb({
  spaceId,
  crumb,
  isLast,
}: {
  spaceId: string
  crumb: BreadcrumbStep
  isLast: boolean
}) {
  const className = cn(
    'text-meta text-fg-tertiary transition-colors duration-120',
    crumb.to && 'hover:text-fg-primary',
    isLast && 'text-fg-secondary',
  )

  let content: React.ReactNode = crumb.label
  if (crumb.to?.route === 'entity') {
    content = (
      <Link
        to="/space/$spaceId/entity/$refPath"
        params={{ spaceId, refPath: crumb.to.refPath }}
        className={className}
      >
        {crumb.label}
      </Link>
    )
  } else if (crumb.to?.route === 'usecase') {
    content = (
      <Link
        to="/space/$spaceId/usecase/$useCaseId"
        params={{ spaceId, useCaseId: crumb.to.useCaseId }}
        className={className}
      >
        {crumb.label}
      </Link>
    )
  } else if (crumb.to?.route === 'space') {
    content = (
      <Link to="/space/$spaceId" params={{ spaceId }} className={className}>
        {crumb.label}
      </Link>
    )
  } else {
    content = <span className={className}>{crumb.label}</span>
  }

  return (
    <span className="inline-flex items-center gap-1">
      {content}
      {!isLast ? <ChevronRight className="h-3 w-3 text-fg-muted" strokeWidth={1.5} /> : null}
    </span>
  )
}
