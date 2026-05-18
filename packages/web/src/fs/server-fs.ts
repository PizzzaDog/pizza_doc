import type { FileSystem } from '@pizza-doc/core'

export interface UiSession {
  version: string
  mode: 'global' | 'local-space'
  space: { id: string; path: string; name: string } | null
  changeId: string | null
}

export async function fetchUiSession(): Promise<UiSession | null> {
  try {
    const res = await fetch('/api/session', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as UiSession
  } catch {
    return null
  }
}

/**
 * FileSystem backed by `pd ui`'s local HTTP API. This is what lets `pd ui`
 * open the project-local `.pizza-doc` immediately without asking the browser
 * for a File System Access picker grant first.
 */
export function serverFileSystem(): FileSystem {
  return {
    async readFile(path) {
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(await errorText(res))
      return await res.text()
    },

    async writeFile(path, content) {
      const res = await fetch(`/api/fs/write?path=${encodeURIComponent(path)}`, {
        method: 'PUT',
        body: content,
      })
      if (!res.ok) throw new Error(await errorText(res))
    },

    async listFiles(dir) {
      const res = await fetch(`/api/fs/list?dir=${encodeURIComponent(dir)}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(await errorText(res))
      const data = (await res.json()) as { files: string[] }
      return data.files
    },

    async exists(path) {
      const res = await fetch(`/api/fs/exists?path=${encodeURIComponent(path)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return false
      const data = (await res.json()) as { exists: boolean }
      return data.exists
    },

    async mtime(path) {
      const res = await fetch(`/api/fs/mtime?path=${encodeURIComponent(path)}`, {
        cache: 'no-store',
      })
      if (!res.ok) return null
      const data = (await res.json()) as { mtime: number | null }
      return data.mtime
    },
  }
}

async function errorText(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }
    return data.error ?? res.statusText
  } catch {
    return res.statusText
  }
}
