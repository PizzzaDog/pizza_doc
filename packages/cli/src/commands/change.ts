import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ChangeStatusSchema,
  changeOverlayRoot,
  listChangeSets,
  loadSpace,
  loadSpaceWithChange,
  readChangeSet,
  validate,
} from '@pizza-doc/core'
import type { ChangeSet, ChangeStatus, Space, ValidationIssue } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'
import { stringify as yamlStringify } from 'yaml'
import type { ParsedArgs } from '../util/args.js'
import { bold, cyan, dim, green, red, yellow } from '../util/colors.js'
import { printSpaceDiff } from '../util/diff.js'
import { expectedSpaceId, resolveSpaceDir } from '../util/space-path.js'

const STATUS_ORDER: ChangeStatus[] = [
  'draft',
  'design-review',
  'design-approved',
  'implementing',
  'verified',
  'adopted',
  'rejected',
]

export async function cmdChange(args: ParsedArgs): Promise<number> {
  const [subcommand, ...positional] = args.positional
  const subArgs = { positional, flags: args.flags }

  switch (subcommand) {
    case 'init':
      return initChange(subArgs)
    case 'list':
      return await listChanges(subArgs)
    case 'show':
      return await showChange(subArgs)
    case 'diff':
      return await diffChange(subArgs)
    case 'adopt':
      return await adoptChange(subArgs)
    case 'reject':
      return await setChangeStatus(subArgs, 'rejected')
    case 'status':
      return await statusChange(subArgs)
    default:
      console.error(red('usage: pd change <init|list|show|diff|adopt|reject|status> ...'))
      return 2
  }
}

function initChange(args: ParsedArgs): number {
  const id = args.positional[0]
  if (!id) {
    console.error(red('usage: pd change init <id> --title "..."'))
    return 2
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id)) {
    console.error(red(`invalid change id '${id}' — use letters, numbers, '_' or '-'`))
    return 2
  }
  const dir = resolveSpaceDir(undefined)
  const changeDir = path.join(dir, 'changes', id)
  const changeYaml = path.join(changeDir, 'change.yaml')
  if (fs.existsSync(changeYaml)) {
    console.error(red(`change '${id}' already exists at ${changeYaml}`))
    return 1
  }

  const title = typeof args.flags.title === 'string' ? args.flags.title : titleCase(id)
  const owner = typeof args.flags.owner === 'string' ? args.flags.owner : undefined
  const change: ChangeSet = {
    id,
    title,
    status: 'draft',
    createdAt: new Date().toISOString(),
    scope: { modules: [], services: [] },
    implementation: { requiredChecks: [], requiredCodeOwners: [] },
    deletes: [],
  }
  if (owner) change.owner = owner

  fs.mkdirSync(path.join(changeDir, 'overlay'), { recursive: true })
  fs.writeFileSync(changeYaml, yamlStringify(change, { lineWidth: 0 }), 'utf8')

  console.log(`${green('✓')} ${bold(`changes/${id}/`)} created`)
  console.log(
    `  ${dim('overlay:')} ${path.relative(process.cwd(), path.join(changeDir, 'overlay'))}`,
  )
  return 0
}

async function listChanges(args: ParsedArgs): Promise<number> {
  const dir = resolveSpaceDir(args.positional[0])
  const changes = await listChangeSets(nodeFileSystem(dir))
  if (changes.length === 0) {
    console.log(dim('no change sets'))
    return 0
  }
  for (const { change } of changes) {
    console.log(`${cyan(change.id)}  ${statusColor(change.status)}  ${change.title}`)
  }
  return 0
}

async function showChange(args: ParsedArgs): Promise<number> {
  const id = requireChangeId(args, 'usage: pd change show <id>')
  if (!id) return 2
  const dir = resolveSpaceDir(args.positional[1])
  const fsys = nodeFileSystem(dir)
  const result = await readChangeSet(fsys, id)
  if (!result.change) return printChangeLoadErrors(result.issues)

  const change = result.change
  console.log(`${bold(cyan(change.id))}  ${statusColor(change.status)}`)
  console.log(`  ${change.title}`)
  console.log(`  ${dim('created:')} ${change.createdAt}`)
  if (change.owner) console.log(`  ${dim('owner:')} ${change.owner}`)
  if (change.scope) {
    if (change.scope.modules.length > 0) {
      console.log(`  ${dim('modules:')} ${change.scope.modules.join(', ')}`)
    }
    if (change.scope.services.length > 0) {
      console.log(`  ${dim('services:')} ${change.scope.services.join(', ')}`)
    }
  }
  if (change.implementation?.requiredChecks.length) {
    console.log(`  ${dim('checks:')}`)
    for (const check of change.implementation.requiredChecks) console.log(`    ${check}`)
  }
  if (change.deletes.length > 0) {
    console.log(`  ${dim('deletes:')}`)
    for (const p of change.deletes) console.log(`    ${red('-')} ${p}`)
  }

  const overlay = await overlayFiles(dir, id)
  if (overlay.length > 0) {
    console.log(`  ${dim('overlay:')}`)
    for (const p of overlay) console.log(`    ${green('+/-')} ${p}`)
  }
  return 0
}

async function diffChange(args: ParsedArgs): Promise<number> {
  const id = requireChangeId(args, 'usage: pd change diff <id>')
  if (!id) return 2
  const dir = resolveSpaceDir(args.positional[1])
  const fsys = nodeFileSystem(dir)
  const baseline = await loadBaselineForDiff(dir)
  const merged = await loadSpaceWithChange(fsys, id, '.', expectedSpaceId(dir))
  validate(merged)
  if (!baseline || !merged.space) {
    console.error(red(`failed to load change '${id}'`))
    return 1
  }
  printSpaceDiff(baseline, merged.space, `baseline..change/${id}`)
  return 0
}

