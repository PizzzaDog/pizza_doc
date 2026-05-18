import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Walk up from `cwd` until we find one of:
 *   - a directory containing `space.yaml`  → we are *inside* the space dir
 *   - a directory containing `.pizza-doc/space.yaml` → single-space project
 *     (default layout from `pd init`); the space dir is `<dir>/.pizza-doc`
 *   - a directory containing `spaces/`     → multi-space monorepo (legacy /
 *     opt-in via `pd init --multi`)
 *
 * Single-space `.pizza-doc/` is preferred over `spaces/` if both happen to
 * exist (mid-migration edge case). Callers that need a specific space in a
 * monorepo disambiguate via `--space <id>` or a positional path.
 */
export function findSpaceRoot(
  start: string = process.cwd(),
): { kind: 'space'; path: string } | { kind: 'monorepo'; path: string } | null {
  let dir = path.resolve(start)
  while (true) {
    if (fs.existsSync(path.join(dir, 'space.yaml'))) {
      return { kind: 'space', path: dir }
    }
    if (fs.existsSync(path.join(dir, '.pizza-doc', 'space.yaml'))) {
      return { kind: 'space', path: path.join(dir, '.pizza-doc') }
    }
    if (fs.existsSync(path.join(dir, 'spaces'))) {
      return { kind: 'monorepo', path: dir }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export function resolveSpaceDir(input: string | undefined): string {
  // Explicit path wins: `pd validate spaces/restik` or `pd validate .pizza-doc`.
  if (input) {
    const abs = path.resolve(input)
    if (!fs.existsSync(path.join(abs, 'space.yaml'))) {
      throw new Error(`no space.yaml at ${abs}`)
    }
    return abs
  }
  // No arg: try to infer from cwd.
  const found = findSpaceRoot()
  if (!found) {
    throw new Error('no space found — run inside a space or pass the directory')
  }
  if (found.kind === 'space') return found.path
  throw new Error(
    `cwd is a multi-space monorepo root (${found.path}), not a specific space. Pass one: pd <command> spaces/<id>`,
  )
}

/**
 * Compute the expected `meta.id` for a space directory based on convention.
 *
 * For the single-space `.pizza-doc/` layout the folder name is a magic
 * marker, not the id — `meta.id` is whatever the user picked, so we return
 * `undefined` and skip the filename↔id check in the validator.
 *
 * For multi-space `spaces/<id>/`, the folder basename is the expected id.
 */
export function expectedSpaceId(spaceDir: string): string | undefined {
  const name = path.basename(path.resolve(spaceDir))
  return name === '.pizza-doc' ? undefined : name
}

/**
 * List space ids living inside a multi-space monorepo root (i.e. `spaces/`).
 * Single-space projects use `.pizza-doc/` and are returned by `findSpaceRoot`
 * directly, not via this function.
 */
export function listSpacesIn(monorepoRoot: string): string[] {
  const spacesDir = path.join(monorepoRoot, 'spaces')
  if (!fs.existsSync(spacesDir)) return []
  return fs
    .readdirSync(spacesDir)
    .filter((name) => fs.existsSync(path.join(spacesDir, name, 'space.yaml')))
    .sort()
}
