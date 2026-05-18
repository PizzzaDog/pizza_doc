/**
 * Map a space-relative file path to its semantic role. The path layout is
 * canonical (page 04). Anything that does not match a recognised pattern is
 * returned as `{ kind: 'unknown' }`.
 */
export type FileRole =
  | { kind: 'space' }
  | { kind: 'actor'; id: string }
  | { kind: 'module'; moduleId: string }
  | { kind: 'domain'; moduleId: string; domainId: string }
  | { kind: 'component'; moduleId: string; domainId?: string; id: string }
  | { kind: 'model'; moduleId: string; domainId?: string; id: string }
  | { kind: 'table'; moduleId: string; domainId?: string; id: string }
  | { kind: 'usecase'; id: string }
  | { kind: 'layout'; useCaseId: string }
  | { kind: 'configMap'; moduleId: string }
  | { kind: 'externalDeps'; moduleId: string }
  | { kind: 'stateMachine'; moduleId: string; domainId?: string; id: string }
  | { kind: 'decision'; id: string }
  // v0.3 (A4) — operations layer at space root.
  | { kind: 'runbook'; id: string }
  | { kind: 'opsStateMachine'; id: string }
  | { kind: 'healthContract'; moduleId: string }
  | { kind: 'unknown' }

export function classifyFile(path: string): FileRole {
  // ADR is the only markdown role; everything else has to be YAML.
  const isYaml = path.endsWith('.yaml') || path.endsWith('.yml')
  const isMd = path.endsWith('.md')
  if (!isYaml && !isMd) return { kind: 'unknown' }

  const parts = path.split('/')

  // decisions/ADR-NNN-<slug>.md
  if (isMd && parts[0] === 'decisions' && parts.length === 2) {
    const file = parts[1] ?? ''
    const m = file.match(/^(ADR-[0-9]{3,})-[A-Za-z0-9_-]+\.md$/)
    return m?.[1] ? { kind: 'decision', id: m[1] } : { kind: 'unknown' }
  }

  // v0.3 (A4) — operations/runbooks/<id>.md
  if (isMd && parts[0] === 'operations' && parts[1] === 'runbooks' && parts.length === 3) {
    const file = parts[2] ?? ''
    const id = file.endsWith('.md') ? file.slice(0, -3) : ''
    return id ? { kind: 'runbook', id } : { kind: 'unknown' }
  }
  // Everything below is YAML-only.
  if (!isYaml) return { kind: 'unknown' }

  // v0.3 (A4) — operations/state-machines/<id>.yaml — cross-module state machines
  if (parts[0] === 'operations' && parts[1] === 'state-machines' && parts.length === 3) {
    const id = stripYamlExt(parts[2] ?? '')
    return id ? { kind: 'opsStateMachine', id } : { kind: 'unknown' }
  }

  // v0.3 (A4) — operations/health-contracts/<moduleId>.yaml
  if (parts[0] === 'operations' && parts[1] === 'health-contracts' && parts.length === 3) {
    const moduleId = stripYamlExt(parts[2] ?? '')
    return moduleId ? { kind: 'healthContract', moduleId } : { kind: 'unknown' }
  }

  if (parts.length === 1 && parts[0] === 'space.yaml') return { kind: 'space' }

  if (parts[0] === 'actors' && parts.length === 2) {
    const file = parts[1] ?? ''
    const id = stripYamlExt(file)
    return id ? { kind: 'actor', id } : { kind: 'unknown' }
  }

  if (parts[0] === 'use-cases' && parts.length === 2) {
    const file = parts[1] ?? ''
    if (file.endsWith('.layout.yaml')) {
      const id = file.slice(0, -'.layout.yaml'.length)
      return id ? { kind: 'layout', useCaseId: id } : { kind: 'unknown' }
    }
    const id = stripYamlExt(file)
    return id ? { kind: 'usecase', id } : { kind: 'unknown' }
  }

  if (parts[0] === 'modules') {
    const moduleId = parts[1]
    if (!moduleId) return { kind: 'unknown' }

    if (parts.length === 3 && parts[2] === 'module.yaml') {
      return { kind: 'module', moduleId }
    }

    // modules/<m>/config-map.yaml — module-scoped configuration knobs
    if (parts.length === 3 && parts[2] === 'config-map.yaml') {
      return { kind: 'configMap', moduleId }
    }
    // modules/<m>/external-deps.yaml — module-scoped outbound (or inbound webhook) connections
    if (parts.length === 3 && parts[2] === 'external-deps.yaml') {
      return { kind: 'externalDeps', moduleId }
    }

    // modules/<m>/state-machines/<id>.yaml — v0.3 (A2) standalone state machines
    if (parts.length === 4 && parts[2] === 'state-machines') {
      const id = stripYamlExt(parts[3] ?? '')
      if (!id) return { kind: 'unknown' }
      return { kind: 'stateMachine', moduleId, id }
    }

    // modules/<m>/components|models|tables/<id>.yaml
    if (parts.length === 4 && parts[2] && isContainerFolder(parts[2])) {
      const id = stripYamlExt(parts[3] ?? '')
      if (!id) return { kind: 'unknown' }
      return makeElement(parts[2], moduleId, undefined, id)
    }

    if (parts[2] === 'domains') {
      const domainId = parts[3]
      if (!domainId) return { kind: 'unknown' }

      if (parts.length === 5 && parts[4] === 'domain.yaml') {
        return { kind: 'domain', moduleId, domainId }
      }

      // modules/<m>/domains/<d>/state-machines/<id>.yaml
      if (parts.length === 6 && parts[4] === 'state-machines') {
        const id = stripYamlExt(parts[5] ?? '')
        if (!id) return { kind: 'unknown' }
        return { kind: 'stateMachine', moduleId, domainId, id }
      }

      // modules/<m>/domains/<d>/components|models|tables/<id>.yaml
      if (parts.length === 6 && parts[4] && isContainerFolder(parts[4])) {
        const id = stripYamlExt(parts[5] ?? '')
        if (!id) return { kind: 'unknown' }
        return makeElement(parts[4], moduleId, domainId, id)
      }
    }
  }

  return { kind: 'unknown' }
}

function stripYamlExt(file: string): string {
  if (file.endsWith('.yaml')) return file.slice(0, -5)
  if (file.endsWith('.yml')) return file.slice(0, -4)
  return ''
}

function isContainerFolder(name: string): name is 'components' | 'models' | 'tables' {
  return name === 'components' || name === 'models' || name === 'tables'
}

function makeElement(
  folder: 'components' | 'models' | 'tables',
  moduleId: string,
  domainId: string | undefined,
  id: string,
): FileRole {
  const kind = folder === 'components' ? 'component' : folder === 'models' ? 'model' : 'table'
  return domainId ? { kind, moduleId, domainId, id } : { kind, moduleId, id }
}
