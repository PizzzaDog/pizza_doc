import * as nodePath from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSpace, validate } from '../src/index.js'
import type { LoadResult, ValidationIssue, ValidationResult } from '../src/index.js'
import { nodeFileSystem } from '../src/node-io.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = nodePath.dirname(__filename)

export const FIXTURES_ROOT = nodePath.resolve(__dirname, '../__fixtures__')

export function fixturePath(category: 'valid' | 'invalid', name: string): string {
  return nodePath.join(FIXTURES_ROOT, category, name)
}

export async function loadFixture(
  category: 'valid' | 'invalid',
  name: string,
): Promise<{ result: LoadResult; validation: ValidationResult }> {
  const dir = fixturePath(category, name)
  const fs = nodeFileSystem(dir)
  const result = await loadSpace(fs, '.', name)
  const validation = validate(result)
  return { result, validation }
}

export function issueCodes(issues: readonly ValidationIssue[]): string[] {
  return issues.map((i) => i.code)
}

export function hasCode(issues: readonly ValidationIssue[], code: string): boolean {
  return issues.some((i) => i.code === code)
}
