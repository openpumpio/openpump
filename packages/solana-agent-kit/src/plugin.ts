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
import { transferSolAction } from './actions/transfer-sol.js';
import { transferTokenAction } from './actions/transfer-token.js';
import { batchCreateWalletsAction } from './actions/batch-create-wallets.js';
import { getAggregateBalanceAction } from './actions/get-aggregate-balance.js';
import { mmStartSessionAction } from './actions/mm-start-session.js';
import { mmStopSessionAction } from './actions/mm-stop-session.js';
import { mmSessionStatusAction } from './actions/mm-session-status.js';
import { mmListSessionsAction } from './actions/mm-list-sessions.js';
import { snipeStartAction } from './actions/snipe-start.js';
import { snipeStopAction } from './actions/snipe-stop.js';
import { snipeListAction } from './actions/snipe-list.js';
import { stopLossSetAction } from './actions/stop-loss-set.js';
import { stopLossRemoveAction } from './actions/stop-loss-remove.js';
import { stopLossListAction } from './actions/stop-loss-list.js';
import { vanityOrderAction } from './actions/vanity-order.js';
import { vanityListAction } from './actions/vanity-list.js';

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

    // --- New actions ---

    openpumpTransferSol: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(
        client,
        'POST',
        `/api/wallets/${input['fromWalletId'] as string}/transfer`,
        {
          toAddress: input['toAddress'],
          amountLamports: input['amountLamports'],
        },
      );
    },

    openpumpTransferToken: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(
        client,
        'POST',
        `/api/wallets/${input['fromWalletId'] as string}/transfer`,
        {
          toAddress: input['toAddress'],
          mint: input['mint'],
          tokenAmount: input['tokenAmount'],
        },
      );
    },

    openpumpBatchCreateWallets: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const body: Record<string, unknown> = {
        count: input['count'],
      };
      if (input['labelPrefix'] !== undefined) body['labelPrefix'] = input['labelPrefix'];
      return callApi(client, 'POST', '/api/wallets/batch', body);
    },

    openpumpGetAggregateBalance: async (agent: SolanaAgentKit) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(client, 'GET', '/api/wallets/aggregate-balance');
    },

    openpumpMmStartSession: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const body: Record<string, unknown> = {
        mint: input['mint'],
        config: input['config'],
      };
      if (input['walletIds'] !== undefined) body['walletIds'] = input['walletIds'];
      if (input['walletPoolId'] !== undefined) body['walletPoolId'] = input['walletPoolId'];
      return callApi(client, 'POST', '/api/market-making/sessions', body);
    },

    openpumpMmStopSession: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(
        client,
        'POST',
        `/api/market-making/sessions/${input['sessionId'] as string}/stop`,
      );
    },

    openpumpMmSessionStatus: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(
        client,
        'GET',
        `/api/market-making/sessions/${input['sessionId'] as string}`,
      );
    },

    openpumpMmListSessions: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      let path = '/api/market-making/sessions';
      if (input['status'] !== undefined) {
        path += `?status=${input['status'] as string}`;
      }
      return callApi(client, 'GET', path);
    },

    openpumpSnipeStart: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const body: Record<string, unknown> = {
        walletId: input['walletId'],
        tickerPattern: input['tickerPattern'],
        buyAmountSol: input['buyAmountSol'],
      };
      if (input['maxBuys'] !== undefined) body['maxBuys'] = input['maxBuys'];
      if (input['maxDevPercent'] !== undefined) body['maxDevPercent'] = input['maxDevPercent'];
      if (input['maxTop10Percent'] !== undefined)
        body['maxTop10Percent'] = input['maxTop10Percent'];
      if (input['maxSniperCount'] !== undefined)
        body['maxSniperCount'] = input['maxSniperCount'];
      if (input['maxAgeSeconds'] !== undefined) body['maxAgeSeconds'] = input['maxAgeSeconds'];
      if (input['requireSocial'] !== undefined) body['requireSocial'] = input['requireSocial'];
      if (input['slippageBps'] !== undefined) body['slippageBps'] = input['slippageBps'];
      if (input['priorityLevel'] !== undefined)
        body['priorityLevel'] = input['priorityLevel'];
      return callApi(client, 'POST', '/api/snipe-monitors/monitors', body);
    },

    openpumpSnipeStop: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(
        client,
        'POST',
        `/api/snipe-monitors/monitors/${input['monitorId'] as string}/stop`,
      );
    },

    openpumpSnipeList: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      let path = '/api/snipe-monitors/monitors';
      if (input['status'] !== undefined) {
        path += `?status=${input['status'] as string}`;
      }
      return callApi(client, 'GET', path);
    },

    openpumpStopLossSet: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const body: Record<string, unknown> = {
        walletId: input['walletId'],
        mint: input['mint'],
        triggerMarketCapSol: input['triggerMarketCapSol'],
      };
      if (input['sellPercent'] !== undefined) body['sellPercent'] = input['sellPercent'];
      if (input['slippageBps'] !== undefined) body['slippageBps'] = input['slippageBps'];
      if (input['priorityLevel'] !== undefined)
        body['priorityLevel'] = input['priorityLevel'];
      return callApi(client, 'POST', '/api/stop-losses', body);
    },

    openpumpStopLossRemove: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      return callApi(
        client,
        'DELETE',
        `/api/stop-losses/${input['stopLossId'] as string}`,
      );
    },

    openpumpStopLossList: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      let path = '/api/stop-losses';
      if (input['status'] !== undefined) {
        path += `?status=${input['status'] as string}`;
      }
      return callApi(client, 'GET', path);
    },

    openpumpVanityOrder: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const body: Record<string, unknown> = {
        pattern: input['pattern'],
      };
      if (input['patternType'] !== undefined) body['patternType'] = input['patternType'];
      if (input['caseSensitive'] !== undefined)
        body['caseSensitive'] = input['caseSensitive'];
      return callApi(client, 'POST', '/api/vanity/order', body);
    },

    openpumpVanityList: async (
      agent: SolanaAgentKit,
      input: Record<string, unknown>,
    ) => {
      const client = getClient(agent as unknown as Record<string, unknown>);
      const params: string[] = [];
      if (input['limit'] !== undefined) params.push(`limit=${String(input['limit'])}`);
      if (input['offset'] !== undefined) params.push(`offset=${String(input['offset'])}`);
      const qs = params.length > 0 ? `?${params.join('&')}` : '';
      return callApi(client, 'GET', `/api/vanity/jobs${qs}`);
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
    transferSolAction,
    transferTokenAction,
    batchCreateWalletsAction,
    getAggregateBalanceAction,
    mmStartSessionAction,
    mmStopSessionAction,
    mmSessionStatusAction,
    mmListSessionsAction,
    snipeStartAction,
    snipeStopAction,
    snipeListAction,
    stopLossSetAction,
    stopLossRemoveAction,
    stopLossListAction,
    vanityOrderAction,
    vanityListAction,
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
