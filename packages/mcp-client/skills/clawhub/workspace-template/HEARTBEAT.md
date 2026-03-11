# HEARTBEAT -- 30-Minute Autonomous Check Cycle

This checklist runs automatically every 30 minutes when OpenClaw fires the heartbeat timer. Execute every step in order. Do not skip steps even if the previous heartbeat was recent.

## Step 1: Check All Open Positions

```
get-token-holdings              -- Omit mint to get ALL token positions across all wallets
```

If no open positions exist, skip to Step 3.

For each position found, record:
- Wallet ID
- Mint address
- Token amount (raw base units)
- Wallet label (if any)

## Step 2: Evaluate Exit Conditions

For EACH open position from Step 1:

```
get-token-market-info (mint)    -- Get current price, volume, risk metrics
get-token-quote (mint, "sell", tokenAmount)  -- Get current SOL value of the position
```

Then evaluate these conditions in order (first match triggers the action):

### 2a. Emergency Exit (Rug Detection)

If `get-token-market-info` returns ANY of:
- Volume dropped to 0 in the last hour
- Token data is null or unavailable (token may have been removed)

**Action:** Sell immediately with `turbo` priority.
```
sell-token (walletId, mint, tokenAmount: "all", priorityLevel: "turbo")
```
**Log:** "EMERGENCY EXIT: [mint] -- [reason]. Sold at turbo priority."

### 2b. Stop-Loss (-50% from entry)

Compare the current SOL value (from `get-token-quote` sell) to the entry cost.

If current value <= 50% of entry cost:

**Action:** Sell immediately with `fast` priority.
```
sell-token (walletId, mint, tokenAmount: "all", priorityLevel: "fast")
```
**Log:** "STOP-LOSS: [mint] -- down [X]% from entry. Sold."

### 2c. Take-Profit (+200% from entry)

If current value >= 300% of entry cost (i.e., +200% gain):

**Action:** Sell with `normal` priority.
```
sell-token (walletId, mint, tokenAmount: "all", priorityLevel: "normal")
```
**Log:** "TAKE-PROFIT: [mint] -- up [X]% from entry. Sold."

### 2d. Trailing Stop (-30% from peak, if position has been up >100%)

If the position has at any point been up >100% from entry, and current value is >30% below the highest observed value:

**Action:** Sell with `fast` priority.
```
sell-token (walletId, mint, tokenAmount: "all", priorityLevel: "fast")
```
**Log:** "TRAILING STOP: [mint] -- dropped [X]% from peak of [Y] SOL. Sold."

### 2e. Time Decay (4 hours without +20% movement)

If position was entered >4 hours ago and has never been up >20% from entry:

**Action:** Sell with `normal` priority.
```
sell-token (walletId, mint, tokenAmount: "all", priorityLevel: "normal")
```
**Log:** "TIME DECAY: [mint] -- held for [X]h with only [Y]% movement. Sold."

### 2f. Risk Deterioration

If `get-token-market-info` shows risk metrics have worsened since entry:
- Sniper count has increased by >3 since entry
- Insider holding % has increased by >10 percentage points since entry

**Action:** Consider selling. If both conditions are met, sell.
```
sell-token (walletId, mint, tokenAmount: "all", priorityLevel: "fast")
```
**Log:** "RISK EXIT: [mint] -- risk metrics deteriorated: [details]. Sold."

## Step 3: Scan for New Opportunities

Only execute this step if:
- Circuit breaker is NOT active
- Total exposure is below the 3.0 SOL max
- At least 0.5 SOL is available for a new position (after reserve)

```
get-aggregate-balance           -- Check total SOL available
```

If conditions are met and you have been given token mints to monitor or a scanning strategy, evaluate new opportunities following the full pre-buy safety checklist from SOUL.md.

If no scanning strategy is configured, skip this step.

## Step 4: Update Portfolio Summary

After all checks and trades are complete:

```
list-wallets                    -- Get all wallet IDs
get-aggregate-balance           -- Total SOL
get-token-holdings              -- All remaining positions
```

Compile and log the portfolio summary:

```
=== HEARTBEAT REPORT [timestamp] ===

Portfolio:
  Total SOL: [amount]
  Open positions: [count]
  Total exposure: [amount] SOL
  Available to trade: [amount] SOL

Positions:
  [For each position: mint, symbol, entry price, current value, P&L%, time held]

Actions taken this cycle:
  [List of sells executed with reasons]
  [List of buys executed with reasons]
  [Or "No actions taken"]

Risk status:
  Consecutive losses: [count]
  Circuit breaker: [active/inactive]
  Session P&L: [amount] SOL

Next heartbeat in 30 minutes.
===
```

## Step 5: Report Alerts

If any of the following occurred during this heartbeat cycle, flag them prominently:

- **ALERT: Position sold at stop-loss** -- List affected positions
- **ALERT: Circuit breaker activated** -- State the trigger (consecutive losses / session limit / daily limit)
- **ALERT: Low balance** -- Total SOL below 1.0 SOL
- **ALERT: Emergency exit triggered** -- Potential rug or token removal detected
- **ALERT: All positions closed** -- Portfolio is fully in SOL

## Heartbeat Timing Notes

- The heartbeat fires every 30 minutes. Do not attempt to run it more frequently.
- If a heartbeat takes longer than expected (e.g., many positions to evaluate), complete all steps before the next one fires.
- If a tool call fails during the heartbeat, log the error and continue with the remaining steps. Do not abort the entire heartbeat cycle.
- Between heartbeats, you remain idle unless the user sends a direct instruction.
