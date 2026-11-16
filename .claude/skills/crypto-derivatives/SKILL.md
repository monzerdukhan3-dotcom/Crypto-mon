# Crypto Derivatives

## When to Activate
- Analyzing perpetual swap mechanics, funding rates, and basis trading opportunities
- Evaluating crypto futures across venues (CME, Deribit, Binance)
- Designing funding rate arbitrage or basis trading strategies
- Assessing crypto options strategies and volatility trading
- Understanding liquidation cascades and their market impact

## Core Concepts

### Perpetual Swaps

**Mechanics:**
- No expiry date — positions can be held indefinitely
- Price tracks spot via funding rate mechanism
- Funding rate: periodic payment between longs and shorts
- Positive funding: longs pay shorts (perp > spot, bullish bias)
- Negative funding: shorts pay longs (perp < spot, bearish bias)
- Funding interval: typically every 8 hours (Binance, Bybit) or every 1 hour (some protocols)

**Funding Rate Calculation:**
```
Funding rate = clamp(Interest Rate + Premium, -0.75%, +0.75%)

Where:
- Interest rate = (Quote interest - Base interest) / Funding interval
  Usually 0.01% per 8 hours for USDT-margined perps

- Premium = (Mark Price - Index Price) / Index Price
  Mark price = mid of impact bid/ask
  Index price = weighted average of spot prices across exchanges

Annualized funding = funding_rate * 3 * 365  (for 8h intervals)
Example: 0.01% per 8h = 0.03% daily = 10.95% annualized
```

**Mark Price and Liquidation:**
- Mark price is used for liquidation (not last traded price) to prevent manipulation
- Initial margin: typically 1-5% (20-100x max leverage)
- Maintenance margin: typically 0.5-2%
- Liquidation triggers when: position_value * (1 - 1/leverage) loss reached
- Insurance fund absorbs remaining loss if liquidation price breached during gap

### Crypto Futures

**CME Bitcoin Futures:**
- Regulated venue, institutional participation
- Cash-settled, monthly expiry
- Contract size: 5 BTC (standard), 0.1 BTC (micro)
- Margin: ~40% initial margin requirement
- Basis: typically 5-15% annualized premium (reflects cost of carry + demand premium)
- Gap risk: CME closes weekends, creating Monday gaps

**Deribit Futures:**
- Crypto-native venue, dominant for options
- BTC and ETH quarterly futures
- Inverse contracts (BTC-margined) and linear (USDC-margined)
- Basis tends to be higher than CME (less regulated, more leverage)

**Basis and Term Structure:**
```
Basis = Futures price - Spot price
Annualized basis = (Basis / Spot) * (365 / Days to expiry)

Term structure shapes:
- Contango (normal): futures > spot; cost of carry + demand premium
- Backwardation (unusual in crypto): futures < spot; extreme bearish sentiment
- Steep contango: strong bullish sentiment, leveraged demand
- Inverted: near-term futures below spot; immediate selling pressure

Historical context:
- Bull markets: 15-40% annualized basis
- Bear markets: 0-5% annualized basis, occasionally negative
- Extreme euphoria (late 2021): 40%+ annualized basis
```

### Funding Rate Arbitrage

**Cash-and-Carry (Basis Trade):**
```
Strategy: Long spot + Short perpetual
Profit source: Collect positive funding payments

Setup:
1. Buy 1 BTC spot at $50,000
2. Short 1 BTC perpetual at $50,000
3. Net delta: zero (market neutral)
4. Income: funding rate (long pays short when positive)

Expected return:
- Average funding: 0.01% per 8 hours = 10.95% APY
- During bull markets: 0.05-0.10% per 8h = 54-110% APY
- During bear markets: may go negative (strategy loses money)

Risks:
- Negative funding periods (must weather these)
- Liquidation of short perp during sharp rally (need sufficient margin)
- Exchange counterparty risk
- Basis widening (unrealized loss on mark-to-market)
```

