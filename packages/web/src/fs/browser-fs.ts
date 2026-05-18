import type { FileSystem } from '@pizza-doc/core'

/**
 * Browser-side implementation of the abstract FileSystem interface from core.
 * Backed by the File System Access API (FileSystemDirectoryHandle).
 *
 * Paths are POSIX-style forward-slash paths relative to `root`. The same
 * path grammar core's Node backend uses, so loader/serializer work unchanged
 * in either environment.
 */
export function browserFileSystem(root: FileSystemDirectoryHandle): FileSystem {
  async function resolveParts(
    path: string,
    opts: { create?: boolean } = {},
  ): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const parts = splitPath(path)
    const name = parts.pop()
    if (!name) throw new Error(`invalid path: '${path}'`)
    let dir = root
    for (const p of parts) {
      dir = await dir.getDirectoryHandle(p, { create: opts.create ?? false })
    }
    return { parent: dir, name }
  }

  return {
    async readFile(path) {
      const { parent, name } = await resolveParts(path)
      const fh = await parent.getFileHandle(name)
      const file = await fh.getFile()
      return await file.text()
    },

    async writeFile(path, content) {
      const { parent, name } = await resolveParts(path, { create: true })
      const fh = await parent.getFileHandle(name, { create: true })
      // `createWritable` requires prompted write permission; the picker grants
      // read on open and write on first write attempt (browser UX).
      const writable = await fh.createWritable()
      try {
        await writable.write(content)
      } finally {
        await writable.close()
      }
    },

    async listFiles(dir) {
      const out: string[] = []
      const start = dir === '.' || dir === '' ? root : await resolveDir(root, dir)
      await walk(start, dir === '.' || dir === '' ? '' : dir, out)
      out.sort()
      return out
    },

    async exists(path) {
      try {
        await resolveAny(root, path)
        return true
      } catch {
        return false
      }
    },

    async mtime(path) {
      try {
        const handle = await resolveAny(root, path)
        if (handle.kind !== 'file') return null
        const file = await (handle as FileSystemFileHandle).getFile()
        return file.lastModified
      } catch {
        return null
      }
    },
  }
}

function splitPath(path: string): string[] {
  return path
    .replace(/^\/+/, '')
    .split('/')
    .filter((p) => p && p !== '.')
}

async function resolveDir(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const p of splitPath(path)) {
    dir = await dir.getDirectoryHandle(p)
  }
  return dir
}

async function resolveAny(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemHandle> {
  const parts = splitPath(path)
  if (parts.length === 0) return root
  const last = parts.pop()
  if (!last) return root
  let dir = root
  for (const p of parts) {
    dir = await dir.getDirectoryHandle(p)
  }
  try {
    return await dir.getFileHandle(last)
  } catch {
    return await dir.getDirectoryHandle(last)
  }
}

async function walk(dir: FileSystemDirectoryHandle, prefix: string, out: string[]): Promise<void> {
  // Use `.values()` explicitly. `FileSystemDirectoryHandle[@@asyncIterator]`
  // is spec'd as `.entries()`, which yields `[name, handle]` tuples — the
  // `.kind`/`.name` access below would be silently undefined on every entry,
  // and walk would appear to "find nothing" with no error. TypeScript's DOM
  // types don't declare `.values()` on the handle yet, so we cast narrowly.
  const iter = (dir as unknown as { values(): AsyncIterableIterator<FileSystemHandle> }).values()
  for await (const handle of iter) {
    const name = handle.name
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      out.push(path)
    } else if (handle.kind === 'directory') {
      await walk(handle as FileSystemDirectoryHandle, path, out)
    }
  }
}
