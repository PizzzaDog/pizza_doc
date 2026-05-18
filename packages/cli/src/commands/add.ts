import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseSqlDdl } from '../parsers/sql.js'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { schemaRefFor } from '../util/schemas.js'
import { findSpaceRoot } from '../util/space-path.js'
import { writeYamlFile } from '../util/yaml-emit.js'

type SchemaKind = 'actor' | 'module' | 'domain' | 'component' | 'model' | 'table'

function writeEntity(
  spaceDir: string,
  file: string,
  value: unknown,
  kind: SchemaKind,
  options?: { force?: boolean },
): { wrote: boolean; reason?: string } {
  const opts: { force?: boolean; schemaRef?: string } = {
    schemaRef: schemaRefFor(spaceDir, file, kind),
  }
  if (options?.force) opts.force = true
  return writeYamlFile(file, value, opts)
}

/**
 * `pd add <kind> [id] [flags]`
 *
 * `<kind>` ∈ actor | module | domain | component | model | table
 *
 * All scaffolds emit one well-formed YAML under the right path. The only
 * native importer is SQL DDL via `pd add table --from-sql` — SQL is a
 * language-agnostic declaration format so we parse it directly.
 *
 * For extracting entities out of application code (any language) the CLI
 * doesn't try to build language parsers. Use `pd import --from-jsonl`
 * instead and let the matching `pd-extract-<lang>` agent skill emit the
 * JSONL stream. That keeps the CLI language-neutral and pushes AST work
 * to tools that actually understand each language (tsc, javac, tree-sitter,
 * an LLM reading the source).
 */
export function cmdAdd(args: ParsedArgs): number {
  const kind = args.positional[0]
  if (!kind) return usage()
  const rest = { ...args, positional: args.positional.slice(1) }
  switch (kind) {
    case 'actor':
      return addActor(rest)
    case 'module':
      return addModule(rest)
    case 'domain':
      return addDomain(rest)
    case 'component':
      return addComponent(rest)
    case 'model':
      return addModel(rest)
    case 'table':
      return addTable(rest)
    default:
      console.error(red(`unknown kind: ${kind}`))
      return usage()
  }
}

function usage(): number {
  console.error(`usage: pd add <kind> <id> [flags]
  kinds: actor | module | domain | component | model | table
  common flags:
    --space <id>           target space (default: auto-detect from cwd)
    --module <id>          module for component/model/table (required)
    --domain <id>          optional domain inside that module
    --type <type>          component.type / module.type / actor.type
    --force                overwrite existing file
  importers:
    --from-sql <file>      (tables) parse DDL and emit matching YAML
  multi-file import from application code uses:
    pd import --from-jsonl <file>       (see pd-extract-<lang> skills)`)
  return 2
}

// ---------------------- resolve target space ----------------------

function resolveSpace(args: ParsedArgs): { spaceDir: string } {
  const explicit = typeof args.flags.space === 'string' ? args.flags.space : undefined
  const found = findSpaceRoot()
  if (explicit) {
    // Try both raw path and "spaces/<id>" relative to discovered monorepo root.
    const candidates = [
      path.resolve(explicit),
      found?.kind === 'monorepo' ? path.join(found.path, 'spaces', explicit) : null,
    ].filter((p): p is string => !!p)
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'space.yaml'))) return { spaceDir: c }
    }
    throw new Error(`no space.yaml found for --space ${explicit}`)
  }
  if (found?.kind === 'space') return { spaceDir: found.path }
  throw new Error('cannot infer target space — pass --space <id>')
}

function moduleDir(spaceDir: string, mod: string, domain?: string): string {
  return domain
    ? path.join(spaceDir, 'modules', mod, 'domains', domain)
    : path.join(spaceDir, 'modules', mod)
}