**Cross-Exchange Funding Arbitrage:**
```
When: Funding rates diverge significantly across exchanges

Example:
- Binance BTC funding: +0.05% per 8h (longs pay shorts)
- Bybit BTC funding: +0.01% per 8h

Trade:
- Long BTC perp on Bybit (pay 0.01%)
- Short BTC perp on Binance (receive 0.05%)
- Net funding income: 0.04% per 8h = 43.8% APY

Risks:
- Funding rates converge (temporary opportunity)
- Margin calls on one leg during volatile moves
- Capital fragmented across exchanges
- Exchange-specific risk (withdrawal freeze, insolvency)
```

### Crypto Options

**Market Structure:**
- Deribit: ~90% of crypto options volume
- CME: growing institutional participation
- DeFi options: Lyra, Hegic, Dopex (smaller scale, different mechanics)
- BTC and ETH dominate; altcoin options are illiquid

**Key Differences from TradFi Options:**
- Higher implied volatility: BTC IV typically 50-100%, ETH 60-120%
- Volatility smile is more pronounced (fat tails are real and frequent)
- Put skew is less dominant than equities — crypto crashes AND pumps violently
- 24/7 trading with no overnight gap risk (but also no theta advantage from weekends)
- Limited market makers — wider spreads, less efficient pricing

**Crypto Volatility Trading:**
```
IV percentile framework:
- IV below 20th percentile: buy straddles/strangles (vol is cheap)
- IV above 80th percentile: sell straddles/strangles (vol is expensive)
- BTC 30-day IV historical range: 30% (extreme lows) to 150% (extreme highs)

Term structure:
- Normal: longer-dated options have higher IV (typical in calm markets)
- Inverted: short-dated IV > long-dated IV (during acute stress or event risk)
- Event-driven: IV spike around halving, ETF decisions, macro events

Skew analysis:
- Call skew > put skew: bullish sentiment (demand for upside exposure)
- Put skew > call skew: hedging demand (typical in equities, less consistent in crypto)
- Monitor 25-delta risk reversal: calls - puts, positive = call skew dominance
```

### Liquidation Cascades

**Cascade Mechanics:**
```
1. Price moves against leveraged positions
2. Positions hit liquidation price
3. Exchange force-closes positions at market
4. Forced selling pushes price further
5. More positions hit liquidation
6. Feedback loop accelerates price movement

Liquidation data sources:
- Coinglass: real-time liquidation data across exchanges
- Exchange APIs: open interest changes signal liquidation events
- On-chain: DeFi liquidations are publicly visible

Key metrics:
- Open interest / market cap ratio: >5% signals crowded positioning
- Estimated liquidation levels: cluster analysis of likely stop/liquidation prices
- Funding rate extremes: >0.1% per 8h = over-leveraged longs
```

**Trading Around Liquidation Events:**
```
Signal: Large liquidation cluster identified at $45,000 (BTC)
Open interest: $20B, estimated $3B in long liquidations between $45K-$43K

If price approaches $45K:
- Expect acceleration through liquidation zone
- Cascading liquidations may push price to $43K briefly
- Buy orders placed at $42,500-$43,000 (below liquidation cascade)
- Stop below $41,000 (next major liquidation cluster)
- Target: $46,000-$48,000 (recovery after cascade exhaustion)

Risk: cascade can extend further than expected if market structure is fragile
```

## Methodology

### Basis Trade Execution
1. **Monitor funding rates** across exchanges (Coinglass, exchange APIs)
2. **Calculate expected return** — average funding over 30-day lookback, annualize
3. **Assess margin requirements** — need 2-3x maintenance margin buffer for volatile moves
4. **Execute delta-neutral** — match spot purchase with perp short simultaneously
5. **Monitor continuously** — rebalance if delta drifts; add margin if needed during rallies
6. **Exit criteria** — funding turns negative for 3+ consecutive periods, or better opportunity elsewhere

