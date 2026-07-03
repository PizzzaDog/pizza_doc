import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { parseSourceRef } from '../util/anchors.js'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { findSpaceRoot, listSpacesIn } from '../util/space-path.js'
import { writeYamlFile } from '../util/yaml-emit.js'

/**
 * `pd import --from-jsonl <file> [--space-dir <dir>] [--merge]`
 *
 * Universal bridge between language-specific extractors and a Pizza Doc
 * space. The CLI is **intentionally** not a multi-language parser —
 * language-aware extraction is pushed to external tools (an agent skill,
 * an AST-based extractor binary, a Prisma schema reader, whatever) that
 * emit a stream of entity declarations in our canonical JSONL shape.
 *
 * Each JSONL line is one entity. The format mirrors the Zod schemas in
 * `@pizza-doc/core` plus a `_placement` envelope describing where the
 * entity lives in the space directory tree.
 *
 *   {"_placement":{"spaceId":"restik","module":"backend","domain":"identity"},
 *    "kind":"model","id":"User","name":"User","modelKind":"entity",...}
 *
 *   {"_placement":{"spaceId":"restik","module":"postgres-db","domain":"public"},
 *    "kind":"table","id":"id_users",...}
 *
 * Space / actor placements omit `module`; module placements include only
 * `{spaceId, module}`; domain placements include `{spaceId, module,
 * domain}`; component/model/table add the domain if the entity lives in
 * one, else omit it.
 *
 * Errors write nothing (transactional-ish) so a partial import never
 * half-destroys the target space.
 *
 * Rename guard (v0.6 — code-anchoring Phase 3): an incoming NEW entity
 * whose `sourceRef` file is already cited by an existing same-kind
 * entity with a different id — an id this import does NOT also carry —
 * is almost certainly a rename in code. Writing it would fork the spec
 * (the old yaml lingers and every ref keeps pointing at it), so the
 * entry is skipped with a rename hint instead. Ambiguous matches
 * (several candidates in one file) are left alone.
 */
export async function cmdImport(args: ParsedArgs): Promise<number> {
  const file = typeof args.flags['from-jsonl'] === 'string' ? args.flags['from-jsonl'] : undefined
  if (!file) {
    console.error(red('usage: pd import --from-jsonl <file> [--space-dir <dir>] [--merge]'))
    return 2
  }
  if (!fs.existsSync(file)) {
    console.error(red(`file not found: ${file}`))
    return 1
  }

  const found = findSpaceRoot()
  const ctx = buildImportContext(args, found)
  const force = args.flags.force === true
  const merge = args.flags.merge === true
  const dryRun = args.flags['dry-run'] === true

  const lines = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
  const plans: PlanEntry[] = []
  const errors: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    let entry: ImportEntry
    try {
      entry = JSON.parse(line) as ImportEntry
    } catch (e) {
      errors.push(`line ${i + 1}: invalid JSON — ${(e as Error).message}`)
      continue
    }
    const resolved = resolvePath(entry, ctx)
    if (!resolved.ok) {
      errors.push(`line ${i + 1}: ${resolved.reason}`)
      continue
    }
    // Strip the `_placement` envelope before writing — it's transport-only.
    const body = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== '_placement'))
    plans.push({ filePath: resolved.filePath, body, spaceDir: resolved.spaceDir })
  }

  if (errors.length > 0) {
    for (const msg of errors) console.error(red(`  ${msg}`))
    return 1
  }

  // v0.6 (code-anchoring Phase 3) — rename guard, see the doc comment.
  const renameSkips = detectRenameForks(plans)

  console.log(
    `${bold(cyan('import plan:'))} ${plans.length} entit${plans.length === 1 ? 'y' : 'ies'} from ${path.relative(process.cwd(), file)}`,
  )
  if (dryRun) {
    for (const { filePath } of plans) {
      const hint = renameSkips.get(filePath)
      if (hint) {
        console.log(`  ${yellow('would skip')} ${path.relative(process.cwd(), filePath)}: ${hint}`)
      } else {
        console.log(`  ${dim('would write')} ${path.relative(process.cwd(), filePath)}`)
      }
    }
    return 0
  }

  let written = 0
  let skipped = 0
  let renameSkipped = 0
  for (const { filePath, body } of plans) {
    const renameHint = renameSkips.get(filePath)
    if (renameHint) {
      console.log(`${yellow('~')} ${path.relative(process.cwd(), filePath)}: ${renameHint}`)
      renameSkipped++
      continue
    }
    const res = writeImportFile(filePath, body, { force, merge })
    if (res.wrote) {
      console.log(
        `${green('✓')} ${path.relative(process.cwd(), filePath)}${res.merged ? dim(' merged') : ''}`,
      )
      written++
    } else {
      console.log(`${yellow('~')} ${path.relative(process.cwd(), filePath)}: ${res.reason}`)
      skipped++
    }
  }
  console.log(
    `\n${bold(`${written} written`)}${skipped > 0 ? `, ${yellow(`${skipped} skipped (use --force to overwrite)`)}` : ''}${renameSkipped > 0 ? `, ${yellow(`${renameSkipped} rename-guarded (apply the rename in yaml; drop sourceRef to force a fork)`)}` : ''}`,
  )
  return 0
}

