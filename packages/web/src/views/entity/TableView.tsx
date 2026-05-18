import { encodeRefForRoute } from '@/lib/entity-ref'
import type { UsageIndex } from '@/lib/usage-index'
import type { Table, ValidationIssue } from '@pizza-doc/core'
import { ColumnsTable, IndexesList } from './ColumnsTable'
import { EntityHeader } from './EntityHeader'
import { EntityIssues } from './EntityIssues'
import { UsedInPanel } from './UsedInPanel'
import { ViewShell } from './ViewShell'

export function TableView({
  spaceId,
  table,
  moduleId,
  moduleName,
  domainId,
  usage,
  issues,
}: {
  spaceId: string
  table: Table
  moduleId: string
  moduleName: string
  domainId?: string
  usage: UsageIndex
  issues: ValidationIssue[]
}) {
  const parentRef = domainId ? `module:${moduleId}/domain:${domainId}` : `module:${moduleId}`
  const ref = `${parentRef}/table:${table.id}`

  const persistedBy = usage.modelsPersistedAsTable.get(ref) ?? []
  const fkSources = usage.tablesWithFkToTable.get(ref) ?? []
  const useCases = usage.useCasesByTable.get(ref) ?? []

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
  crumbs.push({ label: table.id })

  return (
    <ViewShell
      header={
        <EntityHeader
          spaceId={spaceId}
          name={table.name}
          typeLabel="table"
          subtitle={ref}
          description={table.description}
          crumbs={crumbs}
        />
      }
      main={
        <>
          <ColumnsTable spaceId={spaceId} columns={table.columns} />
          <IndexesList indexes={table.indexes} />
          {issues.length > 0 ? <EntityIssues issues={issues} /> : null}
        </>
      }
      aside={
        <>
          <UsedInPanel
            title="Persisted by models"
            spaceId={spaceId}
            refs={persistedBy}
            empty="No model targets this table via persistedAs."
          />
          <UsedInPanel
            title="Foreign-keyed from"
            spaceId={spaceId}
            refs={fkSources}
            empty="No other table points to this one."
          />
          <UsedInPanel
            title="Touched by use cases"
            spaceId={spaceId}
            refs={useCases}
            empty="No use case reads or writes this table yet."
          />
        </>
      }
    />
  )
}
