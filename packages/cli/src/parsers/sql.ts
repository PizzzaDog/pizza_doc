/**
 * Minimal Postgres DDL parser — handles the shape most `CREATE TABLE`
 * statements in migration files take. Aim: import Liquibase/Flyway/raw .sql
 * into Pizza Doc tables without hand-authoring.
 *
 * Not a full SQL parser. We don't try to handle:
 *   - computed columns / `GENERATED ALWAYS AS`,
 *   - inheritance,
 *   - partitioning clauses,
 *   - weird quoting edge cases.
 *
 * Anything we can't parse is preserved by writing the raw column into
 * `description` so the author can fix it up manually.
 */

export interface ParsedTable {
  kind: 'table'
  id: string
  name: string
  description?: string
  columns: ParsedColumn[]
  indexes?: ParsedIndex[]
}

export interface ParsedColumn {
  name: string
  sqlType: string
  primaryKey?: boolean
  nullable?: boolean
  unique?: boolean
  default?: string
  foreignKey?: { table: string; column: string }
  description?: string
}

export interface ParsedIndex {
  name: string
  columns: string[]
  unique?: boolean
}

export function parseSqlDdl(source: string): ParsedTable[] {
  const stmts = splitStatements(stripComments(source))
  const tables: ParsedTable[] = []
  const indexes: Array<{
    tableName: string
    index: ParsedIndex
  }> = []

  for (const stmt of stmts) {
    const table = tryParseCreateTable(stmt)
    if (table) {
      tables.push(table)
      continue
    }
    const idx = tryParseCreateIndex(stmt)
    if (idx) indexes.push(idx)
  }

  // Attach indexes to their tables.
  for (const { tableName, index } of indexes) {
    const target = tables.find((t) => t.name === tableName)
    if (target) {
      target.indexes = target.indexes ?? []
      target.indexes.push(index)
    }
  }
  return tables
}

// ---------- helpers ----------

function stripComments(s: string): string {
  // Line comments and Liquibase --changeset markers.
  let out = s.replace(/--[^\n]*\n/g, '\n')
  // Block comments /* ... */
  out = out.replace(/\/\*[\s\S]*?\*\//g, '')
  return out
}

function splitStatements(s: string): string[] {
  // Naive split on `;` outside parens/quotes. Good enough for DDL.
  const out: string[] = []
  let depth = 0
  let inSingle = false
  let inDouble = false
  let buf = ''
  for (const ch of s) {
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    if (!inSingle && !inDouble) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (ch === ';' && depth === 0) {
        if (buf.trim()) out.push(buf.trim())
        buf = ''
        continue
      }
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function tryParseCreateTable(stmt: string): ParsedTable | null {
  const m = stmt.match(
    /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(([\s\S]*)\)\s*$/i,
  )
  if (!m) return null
  const tableName = m[2] ?? ''
  const body = m[3] ?? ''
  const lines = splitColumnLines(body)
  const columns: ParsedColumn[] = []
  const inlinePkCols: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Table-level constraints first.
    const pk = trimmed.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i)
    if (pk) {
      const colsText = pk[1]
      if (colsText) inlinePkCols.push(...parseColList(colsText))
      continue
    }
    const unique = trimmed.match(/^UNIQUE\s*\(([^)]+)\)/i)
    if (unique) {
      // Single-column → mark the column. Multi-column → emit a unique index.
      const colsText = unique[1]
      if (!colsText) continue
      const cols = parseColList(colsText)
      if (cols.length === 1) {
        const c = columns.find((x) => x.name === cols[0])
        if (c) c.unique = true
      } else {
        // Stash for later; synthesised as an index.
        // Handled after column pass.
        ;(tableLevelUnique as string[][]).push(cols)
      }
      continue
    }
    const fk = trimmed.match(/^FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+"?(\w+)"?\s*\(([^)]+)\)/i)
    if (fk) {
      const [, colsText, refTable, refColsText] = fk
      if (!colsText || !refTable || !refColsText) continue
      const cols = parseColList(colsText)
      const refCols = parseColList(refColsText)
      if (cols.length === 1 && refCols.length === 1) {
        const c = columns.find((x) => x.name === cols[0])
        const refCol = refCols[0]
        if (c && refCol) c.foreignKey = { table: `<FK-TABLE-REF:${refTable}>`, column: refCol }
      }
      continue
    }

    const col = parseColumnLine(trimmed)
    if (col) columns.push(col)
  }

  // Single table-level PK.
  if (inlinePkCols.length === 1) {
    const c = columns.find((x) => x.name === inlinePkCols[0])
    if (c) c.primaryKey = true
  }

  const indexes: ParsedIndex[] = []
  for (const cols of tableLevelUnique) {
    indexes.push({
      name: `${tableName}_${cols.join('_')}_key`,
      columns: cols,
      unique: true,
    })
  }
  // reset module-level stash (rare multi-call use)
  tableLevelUnique.length = 0

  return {
    kind: 'table',
    id: tableName,
    name: tableName,
    columns,
    ...(indexes.length > 0 ? { indexes } : {}),
  }
}