// ---------- placement resolution ----------

interface ImportEntry {
  kind?: string
  id?: string
  _placement?: {
    spaceId?: string
    module?: string
    domain?: string
  }
  [key: string]: unknown
}

interface PlanEntry {
  filePath: string
  body: Record<string, unknown>
  /** Root of the space this entry resolves into — the rename guard scans it. */
  spaceDir: string
}

interface ImportContext {
  found: ReturnType<typeof findSpaceRoot>
  explicitSpaceDir?: string
  explicitSpaceId?: string
}

function buildImportContext(
  args: ParsedArgs,
  found: ReturnType<typeof findSpaceRoot>,
): ImportContext {
  const explicitSpaceDir =
    typeof args.flags['space-dir'] === 'string'
      ? path.resolve(args.flags['space-dir'])
      : typeof args.flags.spaceDir === 'string'
        ? path.resolve(args.flags.spaceDir)
        : undefined
  const explicitSpaceId = typeof args.flags.space === 'string' ? args.flags.space : undefined
  const ctx: ImportContext = { found }
  if (explicitSpaceDir !== undefined) ctx.explicitSpaceDir = explicitSpaceDir
  if (explicitSpaceId !== undefined) ctx.explicitSpaceId = explicitSpaceId
  return ctx
}

/**
 * Map an entry to the path where its YAML lives. Mirrors the loader's
 * directory conventions exactly (see `packages/core/src/classify.ts`):
 *
 *   <space>/space.yaml
 *   <space>/actors/<aid>.yaml
 *   <space>/modules/<mid>/module.yaml
 *   <space>/modules/<mid>/domains/<did>/domain.yaml
 *   <space>/modules/<mid>/[domains/<did>/]components/<cid>.yaml
 *   <space>/modules/<mid>/[domains/<did>/]models/<mid>.yaml
 *   <space>/modules/<mid>/[domains/<did>/]tables/<tid>.yaml
 *   <space>/use-cases/<ucid>.yaml
 */
function resolvePath(
  entry: ImportEntry,
  ctx: ImportContext,
): { ok: true; filePath: string; spaceDir: string } | { ok: false; reason: string } {
  const p = entry._placement ?? {}
  const spaceDir = resolveSpaceDirForEntry(p.spaceId, ctx)
  if (!spaceDir) {
    return {
      ok: false,
      reason: `could not resolve target space for entry kind=${entry.kind ?? '?'}; pass --space-dir <dir>, run from inside a single .pizza-doc space, or include _placement.spaceId in multi-space layout`,
    }
  }

  const id = entry.id as string | undefined
  const kind = entry.kind as string | undefined

  // The space.yaml itself doesn't carry `kind:` — detect via meta.
  if (entry.meta && typeof entry.meta === 'object') {
    return { ok: true, filePath: path.join(spaceDir, 'space.yaml'), spaceDir }
  }

  if (kind === 'actor' && id) {
    return { ok: true, filePath: path.join(spaceDir, 'actors', `${id}.yaml`), spaceDir }
  }
  if (kind === 'module' && id) {
    return { ok: true, filePath: path.join(spaceDir, 'modules', id, 'module.yaml'), spaceDir }
  }
  if (kind === 'usecase' && id) {
    return { ok: true, filePath: path.join(spaceDir, 'use-cases', `${id}.yaml`), spaceDir }
  }

  if (!p.module || !id) {
    return {
      ok: false,
      reason: `could not resolve path for entry kind=${kind ?? '?'}; component/model/table entries need _placement.module and id`,
    }
  }
  const baseDir = p.domain
    ? path.join(spaceDir, 'modules', p.module, 'domains', p.domain)
    : path.join(spaceDir, 'modules', p.module)

  // domain.yaml comes in without `kind:` — detect by missing kind + domain placement.
  if (!kind && p.domain) {
    return { ok: true, filePath: path.join(baseDir, 'domain.yaml'), spaceDir }
  }
  if (kind === 'component') {
    return { ok: true, filePath: path.join(baseDir, 'components', `${id}.yaml`), spaceDir }
  }
  if (kind === 'model') {
    return { ok: true, filePath: path.join(baseDir, 'models', `${id}.yaml`), spaceDir }
  }
  if (kind === 'table') {
    return { ok: true, filePath: path.join(baseDir, 'tables', `${id}.yaml`), spaceDir }
  }
  return { ok: false, reason: `could not resolve path for entry kind=${kind ?? '?'}` }
}