async function adoptChange(args: ParsedArgs): Promise<number> {
  const id = requireChangeId(args, 'usage: pd change adopt <id>')
  if (!id) return 2
  const dir = resolveSpaceDir(args.positional[1])
  const fsys = nodeFileSystem(dir)
  const changeResult = await readChangeSet(fsys, id)
  if (!changeResult.change) return printChangeLoadErrors(changeResult.issues)

  const merged = await loadSpaceWithChange(fsys, id, '.', expectedSpaceId(dir))
  const validation = validate(merged)
  const errors = validation.issues.filter((i) => i.severity === 'error')
  if (!merged.space || errors.length > 0) {
    console.error(red(`change '${id}' is not adoptable: validation has ${errors.length} errors`))
    for (const issue of errors.slice(0, 10)) printIssue(issue)
    if (errors.length > 10) console.error(dim(`  ...and ${errors.length - 10} more`))
    return 1
  }

  for (const deletePath of changeResult.change.deletes) {
    const target = safeSpacePath(dir, deletePath)
    if (fs.existsSync(target)) fs.rmSync(target, { force: true })
  }

  const overlay = await overlayFiles(dir, id)
  for (const rel of overlay) {
    const source = safeSpacePath(dir, path.posix.join(changeOverlayRoot(id), rel))
    const target = safeSpacePath(dir, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
  }

  await writeChange(dir, {
    ...changeResult.change,
    status: 'adopted',
    adoptedAt: new Date().toISOString(),
  })

  console.log(`${green('✓')} adopted ${bold(id)} into canonical .pizza-doc`)
  console.log(
    `  ${dim(`${overlay.length} overlay files applied, ${changeResult.change.deletes.length} deletes`)}`,
  )
  return 0
}

async function statusChange(args: ParsedArgs): Promise<number> {
  const id = requireChangeId(args, `usage: pd change status <id> <${STATUS_ORDER.join('|')}>`)
  if (!id) return 2
  const status = args.positional[1]
  const parsed = ChangeStatusSchema.safeParse(status)
  if (!parsed.success) {
    console.error(red(`invalid status '${status}'. Expected one of: ${STATUS_ORDER.join(', ')}`))
    return 2
  }
  return await setChangeStatus(args, parsed.data)
}

async function setChangeStatus(args: ParsedArgs, status: ChangeStatus): Promise<number> {
  const id = requireChangeId(args, `usage: pd change status <id> <${STATUS_ORDER.join('|')}>`)
  if (!id) return 2
  const dir = resolveSpaceDir(args.positional[status === 'rejected' ? 1 : 2])
  const result = await readChangeSet(nodeFileSystem(dir), id)
  if (!result.change) return printChangeLoadErrors(result.issues)
  const next: ChangeSet = { ...result.change, status }
  if (status === 'rejected') next.rejectedAt = new Date().toISOString()
  await writeChange(dir, next)
  console.log(`${green('✓')} ${id} → ${statusColor(status)}`)
  return 0
}

async function loadBaselineForDiff(dir: string): Promise<Space | null> {
  const result = await loadSpace(nodeFileSystem(dir), '.', expectedSpaceId(dir))
  validate(result)
  return result.space
}

async function writeChange(spaceDir: string, change: ChangeSet): Promise<void> {
  const file = safeSpacePath(spaceDir, `changes/${change.id}/change.yaml`)
  fs.writeFileSync(file, yamlStringify(change, { lineWidth: 0 }), 'utf8')
}

async function overlayFiles(spaceDir: string, id: string): Promise<string[]> {
  const root = path.join(spaceDir, changeOverlayRoot(id))
  if (!fs.existsSync(root)) return []
  const out: string[] = []
  walkFiles(root, root, out)
  return out.sort()
}

function walkFiles(root: string, dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(root, abs, out)
    else if (entry.isFile()) out.push(path.relative(root, abs).split(path.sep).join('/'))
  }
}

function requireChangeId(args: ParsedArgs, usage: string): string | null {
  const id = args.positional[0]
  if (!id) {
    console.error(red(usage))
    return null
  }
  return id
}

function printChangeLoadErrors(issues: ValidationIssue[]): number {
  for (const issue of issues) printIssue(issue)
  return 1
}

function printIssue(issue: ValidationIssue): void {
  const loc = issue.file ? dim(` [${issue.file}${issue.line ? `:${issue.line}` : ''}]`) : ''
  console.error(`  ${cyan(issue.code)}${loc}`)
  console.error(`    ${issue.message}`)
}

function statusColor(status: ChangeStatus): string {
  switch (status) {
    case 'adopted':
    case 'verified':
    case 'design-approved':
      return green(status)
    case 'rejected':
      return red(status)
    case 'implementing':
    case 'design-review':
      return yellow(status)
    case 'draft':
      return dim(status)
  }
}

function safeSpacePath(spaceDir: string, rel: string): string {
  const normalized = rel.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.split('/').some((p) => p === '..')) {
    throw new Error(`unsafe space path: ${rel}`)
  }
  const root = path.resolve(spaceDir)
  const abs = path.resolve(root, normalized)
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error(`unsafe space path: ${rel}`)
  }
  return abs
}

function titleCase(id: string): string {
  return id
    .split(/[-_]/)
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(' ')
}
