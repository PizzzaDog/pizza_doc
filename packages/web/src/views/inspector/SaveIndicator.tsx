import type { SaveStatus } from '@/store/space'
import { Check, Loader2, TriangleAlert } from 'lucide-react'

/**
 * Subtle save-state indicator that sits in the inspector header. Stays empty
 * when idle so the header doesn't twitch on every focus change.
 */
export function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  if (status === 'saving') {
    return (
      <span
        aria-live="polite"
        className="inline-flex items-center gap-1 text-meta text-fg-tertiary"
      >
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> Saving…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span aria-live="polite" className="inline-flex items-center gap-1 text-meta text-success">
        <Check className="h-3 w-3" strokeWidth={1.5} /> Saved
      </span>
    )
  }
  return (
    <span aria-live="polite" className="inline-flex items-center gap-1 text-meta text-error">
      <TriangleAlert className="h-3 w-3" strokeWidth={1.5} /> Failed
    </span>
  )
}
