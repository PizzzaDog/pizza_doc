import { FieldsTable } from '@/views/entity/FieldsTable'
import { RefLink } from '@/views/entity/RefLink'
import type { Column, Field, Index, Model, Module, Table, UseCase } from '@pizza-doc/core'
import type * as React from 'react'
import type { ResolvedEntity } from './resolved-entity'

/**
 * Compact read-only summary of the selected entity. Denser than the full
 * entity detail views — those stay the primary surface for browsing.
 */
export function DetailsTab({
  spaceId,
  resolved,
}: {
  spaceId: string
  resolved: ResolvedEntity
}) {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <Section label="kind">
        <span className="font-mono text-[12px] text-fg-primary">{resolved.kind}</span>
      </Section>

      {'entity' in resolved && 'description' in resolved.entity && resolved.entity.description ? (
        <Section label="description">
          <p className="text-ui text-fg-secondary">{resolved.entity.description}</p>
        </Section>
      ) : null}

      {renderKindSpecific(spaceId, resolved)}
    </div>
  )
}

function renderKindSpecific(spaceId: string, resolved: ResolvedEntity): React.ReactNode {
  switch (resolved.kind) {
    case 'actor':
      return (
        <>
          <Row label="type" value={resolved.entity.type} />
        </>
      )

    case 'module': {
      const totals = moduleChildTotals(resolved.entity)
      const tables = moduleTableRefs(resolved.entity)
      return (
        <>
          <Row label="type" value={resolved.entity.type} />
          {resolved.entity.techStack ? (
            <Row label="techStack" value={resolved.entity.techStack} />
          ) : null}
          <Row label="domains" value={`${resolved.entity.domains.length}`} />
          <Row label="components" value={`${totals.components}`} />
          <Row label="models" value={`${totals.models}`} />
          <Row label="tables" value={`${totals.tables}`} />
          {tables.length > 0 ? (
            <RefList label="table refs" spaceId={spaceId} refs={tables} />
          ) : null}
        </>
      )
    }

    case 'domain':
      return (
        <>
          <Row
            label="module"
            value={<RefLink spaceId={spaceId} refUri={`module:${resolved.module.id}`} />}
          />
          <Row label="components" value={`${resolved.entity.components.length}`} />
          <Row label="models" value={`${resolved.entity.models.length}`} />
          <Row label="tables" value={`${resolved.entity.tables.length}`} />
        </>
      )

    case 'component':
      return (
        <>
          <Row label="type" value={resolved.entity.type} />
          <Row
            label="module"
            value={<RefLink spaceId={spaceId} refUri={`module:${resolved.module.id}`} />}
          />
          {resolved.domain ? (
            <Row
              label="domain"
              value={
                <RefLink
                  spaceId={spaceId}
                  refUri={`module:${resolved.module.id}/domain:${resolved.domain.id}`}
                />
              }
            />
          ) : null}
          <Row label="methods" value={`${resolved.entity.methods.length}`} />
        </>
      )

    case 'model':
      return (
        <>
          <Row label="modelKind" value={resolved.entity.modelKind} />
          {resolved.entity.persistedAs ? (
            <Row
              label="persistedAs"
              value={<RefLink spaceId={spaceId} refUri={resolved.entity.persistedAs} />}
            />
          ) : null}
          <FieldsTable fields={resolved.entity.fields} />
          <ExampleJson model={resolved.entity} />
        </>
      )

    case 'table':
      return (
        <>
          <Row label="columns" value={`${resolved.entity.columns.length}`} />
          <Row label="indexes" value={`${resolved.entity.indexes.length}`} />
          <CompactColumnsTable spaceId={spaceId} table={resolved.entity} />
          <CompactIndexesList indexes={resolved.entity.indexes} />
        </>
      )

    case 'usecase': {
      const tableRefs = useCaseSqlTableRefs(resolved.entity)
      return (
        <>
          <Row label="actor" value={<RefLink spaceId={spaceId} refUri={resolved.entity.actor} />} />
          <Row label="trigger" value={resolved.entity.trigger} />
          <Row label="steps" value={`${resolved.entity.steps.length}`} />
          <Row label="errorFlows" value={`${resolved.entity.errorFlows.length}`} />
          <Row label="dataFlow" value={`${resolved.entity.dataFlow.length}`} />
          {tableRefs.length > 0 ? (
            <RefList label="touched tables" spaceId={spaceId} refs={tableRefs} />
          ) : null}
        </>
      )
    }
  }
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
        {label}
      </span>
      <span className="truncate text-ui text-fg-primary">{value}</span>
    </div>
  )
}

function RefList({
  label,
  spaceId,
  refs,
}: {
  label: string
  spaceId: string
  refs: readonly string[]
}) {
  return (
    <Section label={label}>
      <ul className="flex flex-col gap-1.5">
        {refs.map((ref) => (
          <li key={ref} className="min-w-0">
            <RefLink spaceId={spaceId} refUri={ref} />
          </li>
        ))}
      </ul>
    </Section>
  )
}

