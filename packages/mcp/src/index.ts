#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { buildServer } from './server.js'

export { buildServer, SERVER_NAME, SERVER_VERSION } from './server.js'
export { ALL_TOOLS, findTool } from './tools/index.js'

async function main(): Promise<void> {
  const server = buildServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Lifetime is owned by the transport — the server stays connected
  // until the client closes stdin (Claude Desktop / Cursor / Code does
  // this on shutdown). No explicit loop needed.
}

// Run when invoked directly via the bin entry, but also let consumers
// import { buildServer } for embedding (tests, custom transports).
import { realpathSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

function isCliEntrypoint(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url
  } catch {
    return false
  }
}

if (isCliEntrypoint()) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
    process.exit(1)
  })
}

// Suppress "value never read" when only the bin path is used.
void fileURLToPath
