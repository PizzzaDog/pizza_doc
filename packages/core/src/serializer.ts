import type { LoadedFile } from './loader.js'

/**
 * Produce the on-disk representation of every YAML file in a loaded space.
 *
 * In Phase 1 the serializer operates in round-trip mode only: it returns the
 * original source text for each file verbatim, which guarantees byte-identical
 * output when nothing has been mutated. Editing support (mutating a
 * `Document` and re-emitting) lands in Phase 8 when the UI needs it.
 */
export function serializeSpace(files: ReadonlyMap<string, LoadedFile>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [path, file] of files) {
    if (file.document) {
      out.set(path, file.document.toString())
    } else {
      out.set(path, file.source)
    }
  }
  return out
}
