import type * as React from 'react'
import { SectionHeading } from './EntityIssues'
import { RefLink } from './RefLink'

/**
 * Compact "Used in" / "Referenced by" panel. Each item is a ref URI that
 * becomes a clickable link via RefLink.
 */
export function UsedInPanel({
  title,
  spaceId,
  refs,
  empty,
  extra,
}: {
  title: string
  spaceId: string
  refs: string[]
  empty?: string
  extra?: React.ReactNode
}) {
  return (
    <section aria-label={title}>
      <SectionHeading>{title}</SectionHeading>
      {refs.length === 0 ? (
        <p className="text-ui text-fg-tertiary">{empty ?? 'Nothing here yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {refs.map((r) => (
            <li key={r} className="flex">
              <RefLink spaceId={spaceId} refUri={r} />
            </li>
          ))}
        </ul>
      )}
      {extra}
    </section>
  )
}
