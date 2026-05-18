import * as path from 'node:path'
import { resolveSpaceDir } from '../util/space.js'
import { schemaRefFor, writeYamlFile } from '../util/yaml-write.js'
import type { ToolDef } from './types.js'

interface AddResult {
  wrote: boolean
  file: string
  ref: string
  reason?: string
  warning?: string
}

const ID_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/

function ensureValidId(id: string, kind: string): void {
  if (!ID_REGEX.test(id)) {
    throw new Error(`invalid ${kind} id '${id}' — must match ${ID_REGEX.source}`)
  }
}

function humanize(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ')
}

// ---------------------- pd_add_actor ----------------------

interface AddActorInput {
  id: string
  type?: 'user' | 'system' | 'scheduler'
  name?: string
  description?: string
  force?: boolean
  spaceDir?: string
}

export const addActorTool: ToolDef<AddActorInput, AddResult> = {
  name: 'pd_add_actor',
  description:
    'Scaffold a new actor (person or external system that initiates use cases). Writes <space>/actors/<id>.yaml with a schema pragma so editors validate inline.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Actor id (kebab-case identifier).' },
      type: {
        type: 'string',
        enum: ['user', 'system', 'scheduler'],
        description: 'Defaults to user.',
      },
      name: { type: 'string' },
      description: { type: 'string' },
      force: { type: 'boolean', description: 'Overwrite an existing file.' },
      spaceDir: { type: 'string' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler(input) {
    ensureValidId(input.id, 'actor')
    const spaceDir = resolveSpaceDir(input.spaceDir)
    const file = path.join(spaceDir, 'actors', `${input.id}.yaml`)
    const value = {
      kind: 'actor',
      id: input.id,
      name: input.name ?? humanize(input.id),
      type: input.type ?? 'user',
      description: input.description ?? `TODO: describe ${humanize(input.id)}.`,
    }
    const opts: Parameters<typeof writeYamlFile>[2] = {
      schemaRef: schemaRefFor(spaceDir, file, 'actor'),
    }
    if (input.force) opts.force = true
    const res = writeYamlFile(file, value, opts)
    return finalize(res, file, `actor:${input.id}`)
  },
}

// ---------------------- pd_add_module ----------------------

interface AddModuleInput {
  id: string
  type?: 'frontend' | 'service' | 'database' | 'queue' | 'external'
  name?: string
  description?: string
  techStack?: string
  force?: boolean
  spaceDir?: string
}

export const addModuleTool: ToolDef<AddModuleInput, AddResult> = {
  name: 'pd_add_module',
  description:
    'Scaffold a new module (deployable unit: frontend / service / database / queue / external). Writes <space>/modules/<id>/module.yaml plus the components/ models/ (and tables/ for database+queue) subdirectories.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: {
        type: 'string',
        enum: ['frontend', 'service', 'database', 'queue', 'external'],
        description: 'Defaults to service.',
      },
      name: { type: 'string' },
      description: { type: 'string' },
      techStack: {
        type: 'string',
        description: "Free-form, e.g. 'Postgres 15', 'Next.js 15', 'Go 1.23'.",
      },
      force: { type: 'boolean' },
      spaceDir: { type: 'string' },
    },
    required: ['id'],
    additionalProperties: false,
  },
  handler(input) {
    ensureValidId(input.id, 'module')
    const spaceDir = resolveSpaceDir(input.spaceDir)
    const dir = path.join(spaceDir, 'modules', input.id)
    const file = path.join(dir, 'module.yaml')
    const type = input.type ?? 'service'
    const value = {
      kind: 'module',
      id: input.id,
      name: input.name ?? humanize(input.id),
      type,
      techStack: input.techStack ?? 'TODO',
      description: input.description ?? `TODO: describe ${humanize(input.id)}.`,
    }
    const opts: Parameters<typeof writeYamlFile>[2] = {
      schemaRef: schemaRefFor(spaceDir, file, 'module'),
    }
    if (input.force) opts.force = true
    const res = writeYamlFile(file, value, opts)
    return finalize(res, file, `module:${input.id}`)
  },
}

// ---------------------- pd_add_domain ----------------------

interface AddDomainInput {
  id: string
  module: string
  name?: string
  description?: string
  force?: boolean
  spaceDir?: string
}

