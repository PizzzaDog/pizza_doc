import type { FileSystem } from '@pizza-doc/core'
import { zipSync } from 'fflate'

/**
 * Bundle every YAML file under a space directory into a .zip and trigger a
 * browser download. `files` is the store's already-loaded list — we
 * re-read via the FileSystem wrapper so the zip reflects disk state (not
 * whatever the in-memory `source` might be after in-flight edits).
 */
export async function downloadSpaceAsZip(
  fs: FileSystem,
  spaceId: string,
  paths: Iterable<string>,
): Promise<void> {
  const entries: Record<string, Uint8Array> = {}
  const encoder = new TextEncoder()
  for (const path of paths) {
    const source = await fs.readFile(path)
    entries[`${spaceId}/${path}`] = encoder.encode(source)
  }
  const bytes = zipSync(entries, { level: 6 })
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${spaceId}-${timestamp()}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function timestamp(): string {
  // YYYYMMDD-HHMM — filesystem-safe, sortable.
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}
