import * as fs from 'node:fs'
import * as os from 'node:os'
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

describe('pd readiness — anchor gate (opt-in)', () => {
  const READY = fixture('valid', 'readiness-production-ready')

  function rewrite(file: string, from: string, to: string): void {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(from, to))
  }

  it('default (no --check-anchors) does not resolve anchors — production-ready still passes', async () => {
    // The fixture cites sourceRefs under services/api/* that do not exist in
    // this checkout; without the opt-in flag they must not be resolved.
    await expect(runCli(['readiness', READY, '--profile', 'production'])).resolves.toBe(0)
  })

  it('--check-anchors fails when a sourceRef points outside the checkout', async () => {
    await expect(
      runCli(['readiness', READY, '--profile', 'production', '--check-anchors']),
    ).resolves.toBe(1)
  })

  it('--module-root maps a module to its own checkout under the anchor gate', async () => {
    const tmp = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'pd-readiness-modroot-'))
    try {
      // Single-space layout: folder name must equal space.yaml meta.id.
      const spaceDir = nodePath.join(tmp, 'readiness-production-ready')
      fs.cpSync(READY, spaceDir, { recursive: true })
      // The module's code lives in its own checkout under the workspace root,
      // and the anchors are authored module-relative.
      fs.mkdirSync(nodePath.join(tmp, 'api-checkout', 'src'), { recursive: true })
      fs.writeFileSync(nodePath.join(tmp, 'api-checkout', 'src', 'main.ts'), 'x\n'.repeat(20))
      fs.writeFileSync(
        nodePath.join(tmp, 'api-checkout', 'src', 'preflight.ts'),
        'export const x = 1\n',
      )
      rewrite(
        nodePath.join(spaceDir, 'modules', 'api', 'components', 'AppRoot.yaml'),
        'services/api/src/main.ts:12',
        'src/main.ts:12',
      )
      rewrite(
        nodePath.join(spaceDir, 'modules', 'api', 'external-deps.yaml'),
        'services/api/src/preflight.ts#checkTemplates',
        'src/preflight.ts',
      )
      const base = ['readiness', spaceDir, '--profile', 'production', '--code-root', tmp]
      // Module-relative anchors don't resolve from the workspace root alone…
      await expect(runCli(base)).resolves.toBe(1)
      // …and do once the module is mapped to its checkout.
      await expect(runCli([...base, '--module-root', 'api=api-checkout'])).resolves.toBe(0)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('--check-anchors --code-root passes when every sourceRef resolves', async () => {
    const tmp = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'pd-readiness-anchor-'))
    try {
      // Single-space layout: folder name must equal space.yaml meta.id.
      const spaceDir = nodePath.join(tmp, 'readiness-production-ready')
      fs.cpSync(READY, spaceDir, { recursive: true })
      fs.mkdirSync(nodePath.join(tmp, 'code'), { recursive: true })
      fs.writeFileSync(nodePath.join(tmp, 'code', 'main.ts'), 'x\n'.repeat(20))
      fs.writeFileSync(nodePath.join(tmp, 'code', 'preflight.ts'), 'export const x = 1\n')
      // Repoint the fixture's two anchors at the real temp files.
      rewrite(
        nodePath.join(spaceDir, 'modules', 'api', 'components', 'AppRoot.yaml'),
        'services/api/src/main.ts:12',
        'code/main.ts:12',
      )
      rewrite(
        nodePath.join(spaceDir, 'modules', 'api', 'external-deps.yaml'),
        'services/api/src/preflight.ts#checkTemplates',
        'code/preflight.ts',
      )
      const code = await runCli([
        'readiness',
        spaceDir,
        '--profile',
        'production',
        '--check-anchors',
        '--code-root',
        tmp,
      ])
      expect(code).toBe(0)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