function CompactColumnsTable({ spaceId, table }: { spaceId: string; table: Table }) {
  if (table.columns.length === 0) return null
  return (
    <Section label="column structure">
      <div className="overflow-hidden rounded-md border border-border-subtle">
        <div className="divide-y divide-border-subtle">
          {table.columns.map((column) => (
            <article key={column.name} className="px-3 py-3">
              <div className="grid grid-cols-[minmax(7rem,1fr)_minmax(7rem,1fr)] gap-3">
                <div className="min-w-0">
                  <div className="break-words font-mono text-[12px] text-fg-primary">
                    {column.name}
                  </div>
                  <ColumnFlags column={column} />
                </div>
                <div className="min-w-0 break-words font-mono text-[12px] text-fg-secondary">
                  {column.sqlType}
                </div>
              </div>
              {column.foreignKey ? (
                <div className="mt-2 flex min-w-0 flex-col gap-0.5 text-ui">
                  <span className="text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
                    foreign key
                  </span>
                  <RefLink spaceId={spaceId} refUri={column.foreignKey.table} />
                  <span className="break-words font-mono text-[11px] text-fg-tertiary">
                    .{column.foreignKey.column}
                  </span>
                </div>
              ) : (
                <p className="mt-2 whitespace-normal break-words text-ui leading-relaxed text-fg-secondary">
                  {column.description ?? <span className="text-fg-muted">—</span>}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </Section>
  )
}

function ColumnFlags({ column }: { column: Column }) {
  const flags: string[] = []
  if (column.primaryKey) flags.push('PK')
  if (column.unique) flags.push('UNIQUE')
  if (column.nullable) flags.push('NULL')
  if (column.default) flags.push(`DEFAULT ${column.default}`)
  if (flags.length === 0) return null
  return (
    <span className="mt-0.5 block whitespace-normal text-[10px] text-fg-tertiary">
      {flags.join(' · ')}
    </span>
  )
}

function CompactIndexesList({ indexes }: { indexes: readonly Index[] }) {
  if (indexes.length === 0) return null
  return (
    <Section label="indexes">
      <ul className="flex flex-col gap-1.5">
        {indexes.map((index) => (
          <li key={index.name} className="text-ui">
            <span className="font-mono text-[11px] text-fg-primary">{index.name}</span>
            <span className="ml-2 font-mono text-[11px] text-fg-tertiary">
              ({index.columns.join(', ')})
            </span>
            {index.unique ? (
              <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-warning">
                unique
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function moduleChildTotals(module: Module): { components: number; models: number; tables: number } {
  let components = module.components.length
  let models = module.models.length
  let tables = module.tables.length
  for (const domain of module.domains) {
    components += domain.components.length
    models += domain.models.length
    tables += domain.tables.length
  }
  return { components, models, tables }
}

function moduleTableRefs(module: Module): string[] {
  const refs = module.tables.map((table) => `module:${module.id}/table:${table.id}`)
  for (const domain of module.domains) {
    for (const table of domain.tables) {
      refs.push(`module:${module.id}/domain:${domain.id}/table:${table.id}`)
    }
  }
  return refs
}

function useCaseSqlTableRefs(useCase: UseCase): string[] {
  const refs = new Set<string>()
  for (const step of useCase.steps) {
    if (step.protocol !== 'sql') continue
    for (const ref of [step.from, step.to]) {
      if (ref.includes('/table:')) refs.add(ref)
    }
  }
  return [...refs]
}

/**
 * Synthesised JSON skeleton for a DTO. Prefers per-field `example` values
 * (from the YAML) — those are literal, so a DTO with examples produces a
 * realistic payload. For fields without examples we insert a typed
 * placeholder (`"<string>"`, `0`, `true`, etc.) so the shape is at least
 * readable without triggering "looks like real data" confusion.
 */
function ExampleJson({ model }: { model: Model }) {
  if (model.fields.length === 0) return null
  const stringified = JSON.stringify(synthExample(model), null, 2)
  return (
    <section aria-label="Example payload">
      <div className="mb-1 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
        example
      </div>
      <pre className="m-0 overflow-auto rounded-md border border-border-subtle bg-bg-secondary p-3 font-mono text-[11px] leading-relaxed text-fg-primary">
        {stringified}
      </pre>
    </section>
  )
}

function synthExample(model: Model): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of model.fields) {
    if (!f.optional) out[f.name] = sampleValueForField(f)
    else if (f.example !== undefined) out[f.name] = f.example
  }
  return out
}

/**
 * Pick a plausible value for a DTO field. Authors can override on a per-
 * field basis via the YAML `example` key; otherwise we infer by type name.
 * The inference is deliberately shallow — the goal is "this is clearly a
 * placeholder", not "this is a real-looking payload".
 */
function sampleValueForField(f: Field): unknown {
  if (f.example !== undefined) return f.example
  const t = f.type.toLowerCase().trim()
  if (t.endsWith('[]')) return []
  if (t === 'string' || t === 'uuid' || t === 'datetime' || t === 'timestamp') return `<${f.type}>`
  if (t === 'int' || t === 'integer' || t === 'number' || t === 'float' || t === 'long') return 0
  if (t === 'boolean' || t === 'bool') return false
  if (t === 'object' || t === 'any' || t === 'json') return {}
  // Named types (other DTOs, enums, custom scalars) — echo as placeholder.
  return `<${f.type}>`
}
