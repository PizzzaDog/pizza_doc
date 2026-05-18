import { loadAndValidate } from '../util/space.js'
import type { ToolDef } from './types.js'

interface SearchInput {
  query: string
  kind?: 'actor' | 'module' | 'component' | 'model' | 'table' | 'usecase'
  limit?: number
  spaceDir?: string
}

interface SearchHit {
  kind: string
  ref: string
  id: string
  name: string
  description?: string
  score: number
}

export const searchTool: ToolDef<SearchInput, { hits: SearchHit[]; total: number }> = {
  name: 'pd_search',
  description:
    'Fuzzy search across all entities in a space (actors, modules, components, models, tables, use cases). Matches on id, name, and description. Returns ranked results with their refs so the next tool call can target a specific entity.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — substrings are matched case-insensitively.',
      },
      kind: {
        type: 'string',
        enum: ['actor', 'module', 'component', 'model', 'table', 'usecase'],
        description: 'Restrict to one entity kind.',
      },
      limit: {
        type: 'number',
        description: 'Cap the number of hits (default 20).',
      },
      spaceDir: { type: 'string' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async handler(input) {
    const limit = input.limit ?? 20
    const q = input.query.trim().toLowerCase()
    if (!q) return { hits: [], total: 0 }
    const { space } = await loadAndValidate(input.spaceDir)

    const hits: SearchHit[] = []
    const want = (k: SearchHit['kind']): boolean => !input.kind || input.kind === k

    if (want('actor')) {
      for (const a of space.actors) {
        const score = scoreEntry(q, a.id, a.name, a.description)
        if (score > 0) {
          hits.push({
            kind: 'actor',
            ref: `actor:${a.id}`,
            id: a.id,
            name: a.name,
            ...(a.description ? { description: a.description } : {}),
            score,
          })
        }
      }
    }

    for (const m of space.modules) {
      if (want('module')) {
        const score = scoreEntry(q, m.id, m.name, m.description)
        if (score > 0) {
          hits.push({
            kind: 'module',
            ref: `module:${m.id}`,
            id: m.id,
            name: m.name,
            ...(m.description ? { description: m.description } : {}),
            score,
          })
        }
      }
      const visit = (
        prefix: string,
        components: typeof m.components,
        models: typeof m.models,
        tables: typeof m.tables,
      ): void => {
        if (want('component')) {
          for (const c of components) {
            const s = scoreEntry(q, c.id, c.name, c.description)
            if (s > 0)
              hits.push({
                kind: 'component',
                ref: `${prefix}/component:${c.id}`,
                id: c.id,
                name: c.name,
                ...(c.description ? { description: c.description } : {}),
                score: s,
              })
          }
        }
        if (want('model')) {
          for (const md of models) {
            const s = scoreEntry(q, md.id, md.name, md.description)
            if (s > 0)
              hits.push({
                kind: 'model',
                ref: `${prefix}/model:${md.id}`,
                id: md.id,
                name: md.name,
                ...(md.description ? { description: md.description } : {}),
                score: s,
              })
          }
        }
        if (want('table')) {
          for (const t of tables) {
            const s = scoreEntry(q, t.id, t.name, t.description)
            if (s > 0)
              hits.push({
                kind: 'table',
                ref: `${prefix}/table:${t.id}`,
                id: t.id,
                name: t.name,
                ...(t.description ? { description: t.description } : {}),
                score: s,
              })
          }
        }
      }
      visit(`module:${m.id}`, m.components, m.models, m.tables)
      for (const d of m.domains) {
        visit(`module:${m.id}/domain:${d.id}`, d.components, d.models, d.tables)
      }
    }

    if (want('usecase')) {
      for (const uc of space.useCases) {
        const score = scoreEntry(q, uc.id, uc.name, uc.description)
        if (score > 0) {
          hits.push({
            kind: 'usecase',
            ref: `usecase:${uc.id}`,
            id: uc.id,
            name: uc.name,
            ...(uc.description ? { description: uc.description } : {}),
            score,
          })
        }
      }
    }

    hits.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref))
    return { hits: hits.slice(0, limit), total: hits.length }
  },
}

/**
 * Score = sum of weighted matches. ID match is most authoritative
 * (refs are unique), then name, then description (substring). Empty fields
 * contribute nothing. Score 0 means "no match, drop".
 */
function scoreEntry(q: string, id: string, name: string, description?: string): number {
  let score = 0
  const idl = id.toLowerCase()
  const nl = name.toLowerCase()
  const dl = (description ?? '').toLowerCase()
  if (idl === q) score += 100
  else if (idl.startsWith(q)) score += 50
  else if (idl.includes(q)) score += 25
  if (nl === q) score += 80
  else if (nl.startsWith(q)) score += 40
  else if (nl.includes(q)) score += 20
  if (dl.includes(q)) score += 5
  return score
}
