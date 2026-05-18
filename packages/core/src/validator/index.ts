import type { LoadResult } from '../loader.js'
import type { Space } from '../schema.js'
import { validateRefsPass } from './refs.js'
import { type SemanticPassOptions, validateSemanticPass } from './semantic.js'
import { hasErrors } from './types.js'
import type { ValidationCode, ValidationIssue, ValidationResult } from './types.js'

export * from './types.js'
export { validateSchemaPass } from './schema.js'
export { validateRefsPass } from './refs.js'
export * from './semantic.js'

export interface ValidateOptions {
  semantic?: SemanticPassOptions
}

/**
 * Run the full validation pipeline on a LoadResult.
 *
 * Per page 12: passes run strictly in order.
 *   Pass 1 — Zod schema (runs in the loader).
 *   Pass 2 — reference resolution. Runs only if Pass 1 clean across all files.
 *   Pass 3 — semantic rules. Runs only if Pass 2 clean.
 *
 * After the three passes, per-entity `suppress: [<code>]` waivers drop
 * matching issues. Schema and refs codes are NOT suppressible — those
 * are structural correctness, not preferences.
 */
export function validate(loadResult: LoadResult, options?: ValidateOptions): ValidationResult {
  const issues: ValidationIssue[] = [...loadResult.issues]
  const schemaPassed = !hasErrors(loadResult.issues)

  if (!schemaPassed || !loadResult.space) {
    return {
      issues,
      passes: { schema: schemaPassed, refs: false, semantic: false },
    }
  }

  const refsResult = validateRefsPass(loadResult.space)
  issues.push(...refsResult.issues)
  const refsPassed = !hasErrors(refsResult.issues)

  if (!refsPassed) {
    return {
      issues,
      passes: { schema: true, refs: false, semantic: false },
    }
  }

  const semanticIssues = validateSemanticPass(loadResult.space, refsResult.index, options?.semantic)
  issues.push(...semanticIssues)
  const semanticPassed = !hasErrors(semanticIssues)

  const filtered = applySuppression(loadResult.space, issues)
  return {
    issues: filtered,
    passes: { schema: true, refs: true, semantic: semanticPassed },
  }
}

/**
 * Drop issues whose `entityRef` resolves to an entity that lists the
 * issue's `code` in its `suppress: []`. Schema and ref codes are not
 * suppressible — those represent broken structure that always must be
 * reported, regardless of author preference.
 */
function applySuppression(space: Space, issues: readonly ValidationIssue[]): ValidationIssue[] {
  const suppressMap = collectSuppressMap(space)
  if (suppressMap.size === 0) return [...issues]
  return issues.filter((issue) => !shouldSuppress(issue, suppressMap))
}

function shouldSuppress(issue: ValidationIssue, suppressMap: Map<string, Set<string>>): boolean {
  if (!issue.entityRef) return false
  if (!isSuppressibleCode(issue.code)) return false
  const codes = suppressMap.get(issue.entityRef)
  return codes ? codes.has(issue.code) : false
}

const NON_SUPPRESSIBLE: ReadonlyArray<ValidationCode> = [
  'YAML_PARSE_ERROR',
  'FILE_UNRECOGNIZED',
  'CHANGE_NOT_FOUND',
  'CHANGE_SCHEMA_INVALID',
  'CHANGE_FILENAME_ID_MISMATCH',
  'CHANGE_DELETE_PATH_INVALID',
  'SCHEMA_UNKNOWN_FIELD',
  'SCHEMA_MISSING_REQUIRED',
  'SCHEMA_WRONG_TYPE',
  'SCHEMA_INVALID_VALUE',
  'SCHEMA_INVALID_ID',
  'SCHEMA_INVALID_REF_PATTERN',
  'SCHEMA_UNKNOWN_MODULE_TYPE',
  'SCHEMA_UNKNOWN_MODEL_KIND',
  'SCHEMA_UNKNOWN_COMPONENT_TYPE',
  'SCHEMA_FILENAME_ID_MISMATCH',
  'REF_BROKEN',
  'REF_WRONG_KIND',
  'DUPLICATE_ID',
]

function isSuppressibleCode(code: ValidationCode): boolean {
  return !NON_SUPPRESSIBLE.includes(code)
}

function collectSuppressMap(space: Space): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (ref: string, codes: readonly string[] | undefined): void => {
    if (!codes || codes.length === 0) return
    out.set(ref, new Set(codes))
  }
  for (const a of space.actors) add(`actor:${a.id}`, a.suppress)
  for (const uc of space.useCases) add(`usecase:${uc.id}`, uc.suppress)
  for (const m of space.modules) {
    for (const c of m.components) {
      add(`module:${m.id}/component:${c.id}`, c.suppress)
    }
    for (const md of m.models) {
      add(`module:${m.id}/model:${md.id}`, md.suppress)
    }
    for (const d of m.domains) {
      for (const c of d.components) {
        add(`module:${m.id}/domain:${d.id}/component:${c.id}`, c.suppress)
      }
      for (const md of d.models) {
        add(`module:${m.id}/domain:${d.id}/model:${md.id}`, md.suppress)
      }
    }
  }
  return out
}
