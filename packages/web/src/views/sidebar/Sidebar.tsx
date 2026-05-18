import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { decodeRefFromRoute } from '@/lib/entity-ref'
import { buildIssueIndex } from '@/lib/issue-index'
import { cn } from '@/lib/utils'
import { useSpaceStore } from '@/store/space'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Pin, PinOff } from 'lucide-react'
import { useMemo } from 'react'
import { SidebarRow } from './SidebarRow'
import { type Item, buildSidebarItems } from './sidebar-items'
import { useSidebarKeyboard } from './useSidebarKeyboard'

export function Sidebar({ spaceId }: { spaceId: string }) {
  const current = useSpaceStore((s) => s.current)
  const expanded = useSpaceStore((s) => s.expandedNodes)
  const toggleNode = useSpaceStore((s) => s.toggleNode)
  const navigate = useNavigate()

  const selectedRef = useSelectedEntityRef()

  const items = useMemo<Item[]>(() => {
    if (!current) return []
    const issues = buildIssueIndex(current.space, current.issues)
    return buildSidebarItems({ space: current.space, issues, expanded })
  }, [current, expanded])

  const { focusedId, setFocusedId, registerRef, onKeyDown } = useSidebarKeyboard(items, {
    onToggle: toggleNode,
    onActivate: (item) => {
      if (!item.navigateTo) return
      if (item.navigateTo.route === 'usecase') {
        navigate({
          to: '/space/$spaceId/usecase/$useCaseId',
          params: { spaceId, useCaseId: item.navigateTo.useCaseId },
        })
      } else {
        navigate({
          to: '/space/$spaceId/entity/$refPath',
          params: { spaceId, refPath: item.navigateTo.refPath },
        })
      }
    },
  })

  return (
    <aside
      aria-label="Space navigation"
      className="flex h-full min-w-0 flex-col border-r border-border-subtle bg-bg-secondary"
    >
      <SpaceHeader name={current?.space.meta.name ?? spaceId} id={spaceId} />
      <div role="tree" aria-label="Entities" onKeyDown={onKeyDown} className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-0.5 px-2 py-3 pb-6">
            {items.map((item) => (
              <SidebarRow
                key={item.id}
                item={item}
                focused={focusedId === item.id}
                selected={selectedRef === item.entityRef && item.entityRef !== null}
                onFocus={() => setFocusedId(item.id)}
                onActivate={() => {
                  setFocusedId(item.id)
                  if (!item.navigateTo) return
                  if (item.navigateTo.route === 'usecase') {
                    navigate({
                      to: '/space/$spaceId/usecase/$useCaseId',
                      params: { spaceId, useCaseId: item.navigateTo.useCaseId },
                    })
                  } else {
                    navigate({
                      to: '/space/$spaceId/entity/$refPath',
                      params: { spaceId, refPath: item.navigateTo.refPath },
                    })
                  }
                }}
                onToggle={() => {
                  setFocusedId(item.id)
                  if (item.expandable) toggleNode(item.id)
                }}
                registerRef={registerRef}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  )
}

function SpaceHeader({ name, id }: { name: string; id: string }) {
  const sidebarMode = useSpaceStore((s) => s.sidebarMode)
  const togglePin = useSpaceStore((s) => s.toggleSidebarPin)
  const pinned = sidebarMode === 'pinned'
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle bg-bg-secondary px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-[700] leading-5 text-fg-primary" title={name}>
          {name}
        </p>
        <p className="truncate font-mono text-[11px] text-fg-tertiary" title={id}>
          {id}
        </p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={togglePin}
            aria-pressed={pinned}
            aria-label={pinned ? 'Unpin sidebar (auto-hide)' : 'Pin sidebar'}
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-all duration-160',
              pinned
                ? 'border-accent/30 bg-accent-muted text-accent'
                : 'border-border-subtle text-fg-tertiary hover:border-border hover:bg-bg-tertiary hover:text-fg-primary',
            )}
          >
            {pinned ? (
              <Pin className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <PinOff className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{pinned ? 'Unpin sidebar (auto-hide)' : 'Pin sidebar'}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * Reads the currently-selected entity/usecase ref out of the router state so
 * the sidebar can highlight it. For the usecase route we synthesize a
 * `usecase:<id>` ref so highlight matching works uniformly.
 */
function useSelectedEntityRef(): string | null {
  const match = useRouterState({
    select: (state) => {
      const last = state.matches[state.matches.length - 1]
      if (!last) return null
      return { routeId: last.routeId, params: last.params as Record<string, string> }
    },
  })
  if (!match) return null
  if (match.routeId.endsWith('/entity/$refPath') && match.params.refPath) {
    return decodeRefFromRoute(match.params.refPath)
  }
  if (match.routeId.endsWith('/usecase/$useCaseId') && match.params.useCaseId) {
    return `usecase:${match.params.useCaseId}`
  }
  return null
}
