# @openpump/sdk

TypeScript SDK for the OpenPump REST API. Zero runtime dependencies (uses global `fetch`), dual-format (ESM + CJS), fully typed.

## Installation

```bash
# Internal workspace usage
pnpm add @openpump/sdk
```

## Quick Start

```ts
import { OpenPump } from '@openpump/sdk';

const op = new OpenPump({ apiKey: 'op_sk_live_...' });

const wallets = await op.wallets.list();
console.log(wallets);
```

## Configuration

```ts
const op = new OpenPump({
  apiKey: 'op_sk_live_...',           // Required
  baseUrl: 'https://api.openpump.io', // Default
  timeout: 30_000,                     // Default (ms)
});
```

## Resources

### Wallets

```ts
// List all wallets
const wallets = await op.wallets.list();

// Create a wallet
const wallet = await op.wallets.create({ label: 'Trading Wallet' });

// Get a single wallet
const w = await op.wallets.get('wallet-id');

// Get balances (SOL + tokens)
const balance = await op.wallets.getBalance('wallet-id');

// Get deposit instructions
const deposit = await op.wallets.getDepositInstructions('wallet-id');

// Force-refresh balance (bypass 30s cache)
const fresh = await op.wallets.refreshBalance('wallet-id');

// Transfer SOL or SPL tokens
const tx = await op.wallets.transfer('wallet-id', {
  toAddress: 'recipient-public-key',
  amountLamports: '100000000',
});

// Get transaction history
const history = await op.wallets.getTransactions('wallet-id', {
  type: 'buy',
  limit: 20,
  offset: 0,
});
```

### Tokens

```ts
// List your tokens
const tokens = await op.tokens.list();

// Create a new PumpFun token
const token = await op.tokens.create({
  name: 'My Token',
  symbol: 'MTK',
  description: 'A cool token',
  imageBase64: 'base64-encoded-image...',
  imageType: 'image/png',
  twitter: '@mytoken',
  website: 'https://mytoken.com',
});

// Get market info (mainnet only)
const market = await op.tokens.getMarketInfo('mint-address');

// Get bonding curve state
const curve = await op.tokens.getCurveState('mint-address');
console.log(curve.currentPriceSOL, curve.graduationPercent);
```

### Trading

```ts
// Get a price quote
const quote = await op.trading.getQuote('mint-address', {
  action: 'buy',
  solAmount: '1000000000',
});

// Get SOL cost for a specific token amount
const cost = await op.trading.getQuoteBuyCost('mint-address', {
  tokenAmount: '1000000',
});

// Buy tokens
const buy = await op.trading.buy('mint-address', {
  walletId: 'wallet-id',
  amountLamports: '500000000',
  slippageBps: 500,
  priorityLevel: 'fast',
});

// Sell tokens
const sell = await op.trading.sell('mint-address', {
  walletId: 'wallet-id',
  tokenAmount: 'all',
  slippageBps: 500,
});

// Multi-wallet bundle sell (Jito bundles)
const bundleSell = await op.trading.bundleSell('mint-address', {
  walletSells: [
    { walletId: 'w1', tokenAmount: 'all' },
    { walletId: 'w2', tokenAmount: '500000' },
  ],
  slippageBps: 500,
});
```

### Bundles

```ts
// Launch token + multi-wallet buy in a single Jito bundle
const { jobId } = await op.bundles.launch({
  devWalletId: 'wallet-1',
  buyWalletIds: ['wallet-2', 'wallet-3'],
  name: 'My Token',
  symbol: 'MTK',
  imageBase64: '...',
  imageType: 'image/png',
  walletBuyAmounts: ['500000000', '500000000'],
});

// Poll for completion
const result = await op.jobs.poll(jobId, {
  intervalMs: 2000,
  timeoutMs: 60_000,
  onProgress: (s) => console.log(`${s.progress}%`),
});
```

### Jobs

```ts
// Get job status
const status = await op.jobs.get('job-id');

// Poll until completion with progress callback
const result = await op.jobs.poll('job-id', {
  intervalMs: 2000,
  timeoutMs: 60_000,
  onProgress: (s) => console.log(`${s.progress}%`),
});

// Poll with abort support
const controller = new AbortController();
const result = await op.jobs.poll('job-id', {
  signal: controller.signal,
});
// Call controller.abort() to cancel polling
```

### Creator Fees

```ts
// Check accumulated fees
const fees = await op.creatorFees.getAccumulatedFees('creator-address');
console.log(fees.accumulatedSOL);

// Claim fees
const claim = await op.creatorFees.claim('creator-address');
console.log(claim.signature);
```

## Error Handling

The SDK throws typed errors that map to HTTP status codes:

```ts
import {
  OpenPumpError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
} from '@openpump/sdk';

try {
  await op.wallets.list();
} catch (error) {
  if (error instanceof AuthenticationError) {
    // 401 - Invalid or expired API key
    console.error(error.code, error.message);
  } else if (error instanceof ValidationError) {
    // 422 - Invalid input
    console.error(error.details);
  } else if (error instanceof NotFoundError) {
    // 404 - Resource not found
  } else if (error instanceof RateLimitError) {
    // 429 - Too many requests
  } else if (error instanceof OpenPumpError) {
    // Any other API error
    console.error(error.status, error.code, error.message);
  }
}
```

All error classes extend `OpenPumpError` with these properties:

| Property  | Type      | Description                |
|-----------|-----------|----------------------------|
| `code`    | `string`  | Machine-readable error code |
| `message` | `string`  | Human-readable description  |
| `status`  | `number`  | HTTP status code            |
| `details` | `unknown` | Optional validation details |

## Build

```bash
pnpm --filter @openpump/sdk run build
```

Outputs ESM (`.js`), CJS (`.cjs`), and TypeScript declarations (`.d.ts`, `.d.cts`) to `dist/`.

## Test

```bash
pnpm --filter @openpump/sdk exec npx vitest run
```

## Requirements

- Node.js 18+ (global `fetch` required)
- TypeScript 5.3+
