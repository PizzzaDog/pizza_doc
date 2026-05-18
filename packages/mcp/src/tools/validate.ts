import { loadAndValidate } from '../util/space.js'
import type { ToolDef } from './types.js'

interface ValidateInput {
  spaceDir?: string
}

interface ValidateOutput {
  spaceDir: string
  metaId: string
  files: number
  passes: { schema: boolean; refs: boolean; semantic: boolean }
  counts: { errors: number; warnings: number; infos: number }
  issues: Array<{
    severity: 'error' | 'warning' | 'info'
    code: string
    message: string
    file?: string
    line?: number
    column?: number
    entityRef?: string
    suggestion?: string
  }>
}

export const validateTool: ToolDef<ValidateInput, ValidateOutput> = {
  name: 'pd_validate',
  description:
    'Run the three-pass Pizza Doc validator (schema, refs, semantic) against a space and return all issues as structured JSON. Use this before drawing conclusions about whether a spec is correct — it is the source of truth, never the prose.',
  inputSchema: {
    type: 'object',
    properties: {
      spaceDir: {
        type: 'string',
        description:
          'Optional path to the space dir (.pizza-doc or spaces/<id>). If omitted, walks up from cwd.',
      },
    },
    additionalProperties: false,
  },
  async handler(input) {
    const { space, spaceDir, metaId, issues, loadResult } = await loadAndValidate(input.spaceDir)
    const counts = { errors: 0, warnings: 0, infos: 0 }
    for (const i of issues) {
      if (i.severity === 'error') counts.errors++
      else if (i.severity === 'warning') counts.warnings++
      else counts.infos++
    }
    return {
      spaceDir,
      metaId,
      files: loadResult.files.size,
      passes: {
        schema: counts.errors === 0 || !issues.some((i) => i.code.startsWith('SCHEMA_')),
        refs: !issues.some((i) => i.code === 'REF_BROKEN' || i.code === 'REF_WRONG_KIND'),
        semantic: !issues.some(
          (i) =>
            i.severity === 'error' &&
            !i.code.startsWith('SCHEMA_') &&
            i.code !== 'REF_BROKEN' &&
            i.code !== 'REF_WRONG_KIND',
        ),
      },
      counts,
      issues: issues.map((i) => {
        const out: ValidateOutput['issues'][number] = {
          severity: i.severity,
          code: i.code,
          message: i.message,
        }
        if (i.file) out.file = i.file
        if (typeof i.line === 'number') out.line = i.line
        if (typeof i.column === 'number') out.column = i.column
        if (i.entityRef) out.entityRef = i.entityRef
        if (i.suggestion) out.suggestion = i.suggestion
        return out
      }),
      // Include space-level summary so the agent doesn't have to call
      // search/explain just to learn how many entities are present.
      summary: summarize(space),
    } as ValidateOutput & { summary: SpaceSummary }
  },
}

interface SpaceSummary {
  actors: number
  modules: number
  components: number
  models: number
  tables: number
  useCases: number
}

function summarize(space: import('@pizza-doc/core').Space): SpaceSummary {
  let components = 0
  let models = 0
  let tables = 0
  for (const m of space.modules) {
    components += m.components.length
    models += m.models.length
    tables += m.tables.length
    for (const d of m.domains) {
      components += d.components.length
      models += d.models.length
      tables += d.tables.length
    }
  }
  return {
    actors: space.actors.length,
    modules: space.modules.length,
    components,
    models,
    tables,
    useCases: space.useCases.length,
  }
}
