/**
 * Abstract filesystem interface. Both the Node-backed CLI and the browser
 * File-System-Access-backed UI implement this so that `loader` and `serializer`
 * stay environment-agnostic.
 *
 * All paths are POSIX-style forward-slash paths, always relative to the space
 * directory root unless documented otherwise.
 */
export interface FileSystem {
  /** Read a file as UTF-8 text. Throws if missing. */
  readFile(path: string): Promise<string>
  /** Write UTF-8 text, creating parent directories as needed. */
  writeFile(path: string, content: string): Promise<void>
  /**
   * Recursively list all files under `dir`. Returned paths are relative to
   * `dir`. Order is deterministic (alphabetical).
   */
  listFiles(dir: string): Promise<string[]>
  /** Check whether a file or directory exists. */
  exists(path: string): Promise<boolean>
  /** Last-modified timestamp as epoch milliseconds. Null if the path is missing. */
  mtime(path: string): Promise<number | null>
}

export function joinPath(...parts: string[]): string {
  const filtered = parts.filter((p) => p.length > 0)
  return filtered
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^(.?)\/$/, '$1')
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf('/')
  if (slash < 0) return ''
  return path.slice(0, slash)
}

export function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? path : path.slice(slash + 1)
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return name
  return name.slice(0, dot)
}
