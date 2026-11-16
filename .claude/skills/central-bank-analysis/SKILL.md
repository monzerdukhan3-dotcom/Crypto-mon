# Central Bank Analysis

## When to Activate
- Parsing central bank communications (statements, minutes, press conferences, speeches)
- Analyzing dot plots, SEP projections, and forward guidance
- Evaluating quantitative easing/tightening and balance sheet operations
- Comparing policy stances across central banks (Fed, ECB, BOJ, BOE, PBOC)
- Trading around central bank meetings and policy decisions
- Understanding Taylor Rule and policy rule frameworks

## Core Concepts

### Federal Reserve (FOMC)

**Decision Framework:**
- Dual mandate: maximum employment + price stability (2% PCE inflation target)
- 8 scheduled meetings per year (roughly every 6 weeks)
- Tools: federal funds rate, balance sheet (QE/QT), forward guidance, emergency facilities
- Decision announced at 2:00 PM ET; press conference at 2:30 PM ET

**FOMC Communication Hierarchy:**
```
1. FOMC Statement — official policy decision, key language changes tracked word-by-word
2. Press Conference — Chair's Q&A reveals nuance beyond statement
3. Summary of Economic Projections (SEP) — quarterly, includes dot plot
4. FOMC Minutes — released 3 weeks after meeting, shows debate depth
5. Fed speeches — individual members signal views between meetings
6. Beige Book — anecdotal economic conditions from 12 districts
```

**Dot Plot Analysis:**
```
What it shows: Each FOMC participant's projection for year-end fed funds rate
Frequency: quarterly (March, June, September, December meetings)
Number of dots: 19 participants (12 voting, 7 non-voting)

Key metrics:
- Median dot: market-moving, represents "central tendency" of committee
- Distribution: tight cluster = consensus; wide spread = uncertainty
- Shift between meetings: direction of median shift signals policy trajectory
- Long-run dot: neutral rate estimate (~2.5-3.0% as of recent years)

Market reaction:
- Median dot above market pricing: hawkish surprise, yields rise
- Median dot below market pricing: dovish surprise, yields fall
- Dot plot has limited predictive accuracy (actual rates often deviate)
  but moves markets because it represents committee's stated intentions
```

**SEP (Summary of Economic Projections):**
```
Variables projected:
- Real GDP growth
- Unemployment rate
- PCE inflation and core PCE inflation
- Federal funds rate (dot plot)

Reading the SEP:
- Compare current projections to previous SEP
- GDP revised up + unemployment revised down + inflation revised up = hawkish
- Watch for internal consistency: can inflation fall to target with projected growth?
- "Forecast error bands" show historical uncertainty around projections
```

### European Central Bank (ECB)

**Framework:**
- Single mandate: price stability (2% HICP inflation, symmetric)
- 6-week meeting cycle, decisions on Thursdays
- Tools: main refinancing rate, deposit facility rate (key rate), APP, PEPP, TLTRO
- Governing Council: 6 Executive Board + 19 national CB governors (rotating voting)

**ECB-Specific Tools:**
```
TLTRO (Targeted Longer-Term Refinancing Operations):
- Long-term loans to banks at favorable rates
- Conditions tied to bank lending to real economy
- Unwinding TLTROs = tightening bank funding conditions

APP (Asset Purchase Programme) / PEPP (Pandemic Emergency Purchase Programme):
- Sovereign and corporate bond purchases
- Reinvestment policy: full reinvestment, partial, or runoff
- PEPP had flexible allocation across countries (helped periphery spreads)

TPI (Transmission Protection Instrument):
- Anti-fragmentation tool, can buy bonds of specific countries
- Conditionality: country must follow fiscal rules
- Backstop against peripheral spread blowout
- Untested — existence itself provides market reassurance
```

**Key ECB Dynamics:**
- Hawks vs doves: Northern vs Southern Europe divide
- Fragmentation risk: Italy/Spain spreads vs Germany (BTP-Bund spread)
- Fiscal rules: Stability and Growth Pact constrains fiscal policy
- Communication: Lagarde press conferences move markets less predictably than Fed

### Bank of Japan (BOJ)

**Framework:**
- 2% inflation target (struggled to achieve for decades)
- Yield Curve Control (YCC): target 10Y JGB yield near a specified level
- Massive balance sheet: BOJ owns >50% of JGB market
- Negative Interest Rate Policy (NIRP): -0.1% on excess reserves (ended March 2024)

