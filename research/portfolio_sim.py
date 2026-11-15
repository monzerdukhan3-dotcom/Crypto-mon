"""Portfolio view of backtest trades: at most N open positions, fixed % risk each.

Trades are taken in entry order; a trade is skipped while N positions are open.
Each trade risks RISK_PCT of current equity (compounding). Prints monthly returns.
Usage: python3 research/portfolio_sim.py trades.json VARIANT N RISK_PCT
"""
import collections, datetime, json, sys

trades, var, n_max, risk = json.load(open(sys.argv[1])), sys.argv[2], int(sys.argv[3]), float(sys.argv[4]) / 100
trades.sort(key=lambda r: r["t"])
equity, open_pos, monthly, taken = 1.0, [], collections.OrderedDict(), 0
events = []
for r in trades:
    open_pos = [(x, e) for (x, e) in open_pos if x > r["t"]]
    if len(open_pos) >= n_max:
        continue
    open_pos.append((r[var + "_exit"], r))
    events.append((r[var + "_exit"], r[var]))
    taken += 1
# book P&L at exit time, sized on equity at that time (approximation)
eq, peak, mdd = 1.0, 1.0, 0.0
for t, rr in sorted(events):
    eq *= 1 + risk * rr
    peak, mdd = max(peak, eq), max(mdd, 1 - eq / peak)
    m = datetime.datetime.fromtimestamp(t / 1000, datetime.UTC).strftime("%Y-%m")
    monthly.setdefault(m, [eq, eq])[1] = eq
prev, rets = 1.0, []
for m, (_, end) in monthly.items():
    rets.append((m, end / prev - 1))
    prev = end
vals = sorted(x for _, x in rets)
print(f"{var} max{n_max} risk{risk*100:.1f}% trades {taken} final x{eq:.2f} maxDD {mdd*100:.1f}%")
print(" months", len(rets), "positive", sum(1 for _, x in rets if x > 0),
      "median %.1f%%" % (100 * vals[len(vals) // 2]), "mean %.1f%%" % (100 * sum(vals) / len(vals)),
      "worst %.1f%%" % (100 * vals[0]), "best %.1f%%" % (100 * vals[-1]))
by_year = collections.defaultdict(lambda: 1.0)
for m, x in rets:
    by_year[m[:4]] *= 1 + x
print(" by year", {y: "%.0f%%" % (100 * (v - 1)) for y, v in by_year.items()})
