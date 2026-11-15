"""Compare alternative spot strategies against the demand-zone backtest.

A) Trend breakout (Donchian): buy at the next day's open after a daily close above the
   prior N-day high. Initial stop entry - 2x ATR20 (daily). Exit on a daily close below the
   prior M-day low, or when the stop trades. R measured on the initial stop.
B) Relative-strength rotation: every Monday, hold the top K coins by 60-day return among
   those above their 50-day SMA, equal weight, cash otherwise. Reported as % returns.
C) Hybrid: the demand-zone trades from backtest_zones.py, kept only when the coin's own
   daily close was above its EMA50 at entry (pullback inside an uptrend).
Costs 0.15% per side everywhere. Signals use only closed candles.
"""
import datetime, json, math, os, sys

sys.path.insert(0, os.path.dirname(__file__))
from backtest_zones import COST, atr, ema, load, stats

DAY = 86_400_000


def breakout(d1, n_entry, n_exit, start_ms):
    a = atr(d1, 20)
    trades, i = [], max(n_entry, 60)
    while i < len(d1) - 1:
        prev_high = max(r["h"] for r in d1[i - n_entry:i])
        if d1[i]["c"] > prev_high and d1[i + 1]["t"] >= start_ms:
            j = i + 1
            entry = d1[j]["o"]
            stop = entry - 2 * a[i]
            risk = entry - stop + entry * COST + stop * COST
            exit_px = None
            k = j
            while k < len(d1):
                b = d1[k]
                if b["l"] <= stop:
                    exit_px = min(stop, b["o"])  # gap below the stop fills at the open
                    break
                if k > j and b["c"] < min(r["l"] for r in d1[k - n_exit:k]):
                    exit_px = b["c"]
                    break
                k += 1
            if exit_px is None:
                exit_px, k = d1[-1]["c"], len(d1) - 1
            r = (exit_px * (1 - COST) - entry * (1 + COST)) / risk
            trades.append(dict(t=d1[j]["t"], r=r, days=(d1[k]["t"] - d1[j]["t"]) / DAY))
            i = k + 1
        else:
            i += 1
    return trades


def rotation(datadir, syms, start_ms, top_k=3, lookback=60):
    data = {}
    for s in syms:
        try:
            data[s] = {r["t"]: r["c"] for r in load(datadir, s, "1Dutc")}
        except FileNotFoundError:
            pass
    days = sorted(data["BTC"])
    days = [t for t in days if t >= start_ms]
    held, weekly, equity, curve = [], [], 1.0, []
    for idx, t in enumerate(days):
        dow = datetime.datetime.fromtimestamp(t / 1000, datetime.UTC).weekday()
        if idx > 0:
            prev = days[idx - 1]
            r = sum((data[s].get(t, data[s].get(prev)) / data[s][prev] - 1) for s in held if prev in data[s]) / top_k if held else 0
            equity *= 1 + r
        if dow == 0:  # rebalance at Monday's close using data up to that close
            scores = []
            for s, px in data.items():
                past = t - lookback * DAY
                hist = [px[x] for x in range(t - 49 * DAY, t + 1, DAY) if x in px]
                if t in px and past in px and len(hist) == 50 and px[t] > sum(hist) / 50:
                    scores.append((px[t] / px[past] - 1, s))
            new = [s for _, s in sorted(scores, reverse=True)[:top_k]]
            turnover = len(set(new) ^ set(held)) / (2 * top_k) if (new or held) else 0
            equity *= 1 - 2 * COST * turnover
            held = new
        curve.append((t, equity))
    return curve


def curve_stats(curve):
    peak, mdd = curve[0][1], 0
    for _, e in curve:
        peak = max(peak, e)
        mdd = max(mdd, 1 - e / peak)
    years = (curve[-1][0] - curve[0][0]) / (365 * DAY)
    cagr = curve[-1][1] ** (1 / years) - 1
    by_year = {}
    for t, e in curve:
        y = datetime.datetime.fromtimestamp(t / 1000, datetime.UTC).year
        by_year.setdefault(y, [e, e])[1] = e
    return dict(total=round(100 * (curve[-1][1] - 1), 1), cagr=round(100 * cagr, 1), max_dd=round(100 * mdd, 1),
                by_year={y: round(100 * (b / a - 1), 1) for y, (a, b) in by_year.items()})


def year(t):
    return datetime.datetime.fromtimestamp(t / 1000, datetime.UTC).year


def by_year(rows, key):
    out = {}
    for y in sorted({year(r["t"]) for r in rows}):
        out[y] = stats([r[key] for r in rows if year(r["t"]) == y])["exp"]
    return out


if __name__ == "__main__":
    datadir, start = sys.argv[1], int(sys.argv[2])
    syms = sys.argv[3:]
    for ne, nx in ((20, 10), (55, 20)):
        rows = []
        for s in syms:
            try:
                rows += [dict(x, sym=s) for x in breakout(load(datadir, s, "1Dutc"), ne, nx, start)]
            except FileNotFoundError:
                pass
        print(f"A breakout {ne}/{nx}", stats([r["r"] for r in rows]), "by year", by_year(rows, "r"),
              "median days", sorted(r["days"] for r in rows)[len(rows) // 2] if rows else None)
        rs = sorted(r["r"] for r in rows)
        print("   without best 10%", stats(rs[: int(len(rs) * 0.9)]))
    for k in (3, 5):
        print(f"B rotation top{k}", curve_stats(rotation(datadir, syms, start, top_k=k)))
    btc = [(r["t"], r["c"]) for r in load(datadir, "BTC", "1Dutc") if r["t"] >= start]
    print("   BTC buy&hold", curve_stats([(t, c / btc[0][1]) for t, c in btc]))
    zt = json.load(open(os.path.join(datadir, "trades_t1_15.json")))
    keep = []
    for r in zt:
        d1 = load(datadir, r["sym"], "1Dutc")
        closes = [x["c"] for x in d1]
        e50 = ema(closes, 50)
        idx = max(i for i, x in enumerate(d1) if x["t"] + DAY <= r["t"])
        if closes[idx] > e50[idx]:
            keep.append(r)
    for name, rows in (("C zones, all", zt), ("C zones, coin above EMA50", keep),
                       ("C zones 4H, coin above EMA50", [r for r in keep if r["tf"] == "4H"]),
                       ("   zones 4H, coin below EMA50", [r for r in zt if r["tf"] == "4H" and r not in keep])):
        print(name, stats([r["half_be"] for r in rows]), "by year", by_year(rows, "half_be"))
