// Client
export { OpenPump } from './client.js';
export type { OpenPumpConfig } from './client.js';

// Errors
export {
  OpenPumpError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  InsufficientFundsError,
  TransactionError,
} from './errors.js';

// Resource types (re-export for consumer convenience)
export type {
  Wallets,
  CreateWalletOptions,
  WalletInfo,
  WalletBalance,
  DepositInstructions,
  TransferOptions,
  TransferResult,
  TransactionListOptions,
  TransactionListResult,
} from './resources/wallets.js';
export type {
  Tokens,
  CreateTokenOptions,
  CreateTokenResult,
  TokenListItem,
  CurveState,
} from './resources/tokens.js';
export type {
  Trading,
  BuyOptions,
  BuyResult,
  SellOptions,
  SellResult,
  QuoteOptions,
  QuoteResult,
  QuoteBuyCostOptions,
  QuoteBuyCostResult,
  BundleSellOptions,
  BundleSellResult,
  BundleSellEntry,
  PriorityLevel,
} from './resources/trading.js';
export type { Jobs, JobStatus, PollOptions } from './resources/jobs.js';
export type {
  CreatorFees,
  AccumulatedFees,
  ClaimFeesResult,
} from './resources/creator-fees.js';
export type {
  Bundles,
  BundleLaunchOptions,
  BundleLaunchResult,
} from './resources/bundles.js';
