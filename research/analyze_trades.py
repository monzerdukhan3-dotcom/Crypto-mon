"""Robustness breakdown of backtest_zones.py output (trades.json)."""
import datetime, json, sys
from collections import defaultdict

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from backtest_zones import VARIANTS, stats

trades = json.load(open(sys.argv[1]))
year = lambda r: datetime.datetime.fromtimestamp(r["t"] / 1000, datetime.UTC).year


def table(title, key):
    print(f"\n## {title}")
    groups = defaultdict(list)
    for r in trades:
        groups[key(r)].append(r)
    for g in sorted(groups, key=str):
        rows = groups[g]
        print(g, {v: (stats([r[v] for r in rows])["exp"], stats([r[v] for r in rows])["win"]) for v in VARIANTS}, "n=", len(rows))


print("## All (n, win%, expectancy R, total R, PF, max DD R)")
for v in VARIANTS:
    print(v, stats([r[v] for r in trades]))
table("By year: (expectancy R, win%)", year)
table("By BTC regime at entry", lambda r: r["regime"])
table("By zone timeframe", lambda r: r["tf"])
table("By coin", lambda r: r["sym"])
# concentration: drop the best 10% of trades per variant
print("\n## Without best 10% of trades")
for v in VARIANTS:
    rs = sorted(r[v] for r in trades)
    cut = rs[: int(len(rs) * 0.9)]
    print(v, stats(cut))
