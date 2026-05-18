import { describe, expect, it } from 'vitest'
import { evaluateReadiness } from '../src/index.js'
import { loadFixture } from './helpers.js'

async function readiness(category: 'valid' | 'invalid', name: string) {
  const { result, validation } = await loadFixture(category, name)
  if (!result.space) throw new Error(`space not assembled for ${name}`)
  return evaluateReadiness(result.space, validation)
}

function codes(result: ReturnType<typeof evaluateReadiness>): string[] {
  return result.issues.map((i) => i.code)
}

describe('production readiness profile', () => {
  it('passes a production-ready space', async () => {
    const result = await readiness('valid', 'readiness-production-ready')

    expect(result.passed).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('passes an intentionally orphaned endpoint when the method has a reason', async () => {
    const result = await readiness('valid', 'readiness-orphan-endpoint-suppressed')

    expect(result.passed).toBe(true)
    expect(codes(result)).not.toContain('READINESS_ORPHAN_ENDPOINT')
  })

  it('fails an uncovered endpoint', async () => {
    const result = await readiness('invalid', 'READINESS_UNCOVERED_ENDPOINT')

    expect(result.passed).toBe(false)
    expect(codes(result)).toContain('READINESS_ENDPOINT_COVERAGE_BELOW_THRESHOLD')
  })

  it('fails an orphan endpoint without a local readiness reason', async () => {
    const result = await readiness('invalid', 'READINESS_ORPHAN_ENDPOINT')

    expect(result.passed).toBe(false)
    expect(codes(result)).toContain('READINESS_ORPHAN_ENDPOINT')
  })

  it('fails a file/device/exec dependency without preflight or drift proof', async () => {
    const result = await readiness('invalid', 'READINESS_EXTERNAL_DEP_PROOF_MISSING')

    expect(result.passed).toBe(false)
    expect(codes(result)).toContain('READINESS_EXTERNAL_DEP_PROOF_MISSING')
  })

  it('fails a composition root unless it is explicitly marked and justified', async () => {
    const result = await readiness('invalid', 'READINESS_ORPHAN_COMPOSITION_ROOT')

    expect(result.passed).toBe(false)
    expect(codes(result)).toContain('READINESS_ORPHAN_COMPONENT')
  })

  it('fails an error mapping without implementation proof', async () => {
    const result = await readiness('invalid', 'READINESS_ERROR_MAPPING_PROOF_MISSING')

    expect(result.passed).toBe(false)
    expect(codes(result)).toContain('READINESS_ERROR_MAPPING_PROOF_MISSING')
  })
})
