import type { z } from 'zod'
import type { FileRole } from '../classify.js'
import { closestMatches } from '../levenshtein.js'
import {
  ActorSchema,
  ComponentSchema,
  ConfigMapFileSchema,
  DomainSchema,
  ExternalDepsFileSchema,
  ModelSchema,
  ModuleSchema,
  SpaceFileSchema,
  TableSchema,
  UseCaseSchema,
} from '../schema.js'
import type { ValidationCode, ValidationIssue } from './types.js'

const KNOWN_FIELDS: Record<string, readonly string[]> = {
  actor: ['kind', 'id', 'name', 'type', 'description'],
  module: [
    'kind',
    'id',
    'name',
    'type',
    'techStack',
    'description',
    'domains',
    'components',
    'models',
    'tables',
  ],
  domain: ['id', 'name', 'description', 'components', 'models', 'tables'],
  component: ['kind', 'id', 'name', 'type', 'methods', 'description'],
  model: ['kind', 'id', 'name', 'modelKind', 'fields', 'description', 'persistedAs'],
  table: ['kind', 'id', 'name', 'columns', 'indexes', 'description'],
  usecase: [
    'kind',
    'id',
    'name',
    'actor',
    'trigger',
    'description',
    'steps',
    'errorFlows',
    'invariants',
    'dataFlow',
  ],
  space: ['meta'],
  field: ['name', 'type', 'optional', 'description', 'example'],
  method: ['name', 'params', 'returns', 'calls', 'throws', 'description', 'httpMethod', 'httpPath'],
  column: ['name', 'sqlType', 'primaryKey', 'nullable', 'unique', 'foreignKey', 'description'],
  step: ['from', 'to', 'via', 'protocol', 'description'],
  errorFlow: ['id', 'condition', 'steps', 'resultDescription'],
  dataFlow: ['sourceField', 'targetField', 'transform'],
  invariants: ['pre', 'post'],
  meta: ['id', 'name', 'description', 'version', 'pizzaDocVersion'],
  index: ['name', 'columns', 'unique'],
  foreignKey: ['table', 'column'],
}

/**
 * Pass 1: per-file schema validation.
 *
 * Runs the Zod schema that matches the file's role, plus the filename/id match
 * rule from page 12. Returns a flat list of ValidationIssue.
 */
export function validateSchemaPass(
  filePath: string,
  role: FileRole,
  data: unknown,
  expectedSpaceId?: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  switch (role.kind) {
    case 'space': {
      const result = SpaceFileSchema.safeParse(data)
      if (!result.success) {
        issues.push(...mapZodIssues(result.error.issues, filePath, 'space'))
      } else if (expectedSpaceId && result.data.meta.id !== expectedSpaceId) {
        issues.push(filenameMismatch(filePath, result.data.meta.id, expectedSpaceId, 'space'))
      }
      break
    }
    case 'actor':
      runEntity(ActorSchema, data, filePath, role.id, 'actor', issues)
      break
    case 'module':
      runContainer(ModuleSchema, data, filePath, role.moduleId, 'module', issues)
      break
    case 'domain':
      runContainer(DomainSchema, data, filePath, role.domainId, 'domain', issues)
      break
    case 'component':
      runEntity(ComponentSchema, data, filePath, role.id, 'component', issues)
      break
    case 'model':
      runEntity(ModelSchema, data, filePath, role.id, 'model', issues)
      checkModelKindEnumConsistency(data, filePath, issues)
      break
    case 'table':
      runEntity(TableSchema, data, filePath, role.id, 'table', issues)
      break
    case 'usecase':
      runEntity(UseCaseSchema, data, filePath, role.id, 'usecase', issues)
      break
    case 'configMap':
      runListFile(ConfigMapFileSchema, data, filePath, 'config-map', issues)
      break
    case 'externalDeps':
      runListFile(ExternalDepsFileSchema, data, filePath, 'external-deps', issues)
      break
    case 'decision':
      // ADR validation runs in the loader's parseAdrFile (frontmatter
      // schema + filename↔id check). Nothing to do here.
      break
    case 'layout':
    case 'unknown':
      break
  }

  return issues
}

/**
 * Cross-field check for `modelKind: enum`.
 *
 * The Zod schema accepts `values?: string[]` and `fields: FieldSchema[]` on
 * any model so the surface stays simple, but only `enum` should carry a
 * `values` list and only non-enum models should declare `fields`. This
 * catches mismatches Zod's per-field rules can't.
 */
