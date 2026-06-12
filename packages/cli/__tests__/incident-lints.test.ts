import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ValidationCode } from '@pizza-doc/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cmdLint } from '../src/commands/lint.js'
import { parseArgs } from '../src/util/args.js'
import { loadSpaceForCli } from '../src/util/load.js'

describe('incident-derived validation lints', () => {
  let tmp: string
  let spaceDir: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-incident-lints-'))
    spaceDir = path.join(tmp, '.pizza-doc')
    fs.mkdirSync(path.join(spaceDir, 'modules', 'api', 'components'), { recursive: true })
    fs.mkdirSync(path.join(spaceDir, 'modules', 'api', 'models'), { recursive: true })
    fs.mkdirSync(path.join(spaceDir, 'decisions'), { recursive: true })
    fs.writeFileSync(
      path.join(spaceDir, 'space.yaml'),
      'meta:\n  id: incident-lints\n  name: Incident Lints\n  version: 0.1.0\n  pizzaDocVersion: 0.5.0\n',
    )
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'module.yaml'),
      'kind: module\nid: api\nname: API\ntype: service\n',
    )
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('flags top-level combinators on tool input schemas and accepts a flat root', async () => {
    writeToolComponent([
      '```yaml',
      'inputSchema:',
      '  type: object',
      '  properties:',
      '    at:',
      '      type: string',
      '    every:',
      '      type: string',
      '  oneOf:',
      '    - required: [at]',
      '    - required: [every]',
      '```',
    ])

    await expect(issueCodes()).resolves.toContain('TOOL_SCHEMA_TOPLEVEL_COMBINATOR')

    writeToolComponent([
      '```yaml',
      'inputSchema:',
      '  type: object',
      '  properties:',
      '    at:',
      '      type: string',
      '    every:',
      '      type: string',
      '  required: []',
      '```',
    ])

    await expect(issueCodes()).resolves.not.toContain('TOOL_SCHEMA_TOPLEVEL_COMBINATOR')
  })

  it('flags ADR code fences that duplicate model YAML literals and accepts path-only ADRs', async () => {
    writeModel()
    writeAdr([
      'This ADR wrongly copies the binding fields:',
      '',
      '```yaml',
      'fields:',
      '  - name: workspaceId',
      '    type: string',
      '  - name: runId',
      '    type: string',
      '  - name: message',
      '    type: string',
      '```',
    ])

    await expect(issueCodes()).resolves.toContain('ADR_EMBEDS_SCHEMA_LITERAL')

    writeAdr(['The binding lives in modules/api/models/IncidentPayload.yaml.'])

    await expect(issueCodes()).resolves.not.toContain('ADR_EMBEDS_SCHEMA_LITERAL')
  })

  it('lists and explains both incident codes', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    expect(cmdLint(parseArgs([]))).toBe(0)
    let output = log.mock.calls.flat().join('\n')
    expect(output).toContain('TOOL_SCHEMA_TOPLEVEL_COMBINATOR')
    expect(output).toContain('ADR_EMBEDS_SCHEMA_LITERAL')

    log.mockClear()
    expect(cmdLint(parseArgs(['--explain', 'TOOL_SCHEMA_TOPLEVEL_COMBINATOR']))).toBe(0)
    output = log.mock.calls.flat().join('\n')
    expect(output).toContain('schedule_create incident')
    expect(output).toContain('plain object')

    log.mockClear()
    expect(cmdLint(parseArgs(['--explain', 'ADR_EMBEDS_SCHEMA_LITERAL']))).toBe(0)
    output = log.mock.calls.flat().join('\n')
    expect(output).toContain('duplicates at least six consecutive lines')
    expect(output).toContain('model YAML')
  })

  async function issueCodes(): Promise<ValidationCode[]> {
    const loaded = await loadSpaceForCli(spaceDir)
    return loaded.issues.map((issue) => issue.code)
  }

  function writeToolComponent(descriptionLines: string[]): void {
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'components', 'ToolServer.yaml'),
      [
        'kind: component',
        'id: ToolServer',
        'name: ToolServer',
        'type: service',
        'suppress:',
        '  - COMPONENT_UNUSED',
        'description: |-',
        ...descriptionLines.map((line) => `  ${line}`),
        '',
      ].join('\n'),
    )
  }

  function writeModel(): void {
    fs.writeFileSync(
      path.join(spaceDir, 'modules', 'api', 'models', 'IncidentPayload.yaml'),
      [
        'kind: model',
        'id: IncidentPayload',
        'name: IncidentPayload',
        'modelKind: dto',
        'suppress:',
        '  - DTO_UNUSED',
        'fields:',
        '  - name: workspaceId',
        '    type: string',
        '  - name: runId',
        '    type: string',
        '  - name: message',
        '    type: string',
        '',
      ].join('\n'),
    )
  }

  function writeAdr(bodyLines: string[]): void {
    fs.writeFileSync(
      path.join(spaceDir, 'decisions', 'ADR-001-incident-literal.md'),
      [
        '---',
        'id: ADR-001',
        'title: Incident literal fixture',
        'status: accepted',
        '---',
        '# Incident literal fixture',
        '',
        ...bodyLines,
        '',
      ].join('\n'),
    )
  }
})
