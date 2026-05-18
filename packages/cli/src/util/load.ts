import * as path from 'node:path'
import { loadSpace, validate } from '@pizza-doc/core'
import type { LoadResult, Space, ValidationIssue } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'
import { expectedSpaceId } from './space-path.js'

export interface LoadedSpace {
  space: Space
  id: string
  dir: string
  issues: ValidationIssue[]
  loadResult: LoadResult
}

/**
 * Load + validate a space. Throws with a readable message when the space
 * has schema errors bad enough that a non-null `Space` can't be constructed
 * — no point running `coverage` on something that doesn't parse.
 */
export async function loadSpaceForCli(dir: string): Promise<LoadedSpace> {
  const abs = path.resolve(dir)
  const fs = nodeFileSystem(abs)
  const loadResult = await loadSpace(fs, '.', expectedSpaceId(abs))
  const result = validate(loadResult)
  if (!loadResult.space) {
    const first = result.issues[0]
    throw new Error(
      `failed to load space at ${abs}: ${first?.message ?? 'no space.yaml or fatal schema error'}`,
    )
  }
  return {
    space: loadResult.space,
    id: loadResult.space.meta.id,
    dir: abs,
    issues: result.issues,
    loadResult,
  }
}
