import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Space } from '@pizza-doc/core'
import { loadSpace, loadSpaceWithChange, validate } from '@pizza-doc/core'
import { nodeFileSystem } from '@pizza-doc/core/node-io'
import type { ParsedArgs } from '../util/args.js'
import { red } from '../util/colors.js'
import { printSpaceDiff } from '../util/diff.js'
import { expectedSpaceId, resolveSpaceDir } from '../util/space-path.js'

/**
 * `pd diff <ref>` — structural diff between a git ref and the working tree.
 * Lists added / removed / changed entities at the entity level: components,
 * models, tables, use cases.
 *
 * Why not `git diff`? Because YAML reordering, whitespace, and unrelated
 * field edits drown the signal. This command reports "OrderDto gained the
 * `shippingAddress` field" — the actual spec change.
 */
export async function cmdDiff(args: ParsedArgs): Promise<number> {
  const changeId = typeof args.flags.change === 'string' ? args.flags.change : null
  if (changeId) return await diffChange(args, changeId)

  const ref = args.positional[0]
  if (!ref) {
    console.error(red('usage: pd diff <git-ref> [spaces/<id>]'))
    console.error(red('   or: pd diff --change <id> [spaces/<id>]'))
    return 2
  }
  const dir = resolveSpaceDir(args.positional[1])
  const repoRoot = findRepoRoot(dir)
  const rel = path.relative(repoRoot, dir)

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-diff-'))
  try {
    // Use `git archive` to get a snapshot of the space at <ref>.
    execSync(`git archive ${ref} -- ${quote(rel)} | tar -x -C ${quote(tmp)}`, {
      cwd: repoRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    const oldDir = path.join(tmp, rel)
    if (!fs.existsSync(oldDir)) {
      console.error(red(`${rel} does not exist at ref ${ref}`))
      return 1
    }
    const oldSpace = await loadForDiff(oldDir, expectedSpaceId(dir))
    const newSpace = await loadForDiff(dir, expectedSpaceId(dir))
    if (!oldSpace || !newSpace) {
      console.error(red('failed to load one side of the diff'))
      return 1
    }
    printSpaceDiff(oldSpace, newSpace, `${ref}..HEAD`)
    return 0
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

async function diffChange(args: ParsedArgs, changeId: string): Promise<number> {
  const dir = resolveSpaceDir(args.positional[0])
  const fsys = nodeFileSystem(dir)
  const baseline = await loadForDiff(dir, expectedSpaceId(dir))
  const merged = await loadSpaceWithChange(fsys, changeId, '.', expectedSpaceId(dir))
  validate(merged)
  if (!baseline || !merged.space) {
    console.error(red(`failed to load change '${changeId}'`))
    return 1
  }
  printSpaceDiff(baseline, merged.space, `baseline..change/${changeId}`)
  return 0
}

async function loadForDiff(dir: string, id: string | undefined): Promise<Space | null> {
  const fsys = nodeFileSystem(dir)
  const result = await loadSpace(fsys, '.', id)
  validate(result) // don't fail diff on validation errors on old side
  return result.space
}

function findRepoRoot(from: string): string {
  return execSync('git rev-parse --show-toplevel', { cwd: from, encoding: 'utf8' }).trim()
}

function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}
