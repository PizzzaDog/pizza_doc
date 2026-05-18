import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import * as nodePath from 'node:path'
import type { FileSystem } from './fs.js'

/**
 * A FileSystem implementation backed by Node's `fs/promises`. All paths passed
 * in through the public API are treated as POSIX-style paths relative to
 * `rootDir`; on disk they are joined with the platform path separator.
 */
export function nodeFileSystem(rootDir: string): FileSystem {
  const resolveAbs = (relPath: string): string => nodePath.resolve(rootDir, relPath)

  return {
    async readFile(path) {
      return await readFile(resolveAbs(path), 'utf8')
    },

    async writeFile(path, content) {
      const abs = resolveAbs(path)
      await mkdir(nodePath.dirname(abs), { recursive: true })
      await writeFile(abs, content, 'utf8')
    },

    async listFiles(dir) {
      const absDir = resolveAbs(dir)
      const out: string[] = []
      await walk(absDir, absDir, out)
      out.sort()
      return out
    },

    async exists(path) {
      try {
        await stat(resolveAbs(path))
        return true
      } catch {
        return false
      }
    },

    async mtime(path) {
      try {
        const s = await stat(resolveAbs(path))
        return s.mtimeMs
      } catch {
        return null
      }
    },
  }
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = nodePath.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(root, abs, out)
    } else if (entry.isFile()) {
      const rel = nodePath.relative(root, abs).split(nodePath.sep).join('/')
      out.push(rel)
    }
  }
}
