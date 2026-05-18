import { describe, expect, it } from 'vitest'
import { hasCode, loadFixture } from './helpers.js'

interface Case {
  fixture: string
  code: string
}

const CASES: readonly Case[] = [
  { fixture: 'SCHEMA_UNKNOWN_FIELD', code: 'SCHEMA_UNKNOWN_FIELD' },
  { fixture: 'SCHEMA_MISSING_REQUIRED', code: 'SCHEMA_MISSING_REQUIRED' },
  { fixture: 'SCHEMA_WRONG_TYPE', code: 'SCHEMA_WRONG_TYPE' },
  { fixture: 'SCHEMA_INVALID_ID', code: 'SCHEMA_INVALID_ID' },
  { fixture: 'SCHEMA_INVALID_REF_PATTERN', code: 'SCHEMA_INVALID_REF_PATTERN' },
  { fixture: 'SCHEMA_FILENAME_ID_MISMATCH_ENTITY', code: 'SCHEMA_FILENAME_ID_MISMATCH' },
  { fixture: 'SCHEMA_FILENAME_ID_MISMATCH_MODULE', code: 'SCHEMA_FILENAME_ID_MISMATCH' },
  { fixture: 'SCHEMA_FILENAME_ID_MISMATCH_DOMAIN', code: 'SCHEMA_FILENAME_ID_MISMATCH' },
  { fixture: 'SCHEMA_SPACE_ID_MISMATCH', code: 'SCHEMA_FILENAME_ID_MISMATCH' },
  { fixture: 'SCHEMA_UNKNOWN_COMPONENT_TYPE', code: 'SCHEMA_UNKNOWN_COMPONENT_TYPE' },
  { fixture: 'SCHEMA_UNKNOWN_MODEL_KIND', code: 'SCHEMA_UNKNOWN_MODEL_KIND' },
  { fixture: 'SCHEMA_UNKNOWN_MODULE_TYPE', code: 'SCHEMA_UNKNOWN_MODULE_TYPE' },
]

describe('Pass 1 schema validation', () => {
  for (const c of CASES) {
    it(`reports ${c.code} for fixture ${c.fixture}`, async () => {
      const { validation } = await loadFixture('invalid', c.fixture)
      expect(
        hasCode(validation.issues, c.code),
        `expected ${c.code} in issues: ${JSON.stringify(validation.issues.map((i) => i.code))}`,
      ).toBe(true)
    })
  }

  it('emits SCHEMA_UNKNOWN_FIELD with a Levenshtein suggestion', async () => {
    const { validation } = await loadFixture('invalid', 'SCHEMA_UNKNOWN_FIELD')
    const issue = validation.issues.find((i) => i.code === 'SCHEMA_UNKNOWN_FIELD')
    expect(issue?.suggestion).toMatch(/optional/)
  })
})
