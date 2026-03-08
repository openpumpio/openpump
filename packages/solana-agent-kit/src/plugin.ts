/**
 * OpenPump plugin for Solana Agent Kit v2.
 *
 * Wraps the OpenPump REST API as LLM-callable actions.
 * Uses managed wallets (server-side signing) -- does NOT access
 * agent.wallet or agent.connection.
 *
 * Usage:
 *   const agent = new SolanaAgentKit(wallet, rpcUrl, {
 *     OPENPUMP_API_KEY: 'op_sk_live_...',
 *     OPENPUMP_API_BASE_URL: 'https://api.openpump.io', // optional
 *   }).use(OpenPumpPlugin);
 */
import type { Plugin, SolanaAgentKit } from 'solana-agent-kit';
import { createApiClient } from './api-client.js';
import { storeClient, getClient, callApi } from './utils.js';
import { buyTokenAction } from './actions/buy-token.js';
import { sellTokenAction } from './actions/sell-token.js';
import { createTokenAction } from './actions/create-token.js';
import { getTokenInfoAction } from './actions/get-token-info.js';
import { listWalletsAction } from './actions/list-wallets.js';
import { createWalletAction } from './actions/create-wallet.js';
import { getBalanceAction } from './actions/get-balance.js';
import { bundleBuyAction } from './actions/bundle-buy.js';

/** Default API base URL for the OpenPump REST API. */
const DEFAULT_API_BASE_URL = 'https://api.openpump.io';

export const OpenPumpPlugin: Plugin = {
  name: 'openpump',

  methods: {
    openpumpBuyToken: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const body: Record<string, unknown> = {
        walletId: input['walletId'],
        amountLamports: input['amountLamports'],
      };
      if (input['slippageBps'] !== undefined) body['slippageBps'] = input['slippageBps'];
      if (input['priorityLevel'] !== undefined)
        body['priorityLevel'] = input['priorityLevel'];
      return callApi(
        client,
        'POST',
        `/api/tokens/${input['mint'] as string}/buy`,
        body,
      );
    },

    openpumpSellToken: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const body: Record<string, unknown> = {
        walletId: input['walletId'],
        tokenAmount: input['tokenAmount'],
      };
      if (input['slippageBps'] !== undefined) body['slippageBps'] = input['slippageBps'];
      if (input['priorityLevel'] !== undefined)
        body['priorityLevel'] = input['priorityLevel'];
      return callApi(
        client,
        'POST',
        `/api/tokens/${input['mint'] as string}/sell`,
        body,
      );
    },

    openpumpCreateToken: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(client, 'POST', '/api/tokens/create', input);
    },

    openpumpGetTokenInfo: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(
        client,
        'GET',
        `/api/tokens/${input['mint'] as string}/curve-state`,
      );
    },

    openpumpListWallets: async (agent: SolanaAgentKit) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(client, 'GET', '/api/wallets');
    },

    openpumpCreateWallet: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const body: Record<string, unknown> = {};
      if (input['label'] !== undefined) body['label'] = input['label'];
      return callApi(client, 'POST', '/api/wallets', body);
    },

    openpumpGetBalance: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(
        client,
        'GET',
        `/api/wallets/${input['walletId'] as string}/balance`,
      );
    },

    openpumpBundleBuy: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(client, 'POST', '/api/tokens/bundle-launch', input);
    },
  },

  actions: [
    buyTokenAction,
    sellTokenAction,
    createTokenAction,
    getTokenInfoAction,
    listWalletsAction,
    createWalletAction,
    getBalanceAction,
    bundleBuyAction,
  ],

  initialize(agent: SolanaAgentKit): void {
    const apiKey = (agent.config as Record<string, unknown>)['OPENPUMP_API_KEY'] as
      | string
      | undefined;
    if (!apiKey) {
      throw new Error(
        'OpenPumpPlugin requires OPENPUMP_API_KEY in agent config. ' +
          'Pass it when creating SolanaAgentKit: new SolanaAgentKit(wallet, rpc, { OPENPUMP_API_KEY: "op_sk_live_..." })',
      );
    }

    const baseUrl =
      ((agent.config as Record<string, unknown>)['OPENPUMP_API_BASE_URL'] as
        | string
        | undefined) ?? DEFAULT_API_BASE_URL;

    const client = createApiClient(apiKey, baseUrl);
    storeClient(agent as unknown as Record<string, unknown>, client);
  },
};