function resolveSpaceDirForEntry(spaceId: string | undefined, ctx: ImportContext): string | null {
  if (ctx.explicitSpaceDir) return ctx.explicitSpaceDir

  if (ctx.explicitSpaceId) {
    const direct = path.resolve(ctx.explicitSpaceId)
    if (fs.existsSync(path.join(direct, 'space.yaml'))) return direct
    if (ctx.found?.kind === 'monorepo')
      return path.join(ctx.found.path, 'spaces', ctx.explicitSpaceId)
    return path.join(process.cwd(), 'spaces', ctx.explicitSpaceId)
  }

  if (!spaceId) {
    if (ctx.found?.kind === 'space') return ctx.found.path
    if (ctx.found?.kind === 'monorepo') {
      const ids = listSpacesIn(ctx.found.path)
      return ids.length === 1 && ids[0] ? path.join(ctx.found.path, 'spaces', ids[0]) : null
    }
    return null
  }

  if (ctx.found?.kind === 'space') {
    const currentId = readSpaceId(ctx.found.path)
    if (!currentId || currentId === spaceId) return ctx.found.path
  }
  if (ctx.found?.kind === 'monorepo') return path.join(ctx.found.path, 'spaces', spaceId)
  return path.join(process.cwd(), 'spaces', spaceId)
}

function readSpaceId(spaceDir: string): string | null {
  try {
    const parsed = parseYaml(fs.readFileSync(path.join(spaceDir, 'space.yaml'), 'utf8')) as {
      meta?: { id?: unknown }
    } | null
    return typeof parsed?.meta?.id === 'string' ? parsed.meta.id : null
  } catch {
    return null
  }
}

