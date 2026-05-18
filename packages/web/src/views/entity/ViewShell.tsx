import type * as React from 'react'

/**
 * Two-column layout shared by every entity detail view. Main content on the
 * left, thin sidebar-ish column on the right for "Used in" / "Validation" /
 * ancillary panels.
 */
export function ViewShell({
  header,
  main,
  aside,
}: {
  header: React.ReactNode
  main: React.ReactNode
  aside: React.ReactNode
}) {
  return (
    <article className="flex h-full flex-col">
      {header}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(240px,320px)] overflow-auto">
        <section className="min-w-0 px-8 py-6">
          <div className="flex flex-col gap-8">{main}</div>
        </section>
        <aside className="min-w-0 border-l border-border-subtle bg-bg-secondary/50 px-6 py-6">
          <div className="flex flex-col gap-6">{aside}</div>
        </aside>
      </div>
    </article>
  )
}
