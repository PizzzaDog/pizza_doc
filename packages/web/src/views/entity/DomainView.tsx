import type { UsageIndex } from '@/lib/usage-index'
import type { Domain, ValidationIssue } from '@pizza-doc/core'
import { EntityHeader } from './EntityHeader'
import { EntityIssues, SectionHeading } from './EntityIssues'
import { RefLink } from './RefLink'
import { UsedInPanel } from './UsedInPanel'
import { ViewShell } from './ViewShell'

export function DomainView({
  spaceId,
  moduleId,
  moduleName,
  domain,
  usage,
  issues,
}: {
  spaceId: string
  moduleId: string
  moduleName: string
  domain: Domain
  usage: UsageIndex
  issues: ValidationIssue[]
}) {
  const moduleRef = `module:${moduleId}`
  const domainRef = `${moduleRef}/domain:${domain.id}`
  const useCases = usage.useCasesByScope.get(domainRef) ?? []

  return (
    <ViewShell
      header={
        <EntityHeader
          spaceId={spaceId}
          name={domain.name}
          typeLabel="domain"
          subtitle={domainRef}
          description={domain.description}
          crumbs={[
            { label: 'Space', to: { route: 'space' } },
            { label: 'Modules' },
            {
              label: moduleName,
              to: { route: 'entity', refPath: encodeURIComponent(moduleRef) },
            },
            { label: domain.id },
          ]}
        />
      }
      main={
        <>
          <section>
            <SectionHeading>Contents</SectionHeading>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
              <DlRow label="components" value={domain.components.length} />
              <DlRow label="models" value={domain.models.length} />
              <DlRow label="tables" value={domain.tables.length} />
            </dl>
          </section>

          {domain.components.length > 0 ? (
            <ChildGroup
              label="components"
              refs={domain.components.map((c) => `${domainRef}/component:${c.id}`)}
              spaceId={spaceId}
            />
          ) : null}

          {domain.models.length > 0 ? (
            <ChildGroup
              label="models"
              refs={domain.models.map((m) => `${domainRef}/model:${m.id}`)}
              spaceId={spaceId}
            />
          ) : null}

          {domain.tables.length > 0 ? (
            <ChildGroup
              label="tables"
              refs={domain.tables.map((t) => `${domainRef}/table:${t.id}`)}
              spaceId={spaceId}
            />
          ) : null}

          {issues.length > 0 ? <EntityIssues issues={issues} /> : null}
        </>
      }
      aside={
        <UsedInPanel
          title="Used in use cases"
          spaceId={spaceId}
          refs={useCases}
          empty="No use case touches anything in this domain yet."
        />
      }
    />
  )
}

function ChildGroup({ label, refs, spaceId }: { label: string; refs: string[]; spaceId: string }) {
  return (
    <section aria-label={label}>
      <SectionHeading>
        {label} ({refs.length})
      </SectionHeading>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {refs.map((r) => (
          <li key={r}>
            <RefLink spaceId={spaceId} refUri={r} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function DlRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-meta text-fg-tertiary">{label}</dt>
      <dd className="font-mono text-ui text-fg-primary">{value}</dd>
    </div>
  )
}
