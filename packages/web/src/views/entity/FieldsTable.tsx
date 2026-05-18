import type { Field } from '@pizza-doc/core'
import { SectionHeading } from './EntityIssues'

export function FieldsTable({
  fields,
  emptyLabel = 'No fields declared.',
}: {
  fields: ReadonlyArray<Field>
  emptyLabel?: string
}) {
  return (
    <section aria-label="Fields">
      <SectionHeading>Fields</SectionHeading>
      {fields.length === 0 ? (
        <p className="text-ui text-fg-tertiary">{emptyLabel}</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border-subtle">
          <div className="grid grid-cols-[minmax(7rem,1fr)_minmax(8rem,1.1fr)_4rem] gap-x-3 border-b border-border-subtle px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-fg-tertiary">
            <span>name</span>
            <span>type</span>
            <span className="text-right">req</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {fields.map((f) => (
              <article key={f.name} className="px-3 py-3">
                <div className="grid grid-cols-[minmax(7rem,1fr)_minmax(8rem,1.1fr)_4rem] items-start gap-x-3">
                  <span className="min-w-0 break-words font-mono text-[12px] text-fg-primary">
                    {f.name}
                  </span>
                  <span className="min-w-0 break-words font-mono text-[12px] text-fg-secondary">
                    {f.type}
                  </span>
                  <span className="text-right text-[12px] text-fg-tertiary">
                    {f.optional ? 'opt' : 'req'}
                  </span>
                </div>
                <p className="mt-2 whitespace-normal break-words text-ui leading-relaxed text-fg-secondary">
                  {f.description ?? <span className="text-fg-tertiary">—</span>}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
