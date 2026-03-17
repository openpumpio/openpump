# @openpump/mcp

MCP (Model Context Protocol) server for Solana token operations on [pump.fun](https://pump.fun) via [OpenPump](https://openpump.io). Works with Claude Desktop, Claude Code, Cursor, and any MCP-compatible client.

## Features

- **57 tools** for token creation, trading, transfers, wallet management, and market data
- **Dual transport**: stdio (for `npx` / Claude Desktop) and HTTP (for remote deployment)
- **API key authentication** via the OpenPump REST API -- no database required
- **Zero workspace dependencies** -- installable from npm without access to the monorepo

## Quick Start

### 1. Get an API Key

Sign up at [openpump.io](https://openpump.io) and generate an API key from Settings. Keys start with `op_sk_live_`.

### 2. Auto-configure (recommended)

The CLI installer detects installed AI clients, prompts for your API key, and writes the correct config files automatically:

```bash
npx @openpump/mcp init
```

Or pass the key directly:

```bash
npx @openpump/mcp init --api-key op_sk_live_abc123
```

**Supported clients:** Claude Desktop (macOS, Windows, Linux), Cursor, Claude Code.

The installer:
- Detects which clients are installed on your system
- Lets you choose which ones to configure
- Merges the OpenPump entry into existing config without overwriting other MCP servers
- Creates config directories and files if they don't exist
- Warns before overwriting an existing OpenPump entry

Run `npx @openpump/mcp init --help` for all options.

### 3. Run via npx (manual)

If you prefer to set up manually, run the MCP server directly:

```bash
OPENPUMP_API_KEY=op_sk_live_abc123 npx @openpump/mcp
```

## Client Setup (Manual)

If you prefer manual configuration over `npx @openpump/mcp init`, add the following to each client's config file.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "openpump": {
      "command": "npx",
      "args": ["-y", "@openpump/mcp@latest"],
      "env": {
        "OPENPUMP_API_KEY": "op_sk_live_..."
      }
    }
  }
}
```

### Claude Code

Use the CLI or add to `.claude/settings.json`:

```bash
claude mcp add openpump --transport stdio -- npx -y @openpump/mcp@latest
```

Or manually add to `.claude/settings.json` in your project or `~/.claude/settings.json` globally:

```json
{
  "mcpServers": {
    "openpump": {
      "command": "npx",
      "args": ["-y", "@openpump/mcp@latest"],
      "env": {
        "OPENPUMP_API_KEY": "op_sk_live_..."
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openpump": {
      "command": "npx",
      "args": ["-y", "@openpump/mcp@latest"],
      "env": {
        "OPENPUMP_API_KEY": "op_sk_live_..."
      }
    }
  }
}
```

## HTTP Transport

For remote deployments or multi-tenant setups, use the HTTP transport:

```bash
OPENPUMP_API_URL=https://openpump.io PORT=3001 node -e "import('@openpump/mcp/http')"
```

Or when installed locally:

```bash
npm start:http
```

The HTTP transport exposes `POST /mcp`, `GET /mcp`, and `DELETE /mcp` endpoints with per-request API key authentication via `Authorization: Bearer` or `x-api-key` headers.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENPUMP_API_KEY` | Yes (stdio) | -- | Your OpenPump API key (`op_sk_live_...`) |
| `OPENPUMP_API_URL` | No | `https://openpump.io` | OpenPump API base URL |
| `PORT` | No | `3001` | HTTP transport port |
| `MCP_SESSION_TTL_HOURS` | No | `4` | HTTP session idle timeout (hours) |

## Available Tools (57)

### Token Creation & Trading (8)

| Tool | Description |
|------|-------------|
| `create-token` | Create a new token on pump.fun |
| `bundle-launch` | Create token + coordinated multi-wallet buy via Jito bundles |
| `bundle-buy` | Coordinated multi-wallet buy via Jito bundles |
| `bundle-sell` | Coordinated multi-wallet sell via Jito bundles |
| `buy-token` | Buy a token with SOL (single wallet) |
| `sell-token` | Sell a token back to SOL |
| `estimate-bundle-cost` | Preview bundle costs without executing |
| `claim-creator-fees` | Claim accumulated PumpFun creator fees |

### Transfers (2)

| Tool | Description |
|------|-------------|
| `transfer-sol` | Send SOL to any Solana address (10 SOL cap per call) |
| `transfer-token` | Send SPL tokens to any Solana address |

### Wallet Management (7)

| Tool | Description |
|------|-------------|
| `create-wallet` | Create a new HD-derived custodial wallet |
| `batch-create-wallets` | Create 2-50 wallets in one action with auto-numbered labels |
| `list-wallets` | List all wallets with public keys, labels, and derivation index |
| `get-wallet-balance` | Get SOL + token balances for a wallet |
| `get-aggregate-balance` | Get total SOL across all wallets |
| `get-wallet-deposit-address` | Get deposit address and funding instructions |
| `get-wallet-transactions` | Paginated transfer history for a wallet |

### Market Data & Info (7)

| Tool | Description |
|------|-------------|
| `get-token-info` | Token metadata: price, market cap, bonding curve progress, graduation status |
| `get-token-market-info` | Rich analytics: volume, buy/sell counts, price changes, risk metrics |
| `get-token-holdings` | Which wallets hold a specific token (or all holdings across all wallets) |
| `get-token-quote` | Price quote for buy or sell without executing |
| `list-my-tokens` | All tokens launched by the authenticated user |
| `get-creator-fees` | Check accumulated PumpFun creator fees |
| `get-jito-tip-levels` | Current Jito MEV tip amounts per priority level |

### Vanity Addresses (4)

| Tool | Description |
|------|-------------|
| `estimate-vanity-cost` | Estimate credit cost for a vanity address pattern |
| `order-vanity-address` | Order a custom vanity Solana wallet or mint address |
| `list-vanity-jobs` | List all vanity address generation jobs |
| `get-vanity-job` | Get status of a specific vanity job |

### Market Making (13)

| Tool | Description |
|------|-------------|
| `mm-create-pool` | Create a wallet pool for market making (2-50 wallets) |
| `mm-fund-pool` | Distribute SOL to pool wallets (optional multi-hop obfuscation) |
| `mm-pool-status` | Aggregate pool view: per-wallet SOL + token balances |
| `mm-consolidate-pool` | Sweep all funds from pool wallets to a single target |
| `mm-list-pools` | List all wallet pools |
| `mm-start-session` | Start autonomous market making on a token |
| `mm-stop-session` | Stop a running session |
| `mm-pause-session` | Pause a session (retains position and config) |
| `mm-resume-session` | Resume a paused session |
| `mm-session-status` | Session stats: trades, P&L, position |
| `mm-list-sessions` | List all sessions (filter by status) |
| `mm-update-strategy` | Hot-update strategy params on a running session |
| `mm-get-pnl` | Detailed P&L: cost basis, realized/unrealized, ROI |

### Sniping (7)

| Tool | Description |
|------|-------------|
| `snipe-start` | Start a snipe monitor that auto-buys new tokens matching criteria |
| `snipe-stop` | Stop a snipe monitor permanently |
| `snipe-pause` | Pause a snipe monitor |
| `snipe-resume` | Resume a paused snipe monitor |
| `snipe-update` | Update criteria on an active or paused monitor |
| `snipe-status` | Get monitor status and criteria |
| `snipe-list` | List all snipe monitors |

### Stop-Loss (4)

| Tool | Description |
|------|-------------|
| `stop-loss-set` | Set a stop-loss that auto-sells when market cap drops below trigger |
| `stop-loss-remove` | Remove a stop-loss monitor |
| `stop-loss-list` | List all stop-loss monitors |
| `stop-loss-status` | Get status of a specific stop-loss |

### Spam Launch (3)

| Tool | Description |
|------|-------------|
| `spam-launch` | Launch multiple tokens in rapid succession from a single wallet |
| `estimate-spam-cost` | Estimate SOL + credit cost for a spam campaign |
| `cancel-spam-launch` | Cancel a running spam launch |

### Jobs (2)

| Tool | Description |
|------|-------------|
| `poll-job` | Check status of an async job (token creation, trades, bundles) |
| `cancel-job` | Cancel a running async orchestration job |

## Devnet

To test against Solana devnet (no real funds), point the MCP server at the devnet instance:

```bash
OPENPUMP_API_KEY=op_sk_live_... OPENPUMP_API_URL=https://devnet.openpump.io npx @openpump/mcp
```

Or configure your client to use the devnet HTTP endpoint directly:

**Claude Desktop / Cursor:**
```json
{
  "mcpServers": {
    "openpump-devnet": {
      "url": "https://devnet.openpump.io/api/mcp",
      "headers": { "Authorization": "Bearer op_sk_live_..." }
    }
  }
}
```

**Claude Code:**
```bash
claude mcp add --transport http openpump-devnet https://devnet.openpump.io/api/mcp \
  --header "Authorization: Bearer op_sk_live_..."
```

> Devnet API keys are created at [devnet.openpump.io](https://devnet.openpump.io) and are separate from mainnet keys.

## Development

```bash
# Install dependencies
pnpm install

# Run in dev mode (auto-reload)
pnpm run dev

# Build
pnpm run build

# Run tests
pnpm run test

# Type check
pnpm run typecheck

# Lint
pnpm run lint
```

## License

MIT
