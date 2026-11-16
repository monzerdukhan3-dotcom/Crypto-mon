"""Does the 5-day spot-ETF flow sum say anything about BTC's next 7 and 30 days?

Flows for trading day D are published the next morning (T+1), so the forward return starts
from the OKX daily close of D+1. Split into two halves to see what holds in both.
Usage: python3 research/etf_score_test.py ETF_HISTORY.json BTC_1Dutc.json
(ETF history: crypto-analyst/scripts/etf_flows.py --save; candles: fetch_okx.py)
"""
import datetime, json, sys

DAY = 86_400_000
etf, d1 = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
close = {r["t"]: r["c"] for r in d1}
ms = lambda s: int(datetime.datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=datetime.UTC).timestamp() * 1000)
rows = []
for i in range(4, len(etf)):
    t0 = ms(etf[i]["date"]) + DAY  # candle of D+1; its close is known at 00:00 UTC of D+2
    if t0 not in close:
        continue
    f = lambda n: close[t0 + n * DAY] / close[t0] - 1 if t0 + n * DAY in close else None
    rows.append(dict(t=t0, sum5=sum(r["total"] for r in etf[i - 4:i + 1]), day=etf[i]["total"], f7=f(7), f30=f(30)))
mid = rows[len(rows) // 2]["t"]
halves = (("first half", [r for r in rows if r["t"] < mid]), ("second half", [r for r in rows if r["t"] >= mid]))
print("split at", datetime.datetime.fromtimestamp(mid / 1000, datetime.UTC).date(), "| days", len(rows))


def line(sel, key):
    v = sorted(r[key] for r in sel if r[key] is not None)
    return f"n={len(v):3} up {100 * sum(1 for x in v if x > 0) / len(v):3.0f}% median {100 * v[len(v) // 2]:+5.1f}%" if v else "no cases"


BUCKETS = [("all days", lambda r: True),
           ("5d sum > +100M  (score +1)", lambda r: r["sum5"] > 100),
           ("5d sum -300..+100M (score 0)", lambda r: -300 <= r["sum5"] <= 100),
           ("5d sum < -300M  (score -1)", lambda r: r["sum5"] < -300),
           ("5d sum > +1000M", lambda r: r["sum5"] > 1000),
           ("5d sum < -1000M", lambda r: r["sum5"] < -1000),
           ("single day < -400M", lambda r: r["day"] < -400),
           ("single day > +400M", lambda r: r["day"] > 400)]
for name, f in BUCKETS:
    print(f"\n{name}")
    for label, part in halves:
        sel = [r for r in part if f(r)]
        print(f"  {label}: 7d {line(sel, 'f7')} | 30d {line(sel, 'f30')}")
