import type { FileSystem } from '@pizza-doc/core'

/**
 * Bundled spaces. Every subdirectory of `<repo>/spaces/*` that has a
 * `space.yaml` is inlined into the web bundle at build time via
 * `import.meta.glob(..., eager: true, as: 'raw')`.
 *
 * This exists because the File System Access API needs a user gesture every
 * session — forcing the "Choose folder" dance on anyone who's just running
 * the app against its own spaces is silly. The bundled set is a zero-click
 * list rendered on Home; the picker still handles arbitrary external
 * folders.
 *
 * All bundled spaces are **read-only**. `writeFile` throws; the store
 * surfaces that as a toast when edits are attempted.
 */

// Paths are relative to this file (packages/web/src/fs/). Repo layout:
//   pizza-doc/
//     packages/web/src/fs/bundled-spaces.ts   ← this file
//     spaces/<id>/**/*.yaml
// So `../../../../spaces/*/**/*.yaml` reaches every space's files.
const rawFiles = import.meta.glob('../../../../spaces/*/**/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const GLOB_PREFIX = '../../../../spaces/'

/**
 * Files grouped by space id. Key = space id (folder name right under
 * `spaces/`). Value = map of space-root-relative path → file contents.
 * A space is only surfaced to the UI if it has a `space.yaml` at its root.
 */
const bundled: Record<string, Record<string, string>> = (() => {
  const out: Record<string, Record<string, string>> = {}
  for (const [globPath, contents] of Object.entries(rawFiles)) {
    if (!globPath.startsWith(GLOB_PREFIX)) continue
    const rest = globPath.slice(GLOB_PREFIX.length)
    const slash = rest.indexOf('/')
    if (slash < 0) continue
    const id = rest.slice(0, slash)
    const relative = rest.slice(slash + 1)
    const spaceFiles = out[id] ?? {}
    spaceFiles[relative] = contents
    out[id] = spaceFiles
  }
  // Only keep spaces that actually have a space.yaml — otherwise it's not
  // a loadable space, and showing it in the picker would dead-end.
  for (const id of Object.keys(out)) {
    const files = out[id]
    if (!files || !files['space.yaml']) delete out[id]
  }
  return out
})()

/** Back-compat: callers previously imported this id. Keep pointing it at
 * the demo space if it exists, otherwise the first bundled space. */
export const BUNDLED_DEMO_ID =
  bundled['pizza-shop-demo'] !== undefined ? 'pizza-shop-demo' : (Object.keys(bundled)[0] ?? '')

export interface BundledSpaceSummary {
  id: string
  /** First line of the space's `meta.name`, or the id. Best-effort parsed
   * straight from the raw YAML without invoking the full loader — Home just
   * needs a label. */
  name: string
}

export function listBundledSpaces(): BundledSpaceSummary[] {
  return Object.entries(bundled)
    .map(([id, files]) => ({ id, name: parseSpaceName(files['space.yaml']) ?? id }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function hasBundledSpace(id: string): boolean {
  return bundled[id] !== undefined
}

/** Back-compat shim — anyone who imported hasBundledDemo should now import
 * `hasBundledSpace(BUNDLED_DEMO_ID)` or use `listBundledSpaces()`. */
export function hasBundledDemo(): boolean {
  return BUNDLED_DEMO_ID !== '' && hasBundledSpace(BUNDLED_DEMO_ID)
}

export function bundledSpaceFileSystem(id: string): FileSystem {
  const files = bundled[id]
  if (!files) throw new Error(`bundled space '${id}' not found`)
  return {
    async readFile(path) {
      const v = files[path]
      if (v === undefined) throw new Error(`bundled space '${id}': no file at '${path}'`)
      return v
    },
    async writeFile(_path, _content) {
      throw new Error('Bundled spaces are read-only — pick a local folder to edit.')
    },
    async listFiles(dir) {
      const prefix = dir === '.' || dir === '' ? '' : `${dir.replace(/\/+$/, '')}/`
      const out: string[] = []
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue
        out.push(prefix ? p.slice(prefix.length) : p)
      }
      out.sort()
      return out
    },
    async exists(path) {
      return path in files
    },
    async mtime() {
      // The bundle is immutable per-load. Returning 0 keeps the file
      // watcher silent (it treats every file as "unchanged").
      return 0
    },
  }
}

/** Back-compat alias. */
export function bundledDemoFileSystem(): FileSystem {
  return bundledSpaceFileSystem(BUNDLED_DEMO_ID)
}

/** Naive but sufficient: find the first `name:` field under `meta:` in the
 * `space.yaml` source. The real loader parses Zod, but Home only needs a
 * display label — saving a parse pass per space on boot matters. */
function parseSpaceName(source: string | undefined): string | null {
  if (!source) return null
  const metaIdx = source.indexOf('meta:')
  if (metaIdx < 0) return null
  const slice = source.slice(metaIdx)
  const m = slice.match(/\n\s{2,}name:\s*(.+)/)
  const captured = m?.[1]
  if (!captured) return null
  return captured.trim().replace(/^['"]|['"]$/g, '')
}
