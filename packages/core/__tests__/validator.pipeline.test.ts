import { describe, expect, it } from 'vitest'
import { loadFixture } from './helpers.js'

describe('validation pipeline ordering', () => {
  it('skips Pass 2 when Pass 1 has errors', async () => {
    const { validation } = await loadFixture('invalid', 'SCHEMA_UNKNOWN_FIELD')
    expect(validation.passes.schema).toBe(false)
    expect(validation.passes.refs).toBe(false)
    for (const issue of validation.issues) {
      expect(issue.code).not.toBe('REF_BROKEN')
      expect(issue.code).not.toBe('REF_WRONG_KIND')
    }
  })

  it('runs Pass 2 when Pass 1 is clean', async () => {
    const { validation } = await loadFixture('invalid', 'REF_BROKEN_COMPONENT')
    expect(validation.passes.schema).toBe(true)
  })
})
