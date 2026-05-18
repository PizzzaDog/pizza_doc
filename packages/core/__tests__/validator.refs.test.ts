import { describe, expect, it } from 'vitest'
import { hasCode, loadFixture } from './helpers.js'

interface Case {
  fixture: string
  code: string
}

const CASES: readonly Case[] = [
  { fixture: 'REF_BROKEN_COMPONENT', code: 'REF_BROKEN' },
  { fixture: 'REF_BROKEN_METHOD', code: 'REF_BROKEN' },
  { fixture: 'REF_BROKEN_TABLE', code: 'REF_BROKEN' },
  { fixture: 'REF_BROKEN_ACTOR', code: 'REF_BROKEN' },
  { fixture: 'REF_WRONG_KIND_VIA_NOT_MODEL', code: 'REF_WRONG_KIND' },
  { fixture: 'REF_WRONG_KIND_ACTOR', code: 'REF_WRONG_KIND' },
  { fixture: 'REF_WRONG_KIND_PERSISTED_AS', code: 'REF_WRONG_KIND' },
  { fixture: 'REF_CLOSE_SUGGESTION', code: 'REF_BROKEN' },
]

describe('Pass 2 reference resolution', () => {
  for (const c of CASES) {
    it(`reports ${c.code} for fixture ${c.fixture}`, async () => {
      const { validation } = await loadFixture('invalid', c.fixture)
      expect(validation.passes.schema, `Pass 1 must pass for ${c.fixture}`).toBe(true)
      expect(
        hasCode(validation.issues, c.code),
        `expected ${c.code} in issues: ${JSON.stringify(validation.issues.map((i) => i.code))}`,
      ).toBe(true)
    })
  }

  it('attaches a close-match suggestion on REF_BROKEN', async () => {
    const { validation } = await loadFixture('invalid', 'REF_CLOSE_SUGGESTION')
    const broken = validation.issues.find((i) => i.code === 'REF_BROKEN')
    expect(broken?.suggestion).toMatch(/UserService/)
  })
})
