/**
 * Shared shapes for MCP tool definitions. Each tool exports an
 * `inputSchema` (JSON Schema) and a `handler` that returns a
 * structured result. The server adapts these into MCP `CallToolResult`
 * envelopes with `content: [{ type: 'text', text: JSON.stringify(...) }]`.
 *
 * Returning structured JSON (instead of pre-formatted text) is the whole
 * point of the MCP server: agents parse responses without regex and
 * call the next tool with values from the previous one.
 */
export interface ToolDef<Input, Output> {
  name: string
  description: string
  inputSchema: object
  handler: (input: Input) => Promise<Output> | Output
}

export type AnyToolDef = ToolDef<Record<string, unknown>, unknown>