### Options Strategy Selection
```
Directional + vol view -> strategy:
- Bullish + long vol: buy calls, bull call spread
- Bullish + short vol: sell puts, short put spread
- Bearish + long vol: buy puts, bear put spread
- Bearish + short vol: sell calls, short call spread
- Neutral + long vol: straddle, strangle
- Neutral + short vol: iron condor, iron butterfly

Sizing: options positions sized at 1-3% of portfolio per trade
Expiry: 30-60 DTE for most strategies (balances theta and gamma)
```

## Examples

### Example 1: Funding Rate Arbitrage
```
Current state:
- BTC spot: $50,000
- BTC perp funding (Binance): 0.04% per 8h (bullish market)
- Annualized: 43.8%

Execution:
- Deposit $55,000 to exchange (10% buffer for margin)
- Buy 1 BTC spot: $50,000
- Short 1 BTC perp: 2x leverage (margin: $25,000)
- Total capital deployed: $75,000

Daily income: $50,000 * 0.04% * 3 = $60/day
Monthly income: ~$1,800
Return on capital: 1,800 / 75,000 = 2.4% monthly = 28.8% APY

Risk management:
- If BTC rallies 30%: short perp unrealized loss = $15,000
  Offset by spot gain of $15,000. Need margin for perp.
  $25,000 margin - $15,000 loss = $10,000 remaining (above maintenance)
- Add margin alert at $58,000 BTC price
```

### Example 2: Liquidation Cascade Trade
```
Setup:
- BTC at $48,000 after steady rally
- Open interest at all-time high: $25B
- Funding rate: 0.08% per 8h (extremely high)
- Estimated long liquidation cluster: $44,000-$46,000 (~$4B)

Strategy: Short-term reversal trade
- No position above $46,000 (wait for cascade)
- Limit buy orders laddered: $45K (25%), $44K (25%), $43K (25%), $42K (25%)
- Stop loss: $40,000 (below next cluster)
- Take profit: scale out $47K-$50K

Execution:
- Price drops to $46K, liquidations begin cascading
- Fills at average $43,800
- Bounce to $48,000 within 12 hours as leverage is flushed
- Exit at $47,500 average
- Return: 8.4% in 12 hours
```

### Example 3: BTC Options Straddle
```
Event: Bitcoin halving in 2 weeks
BTC spot: $60,000
30-day ATM IV: 85% (elevated due to event)

Sell straddle (vol too expensive):
- Sell $60K call (14 DTE): premium $3,500
- Sell $60K put (14 DTE): premium $3,200
- Total premium collected: $6,700
- Breakeven range: $53,300 - $66,700 (±11.2%)

Post-event: IV likely to crush from 85% to 60%
If BTC stays within range: capture full premium
If BTC moves ±10%: partial loss, offset by IV crush

Alternative (less risk): sell strangle at 10-delta
- Sell $70K call + $52K put
- Lower premium ($2,500) but wider profit range
```

## Quality Gate

Before trading crypto derivatives, verify:

- [ ] Exchange counterparty risk assessed — use regulated venues for large positions, diversify across exchanges
- [ ] Margin requirements calculated with buffer — 2-3x maintenance margin minimum for volatile markets
- [ ] Funding rate analysis uses sufficient lookback period (30+ days) — do not extrapolate from short window
- [ ] Basis trade delta is monitored and rebalanced — drift beyond 5% requires adjustment
- [ ] Liquidation levels are mapped — know where cascades will occur above and below current price
- [ ] Options positions are sized conservatively — max 1-3% of portfolio per trade, defined max loss
- [ ] IV analysis uses historical context — is current IV high or low relative to realized vol?
- [ ] Correlation between spot and derivatives positions is verified — inverse contracts have convexity risk
- [ ] Withdrawal capability confirmed — can you exit the exchange quickly if needed?
- [ ] Tax implications considered — derivatives have different tax treatment in most jurisdictions
