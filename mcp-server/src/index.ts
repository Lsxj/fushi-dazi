#!/usr/bin/env node
/**
 * Fushi MCP server entrypoint (stdio transport).
 *
 * IMPORTANT: installWxShim() MUST be called before importing any fushi-ditu
 * util, because those utils call `wx.getStorageSync` inline at module-load time
 * or at first-call time depending on the function.
 *
 * We use a dynamic import for the fushi-ditu utils to make this ordering explicit
 * and to keep the shim out of the dependency graph for any future HTTP transport.
 */
import { installWxShim } from './shim/wx-shim.js'

installWxShim()

// Now safe to import fushi-ditu modules.
const { createFushiServer } = await import('./server.js')
const { StdioServerTransport } = await import(
  '@modelcontextprotocol/sdk/server/stdio.js'
)

async function main(): Promise<void> {
  const server = createFushiServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // StdioServerTransport keeps the process alive; on SIGINT/SIGTERM we shut down cleanly.
  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`fushi-mcp: received ${signal}, shutting down\n`)
    await server.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  process.stderr.write(`fushi-mcp: fatal: ${(err as Error).stack ?? err}\n`)
  process.exit(1)
})