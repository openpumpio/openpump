# OpenPump

MCP-native Solana trading infrastructure. TypeScript SDK, MCP server, ElizaOS plugin, and Solana Agent Kit integration for [pump.fun](https://pump.fun) automation.

**Website:** [openpump.io](https://openpump.io) | **Docs:** [openpump.io/docs](https://openpump.io/docs) | **X:** [@openpumpio](https://x.com/openpumpio)

## Packages

| Package | npm | Description |
|---|---|---|
| [`@openpump/mcp`](./packages/mcp-client) | [![npm](https://img.shields.io/npm/v/@openpump/mcp)](https://www.npmjs.com/package/@openpump/mcp) | MCP server for Claude Desktop, Cursor, and Claude Code |
| [`@openpump/sdk`](./packages/sdk) | [![npm](https://img.shields.io/npm/v/@openpump/sdk)](https://www.npmjs.com/package/@openpump/sdk) | TypeScript SDK for the OpenPump API |
| [`@openpump/eliza-plugin`](./packages/eliza-plugin) | [![npm](https://img.shields.io/npm/v/@openpump/eliza-plugin)](https://www.npmjs.com/package/@openpump/eliza-plugin) | ElizaOS plugin for conversational token trading |
| [`@openpump/solana-agent-kit`](./packages/solana-agent-kit) | [![npm](https://img.shields.io/npm/v/@openpump/solana-agent-kit)](https://www.npmjs.com/package/@openpump/solana-agent-kit) | Solana Agent Kit v2 plugin |

## Quick Start

### MCP Server (Claude Desktop / Cursor / Claude Code)

```bash
npx @openpump/mcp init
```

Auto-detects installed AI clients and configures them. See [`@openpump/mcp` README](./packages/mcp-client) for details.

### SDK

```bash
npm install @openpump/sdk
```

```typescript
import { OpenPump } from '@openpump/sdk';

const client = new OpenPump({ apiKey: 'op_sk_live_...' });

// Create a token
const job = await client.tokens.create({
  name: 'My Token',
  symbol: 'MTK',
  description: 'A new token on pump.fun',
});

// Buy tokens
await client.trading.buy({
  mint: 'TOKEN_MINT_ADDRESS',
  walletId: 'your-wallet-id',
  amountSol: 0.1,
});
```

### ElizaOS Plugin

```bash
npm install @openpump/eliza-plugin
```

See [`@openpump/eliza-plugin` README](./packages/eliza-plugin) for setup.

### Solana Agent Kit

```bash
npm install @openpump/solana-agent-kit
```

See [`@openpump/solana-agent-kit` README](./packages/solana-agent-kit) for setup.

## Getting an API Key

1. Sign up at [openpump.io](https://openpump.io)
2. Go to Settings and generate an API key
3. Keys start with `op_sk_live_`

## License

MIT