**YCC Mechanics:**
```
Original YCC (2016-2022): 10Y JGB target at 0%, ±0.25% band
Widened band (Dec 2022): ±0.50%
Further flexibility (Jul 2023): 0.5% as "reference," 1.0% hard cap
Ended YCC (Mar 2024): abandoned yield cap, normalized policy

Market impact:
- YCC exit was the most anticipated macro event for years
- JPY weakened massively during YCC (rate differential with US widened)
- YCC exit + rate hikes -> JPY appreciation (carry unwind)
- BOJ intervention: direct FX intervention when JPY weakness is "disorderly"
```

**BOJ Intervention:**
```
FX intervention history:
- 2022: $60B+ in JPY buying intervention (Sep-Oct 2022, USD/JPY near 150)
- 2024: ~$62B intervention as USD/JPY hit 160
- Pattern: BOJ intervenes near round numbers (150, 155, 160)
- Effectiveness: buys time but cannot reverse fundamental FX trends
- "Rate check" calls to banks signal imminent intervention

Warning signs:
- Ministry of Finance verbal warnings escalate: "watching closely" -> "ready to act" -> "decisive action"
- BOJ checking rates with dealers
- Sudden $2-5 move in JPY within minutes during Asian session
```

### Taylor Rule

**Standard Taylor Rule:**
```
i = r* + pi + 0.5*(pi - pi*) + 0.5*(y - y*)

Where:
i = recommended federal funds rate
r* = neutral real rate (~0.5-1.0%)
pi = current inflation rate
pi* = target inflation rate (2%)
y - y* = output gap (actual GDP - potential GDP)

Example:
r* = 0.5%, pi = 3.5%, pi* = 2.0%, output gap = +1.0%
i = 0.5 + 3.5 + 0.5*(3.5-2.0) + 0.5*(1.0) = 5.25%

If actual fed funds = 5.25%: policy is "Taylor Rule neutral"
If actual < Taylor Rule: policy is accommodative
If actual > Taylor Rule: policy is restrictive
```

**Modified Taylor Rules:**
- Inertia variant: adds smoothing parameter (central banks move gradually)
- Balanced approach: higher weight on output gap (more responsive to employment)
- First-difference rule: adjusts rate based on changes, not levels
- Different rules give different prescriptions — a range is more useful than a point estimate

### Quantitative Easing / Tightening

**QE (Quantitative Easing):**
```
Mechanism:
1. Central bank creates reserves (digital money)
2. Purchases government bonds (and sometimes corporate bonds)
3. Reduces bond supply -> lowers yields -> eases financial conditions
4. Portfolio rebalancing: investors pushed into riskier assets

Channels of transmission:
- Duration extraction: removes long-duration assets from market
- Signaling: commitment to easy policy
- Portfolio balance: investors rebalance into equities, credit, EM
- Wealth effect: higher asset prices -> more spending

Estimated impact: $1T QE ≈ 25-50 bps lower 10Y yield (estimates vary widely)
```

**QT (Quantitative Tightening):**
```
Mechanism:
1. Central bank allows bonds to mature without reinvestment
2. Reduces reserves in banking system
3. Increases bond supply -> raises yields -> tightens financial conditions

Fed QT (2022-present):
- Cap: $60B/month Treasuries + $35B/month MBS
- Actual pace: slower due to MBS prepayment dynamics
- Total balance sheet reduction: ~$2T from peak

Market impact:
- QT is "like watching paint dry" in normal conditions (Yellen)
- But can amplify volatility during stress (September 2019 repo crisis, March 2023 SVB)
- Reserve scarcity: when reserves fall below comfortable level, funding markets seize
```

## Methodology

### Pre-Meeting Analysis
1. **Compile market expectations** — fed funds futures, OIS curves, options pricing
2. **Review recent data** — has inflation/employment surprised since last meeting?
3. **Analyze member speeches** — have members signaled direction during blackout-adjacent period?
4. **Map positioning** — are markets already priced for the expected outcome?
5. **Define scenarios** — rate decision + statement language + guidance changes
6. **Prepare trades** — what to do in each scenario

### Statement Parsing
```
Key phrases and their interpretation:
- "Data dependent": no preset path, each meeting is live
- "Further tightening may be appropriate": hawkish, more hikes expected
- "Prepared to adjust stance": pivot signal, cuts on the table
- "Patient": not rushing to change policy
- "Expeditiously": urgency to move rates
- "Some/several/many/most participants": graduated language for committee consensus level

Track word changes between statements:
- Additions/removals of qualifiers signal direction shifts
- Example: adding "slowing" before "inflation" = dovish shift
- Example: removing "transitory" = hawkish acknowledgment
```

