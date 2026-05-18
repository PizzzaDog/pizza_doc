import type { UsageIndex } from '@/lib/usage-index'
import type { Domain, Module, ValidationIssue } from '@pizza-doc/core'
import { EntityHeader } from './EntityHeader'
import { EntityIssues, SectionHeading } from './EntityIssues'
import { RefLink } from './RefLink'
import { UsedInPanel } from './UsedInPanel'
import { ViewShell } from './ViewShell'

export function ModuleView({
  spaceId,
  module: mod,
  usage,
  issues,
}: {
  spaceId: string
  module: Module
  usage: UsageIndex
  issues: ValidationIssue[]
}) {
  const ref = `module:${mod.id}`
  const useCases = usage.useCasesByScope.get(ref) ?? []

  const directElementCounts = countElements(mod)
  const totals = totalElements(mod)

  return (
    <ViewShell
      header={
        <EntityHeader
          spaceId={spaceId}
          name={mod.name}
          typeLabel={mod.type}
          subtitle={ref}
          description={mod.description}
          crumbs={[
            { label: 'Space', to: { route: 'space' } },
            { label: 'Modules' },
            { label: mod.id },
          ]}
        />
      }
      main={
        <>
          {mod.techStack ? (
            <section>
              <SectionHeading>Tech stack</SectionHeading>
              <p className="font-mono text-[12px] text-fg-primary">{mod.techStack}</p>
            </section>
          ) : null}

          <section>
            <SectionHeading>Contents</SectionHeading>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
              <DlRow label="modules" value={`${mod.domains.length} domains`} />
              <DlRow label="components" value={totals.components} />
              <DlRow label="models" value={totals.models} />
              <DlRow label="tables" value={totals.tables} />
              <DlRow label="methods" value={totals.methods} />
            </dl>
          </section>

          {mod.domains.length > 0 ? (
            <section aria-label="Domains">
              <SectionHeading>Domains</SectionHeading>
              <ul className="flex flex-col gap-1.5">
                {mod.domains.map((d) => (
                  <DomainRow key={d.id} spaceId={spaceId} moduleId={mod.id} domain={d} />
                ))}
              </ul>
            </section>
          ) : null}

          {directElementCounts.hasAny ? (
            <DirectChildren spaceId={spaceId} moduleRef={ref} mod={mod} />
          ) : null}

          {issues.length > 0 ? <EntityIssues issues={issues} /> : null}
        </>
      }
      aside={
        <UsedInPanel
          title="Used in use cases"
          spaceId={spaceId}
          refs={useCases}
          empty="Nothing in this module is referenced by a use case yet."
        />
      }
    />
  )
}

function DomainRow({
  spaceId,
  moduleId,
  domain,
}: { spaceId: string; moduleId: string; domain: Domain }) {
  const domainRef = `module:${moduleId}/domain:${domain.id}`
  const counts = countChildren(domain)
  return (
    <li className="flex items-baseline justify-between gap-4">
      <div className="flex min-w-0 items-baseline gap-2">
        <RefLink
          spaceId={spaceId}
          refUri={domainRef}
          label={domain.id}
          className="text-ui text-fg-primary hover:underline"
        />
        {domain.description ? (
          <span className="truncate text-ui text-fg-secondary">{domain.description}</span>
        ) : null}
      </div>
      <span className="font-mono text-meta text-fg-tertiary">
        {counts.components}c · {counts.models}m · {counts.tables}t
      </span>
    </li>
  )
}

function DirectChildren({
  spaceId,
  moduleRef,
  mod,
}: {
  spaceId: string
  moduleRef: string
  mod: Module
}) {
  return (
    <section aria-label="Module-level children">
      <SectionHeading>Module-level children</SectionHeading>
      <div className="flex flex-col gap-3">
        {mod.components.length > 0 ? (
          <GroupList
            label="components"
            refs={mod.components.map((c) => `${moduleRef}/component:${c.id}`)}
            spaceId={spaceId}
          />
        ) : null}
        {mod.models.length > 0 ? (
          <GroupList
            label="models"
            refs={mod.models.map((m) => `${moduleRef}/model:${m.id}`)}
            spaceId={spaceId}
          />
        ) : null}
        {mod.tables.length > 0 ? (
          <GroupList
            label="tables"
            refs={mod.tables.map((t) => `${moduleRef}/table:${t.id}`)}
            spaceId={spaceId}
          />
        ) : null}
      </div>
    </section>
  )
}

function GroupList({ label, refs, spaceId }: { label: string; refs: string[]; spaceId: string }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
        {label} ({refs.length})
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {refs.map((r) => (
          <li key={r}>
            <RefLink spaceId={spaceId} refUri={r} />
          </li>
        ))}
      </ul>
    </div>
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

function countChildren(domain: Domain) {
  return {
    components: domain.components.length,
    models: domain.models.length,
    tables: domain.tables.length,
  }
}

function totalElements(mod: Module) {
  let components = mod.components.length
  let models = mod.models.length
  let tables = mod.tables.length
  let methods = 0
  for (const c of mod.components) methods += c.methods.length
  for (const d of mod.domains) {
    components += d.components.length
    models += d.models.length
    tables += d.tables.length
    for (const c of d.components) methods += c.methods.length
  }
  return { components, models, tables, methods }
}

function countElements(mod: Module) {
  return {
    hasAny: mod.components.length + mod.models.length + mod.tables.length > 0,
  }
}
