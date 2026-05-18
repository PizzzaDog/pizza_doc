import type { UsageIndex } from '@/lib/usage-index'
import type { Actor, ValidationIssue } from '@pizza-doc/core'
import { EntityHeader } from './EntityHeader'
import { EntityIssues } from './EntityIssues'
import { UsedInPanel } from './UsedInPanel'
import { ViewShell } from './ViewShell'

export function ActorView({
  spaceId,
  actor,
  usage,
  issues,
}: {
  spaceId: string
  actor: Actor
  usage: UsageIndex
  issues: ValidationIssue[]
}) {
  const ref = `actor:${actor.id}`
  const useCases = usage.useCasesByActor.get(ref) ?? []
  return (
    <ViewShell
      header={
        <EntityHeader
          spaceId={spaceId}
          name={actor.name}
          typeLabel={actor.type}
          subtitle={ref}
          description={actor.description}
          crumbs={[
            { label: 'Space', to: { route: 'space' } },
            { label: 'Actors' },
            { label: actor.id },
          ]}
        />
      }
      main={
        <>
          {issues.length > 0 ? <EntityIssues issues={issues} /> : null}
          <UsedInPanel
            title="Triggers use cases"
            spaceId={spaceId}
            refs={useCases}
            empty="Not yet referenced by any use case."
          />
        </>
      }
      aside={<RawRef refUri={ref} />}
    />
  )
}

function RawRef({ refUri }: { refUri: string }) {
  return (
    <section aria-label="Reference">
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wide text-fg-tertiary">
        Reference URI
      </h3>
      <p className="break-all font-mono text-[12px] text-fg-secondary">{refUri}</p>
    </section>
  )
}
