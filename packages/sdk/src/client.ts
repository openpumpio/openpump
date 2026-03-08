import { HttpClient } from './http.js';
import { Wallets } from './resources/wallets.js';
import { Tokens } from './resources/tokens.js';
import { Trading } from './resources/trading.js';
import { Jobs } from './resources/jobs.js';
import { CreatorFees } from './resources/creator-fees.js';
import { Bundles } from './resources/bundles.js';

export interface OpenPumpConfig {
  /** API key (op_sk_live_...) */
  apiKey: string;
  /** Base URL of the OpenPump API. Defaults to https://api.openpump.io */
  baseUrl?: string;
  /** Request timeout in milliseconds. Defaults to 30_000 */
  timeout?: number;
}

/**
 * OpenPump SDK client with resource-namespaced API methods.
 *
 * @example
 * ```ts
 * import { OpenPump } from '@openpump/sdk';
 *
 * const op = new OpenPump({ apiKey: 'op_sk_live_...' });
 *
 * // List wallets
 * const wallets = await op.wallets.list();
 *
 * // Create a token
 * const token = await op.tokens.create({ ... });
 *
 * // Buy tokens
 * const trade = await op.trading.buy('mint-address', { ... });
 *
 * // Poll a bundle launch job
 * const job = await op.jobs.poll('job-id', { timeoutMs: 60_000 });
 * ```
 */
export class OpenPump {
  readonly wallets: Wallets;
  readonly tokens: Tokens;
  readonly trading: Trading;
  readonly jobs: Jobs;
  readonly creatorFees: CreatorFees;
  readonly bundles: Bundles;

  private readonly _http: HttpClient;

  constructor(config: OpenPumpConfig) {
    if (!config.apiKey) {
      throw new Error('apiKey is required');
    }

    this._http = new HttpClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'https://api.openpump.io',
      timeout: config.timeout ?? 30_000,
    });

    this.wallets = new Wallets(this._http);
    this.tokens = new Tokens(this._http);
    this.trading = new Trading(this._http);
    this.jobs = new Jobs(this._http);
    this.creatorFees = new CreatorFees(this._http);
    this.bundles = new Bundles(this._http);
  }
}
