import type { RefIndex, RefTarget, Space } from '@pizza-doc/core'
import { buildRefIndex } from '@pizza-doc/core'

export type ResolvedEntity =
  | { kind: 'actor'; target: Extract<RefTarget, { kind: 'actor' }> }
  | { kind: 'usecase'; target: Extract<RefTarget, { kind: 'usecase' }> }
  | { kind: 'module'; target: Extract<RefTarget, { kind: 'module' }> }
  | { kind: 'domain'; target: Extract<RefTarget, { kind: 'domain' }> }
  | { kind: 'component'; target: Extract<RefTarget, { kind: 'component' }> }
  | { kind: 'method'; target: Extract<RefTarget, { kind: 'method' }> }
  | { kind: 'model'; target: Extract<RefTarget, { kind: 'model' }> }
  | { kind: 'table'; target: Extract<RefTarget, { kind: 'table' }> }

export function resolveRef(index: RefIndex, ref: string): ResolvedEntity | null {
  const target = index.get(ref)
  if (!target) return null
  return { kind: target.kind, target } as ResolvedEntity
}

/** Find the enclosing module ref from any nested ref (module/domain/component/model/table). */
export function parentModuleRef(ref: string): string | null {
  const match = ref.match(/^(module:[^/]+)/)
  return match?.[1] ?? null
}

/** The parent component ref given a method ref, else null. */
export function parentComponentRef(ref: string): string | null {
  const idx = ref.indexOf('/method:')
  if (idx < 0) return null
  return ref.slice(0, idx)
}

/**
 * Convenience: build a cached ref index for a space. The caller owns the
 * cache lifetime (usually a `useMemo` keyed on the space identity).
 */
export function ensureRefIndex(space: Space): RefIndex {
  return buildRefIndex(space)
}
