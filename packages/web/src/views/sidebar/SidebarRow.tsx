import { cn } from '@/lib/utils'
import { Bot, ChevronDown, ChevronRight, Clock, UserRound } from 'lucide-react'
import * as React from 'react'
import { EntryContextMenu } from './EntryContextMenu'
import { ModuleKindIcon, ModuleKindPill, TypeBadge } from './TypeBadge'
import { ValidationDot } from './ValidationDot'
import type { Item } from './sidebar-items'

interface Props {
  item: Item
  focused: boolean
  selected: boolean
  onFocus: () => void
  onActivate: () => void
  onToggle: () => void
  registerRef: (id: string, el: HTMLButtonElement | null) => void
}

/**
 * One row. Uses <div role="treeitem"> (not <button>) so ARIA tree semantics
 * match the WAI-ARIA Tree Pattern and biome's a11y rules don't flag
 * button-with-non-button-role. All keyboard nav is handled by the parent's
 * useSidebarKeyboard onKeyDown listener. The inner chevron is a real <button>
 * for the chevron-only click target page 06 calls for.
 */
export const SidebarRow = React.memo(function SidebarRow({
  item,
  focused,
  selected,
  onFocus,
  onActivate,
  onToggle,
  registerRef,
}: Props) {
  // The roving-tabindex focus target lives on a button we keep invisible to
  // layout. Register it so parent can .focus() the correct row.
  const invisibleRef = React.useCallback(
    (el: HTMLButtonElement | null) => registerRef(item.id, el),
    [registerRef, item.id],
  )

  if (item.kind === 'empty') {
    return (
      <div
        className="pointer-events-none flex items-center px-3 py-1 text-meta text-fg-muted"
        style={{ paddingLeft: `${12 + item.indent}px` }}
      >
        {item.label}
      </div>
    )
  }

  if (item.kind === 'section') {
    return (
      <div
        role="treeitem"
        aria-expanded={item.expanded}
        aria-label={`section ${item.label}`}
        tabIndex={focused ? 0 : -1}
        onFocus={onFocus}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
        data-focused={focused ? '' : undefined}
        className={cn(
          'group mt-4 flex w-full cursor-pointer select-none items-center gap-2 px-2 py-1 text-[11px] font-mono uppercase tracking-wide text-fg-tertiary first:mt-0',
          'transition-colors duration-120 hover:text-fg-primary',
          'focus-visible:outline-none focus-visible:ring-focus rounded-sm',
        )}
      >
        <button
          ref={invisibleRef}
          type="button"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onFocus={onFocus}
        />
        <Chevron expanded={item.expanded} />
        <span>{item.label}</span>
        <span className="ml-auto">
          <ValidationDot severity={item.severity} />
        </span>
      </div>
    )
  }

  const body = (
    <div
      role="treeitem"
      aria-expanded={item.expandable ? item.expanded : undefined}
      aria-current={selected ? 'page' : undefined}
      aria-label={ariaLabel(item)}
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onClick={(event) => {
        // Chevron button handles its own click via stopPropagation; anything
        // else on this row activates (or toggles if the row has no target).
        if ((event.target as HTMLElement).closest('[data-chevron-button]')) return
        if (item.navigateTo) onActivate()
        else if (item.expandable) onToggle()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          if (item.navigateTo) onActivate()
          else if (item.expandable) onToggle()
        } else if (event.key === ' ') {
          event.preventDefault()
          if (item.expandable) onToggle()
          else if (item.navigateTo) onActivate()
        }
      }}
      data-focused={focused ? '' : undefined}
      className={cn(
        'group relative flex min-h-9 w-full cursor-pointer select-none items-center gap-2 rounded-md pr-2 text-left text-[14px] leading-5 text-fg-secondary',
        item.kind === 'usecase' &&
          item.touchedModuleTypes.length > 0 &&
          'min-h-14 items-start pt-2',
        'transition-all duration-160',
        'hover:bg-white/[0.045] hover:text-fg-primary',
        selected && 'bg-bg-tertiary text-fg-primary ring-1 ring-border',
        'focus-visible:outline-none focus-visible:ring-focus',
      )}
      style={
        {
          paddingLeft: `${12 + item.indent}px`,
          '--sidebar-indent': `${item.indent}px`,
        } as React.CSSProperties
      }
    >
      <button
        ref={invisibleRef}
        type="button"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onFocus={onFocus}
      />

      {item.expandable ? (
        <button
          type="button"
          tabIndex={-1}
          data-chevron-button
          aria-label={item.expanded ? 'collapse' : 'expand'}
          onClick={(event) => {
            event.stopPropagation()
            onToggle()
          }}
          className="flex h-5 w-5 items-center justify-center text-fg-tertiary transition-colors duration-120 hover:text-fg-primary"
        >
          <Chevron expanded={item.expanded} />
        </button>
      ) : (
        <span className="flex h-5 w-5 items-center justify-center" aria-hidden>
          <Dot />
        </span>
      )}

      {item.kind === 'module' ? <ModuleKindIcon type={item.moduleType} /> : null}
      {item.kind === 'actor' || item.kind === 'actor-group' ? (
        <ActorGlyph type={item.actorType} />
      ) : null}

      <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-[600]">{item.label}</span>

      {item.kind === 'module' ? <TypeBadge type={item.moduleType} /> : null}
      {item.kind === 'element-group' ? (
        <span className="text-[11px] text-fg-tertiary">({item.count})</span>
      ) : null}
      {item.kind === 'component' && item.participation > 0 ? (
        <span
          aria-label={`appears in ${item.participation} use cases`}
          className="text-[12px] font-mono text-fg-tertiary"
        >
          ×{item.participation}
        </span>
      ) : null}

      <span
        className={cn(
          item.kind === 'usecase' && item.touchedModuleTypes.length > 0 ? 'ml-1' : 'ml-auto',
        )}
      >
        <ValidationDot severity={item.severity} />
      </span>

      {item.kind === 'usecase' && item.touchedModuleTypes.length > 0 ? (
        <span className="absolute left-[calc(12px+var(--sidebar-indent)+28px)] top-[30px] flex max-w-[132px] items-center gap-1 overflow-hidden">
          {item.touchedModuleTypes.map((type) => (
            <ModuleKindPill key={type} type={type} />
          ))}
        </span>
      ) : null}
    </div>
  )

  if (!item.entityRef) return body

  return (
    <EntryContextMenu entityRef={item.entityRef} label={item.label}>
      {body}
    </EntryContextMenu>
  )
})

function Chevron({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <ChevronDown className="h-4 w-4" strokeWidth={1.7} />
  ) : (
    <ChevronRight className="h-4 w-4" strokeWidth={1.7} />
  )
}

function Dot() {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-fg-muted/70" />
}

function ActorGlyph({ type }: { type: 'user' | 'system' | 'scheduler' }) {
  const Icon = type === 'system' ? Bot : type === 'scheduler' ? Clock : UserRound
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-fg-muted/40 bg-bg-tertiary/80 text-fg-secondary"
    >
      <Icon className="h-4 w-4" strokeWidth={1.7} />
    </span>
  )
}

function ariaLabel(item: Item): string {
  switch (item.kind) {
    case 'usecase':
      return `use case ${item.label}`
    case 'actor':
      return `actor ${item.label}`
    case 'actor-group':
      return `actor group ${item.label}`
    case 'module':
      return `module ${item.label} (${item.moduleType})`
    case 'domain':
      return `domain ${item.label}`
    case 'element-group':
      return `${item.label} group, ${item.count} items`
    case 'component':
      return `component ${item.label} (${item.componentType})`
    case 'model':
      return `model ${item.label}`
    case 'table':
      return `table ${item.label}`
    default:
      return item.label
  }
}
