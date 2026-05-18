import type { Column, Index } from '@pizza-doc/core'
import { SectionHeading } from './EntityIssues'
import { RefLink } from './RefLink'

export function ColumnsTable({
  spaceId,
  columns,
}: {
  spaceId: string
  columns: ReadonlyArray<Column>
}) {
  return (
    <section aria-label="Columns">
      <SectionHeading>Columns</SectionHeading>
      <div className="rounded-md border border-border-subtle">
        <table className="w-full text-ui">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              <Th>name</Th>
              <Th>sql type</Th>
              <Th>flags</Th>
              <Th>fk</Th>
              <Th>description</Th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.name} className="border-b border-border-subtle last:border-0 align-top">
                <td className="px-3 py-2 font-mono text-[12px] text-fg-primary">{c.name}</td>
                <td className="px-3 py-2 font-mono text-[12px] text-fg-secondary">{c.sqlType}</td>
                <td className="px-3 py-2 text-[11px] font-mono text-fg-tertiary">
                  <ColumnFlags column={c} />
                </td>
                <td className="px-3 py-2 text-ui">
                  {c.foreignKey ? (
                    <div className="flex flex-col gap-0.5">
                      <RefLink spaceId={spaceId} refUri={c.foreignKey.table} />
                      <span className="font-mono text-[11px] text-fg-tertiary">
                        .{c.foreignKey.column}
                      </span>
                    </div>
                  ) : (
                    <span className="text-fg-tertiary">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-ui text-fg-secondary">
                  {c.description ?? <span className="text-fg-tertiary">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ColumnFlags({ column }: { column: Column }) {
  const flags: string[] = []
  if (column.primaryKey) flags.push('PK')
  if (column.unique) flags.push('UNIQUE')
  if (column.nullable) flags.push('NULL')
  if (flags.length === 0) return <span className="text-fg-muted">—</span>
  return <span>{flags.join(' · ')}</span>
}

export function IndexesList({ indexes }: { indexes: ReadonlyArray<Index> }) {
  if (indexes.length === 0) return null
  return (
    <section aria-label="Indexes">
      <SectionHeading>Indexes</SectionHeading>
      <ul className="flex flex-col gap-1.5">
        {indexes.map((idx) => (
          <li key={idx.name} className="flex items-baseline gap-3">
            <span className="font-mono text-[12px] text-fg-primary">{idx.name}</span>
            <span className="font-mono text-[11px] text-fg-tertiary">
              ({idx.columns.join(', ')})
            </span>
            {idx.unique ? (
              <span className="font-mono text-[10px] uppercase tracking-wide text-warning">
                unique
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
      {children}
    </th>
  )
}
