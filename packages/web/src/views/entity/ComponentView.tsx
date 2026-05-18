import { encodeRefForRoute } from '@/lib/entity-ref'
import type { UsageIndex } from '@/lib/usage-index'
import type { Component, ValidationIssue } from '@pizza-doc/core'
import { EntityHeader } from './EntityHeader'
import { EntityIssues, SectionHeading } from './EntityIssues'
import { MethodsTable } from './MethodsTable'
import { RefLink } from './RefLink'
import { UsedInPanel } from './UsedInPanel'
import { ViewShell } from './ViewShell'

export function ComponentView({
  spaceId,
  component,
  moduleId,
  moduleName,
  domainId,
  usage,
  issues,
}: {
  spaceId: string
  component: Component
  moduleId: string
  moduleName: string
  domainId?: string
  usage: UsageIndex
  issues: ValidationIssue[]
}) {
  const parentRef = domainId ? `module:${moduleId}/domain:${domainId}` : `module:${moduleId}`
  const ref = `${parentRef}/component:${component.id}`

  const incoming = usage.incomingCallsToComponent.get(ref) ?? []
  const outgoing = collectOutgoingCalls(component)
  const useCases = usage.useCasesByComponent.get(ref) ?? []

  const crumbs = [
    { label: 'Space', to: { route: 'space' as const } },
    { label: 'Modules' },
    {
      label: moduleName,
      to: { route: 'entity' as const, refPath: encodeRefForRoute(`module:${moduleId}`) },
    },
  ]
  if (domainId) {
    crumbs.push({
      label: domainId,
      to: {
        route: 'entity' as const,
        refPath: encodeRefForRoute(`module:${moduleId}/domain:${domainId}`),
      },
    })
  }
  crumbs.push({ label: component.id })

  return (
    <ViewShell
      header={
        <EntityHeader
          spaceId={spaceId}
          name={component.name}
          typeLabel={component.type}
          subtitle={ref}
          description={component.description}
          crumbs={crumbs}
        />
      }
      main={
        <>
          <MethodsTable spaceId={spaceId} methods={component.methods} />
          {issues.length > 0 ? <EntityIssues issues={issues} /> : null}
        </>
      }
      aside={
        <>
          <UsedInPanel
            title="Appears in use cases"
            spaceId={spaceId}
            refs={useCases}
            empty="Not in any use case yet."
          />
          <UsedInPanel
            title="Incoming calls"
            spaceId={spaceId}
            refs={incoming}
            empty="No method in the space calls this component."
          />
          <UsedInPanel
            title="Outgoing calls"
            spaceId={spaceId}
            refs={outgoing}
            empty="This component doesn't call any other method."
          />
        </>
      }
    />
  )
}

function collectOutgoingCalls(component: Component): string[] {
  const out = new Set<string>()
  for (const m of component.methods) {
    for (const c of m.calls) out.add(c.target)
  }
  return [...out]
}
