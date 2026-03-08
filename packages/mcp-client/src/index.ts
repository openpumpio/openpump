/**
 * OpenPump MCP Server -- stdio transport entry point.
 *
 * This is the default entry for `npx @openpump/mcp` and Claude Desktop config.
 * If the `init` subcommand is passed, delegates to the CLI installer instead.
 *
 * Environment variables:
 *   OPENPUMP_API_KEY  - Required. Your OpenPump API key (op_sk_live_...)
 *   OPENPUMP_API_URL  - Optional. API base URL (default: https://openpump.io)
 *
 * Usage:
 *   OPENPUMP_API_KEY=op_sk_live_abc123 npx @openpump/mcp
 *   npx @openpump/mcp init [--api-key <key>] [--help]
 *
 * Claude Desktop config (claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "openpump": {
 *         "command": "npx",
 *         "args": ["-y", "@openpump/mcp"],
 *         "env": {
 *           "OPENPUMP_API_KEY": "op_sk_live_..."
 *         }
 *       }
 *     }
 *   }
 */

// If "init" subcommand is passed, delegate to the CLI installer
if (process.argv[2] === 'init') {
  await import('./cli/init.js');
} else {
  // Normal stdio MCP server startup
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const { createMcpServer } = await import('./server.js');
  const { validateApiKey } = await import('./middleware/api-key-auth.js');

  const API_KEY = process.env['OPENPUMP_API_KEY'] ?? '';
  const API_BASE_URL = process.env['OPENPUMP_API_URL'] ?? 'https://openpump.io';

  if (!API_KEY) {
    console.error('ERROR: OPENPUMP_API_KEY environment variable is required.');
    console.error('');
    console.error('Set it to your OpenPump API key (op_sk_live_...) and try again.');
    console.error('');
    console.error('Example:');
    console.error('  OPENPUMP_API_KEY=op_sk_live_abc123 npx @openpump/mcp');
    // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point, must exit on bad config
    process.exit(1);
  }

  if (!API_KEY.startsWith('op_sk_live_')) {
    console.error('ERROR: OPENPUMP_API_KEY must start with "op_sk_live_".');
    console.error('');
    console.error(`Received: "${API_KEY.slice(0, 12)}..."`);
    // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point, must exit on bad config
    process.exit(1);
  }

  // Validate the API key once at startup via the REST API
  console.error('Validating API key...');
  const userContext = await validateApiKey(API_KEY, API_BASE_URL);

  if (!userContext) {
    console.error('ERROR: API key validation failed.');
    console.error('');
    console.error('Possible causes:');
    console.error('  - Invalid or expired API key');
    console.error('  - API server unreachable at ' + API_BASE_URL);
    console.error('  - Network connectivity issue');
    // eslint-disable-next-line unicorn/no-process-exit -- CLI entry point, must exit on bad config
    process.exit(1);
  }

  console.error(`Authenticated as user ${userContext.userId} with ${userContext.wallets.length.toString()} wallet(s).`);

  // Enrich wallet balances (non-fatal if it fails)
  try {
    const res = await fetch(`${API_BASE_URL}/api/wallets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (res.ok) {
      const body = (await res.json()) as {
        data?: Array<{ id: string; solBalance?: number | null }>;
      };
      const list = body.data ?? [];
      const balanceMap = new Map(
        list
          .filter((w) => w.solBalance != null)
          .map((w) => [w.id, w.solBalance as number]),
      );
      if (balanceMap.size > 0) {
        for (const wallet of userContext.wallets) {
          const bal = balanceMap.get(wallet.id);
          if (bal !== undefined) wallet.solBalance = bal;
        }
      }
    }
  } catch {
    // Non-fatal -- continue without balance enrichment
  }

  const server = createMcpServer(userContext, API_BASE_URL);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('OpenPump MCP server running on stdio transport.');
}
