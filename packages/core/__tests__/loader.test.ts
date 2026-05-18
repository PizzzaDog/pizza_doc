import { readdir } from 'node:fs/promises'
import * as nodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIXTURES_ROOT, loadFixture } from './helpers.js'

async function listFixtureDirs(category: 'valid' | 'invalid'): Promise<string[]> {
  const entries = await readdir(nodePath.join(FIXTURES_ROOT, category), { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

describe('loader: valid fixtures load clean', async () => {
  const dirs = await listFixtureDirs('valid')
  expect(dirs.length).toBeGreaterThanOrEqual(10)

  for (const name of dirs) {
    it(`loads and validates '${name}' without issues`, async () => {
      const { result, validation } = await loadFixture('valid', name)
      expect(result.space, `space assembled for ${name}`).not.toBeNull()
      if (validation.issues.length > 0) {
        console.log(`issues for ${name}:`, validation.issues)
      }
      expect(validation.issues.filter((i) => i.severity === 'error')).toHaveLength(0)
      expect(validation.passes.schema).toBe(true)
      expect(validation.passes.refs).toBe(true)
    })
  }
})