function writeImportFile(
  filePath: string,
  body: unknown,
  options: { force: boolean; merge: boolean },
): { wrote: boolean; merged?: boolean; reason?: string } {
  if (!options.merge) return writeYamlFile(filePath, body, { force: options.force })
  if (!fs.existsSync(filePath)) return writeYamlFile(filePath, body)

  let existing: unknown
  try {
    existing = parseYaml(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    return {
      wrote: false,
      reason: `cannot merge: existing YAML does not parse (${(err as Error).message})`,
    }
  }
  return { ...writeYamlFile(filePath, deepMerge(existing, body), { force: true }), merged: true }
}

function deepMerge(existing: unknown, incoming: unknown): unknown {
  if (Array.isArray(existing) && Array.isArray(incoming)) return mergeArrays(existing, incoming)
  if (isRecord(existing) && isRecord(incoming)) {
    const out: Record<string, unknown> = { ...existing }
    for (const [key, value] of Object.entries(incoming)) {
      out[key] = key in out ? deepMerge(out[key], value) : value
    }
    return out
  }
  return incoming
}

function mergeArrays(existing: unknown[], incoming: unknown[]): unknown[] {
  const key = stableArrayKey(incoming) ?? stableArrayKey(existing)
  if (!key) return incoming

  const out = [...existing]
  const positions = new Map<string, number>()
  for (let i = 0; i < out.length; i++) {
    const item = out[i]
    if (!isRecord(item)) continue
    const value = item[key]
    if (typeof value === 'string') positions.set(value, i)
  }

  for (const item of incoming) {
    if (!isRecord(item) || typeof item[key] !== 'string') {
      out.push(item)
      continue
    }
    const pos = positions.get(item[key])
    if (pos === undefined) {
      positions.set(item[key], out.length)
      out.push(item)
      continue
    }
    out[pos] = deepMerge(out[pos], item)
  }
  return out
}

function stableArrayKey(items: unknown[]): string | null {
  for (const key of ['id', 'name', 'key']) {
    if (
      items.length > 0 &&
      items.every((item) => isRecord(item) && typeof item[key] === 'string')
    ) {
      return key
    }
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------- rename guard (v0.6 — code-anchoring Phase 3) ----------

const RENAME_GUARDED_KINDS = new Set(['component', 'model', 'table'])

/**
 * Map plan filePath → human hint for incoming NEW entities whose
 * `sourceRef` file is already cited by an existing same-kind entity with
 * a different id that this import does not also carry. Writing such a
 * plan forks a renamed symbol into two yamls — the fix is a rename.
 */
function detectRenameForks(plans: ReadonlyArray<PlanEntry>): Map<string, string> {
  const out = new Map<string, string>()
  const bySpace = new Map<string, PlanEntry[]>()
  for (const p of plans) {
    bySpace.set(p.spaceDir, [...(bySpace.get(p.spaceDir) ?? []), p])
  }
  for (const [spaceDir, spacePlans] of bySpace) {
    // Ids arriving in this import, per kind — an existing entity that is
    // itself re-imported is alive in the code, not renamed.
    const incoming = new Set<string>()
    for (const p of spacePlans) {
      if (typeof p.body.kind === 'string' && typeof p.body.id === 'string') {
        incoming.add(`${p.body.kind}|${p.body.id}`)
      }
    }
    // Existing entities on disk, grouped by (kind, sourceRef file).
    const existing = new Map<string, Array<{ id: string; yamlPath: string }>>()
    for (const yamlPath of listEntityYamls(spaceDir)) {
      let parsed: unknown
      try {
        parsed = parseYaml(fs.readFileSync(yamlPath, 'utf8'))
      } catch {
        continue
      }
      if (!isRecord(parsed)) continue
      const { kind, id, sourceRef } = parsed
      if (typeof kind !== 'string' || typeof id !== 'string' || typeof sourceRef !== 'string') {
        continue
      }
      const key = `${kind}|${parseSourceRef(sourceRef).filePath}`
      existing.set(key, [...(existing.get(key) ?? []), { id, yamlPath }])
    }
    for (const p of spacePlans) {
      const { kind, id, sourceRef } = p.body
      if (typeof kind !== 'string' || typeof id !== 'string' || typeof sourceRef !== 'string') {
        continue
      }
      if (!RENAME_GUARDED_KINDS.has(kind)) continue
      if (fs.existsSync(p.filePath)) continue // not NEW — the id already has a home
      const file = parseSourceRef(sourceRef).filePath
      const candidates = (existing.get(`${kind}|${file}`) ?? []).filter(
        (c) => c.id !== id && !incoming.has(`${kind}|${c.id}`),
      )
      if (candidates.length !== 1) continue // no match, or ambiguous — leave alone
      const old = candidates[0]
      if (!old) continue
      out.set(
        p.filePath,
        `rename? existing ${kind} '${old.id}' (${path.relative(spaceDir, old.yamlPath)}) cites the same sourceRef file '${file}' — rename that yaml's id + every ref to it instead of adding a fork`,
      )
    }
  }
  return out
}

/** Component/model/table yamls under `<space>/modules/`, recursively. */
function listEntityYamls(spaceDir: string): string[] {
  const out: string[] = []
  const modulesDir = path.join(spaceDir, 'modules')
  if (!fs.existsSync(modulesDir)) return out
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(p)
      } else if (entry.isFile() && entry.name.endsWith('.yaml')) {
        const parent = path.basename(dir)
        if (parent === 'components' || parent === 'models' || parent === 'tables') out.push(p)
      }
    }
  }
  walk(modulesDir)
  return out
}