function ensureIdExists(id: string | undefined, kind: string): string {
  if (!id) {
    console.error(red(`usage: pd add ${kind} <id>`))
    process.exit(2)
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    console.error(red(`invalid id '${id}' — must match [A-Za-z][A-Za-z0-9_-]*`))
    process.exit(2)
  }
  return id
}

// ---------------------- actor ----------------------

function addActor(args: ParsedArgs): number {
  const id = ensureIdExists(args.positional[0], 'actor')
  const { spaceDir } = resolveSpace(args)
  const type = (typeof args.flags.type === 'string' && args.flags.type) || 'user'
  if (!['user', 'system', 'scheduler'].includes(type)) {
    console.error(red(`actor.type must be user | system | scheduler (got '${type}')`))
    return 2
  }
  const file = path.join(spaceDir, 'actors', `${id}.yaml`)
  const res = writeEntity(
    spaceDir,
    file,
    {
      kind: 'actor',
      id,
      name: humanize(id),
      type,
      description: `TODO: describe ${humanize(id)}.`,
    },
    'actor',
    { force: args.flags.force === true },
  )
  return reportWrite(res, file)
}

// ---------------------- module ----------------------

function addModule(args: ParsedArgs): number {
  const id = ensureIdExists(args.positional[0], 'module')
  const { spaceDir } = resolveSpace(args)
  const type = (typeof args.flags.type === 'string' && args.flags.type) || 'service'
  if (!['frontend', 'service', 'database', 'queue', 'external'].includes(type)) {
    console.error(
      red(`module.type must be frontend|service|database|queue|external (got '${type}')`),
    )
    return 2
  }
  const dir = path.join(spaceDir, 'modules', id)
  // Scaffold subdirectories the loader will walk.
  fs.mkdirSync(path.join(dir, 'components'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'models'), { recursive: true })
  if (type === 'database' || type === 'queue') {
    fs.mkdirSync(path.join(dir, 'tables'), { recursive: true })
  }
  const file = path.join(dir, 'module.yaml')
  const res = writeEntity(
    spaceDir,
    file,
    {
      kind: 'module',
      id,
      name: humanize(id),
      type,
      techStack:
        (typeof args.flags['tech-stack'] === 'string' && args.flags['tech-stack']) || 'TODO',
      description: `TODO: describe ${humanize(id)}.`,
    },
    'module',
    { force: args.flags.force === true },
  )
  return reportWrite(res, file)
}

// ---------------------- domain ----------------------

function addDomain(args: ParsedArgs): number {
  const id = ensureIdExists(args.positional[0], 'domain')
  const mod = requireFlag(args, 'module')
  const { spaceDir } = resolveSpace(args)
  const dir = path.join(spaceDir, 'modules', mod, 'domains', id)
  fs.mkdirSync(path.join(dir, 'components'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'models'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'tables'), { recursive: true })
  const file = path.join(dir, 'domain.yaml')
  const res = writeEntity(
    spaceDir,
    file,
    {
      id,
      name: humanize(id),
      description: `TODO: describe the ${humanize(id)} domain.`,
    },
    'domain',
    { force: args.flags.force === true },
  )
  return reportWrite(res, file)
}

// ---------------------- component ----------------------

function addComponent(args: ParsedArgs): number {
  const id = ensureIdExists(args.positional[0], 'component')
  const mod = requireFlag(args, 'module')
  const domain = typeof args.flags.domain === 'string' ? args.flags.domain : undefined
  const { spaceDir } = resolveSpace(args)
  const type = (typeof args.flags.type === 'string' && args.flags.type) || 'service'
  const valid = [
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
  ]
  if (!valid.includes(type)) {
    console.error(red(`component.type must be one of: ${valid.join(' | ')}`))
    return 2
  }
  const file = path.join(moduleDir(spaceDir, mod, domain), 'components', `${id}.yaml`)
  const res = writeEntity(
    spaceDir,
    file,
    {
      kind: 'component',
      id,
      name: id,
      type,
      description: `TODO: describe ${id}.`,
      methods: [],
    },
    'component',
    { force: args.flags.force === true },
  )
  return reportWrite(res, file)
}

