# Drawdown Analysis and Management

> Max drawdown, recovery analysis, conditional drawdown at risk, stop-loss design, de-leveraging rules, and drawdown-based position sizing.

## When to Activate

- User analyzing drawdown characteristics of a strategy or portfolio
- Designing stop-loss or de-leveraging rules
- Evaluating whether a drawdown is within expected bounds or signals strategy failure
- Position sizing based on maximum acceptable drawdown
- Comparing strategies using drawdown-adjusted performance metrics
- Setting risk limits expressed as drawdown thresholds

## Core Concepts

### Drawdown Definitions

**Drawdown at time t**
- DD(t) = (Peak(t) - Value(t)) / Peak(t)
- Peak(t) = max(Value(s) for s <= t) — running high-water mark
- Always non-negative; zero when portfolio is at a new high

**Maximum Drawdown (MDD)**
- MDD = max(DD(t)) over the observation period
- The single worst peak-to-trough decline
- Most commonly cited drawdown statistic
- Depends heavily on observation period length — longer periods yield larger MDD

**Drawdown Duration**
- Time from peak to trough (decline phase)
- Time from trough to recovery of previous peak (recovery phase)
- Total underwater period = decline + recovery
- Some drawdowns never fully recover within the observation window

**Average Drawdown**
- Mean of all drawdown episodes exceeding a threshold
- More stable than MDD as a risk measure
- Conditional Drawdown at Risk (CDaR): expected drawdown conditional on exceeding a quantile — analogous to ES for drawdowns

### Distribution of Maximum Drawdown

For a random walk with drift mu and volatility sigma:
- Expected MDD scales with sqrt(T) and sigma
- For a GBM process, approximate: E[MDD] proportional to sigma * sqrt(T) for long periods
- Even strategies with positive expected return will experience significant drawdowns
- MDD is a single extreme statistic — high variance across realizations
- A strategy with 10% annual return and 15% vol has approximately 50% probability of a >20% drawdown over 10 years

### Drawdown-Adjusted Performance Metrics

**Calmar Ratio**: Annual return / Max drawdown — higher is better, but MDD is a single point
**Sterling Ratio**: Annual return / (Average of N largest drawdowns + 10%) — more robust than Calmar
**Burke Ratio**: Annual return / sqrt(sum of squared drawdowns) — penalizes multiple deep drawdowns
**Ulcer Index**: sqrt(mean of squared drawdowns) — continuous measure of drawdown pain
**Pain Index**: mean of all drawdowns — captures both depth and duration of underwater periods

## Methodology

### Stop-Loss Design

**Fixed Percentage Stop-Loss**
- Exit when position declines X% from entry (e.g., 2% per trade, 10% portfolio level)
- Simple and transparent
- Risk: whipsaw — stopped out just before recovery
- Size the stop relative to the strategy's expected volatility and holding period

**Trailing Stop-Loss**
- Stop moves up with price but never down
- Trail by fixed percentage (e.g., 10% from peak) or ATR multiple (e.g., 3x ATR)
- Lets winners run while limiting drawdown
- ATR-based stops adapt to current volatility regime

**Volatility-Adjusted Stop**
- Stop distance = k * current_volatility (e.g., k * 20-day realized vol)
- Wider stops in high-vol environments, tighter in low-vol
- Reduces whipsaw in volatile markets while maintaining discipline in calm markets

**Time-Based Stop**
- Exit if position has not reached profit target within N days
- Addresses opportunity cost of capital in stagnant positions
- Combine with price-based stop for multi-dimensional exit logic

### De-Leveraging Rules

Systematic rules for reducing exposure during drawdowns:

**Linear De-Leveraging**
- Reduce exposure proportionally to drawdown depth
- Target leverage = base_leverage * (1 - DD / max_allowed_DD)
- At max allowed drawdown, leverage = 0 (fully de-risked)
- Example: base leverage 1.5x, max DD 20% — at 10% DD, leverage = 1.5 * (1 - 0.5) = 0.75x

**Stepped De-Leveraging**
- Define discrete threshold levels:
  - DD < 5%: maintain full exposure
  - 5% < DD < 10%: reduce to 75% exposure
  - 10% < DD < 15%: reduce to 50% exposure
  - DD > 15%: reduce to 25% or exit entirely
- Less sensitive to noise than continuous de-leveraging
- Clear and easy to implement and communicate

**Volatility-Conditional De-Leveraging**
- Target constant volatility: leverage = target_vol / current_vol
- When realized vol spikes (usually correlated with drawdowns), leverage automatically decreases
- Vol targeting naturally reduces exposure in crisis and increases in calm
- Documented improvement: vol-managed portfolios have lower MDD and higher Sharpe