export const addDomainTool: ToolDef<AddDomainInput, AddResult> = {
  name: 'pd_add_domain',
  description:
    'Scaffold a domain inside an existing module — DDD-style grouping of components/models/tables. Writes <space>/modules/<module>/domains/<id>/domain.yaml.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      module: { type: 'string', description: 'Parent module id.' },
      name: { type: 'string' },
      description: { type: 'string' },
      force: { type: 'boolean' },
      spaceDir: { type: 'string' },
    },
    required: ['id', 'module'],
    additionalProperties: false,
  },
  handler(input) {
    ensureValidId(input.id, 'domain')
    ensureValidId(input.module, 'module')
    const spaceDir = resolveSpaceDir(input.spaceDir)
    const dir = path.join(spaceDir, 'modules', input.module, 'domains', input.id)
    const file = path.join(dir, 'domain.yaml')
    const value = {
      id: input.id,
      name: input.name ?? humanize(input.id),
      description: input.description ?? `TODO: describe the ${humanize(input.id)} domain.`,
    }
    const opts: Parameters<typeof writeYamlFile>[2] = {
      schemaRef: schemaRefFor(spaceDir, file, 'domain'),
    }
    if (input.force) opts.force = true
    const res = writeYamlFile(file, value, opts)
    return finalize(res, file, `module:${input.module}/domain:${input.id}`)
  },
}

// ---------------------- pd_add_component ----------------------

interface AddComponentInput {
  id: string
  module: string
  domain?: string
  type?:
    | 'controller'
    | 'service'
    | 'repository'
    | 'infrastructure'
    | 'page'
    | 'widget'
    | 'client'
    | 'job'
    | 'consumer'
    | 'subscriber'
  name?: string
  description?: string
  force?: boolean
  spaceDir?: string
}

export const addComponentTool: ToolDef<AddComponentInput, AddResult> = {
  name: 'pd_add_component',
  description:
    'Scaffold a component inside a module (and optionally a domain). type defaults to service; consumer/subscriber are for push receivers (SSE clients, queue consumers, webhook handlers).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      module: { type: 'string' },
      domain: { type: 'string' },
      type: {
        type: 'string',
        enum: [
          'controller',
          'service',
          'repository',
          'infrastructure',
          'page',
          'widget',
          'client',
          'job',
          'consumer',
          'subscriber',
        ],
      },
      name: { type: 'string' },
      description: { type: 'string' },
      force: { type: 'boolean' },
      spaceDir: { type: 'string' },
    },
    required: ['id', 'module'],
    additionalProperties: false,
  },
  handler(input) {
    ensureValidId(input.id, 'component')
    ensureValidId(input.module, 'module')
    if (input.domain) ensureValidId(input.domain, 'domain')
    const spaceDir = resolveSpaceDir(input.spaceDir)
    const moduleDir = input.domain
      ? path.join(spaceDir, 'modules', input.module, 'domains', input.domain)
      : path.join(spaceDir, 'modules', input.module)
    const file = path.join(moduleDir, 'components', `${input.id}.yaml`)
    const value = {
      kind: 'component',
      id: input.id,
      name: input.name ?? input.id,
      type: input.type ?? 'service',
      description: input.description ?? `TODO: describe ${input.id}.`,
      methods: [],
    }
    const refPrefix = input.domain
      ? `module:${input.module}/domain:${input.domain}`
      : `module:${input.module}`
    const opts: Parameters<typeof writeYamlFile>[2] = {
      schemaRef: schemaRefFor(spaceDir, file, 'component'),
    }
    if (input.force) opts.force = true
    const res = writeYamlFile(file, value, opts)
    return finalize(res, file, `${refPrefix}/component:${input.id}`)
  },
}

// ---------------------- pd_add_model ----------------------

interface AddModelInput {
  id: string
  module: string
  domain?: string
  modelKind?: 'dto' | 'entity' | 'value-object' | 'event' | 'enum'
  name?: string
  description?: string
  values?: string[]
  force?: boolean
  spaceDir?: string
}

