/**
 * MCP server factory for the publishable @openpump/mcp package.
 *
 * Creates a new McpServer per session. Tools access the userContext
 * via closure -- identity is injected once per session at construction time,
 * not passed through tool arguments.
 *
 * Unlike apps/mcp/src/server.ts, this version accepts an explicit apiBaseUrl
 * parameter instead of relying on a hardcoded API_BASE_URL constant.
 *
 * Server info (name: "openpump", version: "1.0.0") identifies this server
 * in MCP client discovery.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAllTools } from './tools/index.js';
import type { UserContext } from './lib/context.js';

/**
 * Create a new McpServer instance bound to the given user context.
 *
 * The factory pattern ensures each authenticated session gets its own
 * server with its own tool registrations bound to the correct user.
 *
 * @param userContext - Authenticated user context (from API key validation)
 * @param apiBaseUrl  - Base URL of the OpenPump REST API (e.g. "https://openpump.io")
 */
export function createMcpServer(userContext: UserContext, apiBaseUrl: string): McpServer {
  const server = new McpServer({
    name: 'openpump',
    version: '1.0.0',
  });

  registerAllTools(server, userContext, apiBaseUrl);

  return server;
}
