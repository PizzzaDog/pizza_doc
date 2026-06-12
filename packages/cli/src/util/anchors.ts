import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Space } from '@pizza-doc/core'
import { allComponents, allModels, allSourceRefs, allTables } from './space-walk.js'

/**
 * Shared sourceRef-resolution core, used by both `pd anchors` (the
 * standalone deterministic checker) and `pd readiness` (the production
 * gate). Kept out of `@pizza-doc/core` on purpose: resolving an anchor
 * reads real source files on disk, and the core package is pure — it only
 * ever sees the parsed space, never the code it describes.
 */

export interface AnchorIssue {
  severity: 'broken' | 'stale-line' | 'missing'
  /** Human-readable owner label, e.g. `module:api/model:User/field:id`. */
  ref: string
  /** The raw sourceRef string, when the issue stems from one. */
  sourceRef?: string
  reason: string
}

export interface AnchorResult {
  codeRoot: string
  /** How many sourceRef anchors were inspected. */
  checked: number
  /** How many resolved to a real file (stale-line counts as resolved). */
  resolved: number
  /** broken + stale-line issues. `missing` is computed separately. */
  issues: AnchorIssue[]
}

/**
 * Split a `sourceRef` into a file path and optional 1-based line. Only a
 * trailing `:<digits>` segment is treated as a line number, so
 * `src/Foo.ts:42` → line 42 while `src/Foo.ts` (or a Windows `C:\...`
 * authored path) keeps its colons in the path.
 */
export function parseSourceRef(sourceRef: string): { filePath: string; line?: number } {
  const m = sourceRef.match(/^(.*):(\d+)$/)
  if (m?.[1] && m[2]) return { filePath: m[1], line: Number.parseInt(m[2], 10) }
  return { filePath: sourceRef }
}

/**
 * Resolve every `sourceRef` in the space against `codeRoot`: the file must
 * exist, and a cited `:line` must be in range. Pure of CLI/printing
 * concerns so both the command and the readiness gate can share it.
 */
export function resolveAnchors(space: Space, codeRoot: string): AnchorResult {
  const issues: AnchorIssue[] = []
  const lineCache = new Map<string, number | null>() // abs path → line count, or null if unreadable
  let checked = 0
  let resolved = 0

  for (const { ref, sourceRef } of allSourceRefs(space)) {
    checked++
    const { filePath, line } = parseSourceRef(sourceRef)
    const abs = path.resolve(codeRoot, filePath)
    if (!fs.existsSync(abs)) {
      issues.push({ severity: 'broken', ref, sourceRef, reason: 'file not found' })
      continue
    }
    if (line !== undefined) {
      const count = countLines(abs, lineCache)
      if (count !== null && line > count) {
        issues.push({
          severity: 'stale-line',
          ref,
          sourceRef,
          reason: `line ${line} > ${count} lines in file`,
        })
        // The file still exists — a stale line is a warning, not a failure.
        resolved++
        continue
      }
    }
    resolved++
  }

  return { codeRoot, checked, resolved, issues }
}

/** Component / model / table entities that carry no sourceRef at all. */
export function collectMissingAnchors(space: Space): AnchorIssue[] {
  const out: AnchorIssue[] = []
  for (const { component, ref } of allComponents(space)) {
    if (!component.sourceRef) out.push({ severity: 'missing', ref, reason: 'no sourceRef' })
  }
  for (const { model, ref } of allModels(space)) {
    if (!model.sourceRef) out.push({ severity: 'missing', ref, reason: 'no sourceRef' })
  }
  for (const { table, ref } of allTables(space)) {
    if (!table.sourceRef) out.push({ severity: 'missing', ref, reason: 'no sourceRef' })
  }
  return out
}

/** git toplevel of `dir`, or null when not in a repo / git is absent. */
export function gitToplevel(dir: string): string | null {
  try {
    const top = execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return top || null
  } catch {
    return null
  }
}

function countLines(abs: string, cache: Map<string, number | null>): number | null {
  const cached = cache.get(abs)
  if (cached !== undefined) return cached
  let count: number | null
  try {
    count = fs.readFileSync(abs, 'utf8').split('\n').length
  } catch {
    count = null
  }
  cache.set(abs, count)
  return count
}
