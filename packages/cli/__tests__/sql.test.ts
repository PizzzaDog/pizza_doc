import { describe, expect, it } from 'vitest'
import { parseSqlDdl } from '../src/parsers/sql.js'
import type { ParsedColumn, ParsedTable } from '../src/parsers/sql.js'

describe('parseSqlDdl', () => {
  it('parses a simple CREATE TABLE with inline column constraints', () => {
    const sql = `
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `
    const tables = parseSqlDdl(sql)
    expect(tables).toHaveLength(1)
    const t = expectFirst(tables)
    expect(t.id).toBe('users')
    expect(t.columns).toContainEqual(
      expect.objectContaining({
        name: 'id',
        sqlType: 'uuid',
        primaryKey: true,
        default: 'gen_random_uuid()',
      }),
    )
    expect(t.columns).toContainEqual(
      expect.objectContaining({ name: 'email', unique: true, nullable: false }),
    )
    expect(t.columns).toContainEqual(
      expect.objectContaining({ name: 'created_at', sqlType: 'timestamptz' }),
    )
  })

  it('captures foreign keys from inline REFERENCES clauses', () => {
    const sql = `
      CREATE TABLE orders (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id),
        total DECIMAL(19,4) NOT NULL
      );
    `
    const t = expectFirst(parseSqlDdl(sql))
    const userId = expectColumn(t, 'user_id')
    expect(userId.foreignKey).toBeDefined()
    expect(userId.foreignKey?.column).toBe('id')
    expect(t.columns).toContainEqual(
      expect.objectContaining({ name: 'total', sqlType: 'decimal(19,4)' }),
    )
  })

  it('attaches CREATE INDEX to the matching table', () => {
    const sql = `
      CREATE TABLE items (id UUID, tenant_id UUID NOT NULL);
      CREATE INDEX idx_items_tenant ON items(tenant_id);
      CREATE UNIQUE INDEX idx_items_pk ON items(id);
    `
    const t = expectFirst(parseSqlDdl(sql))
    expect(t.indexes).toHaveLength(2)
    expect(t.indexes).toContainEqual({ name: 'idx_items_tenant', columns: ['tenant_id'] })
    expect(t.indexes).toContainEqual({
      name: 'idx_items_pk',
      columns: ['id'],
      unique: true,
    })
  })

  it('handles Liquibase-style formatted SQL with --changeset comments', () => {
    const sql = `
      --liquibase formatted sql
      --changeset restik:pub-001-create-users
      CREATE TABLE IF NOT EXISTS id_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) NOT NULL UNIQUE
      );
    `
    const t = parseSqlDdl(sql)
    expect(t).toHaveLength(1)
    expect(expectFirst(t).id).toBe('id_users')
  })

  it('handles uuid[] array columns', () => {
    const sql = `CREATE TABLE x (id UUID PRIMARY KEY, tags UUID[] DEFAULT '{}');`
    const t = expectFirst(parseSqlDdl(sql))
    const tags = expectColumn(t, 'tags')
    expect(tags.sqlType).toBe('uuid[]')
    expect(tags.default).toBe("'{}'")
  })
})

function expectFirst(tables: ParsedTable[]): ParsedTable {
  const table = tables[0]
  expect(table).toBeDefined()
  if (!table) throw new Error('expected first parsed table')
  return table
}

function expectColumn(table: ParsedTable, name: string): ParsedColumn {
  const column = table.columns.find((c) => c.name === name)
  expect(column).toBeDefined()
  if (!column) throw new Error(`expected column ${name}`)
  return column
}