### Drawdown-Based Position Sizing

**Sizing from Maximum Acceptable Drawdown**
- Given max acceptable DD, strategy vol, and leverage:
- Position size = max_DD / (expected_MDD_per_unit_vol * strategy_vol)
- Example: max acceptable DD = 15%, strategy vol = 20%, expected MDD ratio = 2.5
  - Position size = 15% / (2.5 * 20%) = 30% of capital

**Kelly-Drawdown Tradeoff**
- Full Kelly criterion maximizes growth but has severe drawdowns (expected MDD approximately 50-60%)
- Fractional Kelly (typically 0.25-0.5 of full Kelly) dramatically reduces expected MDD
- f = 0.5 Kelly approximately halves expected MDD while reducing growth rate by only 25%
- Optimal fraction depends on the investor's drawdown tolerance

### Recovery Analysis

- Recovery time = f(drawdown depth, return rate, volatility)
- For a strategy with annual return r and drawdown D: approximate recovery time = -ln(1-D) / r
- A 50% drawdown requires 100% gain to recover — arithmetic of losses is brutal
- With 10% annual return, recovery from 30% DD takes approximately 3.6 years; from 50% DD, approximately 7 years
- Compounding during recovery helps but does not eliminate the asymmetry

## Examples

### Maximum Drawdown Analysis
```
Strategy equity curve peak: $1,000,000 (March 2020)
Strategy equity curve trough: $720,000 (March 23, 2020)
Recovery to new peak: $1,050,000 (August 2020)

Maximum drawdown: (1,000,000 - 720,000) / 1,000,000 = 28%
Decline duration: 15 trading days
Recovery duration: 105 trading days
Total underwater period: 120 trading days

Calmar ratio (annualized return 15%): 15% / 28% = 0.54
```

### Vol-Targeting De-Leverage
```
Strategy target vol: 10% annualized
Current realized vol (20-day): 25% annualized (crisis)

Leverage adjustment: 10% / 25% = 0.40
Original allocation: $5M -> Reduced to: $5M * 0.40 = $2M

When vol normalizes to 12%:
Leverage adjustment: 10% / 12% = 0.83
Allocation: $5M * 0.83 = $4.15M (gradually re-risking)

Result: portfolio volatility stays approximately constant at 10% target.
Historical backtest shows MDD reduced from 35% to 18% with vol targeting.
```

### Conditional Drawdown at Risk
```
Drawdown distribution from 10,000 Monte Carlo paths (252-day horizon):
  Median MDD: 8.5%
  75th percentile MDD: 12.3%
  95th percentile MDD: 19.8%
  99th percentile MDD: 27.1%
  CDaR(95%): average of worst 5% of MDD outcomes = 23.4%

Use CDaR(95%) = 23.4% as the risk budget.
If maximum acceptable loss is $2M on a $10M portfolio (20%):
  Position is slightly oversized — reduce to $10M * (20/23.4) = $8.55M.
```

### Stepped De-Leveraging in Practice
```
Portfolio: $50M, base leverage 2x, gross exposure $100M.

Drawdown trajectory and responses:
  Day 1-20:  DD = 3%    -> Full exposure ($100M gross)
  Day 21:    DD = 6%    -> Reduce to 75% ($75M gross), sell $25M
  Day 35:    DD = 11%   -> Reduce to 50% ($50M gross), sell $25M
  Day 42:    DD = 8%    -> Hold at 50% (do not re-lever until new high or DD < 5%)
  Day 60:    DD = 2%    -> Restore to 75% ($75M gross)
  Day 80:    DD = 0%    -> Restore to 100% ($100M gross)

Rules: only re-lever when drawdown decreases below the previous threshold.
Prevents whipsaw from rapid threshold crossing.
```

## Quality Gate

- Maximum drawdown must be computed on daily (not monthly) frequency to capture intra-month extremes
- Drawdown analysis must cover at least 3 full market cycles or 10+ years of data
- Stop-loss levels must be backtested for whipsaw frequency and net impact on returns
- De-leveraging rules must include re-leveraging logic to avoid permanent risk reduction
- Vol-targeting must use appropriate volatility estimator (realized vol, EWMA, or GARCH) — not just sample vol
- Drawdown metrics must be reported alongside return metrics in all strategy evaluations
- Monte Carlo simulation of drawdown distribution should complement historical analysis
- Recovery time analysis must accompany any drawdown report
- Position sizing must be consistent with stated maximum drawdown tolerance
- Drawdown triggers must be clearly documented and communicated to all stakeholders before they occur
