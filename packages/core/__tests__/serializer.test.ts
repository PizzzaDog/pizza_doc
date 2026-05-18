import { readFile } from 'node:fs/promises'
import * as nodePath from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDocument } from 'yaml'
import { loadSpace, serializeSpace } from '../src/index.js'
import { nodeFileSystem } from '../src/node-io.js'
import { fixturePath } from './helpers.js'

describe('serializer', () => {
  it('produces byte-identical YAML for the usecase-full fixture', async () => {
    const dir = fixturePath('valid', 'usecase-full')
    const fs = nodeFileSystem(dir)
    const result = await loadSpace(fs, '.', 'usecase-full')

    const serialized = serializeSpace(result.files)
    for (const [path, out] of serialized) {
      const original = await readFile(nodePath.join(dir, path), 'utf8')
      expect(out, `file ${path} must round-trip byte-identically`).toBe(original)
    }
  })

  it('preserves comments when re-emitting a hand-edited document', () => {
    const source = `# leading comment
meta:
  id: demo           # inline comment on id
  name: Demo         # inline comment on name
# trailing comment
`
    const doc = parseDocument(source)
    const emitted = doc.toString()
    expect(emitted).toContain('leading comment')
    expect(emitted).toContain('inline comment on id')
    expect(emitted).toContain('trailing comment')
  })
})
