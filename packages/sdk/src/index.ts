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
  BatchCreateOptions,
  BatchCreateResult,
  AggregateBalance,
  ImportWalletOptions,
  ExportPrivateKeyOptions,
  ExportPrivateKeyResult,
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
  BundleBuyEntry,
  BundleBuyOptions,
  BundleBuyResult,
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
export type {
  MarketMaking,
  CreatePoolOptions,
  PoolInfo,
  PoolStatus,
  FundPoolOptions,
  FundPoolResult,
  ConsolidatePoolOptions,
  ConsolidatePoolResult,
  SessionConfig,
  StartSessionOptions,
  SessionInfo,
  SessionPnl,
} from './resources/market-making.js';
export type {
  Snipe,
  MonitorCriteria,
  StartMonitorOptions,
  MonitorInfo,
} from './resources/snipe.js';
export type {
  StopLoss,
  SetStopLossOptions,
  StopLossInfo,
} from './resources/stop-loss.js';
export type {
  Vanity,
  VanityPatternType,
  VanityAddressType,
  VanityEstimateOptions,
  VanityEstimateResult,
  VanityOrderOptions,
  VanityOrderResult,
  VanityJob,
  VanityJobListOptions,
} from './resources/vanity.js';
