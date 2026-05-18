import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSpaceStore } from '@/store/space'
import { Link } from '@tanstack/react-router'
import { SequenceCanvas } from './sequence/SequenceCanvas'

export function UseCaseView({ spaceId, useCaseId }: { spaceId: string; useCaseId: string }) {
  const current = useSpaceStore((s) => s.current)

  if (!current) {
    return <MissingState spaceId={spaceId} message="Loading space…" />
  }
  const useCase = current.space.useCases.find((u) => u.id === useCaseId)
  if (!useCase) {
    return (
      <MissingState
        spaceId={spaceId}
        message={`No use case with id '${useCaseId}' in ${current.space.meta.id}.`}
      />
    )
  }
  const ref = `usecase:${useCase.id}`

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      {/* Slim canvas header — just the use-case name + its ref URI. The
          description + actor crumb used to live here but pushed the
          canvas a third of the way down the screen; they're reachable
          via the right-panel inspector when a node is selected. */}
      <header className="flex shrink-0 items-baseline gap-3 border-b border-border-subtle bg-bg-secondary/70 px-4 py-3 backdrop-blur-xl">
        <h1 className="truncate text-content font-[600] tracking-tight text-fg-primary">
          {useCase.name}
        </h1>
        <span
          className="rounded-md border border-border-subtle bg-bg-tertiary/60 px-2 py-0.5 font-mono text-meta text-fg-tertiary"
          title={ref}
        >
          {ref}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <SequenceCanvas useCase={useCase} space={current.space} />
      </div>
    </div>
  )
}

function MissingState({ spaceId, message }: { spaceId: string; message: string }) {
  return (
    <div className="mx-auto max-w-md px-8 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Use case unavailable</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" size="sm">
            <Link to="/space/$spaceId" params={{ spaceId }}>
              Back to space
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