// ---------------------- model ----------------------

function addModel(args: ParsedArgs): number {
  const id = ensureIdExists(args.positional[0], 'model')
  const mod = requireFlag(args, 'module')
  const domain = typeof args.flags.domain === 'string' ? args.flags.domain : undefined
  const { spaceDir } = resolveSpace(args)
  const modelKind = (typeof args.flags.kind === 'string' && args.flags.kind) || 'dto'
  if (!['dto', 'entity', 'value-object', 'event'].includes(modelKind)) {
    console.error(red('--kind must be dto | entity | value-object | event'))
    return 2
  }

  const file = path.join(moduleDir(spaceDir, mod, domain), 'models', `${id}.yaml`)
  const res = writeEntity(
    spaceDir,
    file,
    {
      kind: 'model',
      id,
      name: id,
      modelKind,
      description: `TODO: describe ${id}.`,
      fields: [{ name: 'id', type: 'uuid' }],
    },
    'model',
    { force: args.flags.force === true },
  )
  return reportWrite(
    res,
    file,
    'scaffolded placeholder field — replace fields from code extraction or edit manually.',
  )
}

// ---------------------- table ----------------------

function addTable(args: ParsedArgs): number {
  const idArg = args.positional[0]
  const mod = requireFlag(args, 'module')
  const domain = typeof args.flags.domain === 'string' ? args.flags.domain : undefined
  const { spaceDir } = resolveSpace(args)

  if (typeof args.flags['from-sql'] === 'string') {
    const source = fs.readFileSync(args.flags['from-sql'], 'utf8')
    const tables = parseSqlDdl(source)
    if (tables.length === 0) {
      console.error(red(`no CREATE TABLE statements found in ${args.flags['from-sql']}`))
      return 1
    }
    let written = 0
    for (const table of tables) {
      const file = path.join(moduleDir(spaceDir, mod, domain), 'tables', `${table.id}.yaml`)
      const res = writeEntity(spaceDir, file, table, 'table', { force: args.flags.force === true })
      if (res.wrote) {
        written++
        console.log(`${green('✓')} ${path.relative(process.cwd(), file)}`)
      } else {
        console.log(`${yellow('~')} ${path.relative(process.cwd(), file)}: ${res.reason}`)
      }
    }
    console.log(`\n${bold(`${written}/${tables.length} tables written`)}`)
    return 0
  }

  const id = ensureIdExists(idArg, 'table')
  const file = path.join(moduleDir(spaceDir, mod, domain), 'tables', `${id}.yaml`)
  const res = writeEntity(
    spaceDir,
    file,
    {
      kind: 'table',
      id,
      name: id,
      description: `TODO: describe ${id}.`,
      columns: [{ name: 'id', sqlType: 'uuid', primaryKey: true, default: 'gen_random_uuid()' }],
    },
    'table',
    { force: args.flags.force === true },
  )
  return reportWrite(
    res,
    file,
    "scaffolded placeholder column — use 'pd add table --from-sql' or import extracted columns.",
  )
}

// ---------------------- shared helpers ----------------------

function requireFlag(args: ParsedArgs, name: string): string {
  const v = args.flags[name]
  if (typeof v !== 'string' || !v) {
    console.error(red(`--${name} is required`))
    process.exit(2)
  }
  return v
}

function humanize(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ')
}

function reportWrite(
  res: { wrote: boolean; reason?: string },
  file: string,
  warning?: string,
): number {
  const rel = path.relative(process.cwd(), file)
  if (res.wrote) {
    console.log(`${green('✓')} ${bold(rel)}`)
    if (warning) console.log(`${yellow('⚠')} ${warning}`)
    console.log(dim('  remember to update ref-grammar in callers / usecases.'))
    return 0
  }
  console.log(`${yellow('~')} ${cyan(rel)}: ${res.reason}`)
  return 1
}
