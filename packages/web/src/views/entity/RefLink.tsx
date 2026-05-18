import { encodeRefForRoute } from '@/lib/entity-ref'
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'

/**
 * Render a ref URI as a clickable link that routes to the right detail view.
 *
 * The ref's top-level kind decides which route gets used:
 *   - `usecase:<id>`              → /space/$id/usecase/$useCaseId
 *   - everything else (actor/module/domain/component/model/table/method)
 *                                 → /space/$id/entity/$refPath (encoded)
 *
 * For method refs, the label defaults to `ComponentName.methodName`.
 */
export function RefLink({
  spaceId,
  refUri,
  label,
  className,
}: {
  spaceId: string
  refUri: string
  label?: string
  className?: string
}) {
  const display = label ?? defaultLabel(refUri)
  if (refUri.startsWith('usecase:')) {
    return (
      <Link
        to="/space/$spaceId/usecase/$useCaseId"
        params={{ spaceId, useCaseId: refUri.slice('usecase:'.length) }}
        className={cn(
          'font-mono text-[12px] text-accent underline-offset-2 transition-colors duration-120 hover:underline',
          className,
        )}
      >
        {display}
      </Link>
    )
  }
  return (
    <Link
      to="/space/$spaceId/entity/$refPath"
      params={{ spaceId, refPath: encodeRefForRoute(refUri) }}
      className={cn(
        'font-mono text-[12px] text-accent underline-offset-2 transition-colors duration-120 hover:underline',
        className,
      )}
    >
      {display}
    </Link>
  )
}

function defaultLabel(ref: string): string {
  // Method refs display as `Component.method`.
  const methodMatch = ref.match(/\/component:([^/]+)\/method:(.+)$/)
  if (methodMatch) return `${methodMatch[1]}.${methodMatch[2]}`
  const last = ref.split('/').pop()
  if (!last) return ref
  const colonIdx = last.indexOf(':')
  return colonIdx >= 0 ? last.slice(colonIdx + 1) : last
}
