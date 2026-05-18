import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSpace, loadSpaceWithChange, validate } from '../src/index.js'
import { nodeFileSystem } from '../src/node-io.js'
import { fixturePath } from './helpers.js'

let tmp: string | null = null

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = null
})

describe('change-set overlays', () => {
  it('keeps baseline canonical and validates baseline plus overlay on demand', async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'pd-change-'))
    cpSync(fixturePath('valid', 'usecase-simple'), tmp, { recursive: true })
    mkdirSync(path.join(tmp, 'changes/demo-change/overlay/modules/api/models'), {
      recursive: true,
    })
    writeFileSync(
      path.join(tmp, 'changes/demo-change/change.yaml'),
      `id: demo-change
title: Demo change
status: draft
createdAt: 2026-05-12T00:00:00Z
deletes: []
`,
    )
    writeFileSync(
      path.join(tmp, 'changes/demo-change/overlay/modules/api/models/CreateUserRequest.yaml'),
      `kind: model
id: CreateUserRequest
name: CreateUserRequest
modelKind: dto
fields:
  - name: email
    type: string
  - name: displayName
    type: string
`,
    )

    const fs = nodeFileSystem(tmp)
    const baseline = await loadSpace(fs, '.', 'usecase-simple')
    const baselineValidation = validate(baseline)
    const merged = await loadSpaceWithChange(fs, 'demo-change', '.', 'usecase-simple')
    const mergedValidation = validate(merged)

    expect(baselineValidation.issues.filter((i) => i.code === 'FILE_UNRECOGNIZED')).toHaveLength(0)
    expect(baseline.space?.modules[0]?.models[0]?.fields.map((f) => f.name)).toEqual(['email'])
    expect(merged.space?.modules[0]?.models[0]?.fields.map((f) => f.name)).toEqual([
      'email',
      'displayName',
    ])
    expect(mergedValidation.passes.schema).toBe(true)
  })
})
