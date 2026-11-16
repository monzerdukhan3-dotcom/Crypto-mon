"""Base rates for BTC direction: what happened after each market state, 2018-2026.

For each day, classify the state known at that day's 00:00 UTC (previous daily close +
the Fear & Greed value published for that day), then measure BTC's forward 7- and 30-day
return. Forward windows overlap, so day counts overstate the evidence; "episodes" counts
separate occurrences (gaps of more than 14 days).

Usage: python3 research/base_rates.py DATA_DIR   (needs BTC_1Dutc.json and fng.json)
Data: fetch_okx.py for candles; https://api.alternative.me/fng/?limit=0 for Fear & Greed.
"""
import datetime, json, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from backtest_zones import ema

DAY = 86_400_000
SPLIT = datetime.datetime(2023, 1, 1, tzinfo=datetime.UTC).timestamp() * 1000


def rsi(closes, n=14):
    out, ag, al = [None] * len(closes), 0.0, 0.0
    for i in range(1, len(closes)):
        ch = closes[i] - closes[i - 1]
        g, l = max(ch, 0), max(-ch, 0)
        if i <= n:
            ag, al = ag + g / n, al + l / n
        else:
            ag, al = (ag * (n - 1) + g) / n, (al * (n - 1) + l) / n
        if i >= n:
            out[i] = 100 - 100 / (1 + ag / al) if al else 100.0
    return out


def load(datadir):
    d1 = json.load(open(os.path.join(datadir, "BTC_1Dutc.json")))
    fng = {int(x["timestamp"]) * 1000: int(x["value"]) for x in json.load(open(os.path.join(datadir, "fng.json")))["data"]}
    c = [r["c"] for r in d1]
    e50 = ema(c, 50)
    s200 = [sum(c[i - 199:i + 1]) / 200 if i >= 199 else None for i in range(len(c))]
    r14 = rsi(c)
    rows = []
    for i in range(200, len(d1)):
        t_known = d1[i]["t"] + DAY  # this close is known at the next day's 00:00 UTC
        rows.append(dict(
            t=t_known, fng=fng.get(t_known), close=c[i], rsi=r14[i],
            above200=c[i] > s200[i], above50=c[i] > e50[i],
            ret7=c[i] / c[i - 7] - 1, dd30=c[i] / max(c[i - 30:i + 1]) - 1,
            f7=c[i + 7] / c[i] - 1 if i + 7 < len(c) else None,
            f30=c[i + 30] / c[i] - 1 if i + 30 < len(c) else None,
            f30min=min(c[i + 1:i + 31]) / c[i] - 1 if i + 30 < len(c) else None))
    return rows


def summarize(rows, key):
    v = sorted(r[key] for r in rows if r[key] is not None)
    if not v:
        return None
    return dict(n=len(v), pos=round(100 * sum(1 for x in v if x > 0) / len(v)), med=round(100 * v[len(v) // 2], 1),
                mean=round(100 * sum(v) / len(v), 1), p10=round(100 * v[int(len(v) * 0.1)], 1), p90=round(100 * v[int(len(v) * 0.9)], 1))


def episodes(rows):
    n, last = 0, None
    for r in rows:
        if last is None or r["t"] - last > 14 * DAY:
            n += 1
        last = r["t"]
    return n


STATES = [
    ("all days", lambda r: True),
    ("F&G <= 15 (extreme fear)", lambda r: r["fng"] is not None and r["fng"] <= 15),
    ("F&G 16-25", lambda r: r["fng"] is not None and 16 <= r["fng"] <= 25),
    ("F&G 26-45", lambda r: r["fng"] is not None and 26 <= r["fng"] <= 45),
    ("F&G 46-74", lambda r: r["fng"] is not None and 46 <= r["fng"] <= 74),
    ("F&G >= 75 (extreme greed)", lambda r: r["fng"] is not None and r["fng"] >= 75),
    ("RSI14 daily < 30", lambda r: r["rsi"] is not None and r["rsi"] < 30),
    ("RSI14 daily > 70", lambda r: r["rsi"] is not None and r["rsi"] > 70),
    ("above SMA200", lambda r: r["above200"]),
    ("below SMA200", lambda r: not r["above200"]),
    ("above EMA50", lambda r: r["above50"]),
    ("below EMA50", lambda r: not r["above50"]),
    ("7d drop > 10%", lambda r: r["ret7"] < -0.10),
    ("30d drawdown > 20%", lambda r: r["dd30"] < -0.20),
    ("F&G<=15 & below SMA200", lambda r: r["fng"] is not None and r["fng"] <= 15 and not r["above200"]),
    ("F&G<=15 & above SMA200", lambda r: r["fng"] is not None and r["fng"] <= 15 and r["above200"]),
    ("F&G<=20 & RSI<30 & below SMA200", lambda r: r["fng"] is not None and r["fng"] <= 20 and r["rsi"] < 30 and not r["above200"]),
    ("F&G>=75 & RSI>70", lambda r: r["fng"] is not None and r["fng"] >= 75 and r["rsi"] > 70),
]

if __name__ == "__main__":
    rows = load(sys.argv[1])
    halves = (("2018-2022", [r for r in rows if r["t"] < SPLIT]), ("2023-2026", [r for r in rows if r["t"] >= SPLIT]))
    for name, f in STATES:
        print(f"\n{name}")
        for label, part in halves:
            sel = [r for r in part if f(r)]
            s7, s30, dip = summarize(sel, "f7"), summarize(sel, "f30"), summarize(sel, "f30min")
            if not s30:
                print(f"  {label}: no cases")
                continue
            print(f"  {label}: days={s30['n']} episodes={episodes(sel)} | 7d: up {s7['pos']}% median {s7['med']}% | "
                  f"30d: up {s30['pos']}% median {s30['med']}% (p10 {s30['p10']}%, p90 {s30['p90']}%) | "
                  f"worst dip within 30d: median {dip['med']}%, p10 {dip['p10']}%")
    last = rows[-1]
    print("\ncurrent state:", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in last.items() if k not in ("f7", "f30", "f30min")})
