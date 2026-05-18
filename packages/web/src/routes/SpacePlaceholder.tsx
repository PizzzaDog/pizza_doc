import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SpaceCounts } from '@/store/space'
import { useSpaceStore } from '@/store/space'
import { UseCaseView } from '@/views/usecase/UseCaseView'
import type { UseCase } from '@pizza-doc/core'
import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, CircleAlert, Info, Loader2, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'

/**
 * Pick the "primary" use case to showcase on the landing canvas. Heuristic
 * only — the use case with the most steps (richest sequence diagram),
 * ties broken alphabetically by id for deterministic choice across loads.
 * Returns null when the space has no use cases.
 */
function pickPrimaryUseCase(useCases: readonly UseCase[]): UseCase | null {
  if (useCases.length === 0) return null
  const sorted = [...useCases].sort((a, b) => {
    if (b.steps.length !== a.steps.length) return b.steps.length - a.steps.length
    return a.id.localeCompare(b.id)
  })
  return sorted[0] ?? null
}

/**
 * Landing view for `/space/$spaceId`. When the space has use cases, we
 * render the first one's canvas inline so the main page looks like the
 * design mock's "Order Flow" — a sequence diagram, not a stats card.
 * When there are no use cases, we fall back to the stats block.
 */
export function SpacePlaceholder() {
  const { spaceId } = useParams({ from: '/space/$spaceId' })
  const current = useSpaceStore((s) => s.current)
  const loading = useSpaceStore((s) => s.loading)
  const loadSpace = useSpaceStore((s) => s.loadSpace)
  const detected = useSpaceStore((s) => s.detectedSpaces)

  useEffect(() => {
    if (!current && !loading && detected.some((s) => s.id === spaceId)) {
      void loadSpace(spaceId)
    }
  }, [current, loading, detected, loadSpace, spaceId])

  if (!current && !detected.some((s) => s.id === spaceId)) {
    return <NoSpacePicked requestedId={spaceId} />
  }

  if (!current) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-fg-secondary">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
        <span className="text-ui">Loading {spaceId}…</span>
      </div>
    )
  }

  // If the space has at least one use case, surface it as the default
  // canvas — mirrors the design's "Order Flow" landing. Picks the use
  // case with the most steps; ties broken alphabetically by id for
  // determinism across loads.
  const primary = pickPrimaryUseCase(current.space.useCases)
  if (primary) {
    return <UseCaseView spaceId={spaceId} useCaseId={primary.id} />
  }

  const errors = current.issues.filter((i) => i.severity === 'error').length
  const warnings = current.issues.filter((i) => i.severity === 'warning').length
  const infos = current.issues.filter((i) => i.severity === 'info').length

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-meta text-fg-tertiary transition-colors duration-120 hover:text-fg-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        Back to space list
      </Link>

      <div className="mb-6 flex items-baseline gap-3">
        <h2 className="text-content font-[450] tracking-tight text-fg-primary">
          {current.space.meta.name}
        </h2>
        <span className="font-mono text-meta text-fg-tertiary">{current.space.meta.id}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loaded</CardTitle>
          <CardDescription>
            Space loaded. Pick an entity or use case from the sidebar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Stats counts={current.counts} errors={errors} warnings={warnings} infos={infos} />
          <PassesLine passes={current.passes} />
        </CardContent>
      </Card>
    </div>
  )
}

function Stats({
  counts,
  errors,
  warnings,
  infos,
}: {
  counts: SpaceCounts
  errors: number
  warnings: number
  infos: number
}) {
  const rows: Array<[string, number | string]> = [
    ['entities', counts.entities],
    ['files', counts.files],
    ['modules', counts.modules],
    ['actors', counts.actors],
    ['components', `${counts.components} (${counts.methods} methods)`],
    ['models', counts.models],
    ['tables', counts.tables],
    ['use cases', counts.useCases],
  ]
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="text-meta text-fg-tertiary">{k}</dt>
            <dd className="font-mono text-ui text-fg-primary">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <IssueBadge icon={CircleAlert} label="errors" count={errors} tone="error" />
        <IssueBadge icon={TriangleAlert} label="warnings" count={warnings} tone="warning" />
        <IssueBadge icon={Info} label="infos" count={infos} tone="ghost" />
      </div>
    </>
  )
}

type IssueTone = 'error' | 'warning' | 'ghost'

function IssueBadge({
  icon: Icon,
  label,
  count,
  tone,
}: {
  icon: typeof CircleAlert
  label: string
  count: number
  tone: IssueTone
}) {
  const colorClass = count === 0 ? 'text-fg-tertiary' : toneClass(tone)
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-tertiary px-2 py-1">
      <Icon className={`h-3.5 w-3.5 ${colorClass}`} strokeWidth={1.5} />
      <span className="font-mono text-meta text-fg-primary">{count}</span>
      <span className="text-meta text-fg-tertiary">{label}</span>
    </div>
  )
}

function toneClass(tone: IssueTone): string {
  switch (tone) {
    case 'error':
      return 'text-error'
    case 'warning':
      return 'text-warning'
    case 'ghost':
      return 'text-fg-secondary'
  }
}

function PassesLine({ passes }: { passes: { schema: boolean; refs: boolean; semantic: boolean } }) {
  return (
    <div className="mt-3 flex items-center gap-3 text-meta text-fg-tertiary">
      <PassDot label="schema" on={passes.schema} />
      <PassDot label="refs" on={passes.refs} />
      <PassDot label="semantic" on={passes.semantic} />
    </div>
  )
}

function PassDot({ label, on }: { label: string; on: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CheckCircle2
        className={`h-3.5 w-3.5 ${on ? 'text-success' : 'text-fg-muted'}`}
        strokeWidth={1.5}
      />
      <span>{label}</span>
    </span>
  )
}

function NoSpacePicked({ requestedId }: { requestedId: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Pick a spaces folder first</CardTitle>
          <CardDescription>
            The requested space{' '}
            <span className="font-mono text-[11px] text-fg-primary">{requestedId}</span> is not in
            the current detected list. File System Access API handles don't survive a page reload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="secondary" size="sm">
            <Link to="/">
              <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              Go to picker
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
