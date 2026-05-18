import { encodeRefForRoute } from '@/lib/entity-ref'
import type { UsageIndex } from '@/lib/usage-index'
import type { Model, ValidationIssue } from '@pizza-doc/core'
import { EntityHeader } from './EntityHeader'
import { EntityIssues, SectionHeading } from './EntityIssues'
import { FieldsTable } from './FieldsTable'
import { RefLink } from './RefLink'
import { UsedInPanel } from './UsedInPanel'
import { ViewShell } from './ViewShell'

export function ModelView({
  spaceId,
  model,
  moduleId,
  moduleName,
  domainId,
  usage,
  issues,
}: {
  spaceId: string
  model: Model
  moduleId: string
  moduleName: string
  domainId?: string
  usage: UsageIndex
  issues: ValidationIssue[]
}) {
  const parentRef = domainId ? `module:${moduleId}/domain:${domainId}` : `module:${moduleId}`
  const ref = `${parentRef}/model:${model.id}`

  const transitingUseCases = usage.useCasesByModelTransit.get(ref) ?? []
  const referencingComponents = usage.componentsReferencingModelByType.get(ref) ?? []

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
  crumbs.push({ label: model.id })

  return (
    <ViewShell
      header={
        <EntityHeader
          spaceId={spaceId}
          name={model.name}
          typeLabel={model.modelKind}
          subtitle={ref}
          description={model.description}
          crumbs={crumbs}
        />
      }
      main={
        <>
          <FieldsTable fields={model.fields} />

          {model.persistedAs ? (
            <section>
              <SectionHeading>Persists as</SectionHeading>
              <RefLink spaceId={spaceId} refUri={model.persistedAs} />
            </section>
          ) : null}

          {issues.length > 0 ? <EntityIssues issues={issues} /> : null}
        </>
      }
      aside={
        <>
          <UsedInPanel
            title="Transits in use cases"
            spaceId={spaceId}
            refs={transitingUseCases}
            empty="Not used as step.via in any use case."
          />
          <UsedInPanel
            title="Accepted by components"
            spaceId={spaceId}
            refs={referencingComponents}
            empty="No component method takes this type as a param or returns it."
          />
        </>
      }
    />
  )
}
