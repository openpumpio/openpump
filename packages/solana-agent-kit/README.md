# @openpump/solana-agent-kit

OpenPump plugin for [Solana Agent Kit v2](https://github.com/sendaifun/solana-agent-kit) -- PumpFun token trading for AI agents.

Provides 8 LLM-callable actions for trading PumpFun tokens via OpenPump's managed wallet API. Uses server-side signing so no local keypairs are needed.

## Installation

```bash
npm install @openpump/solana-agent-kit solana-agent-kit zod
```

## Quick Start

```typescript
import { SolanaAgentKit } from 'solana-agent-kit';
import { OpenPumpPlugin } from '@openpump/solana-agent-kit';

const agent = new SolanaAgentKit(wallet, rpcUrl, {
  OPENPUMP_API_KEY: 'op_sk_live_...',
  OPENPUMP_API_BASE_URL: 'https://api.openpump.io', // optional, defaults to this
}).use(OpenPumpPlugin);

// Programmatic usage via methods
const wallets = await agent.methods.openpumpListWallets(agent);
const result = await agent.methods.openpumpBuyToken(agent, {
  walletId: 'your-wallet-id',
  mint: 'TokenMintAddress...',
  amountLamports: '100000000', // 0.1 SOL
});
```

## MCP Adapter

The plugin is auto-MCP-compatible via `@solana-agent-kit/adapter-mcp`. All actions are exposed as MCP tools without additional code:

```typescript
import { startMcpServer } from '@solana-agent-kit/adapter-mcp';

startMcpServer(agent.actions, agent, {
  name: 'openpump',
  version: '0.1.0',
});
```

## Actions Reference

| Action | Description |
|--------|-------------|
| `OPENPUMP_BUY_TOKEN` | Buy a PumpFun token with SOL from a managed wallet |
| `OPENPUMP_SELL_TOKEN` | Sell a PumpFun token back to SOL |
| `OPENPUMP_CREATE_TOKEN` | Create a new PumpFun token with bonding curve |
| `OPENPUMP_GET_TOKEN_INFO` | Get bonding curve state and metadata for a token |
| `OPENPUMP_LIST_WALLETS` | List all managed wallets for the account |
| `OPENPUMP_CREATE_WALLET` | Create a new HD-derived managed wallet |
| `OPENPUMP_GET_BALANCE` | Get SOL and token balances for a wallet |
| `OPENPUMP_BUNDLE_BUY` | Coordinated multi-wallet token launch via Jito bundles |

### OPENPUMP_BUY_TOKEN

Buy a PumpFun token with SOL.

**Parameters:**
- `walletId` (string, required) -- Managed wallet ID
- `mint` (string, required) -- Token mint address (base58)
- `amountLamports` (string, required) -- SOL to spend in lamports (e.g. "100000000" = 0.1 SOL)
- `slippageBps` (number, optional) -- Slippage tolerance in basis points (default: 500 = 5%)
- `priorityLevel` (string, optional) -- "economy" | "normal" | "fast" | "turbo"

### OPENPUMP_SELL_TOKEN

Sell a PumpFun token back to SOL.

**Parameters:**
- `walletId` (string, required) -- Wallet ID holding the token
- `mint` (string, required) -- Token mint address (base58)
- `tokenAmount` (string, required) -- Raw base units as decimal string, or "all" to sell entire balance
- `slippageBps` (number, optional) -- Slippage tolerance in basis points
- `priorityLevel` (string, optional) -- Transaction priority tier

### OPENPUMP_CREATE_TOKEN

Create a new PumpFun token with a bonding curve.

**Parameters:**
- `walletId` (string, required) -- Creator/dev wallet ID
- `name` (string, required) -- Token name (max 32 chars)
- `symbol` (string, required) -- Token ticker symbol (max 10 chars)
- `description` (string, required) -- Token description (max 500 chars)
- `imageUrl` (string, required) -- Publicly accessible image URL
- `initialBuyAmountSol` (number, optional) -- SOL for dev initial buy at creation
- `twitter` (string, optional) -- Twitter handle
- `telegram` (string, optional) -- Telegram link
- `website` (string, optional) -- Website URL

### OPENPUMP_GET_TOKEN_INFO

Get bonding curve state for a PumpFun token (read-only).

**Parameters:**
- `mint` (string, required) -- Token mint address (base58)

### OPENPUMP_LIST_WALLETS

List all managed wallets for the account (no parameters).

### OPENPUMP_CREATE_WALLET

Create a new HD-derived managed wallet.

**Parameters:**
- `label` (string, optional) -- Human-readable label (max 100 chars)

### OPENPUMP_GET_BALANCE

Get SOL and token balances for a wallet.

**Parameters:**
- `walletId` (string, required) -- Wallet ID to check balance for

### OPENPUMP_BUNDLE_BUY

Coordinated multi-wallet token launch using Jito MEV bundles.

**Parameters:**
- `devWalletId` (string, required) -- Dev/creator wallet ID
- `buyWalletIds` (string[], required) -- Wallet IDs for bundle buy (max 20)
- `tokenParams` (object, required) -- `{ name, symbol, description, imageUrl }`
- `devBuyAmountSol` (string, required) -- Dev buy in lamports
- `walletBuyAmounts` (string[], required) -- Per-wallet buy amounts in lamports
- `priorityLevel` (string, optional) -- Transaction priority tier
- `confirm` (boolean, required) -- Must be true to execute

> **Legal Notice:** Bundle buying may be subject to legal restrictions. A RICO lawsuit (July 2025) is active against bundling services. Use at your own risk.

## Configuration

| Config Key | Required | Default | Description |
|------------|----------|---------|-------------|
| `OPENPUMP_API_KEY` | Yes | -- | OpenPump API key (`op_sk_live_...`) |
| `OPENPUMP_API_BASE_URL` | No | `https://api.openpump.io` | API base URL |

## Architecture

This plugin uses **managed wallets** (server-side signing). It does NOT access `agent.wallet` or `agent.connection`. All signing is delegated to the OpenPump REST API via the API key.

```
AI Agent  -->  Solana Agent Kit  -->  OpenPump Plugin  -->  OpenPump REST API  -->  Solana
                                      (this package)       (server-side signing)
```

## Advanced Usage

Import individual actions for custom compositions:

```typescript
import { buyTokenAction, sellTokenAction } from '@openpump/solana-agent-kit';
```

Import the API client for standalone usage:

```typescript
import { createApiClient } from '@openpump/solana-agent-kit';

const api = createApiClient('op_sk_live_...', 'https://api.openpump.io');
const res = await api.get('/api/wallets');
```

## License

MIT
