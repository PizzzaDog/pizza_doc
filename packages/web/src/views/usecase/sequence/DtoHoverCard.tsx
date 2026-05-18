import type { Model } from '@pizza-doc/core'

/**
 * Floating popover shown when the cursor hovers a message arrow that
 * carries a `via: <DTO>`. Mirrors the Claude-Design `DtoPopover` from
 * `inspector.jsx`:
 *
 *  - 300px wide, clamped to the viewport so it never runs off-screen;
 *  - pointer-events-none so it never steals hover from the underlying row;
 *  - first 5 fields with `name : type [?]` formatting, "+N more" footer if
 *    the DTO has more;
 *  - fade-in-up animation.
 *
 * Parent owns the hover state (anchor + resolved model). Pass nulls to
 * unmount.
 */
export interface DtoHoverCardProps {
  anchor: { x: number; y: number } | null
  model: Model | null
}

const CARD_WIDTH = 300

export function DtoHoverCard({ anchor, model }: DtoHoverCardProps) {
  if (!anchor || !model) return null

  // Clamp to viewport. The design's popover sits slightly offset from the
  // cursor (anchor.x + 14) and nudges up (anchor.y - 12) so it doesn't
  // cover the row you just hovered.
  const x =
    typeof window === 'undefined'
      ? anchor.x + 14
      : Math.min(window.innerWidth - CARD_WIDTH - 12, anchor.x + 14)
  const y = Math.max(12, anchor.y - 12)

  const fields = model.fields.slice(0, 5)
  const extraCount = model.fields.length - fields.length

  return (
    <div
      className="fade-in-up pointer-events-none fixed z-40 overflow-hidden rounded-md border border-border bg-bg-elevated shadow-popover"
      style={{ left: x, top: y, width: CARD_WIDTH }}
      role="tooltip"
      aria-label={`${model.name} DTO preview`}
    >
      <header className="flex items-center gap-2 border-b border-border-subtle bg-bg-secondary px-3 py-2">
        <DtoGlyph />
        <span className="font-mono text-ui font-[550] text-fg-primary">{model.name}</span>
        <span className="ml-auto rounded-sm bg-accent-muted px-1.5 py-0.5 font-mono text-[10px] font-[600] uppercase tracking-wider text-accent">
          {model.modelKind}
        </span>
      </header>
      <div className="px-3 py-2">
        {fields.length === 0 ? (
          <p className="font-mono text-meta text-fg-tertiary">(no fields)</p>
        ) : (
          <ul className="flex flex-col">
            {fields.map((f) => (
              <li
                key={f.name}
                className="grid grid-cols-[auto_1fr_auto] items-baseline gap-2 border-b border-border-subtle py-1 last:border-b-0 font-mono text-meta"
              >
                <span className="text-fg-primary">{f.name}</span>
                <span className="text-fg-muted" />
                <span className="text-accent">
                  {f.type}
                  {f.optional ? '?' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {extraCount > 0 ? (
          <p className="mt-1.5 font-mono text-[10px] text-fg-tertiary">+{extraCount} more…</p>
        ) : null}
        <p className="mt-1.5 text-[10px] text-fg-muted">Click arrow to open full panel</p>
      </div>
    </div>
  )
}

// Tiny inline DTO glyph — matches the design's stacked-lines icon without
// pulling another lucide import for a single use.
function DtoGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-fg-tertiary"
      role="img"
      aria-hidden
    >
      <title>DTO</title>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}
