import {
  addActorTool,
  addComponentTool,
  addDomainTool,
  addModelTool,
  addModuleTool,
  addTableTool,
} from './add.js'
import { explainCodeTool, explainRefTool } from './explain.js'
import { moduleOperationsTool } from './operations.js'
import { searchTool } from './search.js'
import type { AnyToolDef } from './types.js'
import { validateTool } from './validate.js'

/**
 * The full registry of MCP tools published by `pd-mcp`.
 *
 * Read-side: validate / search / explain — agents call these to inspect a
 * space without re-implementing CLI parsing. Returned values are
 * structured JSON (validation issues, ranked search hits, entity records),
 * never colored shell text.
 *
 * Write-side: add_actor / add_module / add_domain / add_component /
 * add_model / add_table — equivalent to `pd add <kind>` but driven by
 * tool args and producing a stable result envelope (wrote, file, ref).
 *
 * `pd_explain_code` does not load the space — it's pure documentation
 * lookup, mirroring `pd lint --explain`.
 */
export const ALL_TOOLS: AnyToolDef[] = [
  validateTool as unknown as AnyToolDef,
  searchTool as unknown as AnyToolDef,
  explainRefTool as unknown as AnyToolDef,
  explainCodeTool as unknown as AnyToolDef,
  addActorTool as unknown as AnyToolDef,
  addModuleTool as unknown as AnyToolDef,
  addDomainTool as unknown as AnyToolDef,
  addComponentTool as unknown as AnyToolDef,
  addModelTool as unknown as AnyToolDef,
  addTableTool as unknown as AnyToolDef,
  moduleOperationsTool as unknown as AnyToolDef,
]

export function findTool(name: string): AnyToolDef | undefined {
  return ALL_TOOLS.find((t) => t.name === name)
}
