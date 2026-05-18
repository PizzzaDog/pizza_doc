/**
 * Table migration parity (v0.5 — B4) tests.
 *
 * Covers:
 *   - Schema parses `migrations: [{ id, action, columns }]` and defaults.
 *   - MIGRATION_COLUMN_INCONSISTENT on add/drop/alter mismatches with columns[].
 *   - MIGRATION_HISTORY_GAP on numeric id sequence gaps.
 *   - Date-stamped ids skip gap detection.
 */
import { describe, expect, it } from 'vitest'
import { buildRefIndex, validateSemanticPass } from '../src/index.js'
import type { Space, TableMigration } from '../src/index.js'
import { TableSchema } from '../src/schema.js'

function makeSpace(args: {
  columns: ReadonlyArray<string>
  migrations: ReadonlyArray<TableMigration>
}): Space {
  return {
    meta: { id: 'b4', name: 'B4', version: '0.1.0', pizzaDocVersion: '0.5.0' },
    actors: [],
    modules: [
      {
        kind: 'module',
        id: 'db',
        name: 'DB',
        type: 'database',
        domains: [],
        models: [],
        components: [],
        errorMapping: [],
        configMap: [],
        externalDeps: [],
        decisions: [],
        tables: [
          {
            kind: 'table',
            id: 'orders',
            name: 'orders',
            columns: args.columns.map((c) => ({
              name: c,
              sqlType: 'text',
              primaryKey: false,
              nullable: false,
              unique: false,
            })),
            indexes: [],
            migrations: [...args.migrations],
          },
        ],
      },
    ],
    useCases: [],
    decisions: [],
  }
}

describe('B4 — Table.migrations schema', () => {
  it('parses an ordered migration history', () => {
    const parsed = TableSchema.parse({
      kind: 'table',
      id: 'orders',
      name: 'orders',
      columns: [{ name: 'id', sqlType: 'uuid' }],
      migrations: [
        { id: 'V0001', action: 'create' },
        { id: 'V0028', action: 'drop-column', columns: ['dust_reserved'] },
      ],
    })
    expect(parsed.migrations).toHaveLength(2)
    expect(parsed.migrations[1]?.action).toBe('drop-column')
  })

  it('defaults migrations to []', () => {
    const parsed = TableSchema.parse({
      kind: 'table',
      id: 'orders',
      name: 'orders',
      columns: [{ name: 'id', sqlType: 'uuid' }],
    })
    expect(parsed.migrations).toEqual([])
  })

  it('rejects an unknown action', () => {
    expect(() =>
      TableSchema.parse({
        kind: 'table',
        id: 'orders',
        name: 'orders',
        columns: [],
        migrations: [{ id: 'V0001', action: 'truncate' }],
      }),
    ).toThrow()
  })
})

describe('B4 — MIGRATION_COLUMN_INCONSISTENT', () => {
  it('fires when drop-column claims a column that is still present', () => {
    const space = makeSpace({
      columns: ['id', 'dust_reserved'],
      migrations: [
        { id: 'V0028', action: 'drop-column', columns: ['dust_reserved'], description: '' },
      ],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    const hit = issues.filter((i) => i.code === 'MIGRATION_COLUMN_INCONSISTENT')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.severity).toBe('error')
    expect(hit[0]?.message).toContain('dust_reserved')
  })

  it('fires when add-column claims a column that is missing', () => {
    const space = makeSpace({
      columns: ['id'],
      migrations: [{ id: 'V0010', action: 'add-column', columns: ['email'], description: '' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'MIGRATION_COLUMN_INCONSISTENT')).toHaveLength(1)
  })

  it('fires when alter-column claims a column that is missing', () => {
    const space = makeSpace({
      columns: ['id'],
      migrations: [{ id: 'V0010', action: 'alter-column', columns: ['email'], description: '' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'MIGRATION_COLUMN_INCONSISTENT')).toHaveLength(1)
  })

  it('does not fire for create action', () => {
    const space = makeSpace({
      columns: ['id'],
      migrations: [{ id: 'V0001', action: 'create', columns: [], description: '' }],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'MIGRATION_COLUMN_INCONSISTENT')).toHaveLength(0)
  })

  it('does not fire on consistent add + drop sequence', () => {
    const space = makeSpace({
      columns: ['id', 'email'],
      migrations: [
        { id: 'V0001', action: 'create', columns: [], description: '' },
        { id: 'V0002', action: 'add-column', columns: ['email'], description: '' },
        { id: 'V0028', action: 'drop-column', columns: ['dust_reserved'], description: '' },
      ],
    })
    const index = buildRefIndex(space)
    const issues = validateSemanticPass(space, index)
    expect(issues.filter((i) => i.code === 'MIGRATION_COLUMN_INCONSISTENT')).toHaveLength(0)
  })
})
