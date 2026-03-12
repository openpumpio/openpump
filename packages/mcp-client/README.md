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

## Available Tools

### Token Operations
- `create-token` -- Create a new token on pump.fun

### Trading
- `buy-token` -- Buy tokens
- `sell-token` -- Sell tokens
- `bundle-buy` -- Bundle buy across multiple wallets
- `bundle-sell` -- Bundle sell across multiple wallets
- `estimate-bundle-cost` -- Estimate cost for a bundle operation
- `claim-creator-fees` -- Claim accumulated creator fees

### Transfers
- `transfer-sol` -- Transfer SOL between wallets
- `transfer-token` -- Transfer SPL tokens between wallets

### Wallet Management
- `create-wallet` -- Create a new managed wallet
- `batch-create-wallets` -- Create 2-50 wallets in one action
- `list-wallets` -- List all wallets
- `get-wallet-balance` -- Get SOL balance for a wallet
- `get-aggregate-balance` -- Get total balance across all wallets
- `get-wallet-deposit-address` -- Get deposit address for a wallet
- `get-wallet-transactions` -- Get transaction history

### Market Data
- `get-token-info` -- Get token metadata and details
- `get-token-market-info` -- Get live market data (price, volume, holders)
- `get-token-holdings` -- Get token holdings for a wallet
- `get-token-quote` -- Get a buy/sell quote
- `list-my-tokens` -- List tokens created by the authenticated user
- `get-creator-fees` -- Get claimable creator fees
- `get-jito-tip-levels` -- Get current Jito tip levels

### Jobs
- `poll-job` -- Poll the status of an async job (token creation, trades)

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