function checkModelKindEnumConsistency(
  data: unknown,
  filePath: string,
  issues: ValidationIssue[],
): void {
  if (!data || typeof data !== 'object') return
  const obj = data as { modelKind?: unknown; values?: unknown; fields?: unknown }
  const isEnum = obj.modelKind === 'enum'
  const hasValues = Array.isArray(obj.values) && obj.values.length > 0
  const hasFields = Array.isArray(obj.fields) && obj.fields.length > 0
  if (isEnum && !hasValues) {
    issues.push({
      severity: 'error',
      code: 'SCHEMA_INVALID_VALUE',
      message: `File ${filePath}: modelKind: enum requires a non-empty values: list (e.g. values: [claude-code, opencode]).`,
      file: filePath,
      path: ['values'],
    })
  }
  if (isEnum && hasFields) {
    issues.push({
      severity: 'error',
      code: 'SCHEMA_INVALID_VALUE',
      message: `File ${filePath}: modelKind: enum cannot declare fields:. Move structured data to a separate model or change modelKind.`,
      file: filePath,
      path: ['fields'],
    })
  }
  if (!isEnum && Array.isArray(obj.values) && obj.values.length > 0) {
    issues.push({
      severity: 'error',
      code: 'SCHEMA_INVALID_VALUE',
      message: `File ${filePath}: values: list is only valid for modelKind: enum (got modelKind: ${String(obj.modelKind ?? '<unset>')}).`,
      file: filePath,
      path: ['values'],
    })
  }
}

/**
 * For files whose top-level shape is a YAML list (config-map.yaml,
 * external-deps.yaml). The schema is `z.array(EntrySchema)`; we surface
 * every element-level issue with a clear path prefix.
 */
function runListFile<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  filePath: string,
  roleName: string,
  issues: ValidationIssue[],
): void {
  const result = schema.safeParse(data)
  if (!result.success) {
    issues.push(...mapZodIssues(result.error.issues, filePath, roleName))
  }
}

function runEntity<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  filePath: string,
  expectedId: string,
  roleName: string,
  issues: ValidationIssue[],
): void {
  const result = schema.safeParse(data)
  if (!result.success) {
    issues.push(...mapZodIssues(result.error.issues, filePath, roleName))
    return
  }
  const actualId = (result.data as { id?: string }).id
  if (actualId !== expectedId) {
    issues.push(filenameMismatch(filePath, actualId ?? '', expectedId, roleName))
  }
}

function runContainer<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  filePath: string,
  expectedId: string,
  roleName: string,
  issues: ValidationIssue[],
): void {
  const result = schema.safeParse(data)
  if (!result.success) {
    issues.push(...mapZodIssues(result.error.issues, filePath, roleName))
    return
  }
  const actualId = (result.data as { id?: string }).id
  if (actualId !== expectedId) {
    issues.push(filenameMismatch(filePath, actualId ?? '', expectedId, roleName))
  }
}

function filenameMismatch(
  filePath: string,
  actualId: string,
  expectedId: string,
  roleName: string,
): ValidationIssue {
  const hint =
    roleName === 'module' || roleName === 'domain' || roleName === 'space'
      ? 'id must equal the parent folder name'
      : 'id must equal the filename without extension'
  return {
    severity: 'error',
    code: 'SCHEMA_FILENAME_ID_MISMATCH',
    message: `File ${filePath} declares id '${actualId}' but ${hint} ('${expectedId}').`,
    file: filePath,
    suggestion: `Change id to '${expectedId}' or rename the file/folder to match.`,
  }
}

function mapZodIssues(
  zodIssues: readonly z.ZodIssue[],
  filePath: string,
  roleName: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const z of zodIssues) {
    issues.push(mapZodIssue(z, filePath, roleName))
  }
  return issues
}

