import type {
  Actor,
  Component,
  Domain,
  Method,
  Model,
  Module,
  Space,
  Table,
  UseCase,
} from './schema.js'

export type RefKind =
  | 'actor'
  | 'usecase'
  | 'module'
  | 'domain'
  | 'component'
  | 'method'
  | 'model'
  | 'table'

export interface RefSegment {
  kind: string
  id: string
}

export interface ParsedRef {
  segments: RefSegment[]
}

export type RefTarget =
  | { kind: 'actor'; entity: Actor }
  | { kind: 'usecase'; entity: UseCase }
  | { kind: 'module'; entity: Module }
  | { kind: 'domain'; entity: Domain; module: Module }
  | { kind: 'component'; entity: Component; module: Module; domain?: Domain }
  | { kind: 'method'; entity: Method; component: Component; module: Module; domain?: Domain }
  | { kind: 'model'; entity: Model; module: Module; domain?: Domain }
  | { kind: 'table'; entity: Table; module: Module; domain?: Domain }

const SEGMENT_RE = /^([a-zA-Z]+):([a-zA-Z][a-zA-Z0-9_-]*)$/

const SEGMENT_KINDS: ReadonlySet<string> = new Set([
  'module',
  'usecase',
  'actor',
  'domain',
  'component',
  'method',
  'model',
  'table',
])

const TOP_KINDS: ReadonlySet<string> = new Set(['module', 'usecase', 'actor'])

/**
 * Parse a ref URI like `module:auth-api/domain:users/component:UserService` into
 * a sequence of `{kind, id}` segments. Returns null if the ref is malformed.
 */
export function parseRef(ref: string): ParsedRef | null {
  if (!ref) return null
  const rawSegments = ref.split('/')
  const segments: RefSegment[] = []
  for (let i = 0; i < rawSegments.length; i++) {
    const raw = rawSegments[i] ?? ''
    const match = SEGMENT_RE.exec(raw)
    if (!match) return null
    const kind = match[1] as string
    const id = match[2] as string
    if (!SEGMENT_KINDS.has(kind)) return null
    if (i === 0 && !TOP_KINDS.has(kind)) return null
    segments.push({ kind, id })
  }
  return segments.length > 0 ? { segments } : null
}

export function formatRef(parsed: ParsedRef): string {
  return parsed.segments.map((s) => `${s.kind}:${s.id}`).join('/')
}

/**
 * An index of every addressable entity in a Space, keyed by its canonical ref URI.
 * Built once after loading; used by the Pass 2 validator and by the UI for
 * navigation.
 */
export class RefIndex {
  private readonly map = new Map<string, RefTarget>()

  get(ref: string): RefTarget | undefined {
    return this.map.get(ref)
  }

  has(ref: string): boolean {
    return this.map.has(ref)
  }

  refs(): IterableIterator<string> {
    return this.map.keys()
  }

  refsOfKind(kind: RefKind): string[] {
    const out: string[] = []
    for (const [ref, target] of this.map) {
      if (target.kind === kind) out.push(ref)
    }
    return out
  }

  size(): number {
    return this.map.size
  }

  set(ref: string, target: RefTarget): void {
    this.map.set(ref, target)
  }
}

/**
 * Build a RefIndex from a loaded Space. Does not validate; duplicate refs
 * overwrite silently (duplicates are caught by the Pass 3 structural-hygiene
 * rule in a later phase).
 */
export function buildRefIndex(space: Space): RefIndex {
  const index = new RefIndex()

  for (const actor of space.actors) {
    index.set(`actor:${actor.id}`, { kind: 'actor', entity: actor })
  }
  for (const useCase of space.useCases) {
    index.set(`usecase:${useCase.id}`, { kind: 'usecase', entity: useCase })
  }

  for (const module of space.modules) {
    const moduleRef = `module:${module.id}`
    index.set(moduleRef, { kind: 'module', entity: module })

    // Direct children (module without domain).
    indexComponents(index, module, undefined, moduleRef, module.components)
    indexModels(index, module, undefined, moduleRef, module.models)
    indexTables(index, module, undefined, moduleRef, module.tables)

    for (const domain of module.domains) {
      const domainRef = `${moduleRef}/domain:${domain.id}`
      index.set(domainRef, { kind: 'domain', entity: domain, module })
      indexComponents(index, module, domain, domainRef, domain.components)
      indexModels(index, module, domain, domainRef, domain.models)
      indexTables(index, module, domain, domainRef, domain.tables)
    }
  }

  return index
}

function indexComponents(
  index: RefIndex,
  module: Module,
  domain: Domain | undefined,
  parentRef: string,
  components: readonly Component[],
): void {
  for (const component of components) {
    const ref = `${parentRef}/component:${component.id}`
    const target: RefTarget = domain
      ? { kind: 'component', entity: component, module, domain }
      : { kind: 'component', entity: component, module }
    index.set(ref, target)
    for (const method of component.methods) {
      const methodRef = `${ref}/method:${method.name}`
      const methodTarget: RefTarget = domain
        ? { kind: 'method', entity: method, component, module, domain }
        : { kind: 'method', entity: method, component, module }
      index.set(methodRef, methodTarget)
    }
  }
}

function indexModels(
  index: RefIndex,
  module: Module,
  domain: Domain | undefined,
  parentRef: string,
  models: readonly Model[],
): void {
  for (const model of models) {
    const ref = `${parentRef}/model:${model.id}`
    const target: RefTarget = domain
      ? { kind: 'model', entity: model, module, domain }
      : { kind: 'model', entity: model, module }
    index.set(ref, target)
  }
}

function indexTables(
  index: RefIndex,
  module: Module,
  domain: Domain | undefined,
  parentRef: string,
  tables: readonly Table[],
): void {
  for (const table of tables) {
    const ref = `${parentRef}/table:${table.id}`
    const target: RefTarget = domain
      ? { kind: 'table', entity: table, module, domain }
      : { kind: 'table', entity: table, module }
    index.set(ref, target)
  }
}
