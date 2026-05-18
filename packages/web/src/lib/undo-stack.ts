/**
 * Snapshot stack for undo/redo. A snapshot captures just enough of the
 * current space to roll the space + on-disk files back:
 *   - `space` object (a structurally-cloned deep copy)
 *   - `sourceByPath` (map of file-path → raw YAML text at snapshot time)
 *
 * When we apply a snapshot we restore the in-memory space AND write each
 * path's source back to disk (only the files that actually differ from the
 * current on-disk source get rewritten — the caller does that diff).
 */

import type { Space } from '@pizza-doc/core'

export interface Snapshot {
  space: Space
  sourceByPath: Map<string, string>
  at: number
}

export interface UndoStack {
  past: Snapshot[]
  future: Snapshot[]
}

export const MAX_SNAPSHOTS = 50

export function emptyStack(): UndoStack {
  return { past: [], future: [] }
}

/**
 * Push a pre-mutation snapshot onto the past stack, clearing redo. Trims
 * the past to MAX_SNAPSHOTS by dropping the oldest.
 */
export function pushPast(stack: UndoStack, snapshot: Snapshot): UndoStack {
  const past = [...stack.past, snapshot]
  while (past.length > MAX_SNAPSHOTS) past.shift()
  return { past, future: [] }
}

export function undo(
  stack: UndoStack,
  current: Snapshot,
): { stack: UndoStack; snapshot: Snapshot } | null {
  if (stack.past.length === 0) return null
  const next = stack.past[stack.past.length - 1]
  if (!next) return null
  return {
    stack: {
      past: stack.past.slice(0, -1),
      future: [...stack.future, current].slice(-MAX_SNAPSHOTS),
    },
    snapshot: next,
  }
}

export function redo(
  stack: UndoStack,
  current: Snapshot,
): { stack: UndoStack; snapshot: Snapshot } | null {
  if (stack.future.length === 0) return null
  const next = stack.future[stack.future.length - 1]
  if (!next) return null
  return {
    stack: {
      past: [...stack.past, current].slice(-MAX_SNAPSHOTS),
      future: stack.future.slice(0, -1),
    },
    snapshot: next,
  }
}

export function clearRedo(stack: UndoStack): UndoStack {
  if (stack.future.length === 0) return stack
  return { past: stack.past, future: [] }
}

/**
 * Structured-clone a Space. Our schemas produce plain JS objects, so
 * `structuredClone` handles everything. Falls back to JSON on older
 * environments, but modern Chromium covers FSA.
 */
export function cloneSpace(space: Space): Space {
  return structuredClone(space)
}
