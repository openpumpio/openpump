/**
 * Integration test: verify the MCP server registers all 23 tools
 * and that tool names/descriptions match the existing apps/mcp server.
 */
import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../server.js';
import type { UserContext } from '../lib/context.js';

const API_URL = 'https://api.example.com';

const mockUserContext: UserContext = {
  userId: 'test-user',
  apiKeyId: 'test-key-id',
  scopes: ['read', 'trade'],
  wallets: [
    {
      id: 'wallet-1',
      publicKey: 'So11111111111111111111111111111111111111112',
      label: 'main',
      index: 0,
    },
  ],
  apiKey: 'op_sk_live_test123',
};

// Expected tool names -- all 23 tools (1 token + 6 trading + 2 transfer + 4 wallet + 9 info + 1 job)
const EXPECTED_TOOL_NAMES = [
  'create-token',
  'bundle-buy',
  'bundle-sell',
  'buy-token',
  'sell-token',
  'estimate-bundle-cost',
  'claim-creator-fees',
  'transfer-sol',
  'transfer-token',
  'create-wallet',
  'get-aggregate-balance',
  'get-wallet-deposit-address',
  'get-wallet-transactions',
  'get-token-info',
  'get-token-market-info',
  'list-my-tokens',
  'get-token-holdings',
  'get-wallet-balance',
  'list-wallets',
  'get-creator-fees',
  'get-token-quote',
  'get-jito-tip-levels',
  'poll-job',
];

describe('MCP tools integration', () => {
  it('registers exactly 23 tools', () => {
    const server = createMcpServer(mockUserContext, API_URL);

    // Access internal tool registry (McpServer._registeredTools is populated after tool() calls)
    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;

    const registeredToolNames = Object.keys(registeredTools).sort();

    expect(registeredToolNames).toHaveLength(23);
  });

  it('registers all expected tool names', () => {
    const server = createMcpServer(mockUserContext, API_URL);

    const registeredTools = (server as unknown as { _registeredTools: Record<string, unknown> })
      ._registeredTools;

    const registeredToolNames = Object.keys(registeredTools).sort();
    const expectedSorted = [...EXPECTED_TOOL_NAMES].sort();

    expect(registeredToolNames).toEqual(expectedSorted);
  });

  it('each tool has a description', () => {
    const server = createMcpServer(mockUserContext, API_URL);

    const registeredTools = (server as unknown as {
      _registeredTools: Record<string, { description?: string }>;
    })._registeredTools;

    for (const [name, tool] of Object.entries(registeredTools)) {
      expect(tool.description, `Tool "${name}" should have a description`).toBeTruthy();
    }
  });
});
