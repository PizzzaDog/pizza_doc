import * as nodePath from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runCli } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = nodePath.dirname(__filename)
const FIXTURES_ROOT = nodePath.resolve(__dirname, '../../core/__fixtures__')

function fixture(category: 'valid' | 'invalid', name: string): string {
  return nodePath.join(FIXTURES_ROOT, category, name)
}

describe('pd readiness', () => {
  it('exits zero for a production-ready fixture', async () => {
    await expect(
      runCli([
        'readiness',
        fixture('valid', 'readiness-production-ready'),
        '--profile',
        'production',
      ]),
    ).resolves.toBe(0)
  })

  it('exits non-zero for a fixture with an uncovered endpoint', async () => {
    await expect(
      runCli([
        'readiness',
        fixture('invalid', 'READINESS_UNCOVERED_ENDPOINT'),
        '--profile',
        'production',
      ]),
    ).resolves.toBe(1)
  })
})
