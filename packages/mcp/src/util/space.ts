import * as fs from 'node:fs'
import * as path from 'node:path'
import { loadSpace, validate } from '@pizza-doc/core'
import type { LoadResult, Space, ValidationIssue } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'

/**
 * Resolve the target space directory from an optional argument and the
 * server's process cwd. Mirrors the CLI's discovery logic so MCP and CLI
 * agree on which space they're acting on.
 *
 * Order:
 *   - explicit arg (absolute or relative to cwd) — used as-is
 *   - cwd has `space.yaml`                       — cwd
 *   - cwd has `.pizza-doc/space.yaml`            — cwd/.pizza-doc
 *   - walk up looking for the same                — first match
 *   - throw — no space discoverable
 */
export function resolveSpaceDir(input?: string): string {
  if (input) {
    const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input)
    if (!fs.existsSync(path.join(abs, 'space.yaml'))) {
      throw new Error(`no space.yaml at ${abs}`)
    }
    return abs
  }
  let dir = path.resolve(process.cwd())
  while (true) {
    if (fs.existsSync(path.join(dir, 'space.yaml'))) return dir
    if (fs.existsSync(path.join(dir, '.pizza-doc', 'space.yaml'))) {
      return path.join(dir, '.pizza-doc')
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    'no Pizza Doc space found — pass a `spaceDir` argument or run pd-mcp from inside a project that has `.pizza-doc/` or `spaces/<id>/`.',
  )
}

/**
 * Compute the expected `meta.id` for a space directory the same way the
 * CLI does: the magic `.pizza-doc/` folder is exempt from the
 * filename↔id check, multi-space `spaces/<id>/` uses the folder name.
 */
export function expectedSpaceId(spaceDir: string): string | undefined {
  const name = path.basename(path.resolve(spaceDir))
  return name === '.pizza-doc' ? undefined : name
}

export interface LoadedSpace {
  space: Space
  spaceDir: string
  metaId: string
  issues: ValidationIssue[]
  loadResult: LoadResult
}

/**
 * Load a space and run the three-pass validator. Throws when there's no
 * parseable `space.yaml` (no point exposing further tooling on a phantom
 * space). All other validation issues are returned in `issues` so callers
 * can inspect them without an exception path.
 */
export async function loadAndValidate(spaceDir?: string): Promise<LoadedSpace> {
  const dir = resolveSpaceDir(spaceDir)
  const fs = nodeFileSystem(dir)
  const loadResult = await loadSpace(fs, '.', expectedSpaceId(dir))
  const result = validate(loadResult)
  if (!loadResult.space) {
    const first = result.issues[0]
    throw new Error(
      `failed to load space at ${dir}: ${first?.message ?? 'no space.yaml or fatal schema error'}`,
    )
  }
  return {
    space: loadResult.space,
    spaceDir: dir,
    metaId: loadResult.space.meta.id,
    issues: result.issues,
    loadResult,
  }
}