const tableLevelUnique: string[][] = []

function splitColumnLines(body: string): string[] {
  // Split on commas at depth 0, so `decimal(19,4)` stays intact.
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of body) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      if (buf.trim()) out.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function parseColList(s: string): string[] {
  return s.split(',').map((x) => x.trim().replace(/"/g, ''))
}

function parseColumnLine(line: string): ParsedColumn | null {
  // `<name> <type>(...) [NOT NULL] [DEFAULT <expr>] [PRIMARY KEY] [UNIQUE] [REFERENCES ...]`
  const nameMatch = line.match(/^"?(\w+)"?\s+(.+)$/)
  if (!nameMatch) return null
  const [, name, restText] = nameMatch
  if (!name || !restText) return null
  let rest = restText

  // Extract type — take everything up to the first keyword or end.
  const typeMatch = rest.match(/^([A-Z][A-Z_0-9]*(?:\s*\([^)]*\))?(?:\s*\[\])?)/i)
  if (!typeMatch) return null
  const typeText = typeMatch[1]
  if (!typeText) return null
  let sqlType = typeText.trim()
  rest = rest.slice(typeMatch[0].length).trim()

  // Normalize `TIMESTAMP WITH TIME ZONE` → `timestamptz`.
  const tzMatch = rest.match(/^WITH\s+TIME\s+ZONE\b/i)
  if (/^TIMESTAMP$/i.test(sqlType) && tzMatch) {
    sqlType = 'timestamptz'
    rest = rest.slice(tzMatch[0].length).trim()
  } else {
    sqlType = sqlType.toLowerCase().replace(/\s+/g, '')
  }

  const col: ParsedColumn = { name, sqlType }

  // NOT NULL / NULL
  if (/\bNOT\s+NULL\b/i.test(rest)) col.nullable = false
  else if (/\bNULL\b/i.test(rest) && !/\bNOT\s+NULL\b/i.test(rest)) col.nullable = true

  // DEFAULT <expr> — capture until the next keyword.
  const def = rest.match(
    /\bDEFAULT\s+(.+?)(?=(\s+(?:NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|REFERENCES|CHECK)\b)|$)/i,
  )
  if (def?.[1]) col.default = def[1].trim()

  if (/\bPRIMARY\s+KEY\b/i.test(rest)) col.primaryKey = true
  if (/\bUNIQUE\b/i.test(rest)) col.unique = true

  const fk = rest.match(/\bREFERENCES\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/i)
  if (fk?.[1] && fk[2]) {
    col.foreignKey = { table: `<FK-TABLE-REF:${fk[1]}>`, column: fk[2] }
  }

  return col
}

function tryParseCreateIndex(stmt: string): { tableName: string; index: ParsedIndex } | null {
  const m = stmt.match(
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+"?(\w+)"?\s*\(([^)]+)\)/i,
  )
  if (!m) return null
  const isUnique = !!m[1]
  const [, , name, tableName, colsText] = m
  if (!name || !tableName || !colsText) return null
  const cols = parseColList(colsText.replace(/\s+DESC\b/gi, '').replace(/\s+ASC\b/gi, ''))
  const index: ParsedIndex = { name, columns: cols }
  if (isUnique) index.unique = true
  return { tableName, index }
}
