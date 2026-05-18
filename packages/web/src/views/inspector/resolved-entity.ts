import { filePathForRef } from '@/lib/entity-file-path'
import type {
  Actor,
  Component,
  Domain,
  LoadedFile,
  Model,
  Module,
  Space,
  Table,
  UseCase,
} from '@pizza-doc/core'

export type ResolvedEntity =
  | { kind: 'actor'; entity: Actor }
  | { kind: 'module'; entity: Module }
  | {
      kind: 'domain'
      entity: Domain
      module: Module
    }
  | {
      kind: 'component'
      entity: Component
      module: Module
      domain?: Domain
    }
  | {
      kind: 'model'
      entity: Model
      module: Module
      domain?: Domain
    }
  | {
      kind: 'table'
      entity: Table
      module: Module
      domain?: Domain
    }
  | { kind: 'usecase'; entity: UseCase }

/**
 * Look up an entity by ref inside the already-loaded space. Kept separate
 * from the canvas `RefIndex` since callers here also want the
 * parent module / domain context for form rendering.
 */
export function resolveEntityForInspector(space: Space, ref: string): ResolvedEntity | null {
  if (ref.startsWith('actor:')) {
    const id = ref.slice('actor:'.length)
    const actor = space.actors.find((a) => a.id === id)
    return actor ? { kind: 'actor', entity: actor } : null
  }
  if (ref.startsWith('usecase:')) {
    const id = ref.slice('usecase:'.length)
    const uc = space.useCases.find((u) => u.id === id)
    return uc ? { kind: 'usecase', entity: uc } : null
  }
  const mm = ref.match(/^module:([^/]+)(?:\/(.+))?$/)
  if (!mm) return null
  const moduleId = mm[1]
  const rest = mm[2]
  const module = space.modules.find((m) => m.id === moduleId)
  if (!module) return null
  if (!rest) return { kind: 'module', entity: module }

  // rest starts with domain:<id> OR component:<id> | model:<id> | table:<id>
  const parts = rest.split('/')
  let domain: Domain | undefined
  let i = 0
  const first = parts[0]
  if (first?.startsWith('domain:')) {
    const did = first.slice('domain:'.length)
    domain = module.domains.find((d) => d.id === did)
    if (!domain) return null
    i = 1
    if (parts.length === 1) return { kind: 'domain', entity: domain, module }
  }
  const leaf = parts[i]
  if (!leaf) return null
  const leafMatch = leaf.match(/^(component|model|table):(.+)$/)
  if (!leafMatch) return null
  const leafKind = leafMatch[1]
  const leafId = leafMatch[2]
  if (!leafId) return null

  const pool = domain ? domain : module
  if (leafKind === 'component') {
    const comp = pool.components.find((c) => c.id === leafId)
    if (!comp) return null
    return domain
      ? { kind: 'component', entity: comp, module, domain }
      : { kind: 'component', entity: comp, module }
  }
  if (leafKind === 'model') {
    const model = pool.models.find((m) => m.id === leafId)
    if (!model) return null
    return domain
      ? { kind: 'model', entity: model, module, domain }
      : { kind: 'model', entity: model, module }
  }
  const table = pool.tables.find((t) => t.id === leafId)
  if (!table) return null
  return domain
    ? { kind: 'table', entity: table, module, domain }
    : { kind: 'table', entity: table, module }
}

export function fileForRef(
  files: Map<string, LoadedFile>,
  ref: string,
): { path: string; file: LoadedFile } | null {
  const path = filePathForRef(ref)
  if (!path) return null
  const file = files.get(path)
  if (!file) return null
  return { path, file }
}
