import { loadAndValidate } from '../util/space.js'
import { CODE_DOCS, type CodeDoc } from './lint-docs.js'
import type { ToolDef } from './types.js'

// ---------------------- pd_explain_ref ----------------------

interface ExplainRefInput {
  ref: string
  spaceDir?: string
}

interface ExplainRefOutput {
  ref: string
  found: boolean
  kind?: string
  entity?: unknown
  // Optional walks for richer context — populated for kinds that benefit.
  callers?: string[]
  callees?: string[]
  usedInUseCases?: string[]
  persistedAs?: string
  reason?: string
}

export const explainRefTool: ToolDef<ExplainRefInput, ExplainRefOutput> = {
  name: 'pd_explain_ref',
  description:
    "Resolve a Pizza Doc ref (e.g. 'module:api/component:OrderController' or 'actor:user') and return the underlying entity plus relationships. Use this when you have a ref from search/validate and need to see the actual fields, callers, callees, or use-case usage.",
  inputSchema: {
    type: 'object',
    properties: {
      ref: {
        type: 'string',
        description:
          'Pizza Doc ref. Top-level forms: actor:<id>, module:<id>, usecase:<id>. Nested: module:<id>/component:<id>, module:<id>/domain:<d>/model:<id>, etc.',
      },
      spaceDir: { type: 'string' },
    },
    required: ['ref'],
    additionalProperties: false,
  },
  async handler(input) {
    const { space } = await loadAndValidate(input.spaceDir)
    const found = lookupRef(space, input.ref)
    if (!found) {
      return {
        ref: input.ref,
        found: false,
        reason:
          'Ref not found. Note Pizza Doc grammar: top-level kinds are only actor:, module:, usecase:; everything else reaches through a module.',
      }
    }
    const out: ExplainRefOutput = {
      ref: input.ref,
      found: true,
      kind: found.kind,
      entity: found.entity,
    }
    // Collect use-case usage where this ref appears in any step.
    const used: string[] = []
    for (const uc of space.useCases) {
      let touched = false
      for (const step of uc.steps) {
        if (step.from === input.ref || step.to === input.ref || step.via === input.ref) {
          touched = true
          break
        }
      }
      for (const ef of uc.errorFlows) {
        for (const step of ef.steps) {
          if (step.from === input.ref || step.to === input.ref || step.via === input.ref) {
            touched = true
            break
          }
        }
        if (touched) break
      }
      if (touched) used.push(`usecase:${uc.id}`)
    }
    if (used.length) out.usedInUseCases = used
    // Component-specific: callers / callees from method.calls and other components' calls.
    if (found.kind === 'component') {
      // Calls were ref-strings in v0.2 and became {target, ...} objects in
      // v0.3 (A1). Accept both shapes here so this tool works against any
      // loaded space without re-typing through @pizza-doc/core.
      type CallEntry = string | { target?: string }
      const targetOf = (c: CallEntry): string => (typeof c === 'string' ? c : (c?.target ?? ''))
      const me = found.entity as { id: string; methods: { calls?: CallEntry[] }[] }
      const callees = new Set<string>()
      for (const method of me.methods) {
        for (const c of method.calls ?? []) {
          const t = targetOf(c)
          if (t) callees.add(t)
        }
      }
      out.callees = [...callees].sort()
      const callers = new Set<string>()
      const myMethodPrefix = `${input.ref}/method:`
      const visitComponent = (
        prefix: string,
        c: { id: string; methods: { calls?: CallEntry[] }[] },
      ): void => {
        for (const m of c.methods) {
          for (const callEntry of m.calls ?? []) {
            const tgt = targetOf(callEntry)
            if (tgt === input.ref || tgt.startsWith(myMethodPrefix)) {
              callers.add(`${prefix}/component:${c.id}`)
              return
            }
          }
        }
      }
      for (const mod of space.modules) {
        for (const c of mod.components) visitComponent(`module:${mod.id}`, c)
        for (const d of mod.domains) {
          for (const c of d.components) visitComponent(`module:${mod.id}/domain:${d.id}`, c)
        }
      }
      out.callers = [...callers].sort()
    }
    // Model-specific: persistedAs target if any.
    if (found.kind === 'model') {
      const m = found.entity as { persistedAs?: string }
      if (m.persistedAs) out.persistedAs = m.persistedAs
    }
    return out
  },
}