export const addModelTool: ToolDef<AddModelInput, AddResult> = {
  name: 'pd_add_model',
  description:
    "Scaffold a model (DTO, entity, value-object, event, or enum). For enum, pass values: ['a', 'b']; fields stays empty. For other kinds, a single placeholder id field is added.",
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      module: { type: 'string' },
      domain: { type: 'string' },
      modelKind: { type: 'string', enum: ['dto', 'entity', 'value-object', 'event', 'enum'] },
      name: { type: 'string' },
      description: { type: 'string' },
      values: {
        type: 'array',
        items: { type: 'string' },
        description: 'Required when modelKind=enum: the closed set of literal values.',
      },
      force: { type: 'boolean' },
      spaceDir: { type: 'string' },
    },
    required: ['id', 'module'],
    additionalProperties: false,
  },
  handler(input) {
    ensureValidId(input.id, 'model')
    ensureValidId(input.module, 'module')
    if (input.domain) ensureValidId(input.domain, 'domain')
    const modelKind = input.modelKind ?? 'dto'
    if (modelKind === 'enum' && (!input.values || input.values.length === 0)) {
      throw new Error('modelKind: enum requires non-empty values: list')
    }
    if (modelKind !== 'enum' && input.values) {
      throw new Error('values: is only valid for modelKind: enum')
    }
    const spaceDir = resolveSpaceDir(input.spaceDir)
    const moduleDir = input.domain
      ? path.join(spaceDir, 'modules', input.module, 'domains', input.domain)
      : path.join(spaceDir, 'modules', input.module)
    const file = path.join(moduleDir, 'models', `${input.id}.yaml`)
    const value: Record<string, unknown> = {
      kind: 'model',
      id: input.id,
      name: input.name ?? input.id,
      modelKind,
      description: input.description ?? `TODO: describe ${input.id}.`,
    }
    if (modelKind === 'enum') {
      value.values = input.values
    } else {
      value.fields = [{ name: 'id', type: 'uuid' }]
    }
    const refPrefix = input.domain
      ? `module:${input.module}/domain:${input.domain}`
      : `module:${input.module}`
    const opts: Parameters<typeof writeYamlFile>[2] = {
      schemaRef: schemaRefFor(spaceDir, file, 'model'),
    }
    if (input.force) opts.force = true
    const res = writeYamlFile(file, value, opts)
    return finalize(
      res,
      file,
      `${refPrefix}/model:${input.id}`,
      modelKind === 'enum'
        ? undefined
        : 'scaffolded placeholder field — replace fields from code extraction or edit manually.',
    )
  },
}

// ---------------------- pd_add_table ----------------------

interface AddTableInput {
  id: string
  module: string
  domain?: string
  name?: string
  description?: string
  force?: boolean
  spaceDir?: string
}

export const addTableTool: ToolDef<AddTableInput, AddResult> = {
  name: 'pd_add_table',
  description:
    'Scaffold a table inside a database or queue module. Adds a single uuid primary-key column as a placeholder; the agent should follow up with edits or use SQL DDL via pd add table --from-sql in the CLI.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      module: { type: 'string' },
      domain: { type: 'string' },
      name: { type: 'string' },
      description: { type: 'string' },
      force: { type: 'boolean' },
      spaceDir: { type: 'string' },
    },
    required: ['id', 'module'],
    additionalProperties: false,
  },
  handler(input) {
    ensureValidId(input.id, 'table')
    ensureValidId(input.module, 'module')
    if (input.domain) ensureValidId(input.domain, 'domain')
    const spaceDir = resolveSpaceDir(input.spaceDir)
    const moduleDir = input.domain
      ? path.join(spaceDir, 'modules', input.module, 'domains', input.domain)
      : path.join(spaceDir, 'modules', input.module)
    const file = path.join(moduleDir, 'tables', `${input.id}.yaml`)
    const value = {
      kind: 'table',
      id: input.id,
      name: input.name ?? input.id,
      description: input.description ?? `TODO: describe ${input.id}.`,
      columns: [{ name: 'id', sqlType: 'uuid', primaryKey: true, default: 'gen_random_uuid()' }],
    }
    const refPrefix = input.domain
      ? `module:${input.module}/domain:${input.domain}`
      : `module:${input.module}`
    const opts: Parameters<typeof writeYamlFile>[2] = {
      schemaRef: schemaRefFor(spaceDir, file, 'table'),
    }
    if (input.force) opts.force = true
    const res = writeYamlFile(file, value, opts)
    return finalize(
      res,
      file,
      `${refPrefix}/table:${input.id}`,
      "scaffolded placeholder column — use 'pd add table --from-sql' or import extracted columns.",
    )
  },
}

function finalize(
  res: { wrote: boolean; reason?: string },
  file: string,
  ref: string,
  warning?: string,
): AddResult {
  if (res.wrote) return warning ? { wrote: true, file, ref, warning } : { wrote: true, file, ref }
  return { wrote: false, file, ref, reason: res.reason ?? 'unknown reason' }
}
