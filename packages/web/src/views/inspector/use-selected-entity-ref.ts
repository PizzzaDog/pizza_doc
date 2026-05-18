import { decodeRefFromRoute } from '@/lib/entity-ref'
import { useSpaceStore } from '@/store/space'
import { useRouterState } from '@tanstack/react-router'

/**
 * What the inspector should show. Resolution order:
 *   1. Canvas selection (`selectedGraphRef`) wins when it points at an
 *      entity — takes precedence even while on an entity route, so clicking
 *      a canvas node always updates the inspector without a URL change.
 *   2. Otherwise the URL decides: /entity/$refPath or /usecase/$useCaseId.
 *
 * Edge selections (`step-*` ids) currently fall through to the URL target;
 * the dedicated edge inspector is a Phase 9+ polish.
 */
export function useSelectedEntityRef(): string | null {
  const selectedGraphRef = useSpaceStore((s) => s.selectedGraphRef)
  const routeRef = useRouterState({
    select: (state) => {
      const last = state.matches[state.matches.length - 1]
      if (!last) return null
      return { routeId: last.routeId, params: last.params as Record<string, string> }
    },
  })

  if (selectedGraphRef && !selectedGraphRef.startsWith('step-')) {
    return selectedGraphRef
  }
  if (!routeRef) return null
  if (routeRef.routeId.endsWith('/entity/$refPath') && routeRef.params.refPath) {
    return decodeRefFromRoute(routeRef.params.refPath)
  }
  if (routeRef.routeId.endsWith('/usecase/$useCaseId') && routeRef.params.useCaseId) {
    return `usecase:${routeRef.params.useCaseId}`
  }
  return null
}
