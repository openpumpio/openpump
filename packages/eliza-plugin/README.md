# @openpump/eliza-plugin

ElizaOS plugin for [OpenPump](https://openpump.io) -- buy, sell, and launch PumpFun tokens via conversational AI agents.

## Installation

```bash
npm install @openpump/eliza-plugin
# or
pnpm add @openpump/eliza-plugin
```

> **Peer dependency:** Requires `@elizaos/core` >= 1.0.0

## Quick Start

Add the plugin to your ElizaOS character configuration:

```json
{
  "name": "TradingAgent",
  "plugins": ["@openpump/eliza-plugin"],
  "settings": {
    "secrets": {
      "OPENPUMP_API_KEY": "op_sk_live_..."
    }
  }
}
```

That's it. Your agent now has access to 8 trading actions and a portfolio context provider.

## Configuration

| Setting | Required | Default | Description |
|---------|----------|---------|-------------|
| `OPENPUMP_API_KEY` | Yes | -- | Your OpenPump API key (starts with `op_sk_`) |
| `OPENPUMP_API_URL` | No | `https://api.openpump.io` | Custom API base URL |

Settings are read from `runtime.getSetting()`, which resolves from your character JSON's `settings.secrets` object.

## Actions

The plugin registers 8 actions that the agent can invoke based on natural language:

### OPENPUMP_BUY_TOKEN

Buy a token from a specific wallet.

```
"Buy 0.5 SOL worth of token ABC from my sniper wallet"
```

**Parameters:** `walletId`, `mint`, `amountLamports` (optional: `slippageBps`, `priorityLevel`)

### OPENPUMP_SELL_TOKEN

Sell a token from a specific wallet.

```
"Sell all my tokens XYZ from wallet w1"
```

**Parameters:** `walletId`, `mint`, `tokenAmount` (optional: `slippageBps`, `priorityLevel`)

### OPENPUMP_CREATE_TOKEN

Create a new PumpFun token.

```
"Create a token called DOGE3 with symbol D3 and this image URL"
```

**Parameters:** `walletId`, `name`, `symbol`, `description`, `imageUrl` (optional: `twitter`, `telegram`, `website`)

### OPENPUMP_GET_TOKEN_INFO

Get current price, market cap, and bonding curve state for a token.

```
"What's the current price of token ABC?"
```

**Parameters:** `mint`

### OPENPUMP_LIST_WALLETS

List all managed wallets with their public keys and labels.

```
"Show me my wallets"
```

**Parameters:** None required.

### OPENPUMP_GET_BALANCE

Get SOL balance and token positions for a specific wallet.

```
"What's the balance of wallet w1?"
```

**Parameters:** `walletId`

### OPENPUMP_BUNDLE_BUY

Atomically create a token and execute coordinated multi-wallet buys using Jito MEV bundles.

```
"Bundle launch token MOON with 3 sniper wallets buying 0.5 SOL each"
```

**Parameters:** `devWalletId`, `buyWalletIds[]`, `name`, `symbol`, `description`, `imageUrl`, `devBuyAmountLamports`, `walletBuyAmounts[]`

### OPENPUMP_SELL_ALL

Sell a token from ALL wallets that hold it.

```
"Sell all positions in token XYZ across all wallets"
```

**Parameters:** `mint`

## Provider

### WalletProvider

The `openpumpWalletProvider` automatically injects current portfolio state into the agent's context before each response. This gives the agent awareness of:

- All managed wallets with labels
- SOL balances per wallet
- Token positions with amounts
- Total portfolio summary

The provider runs automatically -- no configuration needed beyond the API key.

## Advanced Usage

You can import individual components for custom integrations:

```typescript
import {
  openpumpPlugin,
  buyTokenAction,
  sellTokenAction,
  walletProvider,
  createApiClient,
  getClient,
} from '@openpump/eliza-plugin';
```

### Custom API Client

```typescript
import { createApiClient } from '@openpump/eliza-plugin';

const client = createApiClient('op_sk_live_...', 'https://api.openpump.io');
const res = await client.get('/api/wallets');
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Build
pnpm build
```

## Architecture

The plugin follows a thin adapter pattern:

```
ElizaOS Runtime
  -> Plugin.init() validates API key
  -> Action.validate() checks key exists
  -> Action.handler() extracts params from message.content
  -> ApiClient calls OpenPump REST API
  -> Handler formats response as conversational text
  -> Provider injects portfolio context into agent state
```

Each action is stateless and uses a module-level API client cache keyed by agent ID. The plugin has zero runtime dependencies beyond `fetch` (available in Node 18+).

## License

MIT
