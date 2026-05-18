import type { Component, Field, Model, Table, UseCase, Validation } from '@pizza-doc/core'
import type { Actor, Domain, Module } from '@pizza-doc/core'

/**
 * Converts loaded entities back to the file-level YAML shape core expects.
 * The inspector currently edits scalar fields only, so these serializers must
 * preserve nested and v0.2 contract fields that are displayed read-only.
 */
export function toActorFile(a: Actor): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: 'actor',
    id: a.id,
    name: a.name,
    type: a.type,
  }
  if (a.description) out.description = a.description
  return out
}

export function toModuleFile(m: Module): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: 'module',
    id: m.id,
    name: m.name,
    type: m.type,
  }
  if (m.techStack) out.techStack = m.techStack
  if (m.description) out.description = m.description
  if (m.decisions.length > 0) out.decisions = [...m.decisions]
  if (m.errorMapping.length > 0) out.errorMapping = m.errorMapping.map(cleanErrorMapping)
  // Children + sidecar collections (configMap / externalDeps) live in their
  // own files; the container module.yaml never embeds them.
  return out
}

export function toDomainFile(d: Domain): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: d.id,
    name: d.name,
  }
  if (d.description) out.description = d.description
  return out
}

export function toComponentFile(c: Component): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: 'component',
    id: c.id,
    name: c.name,
    type: c.type,
  }
  if (c.description) out.description = c.description
  if (c.sourceRef) out.sourceRef = c.sourceRef
  if (c.methods.length > 0) out.methods = c.methods.map(cleanMethod)
  if (c.routes.length > 0) out.routes = c.routes.map(cleanRoute)
  return out
}

export function toModelFile(m: Model): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: 'model',
    id: m.id,
    name: m.name,
    modelKind: m.modelKind,
    fields: m.fields.map(cleanField),
  }
  if (m.persistedAs) out.persistedAs = m.persistedAs
  if (m.description) out.description = m.description
  if (m.topic) out.topic = m.topic
  if (m.stateMachine) out.stateMachine = cleanStateMachine(m.stateMachine)
  if (m.sourceRef) out.sourceRef = m.sourceRef
  return out
}

export function toTableFile(t: Table): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: 'table',
    id: t.id,
    name: t.name,
    columns: t.columns.map(cleanColumn),
  }
  if (t.description) out.description = t.description
  if (t.indexes.length > 0) out.indexes = t.indexes.map(cleanIndex)
  if (t.sourceRef) out.sourceRef = t.sourceRef
  return out
}

export function toUseCaseFile(u: UseCase): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: 'usecase',
    id: u.id,
    name: u.name,
    actor: u.actor,
    trigger: u.trigger,
    steps: u.steps.map(cleanStep),
  }
  if (u.description) out.description = u.description
  if (u.errorFlows.length > 0) out.errorFlows = u.errorFlows.map(cleanErrorFlow)
  if (u.invariants.pre.length > 0 || u.invariants.post.length > 0) {
    out.invariants = { pre: u.invariants.pre, post: u.invariants.post }
  }
  if (u.requires.length > 0) out.requires = u.requires.map(cleanRequirement)
  if (u.dataFlow.length > 0) out.dataFlow = u.dataFlow.map(cleanDataFlow)
  if (u.sourceRef) out.sourceRef = u.sourceRef
  return out
}

function cleanMethod(m: Component['methods'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: m.name,
    returns: m.returns,
  }
  if (m.params.length > 0) out.params = m.params.map(cleanField)
  if (m.calls.length > 0) out.calls = m.calls.map(cleanCall)
  if (m.throws.length > 0) out.throws = m.throws
  if (m.description) out.description = m.description
  if (m.httpMethod) out.httpMethod = m.httpMethod
  if (m.httpPath) out.httpPath = m.httpPath
  if (m.routeAuth) out.routeAuth = cleanRouteAuth(m.routeAuth)
  if (m.sourceRef) out.sourceRef = m.sourceRef
  return out
}

/**
 * Serialize a call entry. Round-trips legacy ref-string form when no v0.3
 * contract fields are set, so existing specs save unchanged. Emits the
 * object form when any of path/method/credential/optional/description is
 * meaningful.
 */
function cleanCall(c: Component['methods'][number]['calls'][number]): unknown {
  const bare = c.optional === false && !c.path && !c.method && !c.credential && !c.description
  if (bare) return c.target
  const out: Record<string, unknown> = { target: c.target }
  if (c.method) out.method = c.method
  if (c.path) out.path = c.path
  if (c.credential) out.credential = cleanCredential(c.credential)
  if (c.optional) out.optional = true
  if (c.description) out.description = c.description
  return out
}