function mapZodIssue(z: z.ZodIssue, filePath: string, roleName: string): ValidationIssue {
  const path = z.path
  const pathStr = formatZodPath(path)

  if (z.code === 'unrecognized_keys') {
    const keys = (z.keys ?? []) as string[]
    const joined = keys.map((k) => `'${k}'`).join(', ')
    const parentRole = inferRoleAtPath(path, roleName)
    const known = KNOWN_FIELDS[parentRole] ?? []
    const firstKey = keys[0] ?? ''
    const suggestions = closestMatches(firstKey, known)
    const issue: ValidationIssue = {
      severity: 'error',
      code: 'SCHEMA_UNKNOWN_FIELD',
      message: `Unknown field(s) ${joined} in ${filePath}${pathStr ? ` at ${pathStr}` : ''}.`,
      file: filePath,
      path,
    }
    if (suggestions.length > 0) issue.suggestion = `Did you mean '${suggestions[0]}'?`
    return issue
  }

  if (z.code === 'invalid_type') {
    if (z.received === 'undefined') {
      return {
        severity: 'error',
        code: 'SCHEMA_MISSING_REQUIRED',
        message: `Missing required field ${pathStr || '(root)'} in ${filePath}.`,
        file: filePath,
        path,
      }
    }
    return {
      severity: 'error',
      code: 'SCHEMA_WRONG_TYPE',
      message: `Expected ${z.expected} but got ${z.received} at ${pathStr || '(root)'} in ${filePath}.`,
      file: filePath,
      path,
    }
  }

  if (z.code === 'invalid_enum_value') {
    const lastKey = String(path[path.length - 1] ?? '')
    const options = (z.options as readonly string[]) ?? []
    const value = (z as { received?: unknown }).received
    const received = typeof value === 'string' ? value : String(value)
    const code: ValidationCode =
      lastKey === 'type' && roleName === 'module'
        ? 'SCHEMA_UNKNOWN_MODULE_TYPE'
        : lastKey === 'type' && roleName === 'component'
          ? 'SCHEMA_UNKNOWN_COMPONENT_TYPE'
          : lastKey === 'modelKind'
            ? 'SCHEMA_UNKNOWN_MODEL_KIND'
            : 'SCHEMA_INVALID_VALUE'
    return {
      severity: 'error',
      code,
      message: `Invalid value '${received}' at ${pathStr} in ${filePath}. Expected one of: ${options.join(', ')}.`,
      file: filePath,
      path,
    }
  }

  if (z.code === 'invalid_string') {
    const lastKey = String(path[path.length - 1] ?? '')
    if (isIdPath(lastKey)) {
      return {
        severity: 'error',
        code: 'SCHEMA_INVALID_ID',
        message: `Invalid id at ${pathStr} in ${filePath}: must match ^[a-zA-Z][a-zA-Z0-9_-]*$`,
        file: filePath,
        path,
      }
    }
    if (isRefPath(lastKey, path)) {
      return {
        severity: 'error',
        code: 'SCHEMA_INVALID_REF_PATTERN',
        message: `Invalid ref at ${pathStr} in ${filePath}: must start with 'module:', 'usecase:', or 'actor:'.`,
        file: filePath,
        path,
      }
    }
    return {
      severity: 'error',
      code: 'SCHEMA_INVALID_VALUE',
      message: `Invalid string at ${pathStr} in ${filePath}: ${z.message}`,
      file: filePath,
      path,
    }
  }

  return {
    severity: 'error',
    code: 'SCHEMA_INVALID_VALUE',
    message: `${z.message} at ${pathStr || '(root)'} in ${filePath}`,
    file: filePath,
    path,
  }
}

function isIdPath(lastKey: string): boolean {
  return lastKey === 'id'
}

const REF_FIELD_NAMES = new Set([
  'from',
  'to',
  'via',
  'actor',
  'persistedAs',
  'table', // inside foreignKey
])

function isRefPath(lastKey: string, path: readonly (string | number)[]): boolean {
  if (REF_FIELD_NAMES.has(lastKey)) return true
  // `calls` is an array of refs; an item path ends in a number with parent 'calls'.
  if (typeof path[path.length - 1] === 'number') {
    const parent = path[path.length - 2]
    if (parent === 'calls') return true
  }
  return false
}

function formatZodPath(path: readonly (string | number)[]): string {
  if (path.length === 0) return ''
  let out = ''
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`
    else out += out === '' ? seg : `.${seg}`
  }
  return out
}

/**
 * Given the role of the file and a Zod error path, figure out which sub-role
 * we're looking at so we can suggest the right field names.
 */
function inferRoleAtPath(path: readonly (string | number)[], roleName: string): string {
  // Walk the path looking at the deepest container name.
  for (let i = path.length - 1; i >= 0; i--) {
    const seg = path[i]
    if (typeof seg !== 'string') continue
    if (seg === 'fields') return 'field'
    if (seg === 'methods') return 'method'
    if (seg === 'params') return 'field'
    if (seg === 'columns') return 'column'
    if (seg === 'indexes') return 'index'
    if (seg === 'steps') return 'step'
    if (seg === 'errorFlows') return 'errorFlow'
    if (seg === 'dataFlow') return 'dataFlow'
    if (seg === 'invariants') return 'invariants'
    if (seg === 'meta') return 'meta'
    if (seg === 'foreignKey') return 'foreignKey'
    if (seg === 'components') return 'component'
    if (seg === 'models') return 'model'
    if (seg === 'tables') return 'table'
    if (seg === 'domains') return 'domain'
  }
  return roleName
}
