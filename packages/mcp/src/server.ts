import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ALL_TOOLS, findTool } from './tools/index.js'
import { SERVER_VERSION } from './version.js'

export const SERVER_NAME = 'pizza-doc'
export { SERVER_VERSION }

/**
 * Build a Pizza Doc MCP server. Caller wires up a transport (stdio for
 * the CLI bin, http for hosted scenarios) and calls `connect`.
 *
 * Tool dispatch is in one place so we can:
 *   - return structured JSON instead of pre-formatted markdown,
 *   - convert thrown Errors into MCP `isError` envelopes the agent
 *     can branch on,
 *   - keep the per-tool implementations free of MCP framing concerns.
 */
export function buildServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: 'object' },
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = findTool(req.params.name)
    if (!tool) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: `unknown tool: ${req.params.name}`,
              known: ALL_TOOLS.map((t) => t.name),
            }),
          },
        ],
      }
    }
    try {
      const args = (req.params.arguments ?? {}) as Record<string, unknown>
      const out = await tool.handler(args)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: message, tool: req.params.name }),
          },
        ],
      }
    }
  })

  return server
}
