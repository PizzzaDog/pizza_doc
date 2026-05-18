import { parseDocument } from 'yaml'
import type { FileSystem } from './fs.js'
import { joinPath } from './fs.js'
import type { LoadResult } from './loader.js'
import { loadSpace } from './loader.js'
import { ChangeSetSchema } from './schema.js'
import type { ChangeSet } from './schema.js'
import type { ValidationIssue } from './validator/types.js'

export interface ChangeSetLoadResult {
  change: ChangeSet | null
  source: string | null
  issues: ValidationIssue[]
}

export interface ListedChangeSet {
  change: ChangeSet
  path: string
}

export function changeSetPath(id: string): string {
  return `changes/${id}/change.yaml`
}

export function changeOverlayRoot(id: string): string {
  return `changes/${id}/overlay`
}

export async function readChangeSet(fs: FileSystem, id: string): Promise<ChangeSetLoadResult> {
  const path = changeSetPath(id)
  let source: string
  try {
    source = await fs.readFile(path)
  } catch {
    return {
      change: null,
      source: null,
      issues: [
        {
          severity: 'error',
          code: 'CHANGE_NOT_FOUND',
          message: `Change set '${id}' does not exist at ${path}.`,
          file: path,
        },
      ],
    }
  }

  const issues: ValidationIssue[] = []
  const document = parseDocument(source, { prettyErrors: true, keepSourceTokens: true })
  if (document.errors.length > 0) {
    for (const err of document.errors) {
      const issue: ValidationIssue = {
        severity: 'error',
        code: 'YAML_PARSE_ERROR',
        message: `YAML parse error: ${err.message}`,
        file: path,
      }
      const line = err.linePos?.[0]?.line
      const col = err.linePos?.[0]?.col
      if (typeof line === 'number') issue.line = line
      if (typeof col === 'number') issue.column = col
      issues.push(issue)
    }
    return { change: null, source, issues }
  }

  const parsed = ChangeSetSchema.safeParse(document.toJS())
  if (!parsed.success) {
    issues.push({
      severity: 'error',
      code: 'CHANGE_SCHEMA_INVALID',
      message: `Change set ${path} is invalid: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`,
      file: path,
    })
    return { change: null, source, issues }
  }

  const change = parsed.data
  if (change.id !== id) {
    issues.push({
      severity: 'error',
      code: 'CHANGE_FILENAME_ID_MISMATCH',
      message: `Change set folder '${id}' contains id '${change.id}'. They must match.`,
      file: path,
      suggestion: `Rename the folder to '${change.id}' or change id to '${id}'.`,
    })
  }

  for (const deletePath of change.deletes) {
    if (!isSafeSpacePath(deletePath)) {
      issues.push({
        severity: 'error',
        code: 'CHANGE_DELETE_PATH_INVALID',
        message: `Delete path '${deletePath}' must be a relative path inside the space.`,
        file: path,
      })
    }
  }

  return { change: issues.some((i) => i.severity === 'error') ? null : change, source, issues }
}

export async function listChangeSets(fs: FileSystem): Promise<ListedChangeSet[]> {
  let paths: string[]
  try {
    paths = await fs.listFiles('changes')
  } catch {
    return []
  }
  const ids = paths
    .filter((p) => p.endsWith('/change.yaml') && p.split('/').length === 2)
    .map((p) => p.slice(0, -'/change.yaml'.length))
    .sort()

  const out: ListedChangeSet[] = []
  for (const id of ids) {
    const result = await readChangeSet(fs, id)
    if (result.change) out.push({ change: result.change, path: changeSetPath(id) })
  }
  return out
}

export async function loadSpaceWithChange(
  fs: FileSystem,
  changeId: string,
  spaceDir = '.',
  expectedSpaceId?: string,
): Promise<LoadResult> {
  const changeResult = await readChangeSet(fs, changeId)
  if (!changeResult.change) {
    const baseline = await loadSpace(fs, spaceDir, expectedSpaceId)
    return { ...baseline, issues: [...changeResult.issues, ...baseline.issues] }
  }
  const overlayFs = changeSetOverlayFileSystem(fs, changeResult.change)
  const result = await loadSpace(overlayFs, spaceDir, expectedSpaceId)
  return { ...result, issues: [...changeResult.issues, ...result.issues] }
}

/**
 * FileSystem view where canonical reads see baseline + `changes/<id>/overlay`
 * as one merged tree. Writes go to the overlay tree, keeping the accepted
 * baseline untouched until `pd change adopt`.
 */
export function changeSetOverlayFileSystem(base: FileSystem, change: ChangeSet): FileSystem {
  const overlayRoot = changeOverlayRoot(change.id)
  const deletes = new Set(change.deletes.filter(isSafeSpacePath).map(normalizeSpacePath))

  async function overlayExists(path: string): Promise<boolean> {
    return await base.exists(joinPath(overlayRoot, normalizeSpacePath(path)))
  }

  return {
    async readFile(path) {
      const normalized = normalizeSpacePath(path)
      const overlayPath = joinPath(overlayRoot, normalized)
      if (await base.exists(overlayPath)) return await base.readFile(overlayPath)
      if (deletes.has(normalized)) {
        throw new Error(`deleted by change '${change.id}': ${normalized}`)
      }
      return await base.readFile(normalized)
    },

    async writeFile(path, content) {
      await base.writeFile(joinPath(overlayRoot, normalizeSpacePath(path)), content)
    },

    async listFiles(dir) {
      const normalizedDir = normalizeDir(pathLike(dir))
      const basePaths = await safeListFiles(base, normalizedDir || '.')
      const out = new Set<string>()

      for (const rel of basePaths) {
        const rootRel = normalizeSpacePath(joinPath(normalizedDir, rel))
        if (rootRel.startsWith('changes/')) continue
        if (deletes.has(rootRel)) continue
        out.add(rel)
      }

      const overlayDir = joinPath(overlayRoot, normalizedDir)
      const overlayPaths = await safeListFiles(base, overlayDir)
      for (const rel of overlayPaths) out.add(rel)

      return [...out].sort()
    },

    async exists(path) {
      const normalized = normalizeSpacePath(path)
      if (await overlayExists(normalized)) return true
      if (deletes.has(normalized)) return false
      return await base.exists(normalized)
    },

    async mtime(path) {
      const normalized = normalizeSpacePath(path)
      const overlayPath = joinPath(overlayRoot, normalized)
      if (await base.exists(overlayPath)) return await base.mtime(overlayPath)
      if (deletes.has(normalized)) return null
      return await base.mtime(normalized)
    },
  }
}

async function safeListFiles(fs: FileSystem, dir: string): Promise<string[]> {
  try {
    return await fs.listFiles(dir)
  } catch {
    return []
  }
}

function normalizeDir(path: string): string {
  const normalized = normalizeSpacePath(path)
  return normalized === '.' ? '' : normalized
}

function pathLike(path: string): string {
  return path === '' ? '.' : path
}

function normalizeSpacePath(path: string): string {
  const normalized = path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
  if (normalized === '') return '.'
  return normalized.replace(/\/$/, '')
}

function isSafeSpacePath(path: string): boolean {
  const normalized = normalizeSpacePath(path)
  if (normalized === '.' || normalized.startsWith('/')) return false
  return !normalized.split('/').some((part) => part === '..' || part === '')
}
