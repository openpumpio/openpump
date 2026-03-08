/**
 * WalletProvider — Injects current wallet balances and token positions into agent state.
 *
 * This provider runs before each agent response turn, giving the agent awareness of
 * the user's current portfolio. The text output is included in the agent's context
 * so it can make informed trading decisions.
 */
import type { Provider, IAgentRuntime, Memory, State } from '@elizaos/core';
import { getClient } from '../plugin.js';

interface WalletBalance {
  walletId: string;
  publicKey: string;
  label: string | null;
  solBalance: string;
  lamports: string;
  tokenBalances: Array<{
    mint: string;
    amount: string;
    uiAmount: number | null;
    decimals: number;
  }>;
}

export const walletProvider: Provider = {
  name: 'openpumpWalletProvider',
  description: 'Provides current OpenPump managed wallet balances and token positions for portfolio awareness',
  dynamic: true,
  position: 10,

  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    const apiKey = runtime.getSetting('OPENPUMP_API_KEY');
    if (!apiKey) {
      return { text: '', data: {}, values: {} };
    }

    try {
      const client = getClient(runtime);

      // Fetch wallet list
      const walletsRes = await client.get('/api/wallets');
      if (!walletsRes.ok) {
        return { text: 'OpenPump: Unable to fetch wallets', data: {}, values: {} };
      }
      const walletsData = (await walletsRes.json()) as {
        data: Array<{ id: string; publicKey: string; label: string | null; walletIndex: number }>;
      };
      const wallets = walletsData.data ?? [];

      if (wallets.length === 0) {
        return {
          text: 'OpenPump Portfolio: No wallets configured.',
          data: { wallets: [] },
          values: { walletCount: 0 },
        };
      }

      // Fetch balances for all wallets in parallel
      const balanceResults = await Promise.allSettled(
        wallets.map(async (w): Promise<WalletBalance> => {
          const res = await client.get(`/api/wallets/${w.id}/balance`);
          if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
          const body = (await res.json()) as {
            data: {
              solBalance: string;
              lamports: string;
              tokenBalances: Array<{ mint: string; amount: string; uiAmount: number | null; decimals: number }>;
            };
          };
          return {
            walletId: w.id,
            publicKey: w.publicKey,
            label: w.label,
            solBalance: body.data.solBalance,
            lamports: body.data.lamports,
            tokenBalances: body.data.tokenBalances,
          };
        }),
      );

      const balances: WalletBalance[] = balanceResults
        .filter((r): r is PromiseFulfilledResult<WalletBalance> => r.status === 'fulfilled')
        .map((r) => r.value);

      // Format as readable text for agent context
      const lines: string[] = ['OpenPump Portfolio:'];
      let totalSol = 0;
      let totalTokenPositions = 0;

      for (const b of balances) {
        const sol = Number.parseFloat(b.solBalance);
        totalSol += sol;
        const label = b.label ? ` "${b.label}"` : '';
        lines.push(`  Wallet${label} (${b.walletId}): ${b.solBalance} SOL`);

        for (const tb of b.tokenBalances) {
          if (tb.uiAmount !== null && tb.uiAmount > 0) {
            totalTokenPositions++;
            lines.push(`    - Token ${tb.mint}: ${String(tb.uiAmount)} (raw: ${tb.amount})`);
          }
        }
      }

      lines.push(
        `Total: ${totalSol.toFixed(4)} SOL across ${String(wallets.length)} wallets, ` +
        `${String(totalTokenPositions)} token positions`,
      );

      return {
        text: lines.join('\n'),
        data: { wallets: balances },
        values: {
          walletCount: wallets.length,
          totalSol: totalSol.toFixed(4),
          totalTokenPositions,
        },
      };
    } catch (error) {
      return {
        text: `OpenPump: Portfolio fetch failed (${error instanceof Error ? error.message : String(error)})`,
        data: {},
        values: {},
      };
    }
  },
};
