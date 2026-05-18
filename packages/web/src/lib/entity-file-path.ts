/**
 * Inverse of core's `classifyFile`: given a full ref URI, compute the
 * on-disk path inside the space directory (POSIX-style, forward slashes).
 *
 * Returns null for refs we don't know how to persist as a single file —
 * methods (edit via parent component) and anything malformed.
 */
export function filePathForRef(ref: string): string | null {
  if (ref.startsWith('actor:')) {
    const id = ref.slice('actor:'.length)
    if (!id) return null
    return `actors/${id}.yaml`
  }
  if (ref.startsWith('usecase:')) {
    const id = ref.slice('usecase:'.length)
    if (!id) return null
    return `use-cases/${id}.yaml`
  }
  const moduleMatch = ref.match(/^module:([^/]+)(?:\/(.+))?$/)
  if (!moduleMatch) return null
  const moduleId = moduleMatch[1]
  const rest = moduleMatch[2] ?? ''
  if (!moduleId) return null
  if (!rest) return `modules/${moduleId}/module.yaml`

  const parts = rest.split('/')
  let path = `modules/${moduleId}`
  let i = 0
  while (i < parts.length) {
    const part = parts[i]
    if (!part) return null
    if (part.startsWith('domain:')) {
      const did = part.slice('domain:'.length)
      if (!did) return null
      if (i === parts.length - 1) return `${path}/domains/${did}/domain.yaml`
      path = `${path}/domains/${did}`
      i += 1
      continue
    }
    const typed = part.match(/^(component|model|table):(.+)$/)
    if (typed) {
      const [, kind, id] = typed
      if (!id) return null
      const folder = kind === 'component' ? 'components' : kind === 'model' ? 'models' : 'tables'
      if (i !== parts.length - 1) return null
      return `${path}/${folder}/${id}.yaml`
    }
    return null
  }
  return null
}
