/**
 * UserContext -- attached to each MCP session after API key authentication.
 *
 * This mirrors the auth context used by apps/api so that the MCP server
 * can pass user identity and wallet information through to tool handlers
 * via closure, without leaking it into MCP tool arguments.
 */

/** A single wallet belonging to the authenticated user */
export interface WalletInfo {
  /** Wallet database ID (UUID) */
  id: string;
  /** On-chain public key (base58) */
  publicKey: string;
  /** User-assigned label (null if unset) */
  label: string | null;
  /** Derivation index (0 = primary) */
  index: number;
  /** Cached SOL balance in SOL (may be slightly stale) */
  solBalance?: number;
}

export interface UserContext {
  /** Database user ID (UUID) */
  userId: string;
  /** API key database row ID (UUID) */
  apiKeyId: string;
  /** Granted scopes from the API key */
  scopes: string[];
  /** All managed wallets for this user */
  wallets: WalletInfo[];
  /** Raw API key (op_sk_live_...) -- used by tools to authenticate against the REST API */
  apiKey: string;
}
