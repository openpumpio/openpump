/**
 * Unit tests for the MCP server factory.
 */
import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../server.js';
import type { UserContext } from '../lib/context.js';

describe('createMcpServer', () => {
  const mockUserContext: UserContext = {
    userId: 'user-test-123',
    apiKeyId: 'key-test-456',
    scopes: ['read', 'trade'],
    wallets: [
      {
        id: 'wallet-1',
        publicKey: 'ABC123DEF456',
        label: 'test-wallet',
        index: 0,
      },
    ],
    apiKey: 'op_sk_live_testkey123',
  };

  it('creates an McpServer instance', () => {
    const server = createMcpServer(mockUserContext, 'https://api.example.com');
    expect(server).toBeDefined();
  });

  it('creates separate server instances for different contexts', () => {
    const server1 = createMcpServer(mockUserContext, 'https://api.example.com');
    const server2 = createMcpServer(
      { ...mockUserContext, userId: 'different-user' },
      'https://api.example.com',
    );
    expect(server1).not.toBe(server2);
  });
});
