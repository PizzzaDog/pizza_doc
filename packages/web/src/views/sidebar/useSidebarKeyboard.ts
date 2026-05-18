import { useCallback, useEffect, useRef, useState } from 'react'
import type { Item } from './sidebar-items'

/**
 * Roving-tabindex keyboard controller for the sidebar tree.
 *
 *   ↑ / ↓        — move focus among visible items
 *   Home / End   — jump to first / last
 *   Enter        — caller `onActivate` (navigate)
 *   Space        — expandable: toggle; leaf: activate
 *   → / ←        — expandable: expand / collapse; leaf: no-op
 */
export function useSidebarKeyboard(
  items: Item[],
  options: {
    onToggle: (id: string) => void
    onActivate: (item: Item) => void
  },
) {
  const { onToggle, onActivate } = options
  const [focusedId, setFocusedId] = useState<string | null>(items[0]?.id ?? null)
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // Keep focus valid when the tree changes (items removed/collapsed).
  useEffect(() => {
    if (!focusedId) {
      setFocusedId(items[0]?.id ?? null)
      return
    }
    if (!items.some((i) => i.id === focusedId)) {
      setFocusedId(items[0]?.id ?? null)
    }
  }, [items, focusedId])

  const registerRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) refs.current.set(id, el)
    else refs.current.delete(id)
  }, [])

  const focus = useCallback((id: string) => {
    setFocusedId(id)
    const el = refs.current.get(id)
    if (el) el.focus()
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!focusedId) return
      const index = items.findIndex((i) => i.id === focusedId)
      if (index < 0) return
      const item = items[index]
      if (!item) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const next = items[Math.min(items.length - 1, index + 1)]
        if (next) focus(next.id)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const prev = items[Math.max(0, index - 1)]
        if (prev) focus(prev.id)
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        const first = items[0]
        if (first) focus(first.id)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        const last = items[items.length - 1]
        if (last) focus(last.id)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (item.navigateTo) onActivate(item)
        else if (item.expandable) onToggle(item.id)
        return
      }
      if (event.key === ' ') {
        event.preventDefault()
        if (item.expandable) onToggle(item.id)
        else if (item.navigateTo) onActivate(item)
        return
      }
      if (event.key === 'ArrowRight') {
        if (item.expandable && !item.expanded) {
          event.preventDefault()
          onToggle(item.id)
        }
        return
      }
      if (event.key === 'ArrowLeft') {
        if (item.expandable && item.expanded) {
          event.preventDefault()
          onToggle(item.id)
          return
        }
        // Jump to nearest ancestor with lower level.
        for (let j = index - 1; j >= 0; j--) {
          const candidate = items[j]
          if (!candidate) continue
          if (candidate.level < item.level) {
            event.preventDefault()
            focus(candidate.id)
            return
          }
        }
      }
    },
    [items, focusedId, focus, onActivate, onToggle],
  )

  return {
    focusedId,
    setFocusedId,
    registerRef,
    onKeyDown,
  }
}