function cleanCredential(
  c: NonNullable<Component['methods'][number]['calls'][number]['credential']>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { type: c.type }
  if (c.header) out.header = c.header
  if (c.env) out.env = c.env
  return out
}

function cleanRouteAuth(
  a: NonNullable<Component['methods'][number]['routeAuth']>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { type: a.type }
  if (a.header) out.header = a.header
  if (a.env) out.env = a.env
  return out
}

function cleanRoute(r: Component['routes'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = { path: r.path, method: r.method }
  if (r.auth) out.auth = cleanRouteAuth(r.auth)
  if (r.description) out.description = r.description
  if (r.sourceRef) out.sourceRef = r.sourceRef
  return out
}

function cleanField(f: Field): Record<string, unknown> {
  const out: Record<string, unknown> = { name: f.name, type: f.type }
  if (f.optional) out.optional = true
  if (f.persisted === false) out.persisted = false
  if (f.validation) out.validation = cleanValidation(f.validation)
  if (f.description) out.description = f.description
  if (f.example !== undefined) out.example = f.example
  if (f.sourceRef) out.sourceRef = f.sourceRef
  return out
}

function cleanValidation(v: Validation): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (v.format) out.format = v.format
  if (v.min !== undefined) out.min = v.min
  if (v.max !== undefined) out.max = v.max
  if (v.minLength !== undefined) out.minLength = v.minLength
  if (v.maxLength !== undefined) out.maxLength = v.maxLength
  if (v.pattern) out.pattern = v.pattern
  if (v.enumValues) out.enumValues = v.enumValues
  if (v.description) out.description = v.description
  return out
}

function cleanColumn(c: Table['columns'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: c.name,
    sqlType: c.sqlType,
  }
  if (c.primaryKey) out.primaryKey = true
  if (c.nullable) out.nullable = true
  if (c.unique) out.unique = true
  if (c.default !== undefined) out.default = c.default
  if (c.foreignKey) {
    out.foreignKey = {
      table: c.foreignKey.table,
      column: c.foreignKey.column,
    }
  }
  if (c.description) out.description = c.description
  if (c.sourceRef) out.sourceRef = c.sourceRef
  return out
}

function cleanIndex(i: Table['indexes'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: i.name,
    columns: i.columns,
  }
  if (i.unique) out.unique = true
  return out
}

function cleanStep(s: UseCase['steps'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = { from: s.from, to: s.to }
  if (s.via) out.via = s.via
  if (s.protocol) out.protocol = s.protocol
  if (s.description) out.description = s.description
  return out
}

function cleanErrorFlow(f: UseCase['errorFlows'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: f.id,
    condition: f.condition,
    steps: f.steps.map(cleanStep),
  }
  if (f.resultDescription) out.resultDescription = f.resultDescription
  return out
}

function cleanRequirement(r: UseCase['requires'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (r.role) out.role = r.role
  if (r.tenantRole) out.tenantRole = r.tenantRole
  if (r.tenantContext !== undefined) out.tenantContext = r.tenantContext
  if (r.flag) out.flag = r.flag
  if (r.description) out.description = r.description
  return out
}

function cleanDataFlow(d: UseCase['dataFlow'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    sourceField: d.sourceField,
    targetField: d.targetField,
  }
  if (d.cardinality === 'many') out.cardinality = d.cardinality
  if (d.transform) out.transform = d.transform
  return out
}

function cleanErrorMapping(e: Module['errorMapping'][number]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    exception: e.exception,
    httpStatus: e.httpStatus,
  }
  if (e.code) out.code = e.code
  if (e.description) out.description = e.description
  return out
}

function cleanStateMachine(s: NonNullable<Model['stateMachine']>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    field: s.field,
    states: s.states,
  }
  if (s.initial) out.initial = s.initial
  if (s.terminal.length > 0) out.terminal = s.terminal
  if (s.transitions.length > 0) {
    out.transitions = s.transitions.map((t) => {
      const transition: Record<string, unknown> = { from: t.from, to: t.to }
      if (t.on) transition.on = t.on
      if (t.guard) transition.guard = t.guard
      if (t.description) transition.description = t.description
      return transition
    })
  }
  if (s.description) out.description = s.description
  return out
}