### Cross-Central-Bank Divergence Analysis
```
Matrix:
         Hiking  | Holding | Cutting
Fed      [ ]     | [x]     | [ ]
ECB      [ ]     | [ ]     | [x]
BOJ      [x]     | [ ]     | [ ]
BOE      [ ]     | [x]     | [ ]

Divergence creates FX opportunities:
- Fed hold + ECB cut: EUR/USD downside
- Fed hold + BOJ hike: USD/JPY downside (carry unwind)
- Wide divergence = strong trend; convergence = range-bound
```

## Examples

### Example 1: Dot Plot Shift Trade
```
Pre-meeting:
- Market pricing: 2 rate cuts for remainder of year
- Current median dot (from prior SEP): 3 cuts
- Recent CPI: 2 consecutive 0.4% core MoM prints

Outcome: Median dot revised to 1 cut (hawkish shift)
- Statement: "progress on inflation has stalled"
- Press conference: Powell says "need greater confidence" inflation is trending to 2%

Market reaction:
- 2Y yield: +18 bps
- S&P 500: -1.2%
- USD: +0.8% DXY
- Rate cut pricing: reduced to 1.5 cuts from 2.0

Trade: Pre-positioned short 2Y Treasury futures
Entry: before meeting (anticipated hawkish shift based on hot CPI)
Profit: 18 bps * $200 DV01 per contract = $3,600 per contract
Risk management: stop if dot plot showed 3+ cuts (would have been dovish surprise)
```

### Example 2: ECB Fragmentation Trade
```
Situation:
- ECB hiking aggressively to fight inflation
- Italy 10Y (BTP) - Germany 10Y (Bund) spread: 250 bps (widening)
- Italian political uncertainty (election, fiscal concerns)
- TPI announced but not activated

Trade: BTP-Bund spread compression
Thesis: ECB will activate TPI if spread exceeds 300 bps (implicit backstop)
Entry: buy 10Y BTP, sell 10Y Bund (duration-matched)
Entry spread: 250 bps
Target: 180 bps (compression as market prices in TPI backstop)
Stop: 320 bps (TPI activation threshold might be higher than expected)

Profit if spread compresses 70 bps:
70 bps * EUR 8.5 DV01 (10Y duration) per EUR 100K notional = EUR 5,950

Risk: Italian fiscal crisis escalates beyond ECB willingness to intervene
```

### Example 3: BOJ Policy Normalization
```
Setup (2024):
- BOJ ending NIRP and YCC
- USD/JPY at 155 (near intervention zone)
- Rate differential: US 5.25% vs Japan 0.1%
- Carry trade: massive speculative short JPY positions

Trade: Long JPY (short USD/JPY)
Thesis:
- BOJ normalization will gradually raise Japanese rates
- Rate differential will narrow (Fed expected to cut, BOJ to hike)
- Carry trade unwind will amplify JPY strength
- Intervention risk provides downside put on USD/JPY

Entry: short USD/JPY at 155
Target: 140 (carry unwind + rate convergence over 6 months)
Stop: 162 (new high, intervention failed thesis)
Negative carry: ~5% annualized (paying rate differential)

Risk management:
- Negative carry means time is the enemy — need directional move
- Size position conservatively (carry cost is material)
- Option alternative: buy 6-month USD/JPY put at 150 strike, defined risk
```

## Quality Gate

Before trading central bank events, verify:

- [ ] Market pricing is understood — what is already priced in via rates futures and OIS curves?
- [ ] Statement language changes are tracked systematically — use comparison tools
- [ ] Dot plot is interpreted correctly — median, not mean; voting vs non-voting members
- [ ] Balance sheet operations are factored in — QE/QT pace and composition affect curve segments differently
- [ ] Cross-central-bank divergence is mapped — FX is driven by relative policy, not absolute levels
- [ ] Positioning is assessed — crowded positioning amplifies surprise reactions
- [ ] Scenario analysis completed before the meeting — not during the press conference
- [ ] Risk/reward defined with stops — central bank surprises can cause >1% moves in minutes
- [ ] Post-meeting reaction window understood — initial move can reverse; full reaction takes hours/days
- [ ] Calendar for upcoming data releases reviewed — next data print may confirm or refute policy signal