// ---------------------- pd_explain_code ----------------------

interface ExplainCodeInput {
  code: string
}

export const explainCodeTool: ToolDef<ExplainCodeInput, { code: string; doc: CodeDoc | null }> = {
  name: 'pd_explain_code',
  description:
    "Look up a Pizza Doc validation code (e.g. 'USECASE_STEP_CHAIN_DISCONTINUITY', 'DATAFLOW_TARGET_FIELD_MISSING') and return its meaning, common causes, and recommended fix as structured JSON. Mirrors `pd lint --explain`.",
  inputSchema: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Validation code, e.g. HTTP_STEP_TARGET_NOT_CONTROLLER.',
      },
    },
    required: ['code'],
    additionalProperties: false,
  },
  handler(input) {
    const doc = CODE_DOCS[input.code] ?? null
    return { code: input.code, doc }
  },
}

// ---------------------- shared ref lookup ----------------------

interface LookupResult {
  kind: 'actor' | 'module' | 'domain' | 'component' | 'model' | 'table' | 'usecase'
  entity: unknown
}

function lookupRef(space: import('@pizza-doc/core').Space, ref: string): LookupResult | null {
  // actor:<id>
  const actorMatch = ref.match(/^actor:([A-Za-z][A-Za-z0-9_-]*)$/)
  if (actorMatch?.[1]) {
    const a = space.actors.find((x) => x.id === actorMatch[1])
    return a ? { kind: 'actor', entity: a } : null
  }
  // usecase:<id>
  const ucMatch = ref.match(/^usecase:([A-Za-z][A-Za-z0-9_-]*)$/)
  if (ucMatch?.[1]) {
    const uc = space.useCases.find((x) => x.id === ucMatch[1])
    return uc ? { kind: 'usecase', entity: uc } : null
  }
  // module:<id> or module:<id>/<rest>
  const modMatch = ref.match(/^module:([A-Za-z][A-Za-z0-9_-]*)(?:\/(.+))?$/)
  if (modMatch?.[1]) {
    const mod = space.modules.find((x) => x.id === modMatch[1])
    if (!mod) return null
    if (!modMatch[2]) return { kind: 'module', entity: mod }
    const tail = modMatch[2]
    const domainMatch = tail.match(/^domain:([A-Za-z][A-Za-z0-9_-]*)(?:\/(.+))?$/)
    if (domainMatch?.[1]) {
      const dom = mod.domains.find((d) => d.id === domainMatch[1])
      if (!dom) return null
      if (!domainMatch[2]) return { kind: 'domain', entity: dom }
      return resolveLeaf(dom.components, dom.models, dom.tables, domainMatch[2])
    }
    return resolveLeaf(mod.components, mod.models, mod.tables, tail)
  }
  return null
}

function resolveLeaf(
  components: import('@pizza-doc/core').Component[],
  models: import('@pizza-doc/core').Model[],
  tables: import('@pizza-doc/core').Table[],
  segment: string,
): LookupResult | null {
  const compMatch = segment.match(/^component:([A-Za-z][A-Za-z0-9_-]*)(?:\/method:(.+))?$/)
  if (compMatch?.[1]) {
    const c = components.find((x) => x.id === compMatch[1])
    if (!c) return null
    if (compMatch[2]) {
      const method = c.methods.find((m) => m.name === compMatch[2])
      if (!method) return null
      return { kind: 'component', entity: { ...c, focusedMethod: method } }
    }
    return { kind: 'component', entity: c }
  }
  const modelMatch = segment.match(/^model:([A-Za-z][A-Za-z0-9_-]*)$/)
  if (modelMatch?.[1]) {
    const m = models.find((x) => x.id === modelMatch[1])
    return m ? { kind: 'model', entity: m } : null
  }
  const tableMatch = segment.match(/^table:([A-Za-z][A-Za-z0-9_-]*)$/)
  if (tableMatch?.[1]) {
    const t = tables.find((x) => x.id === tableMatch[1])
    return t ? { kind: 'table', entity: t } : null
  }
  return null
}
