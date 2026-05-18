import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ensureRefIndex, parentComponentRef, resolveRef } from '@/lib/entity-lookup'
import { buildUsageIndex } from '@/lib/usage-index'
import { useSpaceStore } from '@/store/space'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { ActorView } from './ActorView'
import { ComponentView } from './ComponentView'
import { DomainView } from './DomainView'
import { ModelView } from './ModelView'
import { ModuleView } from './ModuleView'
import { TableView } from './TableView'

/**
 * Entry route for /space/$spaceId/entity/$refPath. Parses the ref, resolves
 * it against the loaded space, and dispatches to the appropriate detail view
 * per page 06 Mode B.
 */
export function EntityView({ spaceId, refUri }: { spaceId: string; refUri: string }) {
  const current = useSpaceStore((s) => s.current)

  const resolved = useMemo(() => {
    if (!current) return null
    const index = ensureRefIndex(current.space)
    return resolveRef(index, refUri)
  }, [current, refUri])

  const usage = useMemo(() => {
    if (!current) return null
    return buildUsageIndex(current.space)
  }, [current])

  if (!current || !usage) {
    return <EmptyState spaceId={spaceId} title="Loading space…" />
  }

  if (!resolved) {
    return (
      <EmptyState
        spaceId={spaceId}
        title="Entity not found"
        description={`No entity with reference ${refUri} in this space.`}
      />
    )
  }

  // Method ref → render its owning component view. Use cases have their own
  // route; if someone lands here on a usecase ref, send them to it.
  if (resolved.kind === 'method') {
    const compRef = parentComponentRef(refUri)
    if (!compRef) {
      return (
        <EmptyState
          spaceId={spaceId}
          title="Malformed method ref"
          description={`Could not derive a parent component for ${refUri}.`}
        />
      )
    }
    const compTarget = ensureRefIndex(current.space).get(compRef)
    if (!compTarget || compTarget.kind !== 'component') {
      return (
        <EmptyState
          spaceId={spaceId}
          title="Component not found"
          description={`${refUri} does not live on a known component.`}
        />
      )
    }
    return (
      <ComponentView
        spaceId={spaceId}
        component={compTarget.entity}
        moduleId={compTarget.module.id}
        moduleName={compTarget.module.name}
        {...(compTarget.domain ? { domainId: compTarget.domain.id } : {})}
        usage={usage}
        issues={current.issues.filter((i) => i.entityRef === compRef)}
      />
    )
  }

  if (resolved.kind === 'usecase') {
    return (
      <EmptyState
        spaceId={spaceId}
        title="This is a use case"
        description="Use cases live at /usecase/$id. Opening the list is the right path."
        useCaseId={resolved.target.entity.id}
      />
    )
  }

  const issuesForRef = current.issues.filter((i) => i.entityRef === refUri)

  if (resolved.kind === 'actor') {
    return (
      <ActorView
        spaceId={spaceId}
        actor={resolved.target.entity}
        usage={usage}
        issues={issuesForRef}
      />
    )
  }

  if (resolved.kind === 'module') {
    return (
      <ModuleView
        spaceId={spaceId}
        module={resolved.target.entity}
        usage={usage}
        issues={issuesForRef}
      />
    )
  }

  if (resolved.kind === 'domain') {
    return (
      <DomainView
        spaceId={spaceId}
        moduleId={resolved.target.module.id}
        moduleName={resolved.target.module.name}
        domain={resolved.target.entity}
        usage={usage}
        issues={issuesForRef}
      />
    )
  }

  if (resolved.kind === 'component') {
    const t = resolved.target
    return (
      <ComponentView
        spaceId={spaceId}
        component={t.entity}
        moduleId={t.module.id}
        moduleName={t.module.name}
        {...(t.domain ? { domainId: t.domain.id } : {})}
        usage={usage}
        issues={issuesForRef}
      />
    )
  }

  if (resolved.kind === 'model') {
    const t = resolved.target
    return (
      <ModelView
        spaceId={spaceId}
        model={t.entity}
        moduleId={t.module.id}
        moduleName={t.module.name}
        {...(t.domain ? { domainId: t.domain.id } : {})}
        usage={usage}
        issues={issuesForRef}
      />
    )
  }

  if (resolved.kind === 'table') {
    const t = resolved.target
    return (
      <TableView
        spaceId={spaceId}
        table={t.entity}
        moduleId={t.module.id}
        moduleName={t.module.name}
        {...(t.domain ? { domainId: t.domain.id } : {})}
        usage={usage}
        issues={issuesForRef}
      />
    )
  }

  return (
    <EmptyState
      spaceId={spaceId}
      title="Unknown entity kind"
      description="The ref resolved to an unrecognised entity shape."
    />
  )
}

function EmptyState({
  spaceId,
  title,
  description,
  useCaseId,
}: {
  spaceId: string
  title: string
  description?: string
  useCaseId?: string
}) {
  return (
    <div className="mx-auto max-w-md px-8 py-12">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/space/$spaceId" params={{ spaceId }}>
              Back to space
            </Link>
          </Button>
          {useCaseId ? (
            <Button asChild size="sm">
              <Link to="/space/$spaceId/usecase/$useCaseId" params={{ spaceId, useCaseId }}>
                Open use case
              </Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
