import type { FileSystem } from '@pizza-doc/core'

export interface FileWatcherHandle {
  /** Stop polling. */
  stop: () => void
  /** Inform the watcher that we wrote `path` ourselves (don't re-import it). */
  markOwnWrite: (path: string, mtime: number) => void
}

export interface FileWatcherOptions {
  intervalMs?: number
  /** Called when a file's mtime changed on disk since the last tick. */
  onChange: (change: { path: string; source: string; mtime: number }) => void
  /** Called on any unrecoverable watcher error (e.g. directory removed). */
  onError?: (err: unknown) => void
}

/**
 * Poll-based watcher over a core FileSystem implementation. The browser FS
 * API has no push, so 2 s polling is the v1 contract (page 06). The watcher
 * only re-reads files whose mtime has advanced — which also skips files we
 * wrote ourselves, since `markOwnWrite` updates the cache with the new mtime.
 */
export function startFileWatcher(
  fs: FileSystem,
  initial: Map<string, number>,
  options: FileWatcherOptions,
): FileWatcherHandle {
  const intervalMs = options.intervalMs ?? 2000
  const known = new Map(initial)
  let cancelled = false

  const tick = async (): Promise<void> => {
    for (const [path, lastMtime] of known) {
      if (cancelled) return
      let current: number | null
      try {
        current = await fs.mtime(path)
      } catch (err) {
        options.onError?.(err)
        continue
      }
      if (current === null) continue
      if (current === lastMtime) continue
      try {
        const source = await fs.readFile(path)
        known.set(path, current)
        if (!cancelled) options.onChange({ path, source, mtime: current })
      } catch (err) {
        options.onError?.(err)
      }
    }
  }

  const handle = window.setInterval(() => {
    void tick()
  }, intervalMs)

  return {
    stop() {
      cancelled = true
      window.clearInterval(handle)
    },
    markOwnWrite(path, mtime) {
      known.set(path, mtime)
    },
  }
}
