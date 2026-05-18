import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { type BundledSpaceSummary, listBundledSpaces } from '@/fs/bundled-spaces'
import { isFileSystemAccessSupported } from '@/fs/is-supported'
import { useSpaceStore } from '@/store/space'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, FolderOpen, History, Loader2, Package } from 'lucide-react'
import { Unsupported } from './Unsupported'

export function Home() {
  const supported = isFileSystemAccessSupported()
  const navigate = useNavigate()
  const root = useSpaceStore((s) => s.root)
  const detectedSpaces = useSpaceStore((s) => s.detectedSpaces)
  const loading = useSpaceStore((s) => s.loading)
  const error = useSpaceStore((s) => s.error)
  const pickRoot = useSpaceStore((s) => s.pickRoot)
  const clearRoot = useSpaceStore((s) => s.clearRoot)
  const pendingRestoreName = useSpaceStore((s) => s.pendingRestoreName)
  const reopenLastRoot = useSpaceStore((s) => s.reopenLastRoot)

  if (!supported && root?.source !== 'server') return <Unsupported />

  const bundled = listBundledSpaces()
  const goToSpace = (id: string) => navigate({ to: '/space/$spaceId', params: { spaceId: id } })

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-[450] tracking-tight text-fg-primary">Pizza Doc</h1>
        <p className="mt-1 text-ui text-fg-secondary">File-based architecture-as-code.</p>
      </div>

      {/* Bundled spaces first — zero-click, always available. */}
      {bundled.length > 0 ? <BundledList spaces={bundled} onOpen={goToSpace} /> : null}

      {/* Then the FSA picker — required for editing. */}
      {!root ? (
        <IntroCard
          onPick={pickRoot}
          loading={loading}
          pendingRestoreName={pendingRestoreName}
          onReopenLast={reopenLastRoot}
        />
      ) : (
        <DetectedList
          rootName={root.name}
          spaces={detectedSpaces}
          loading={loading}
          onReset={clearRoot}
          onOpen={goToSpace}
        />
      )}

      {error ? (
        <p className="text-ui text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function BundledList({
  spaces,
  onOpen,
}: {
  spaces: BundledSpaceSummary[]
  onOpen: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Bundled spaces</CardTitle>
            <CardDescription>
              Shipped with this build from{' '}
              <span className="font-mono text-[11px] text-fg-primary">spaces/</span>. Read-only —
              pick a folder below to edit.
            </CardDescription>
          </div>
          <Badge variant="ghost">
            <Package className="mr-1 h-3 w-3" strokeWidth={1.5} />
            {spaces.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {spaces.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors duration-120 hover:bg-bg-tertiary"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-ui text-fg-primary">{s.name}</span>
                  {s.name !== s.id ? (
                    <span className="font-mono text-meta text-fg-tertiary">{s.id}</span>
                  ) : null}
                </div>
                <ChevronRight
                  className="h-4 w-4 text-fg-tertiary transition-colors group-hover:text-fg-primary"
                  strokeWidth={1.5}
                />
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function IntroCard({
  onPick,
  loading,
  pendingRestoreName,
  onReopenLast,
}: {
  onPick: () => void
  loading: boolean
  pendingRestoreName: string | null
  onReopenLast: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Open a folder to edit</CardTitle>
        <CardDescription>
          Pick a folder that contains one or more spaces. Each subdirectory with a
          <span className="mx-1 font-mono text-[11px] text-fg-primary">space.yaml</span>
          shows up as an opener.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        {pendingRestoreName ? (
          <Button onClick={onReopenLast} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <History className="h-4 w-4" strokeWidth={1.5} />
            )}
            Reopen {pendingRestoreName}/
          </Button>
        ) : null}
        <Button
          onClick={onPick}
          disabled={loading}
          variant={pendingRestoreName ? 'ghost-subtle' : 'default'}
        >
          {loading && !pendingRestoreName ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <FolderOpen className="h-4 w-4" strokeWidth={1.5} />
          )}
          {pendingRestoreName ? 'Choose different folder' : 'Choose folder'}
        </Button>
      </CardContent>
    </Card>
  )
}

function DetectedList({
  rootName,
  spaces,
  loading,
  onReset,
  onOpen,
}: {
  rootName: string
  spaces: Array<{ id: string }>
  loading: boolean
  onReset: () => void
  onOpen: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Detected spaces</CardTitle>
            <CardDescription>
              in <span className="font-mono text-[11px] text-fg-primary">{rootName}/</span>
            </CardDescription>
          </div>
          <Button variant="ghost-subtle" size="sm" onClick={onReset}>
            Change folder
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {spaces.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-1">
            {spaces.map((space) => (
              <li key={space.id}>
                <button
                  type="button"
                  onClick={() => onOpen(space.id)}
                  disabled={loading}
                  className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors duration-120 hover:bg-bg-tertiary disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-meta text-fg-tertiary">{space.id}</span>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 text-fg-tertiary transition-colors group-hover:text-fg-primary"
                    strokeWidth={1.5}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-subtle px-4 py-6 text-center">
      <p className="text-ui text-fg-secondary">No Pizza Doc spaces found in this folder.</p>
      <p className="text-meta text-fg-tertiary">
        Each space is a subdirectory with a <span className="font-mono">space.yaml</span> inside.
      </p>
    </div>
  )
}
