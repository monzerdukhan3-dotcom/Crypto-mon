"""Backtest of the CLAUDE.md demand-zone spot strategy on OKX history.

Rules mirrored from CLAUDE.md:
- Demand zone: 1-6 small-body base candles (1D or 4H) followed within 3 candles by a
  close >= base top + 2x ATR. Zone top = highest base body, bottom = lowest base wick.
- Zone usable while tested at most once and never closed below.
- Entry: limit at the zone top on the next touch (4H bars), no chasing.
- Close level: below the zone bottom and nearby swing lows, minus 0.25x ATR4h.
  Exit on a 4H close below it. Hard stop: farther of (close level - 0.5 ATR4h) and
  (entry - 1.5 ATR4h); size and R are measured on the hard stop.
- Targets: T2 at the proximal edge of the nearest supply zone above (x0.997), T1 at the
  first confirmed 4H swing high between entry and T2. Trade skipped if net R:R on T2 < 2.
- Costs: 0.15% per side (fee 0.10% + slippage 0.05%).
Look-ahead guards: zones, supply zones and swing highs must be confirmed before the
entry bar; when a stop and a target fall in the same bar the stop is assumed first.
"""
import bisect, json, math, os, sys
from collections import defaultdict

COST = float(os.environ.get("BT_COST", "0.0015"))
T1_MIN_R = float(os.environ.get("BT_T1_MIN_R", "0"))
MAX_HOLD_BARS = 6 * 60  # 60 days of 4H bars


def load(d, sym, bar):
    return json.load(open(os.path.join(d, f"{sym}_{bar}.json")))


def atr(rows, n=14):
    out, prev = [], None
    for i, r in enumerate(rows):
        tr = r["h"] - r["l"] if i == 0 else max(r["h"] - r["l"], abs(r["h"] - rows[i - 1]["c"]), abs(r["l"] - rows[i - 1]["c"]))
        prev = tr if prev is None else (prev * (n - 1) + tr) / n
        out.append(prev)
    return out


def ema(vals, n):
    k, out, e = 2 / (n + 1), [], None
    for v in vals:
        e = v if e is None else v * k + e * (1 - k)
        out.append(e)
    return out


def bar_ms(rows):
    return rows[1]["t"] - rows[0]["t"]


def zones(rows, kind, tf):
    """Return zones with formation (confirmation) close time."""
    a = atr(rows)
    span = bar_ms(rows)
    out = []
    i = 7
    while i < len(rows) - 3:
        base = []
        j = i - 1
        while j >= 0 and len(base) < 6 and abs(rows[j]["c"] - rows[j]["o"]) <= 0.5 * a[j]:
            base.append(rows[j])
            j -= 1
        if not base:
            i += 1
            continue
        A = a[i - 1]
        if kind == "D":
            top = max(max(b["o"], b["c"]) for b in base)
            bot = min(b["l"] for b in base)
            hit = next((k for k in range(i, min(i + 3, len(rows))) if rows[k]["c"] >= top + 2 * A), None)
            if hit is not None and rows[i]["c"] > rows[i]["o"]:
                out.append(dict(kind="D", tf=tf, prox=top, dist=bot, formed=rows[hit]["t"] + span, atr=A))
                i = hit + 1
                continue
        else:
            bot = min(min(b["o"], b["c"]) for b in base)
            top = max(b["h"] for b in base)
            hit = next((k for k in range(i, min(i + 3, len(rows))) if rows[k]["c"] <= bot - 2 * A), None)
            if hit is not None and rows[i]["c"] < rows[i]["o"]:
                out.append(dict(kind="S", tf=tf, prox=bot, dist=top, formed=rows[hit]["t"] + span, atr=A))
                i = hit + 1
                continue
        i += 1
    return out


def swing_highs(h4, w=3):
    span = bar_ms(h4)
    return [(h4[i + w]["t"] + span, h4[i]["h"]) for i in range(w, len(h4) - w)
            if h4[i]["h"] == max(x["h"] for x in h4[i - w:i + w + 1])]


def swing_lows(h4, w=3):
    span = bar_ms(h4)
    return [(h4[i + w]["t"] + span, h4[i]["l"]) for i in range(w, len(h4) - w)
            if h4[i]["l"] == min(x["l"] for x in h4[i - w:i + w + 1])]


def btc_regime(d1):
    c = [r["c"] for r in d1]
    e50 = ema(c, 50)
    s200 = [sum(c[max(0, i - 199):i + 1]) / min(i + 1, 200) for i in range(len(c))]
    span = bar_ms(d1)
    # regime known at the close of each day -> applies from next day open
    return [(r["t"] + span, "above_ema50" if r["c"] > e50[i] else ("below_ema50" if r["c"] > s200[i] else "below_sma200"))
            for i, r in enumerate(d1) if i >= 200]


def regime_at(reg, t):
    lo, hi, ans = 0, len(reg) - 1, None
    while lo <= hi:
        m = (lo + hi) // 2
        if reg[m][0] <= t:
            ans = reg[m][1]
            lo = m + 1
        else:
            hi = m - 1
    return ans


def simulate(h4, a4, i0, entry, close_lvl, hard, t1, t2, variant):
    """Walk 4H bars from fill bar i0. Returns R multiple (net of costs)."""
    risk = entry - hard + entry * COST + hard * COST
    pos, realized, stop, t1_done = 1.0, 0.0, hard, False
    use_close = variant != "hard_only"
    for k in range(i0, min(i0 + MAX_HOLD_BARS, len(h4))):
        b = h4[k]
        if b["l"] <= stop:  # stop first (conservative)
            realized += pos * (stop * (1 - COST) - entry * (1 + COST))
            return realized / risk, k
        if variant in ("half_t1_t2", "half_be", "hard_only") and t1 and not t1_done and b["h"] >= t1:
            realized += 0.5 * (t1 * (1 - COST) - entry * (1 + COST))
            pos, t1_done = 0.5, True
            if variant == "half_be":
                stop = entry * (1 + 2 * COST)
        if variant == "all_t1" and t1 and b["h"] >= t1:
            return (t1 * (1 - COST) - entry * (1 + COST)) / risk, k
        if b["h"] >= t2:
            realized += pos * (t2 * (1 - COST) - entry * (1 + COST))
            return realized / risk, k
        if use_close and b["c"] < close_lvl:
            realized += pos * (b["c"] * (1 - COST) - entry * (1 + COST))
            return realized / risk, k
    last = h4[min(i0 + MAX_HOLD_BARS, len(h4)) - 1]
    realized += pos * (last["c"] * (1 - COST) - entry * (1 + COST))
    return realized / risk, None


VARIANTS = ["half_t1_t2", "half_be", "all_t1", "all_t2", "hard_only"]


def run(datadir, syms, start_ms):
    btc = load(datadir, "BTC", "1Dutc")
    reg = btc_regime(btc)
    trades = []
    for sym in syms:
        try:
            d1, h4 = load(datadir, sym, "1Dutc"), load(datadir, sym, "4H")
        except FileNotFoundError:
            continue
        if len(h4) < 500:
            continue
        a4 = atr(h4)
        dem = zones(d1, "D", "1D") + zones(h4, "D", "4H")
        sup = zones(d1, "S", "1D") + zones(h4, "S", "4H")
        highs, lows = swing_highs(h4), swing_lows(h4)
        times = [b["t"] for b in h4]
        # a supply zone dies on the first 4H close above its distal edge
        for s in sup:
            k = bisect.bisect_left(times, s["formed"])
            s["dead"] = next((h4[j]["t"] for j in range(k, len(h4)) if h4[j]["c"] > s["dist"]), float("inf"))
        cands = []
        for z in dem:
            i = bisect.bisect_left(times, z["formed"])
            # first touch of the zone top after formation; a bar that opens below the
            # zone (gap through) counts as a test, and the next touch may fill (2nd test)
            tests, filled, k = 0, None, i
            while k < len(h4) and tests < 2:
                b = h4[k]
                if b["c"] < z["dist"]:
                    break  # closed below: zone dead
                if b["l"] <= z["prox"]:
                    if b["o"] >= z["prox"]:
                        filled = k
                        break
                    tests += 1
                    while k + 1 < len(h4) and h4[k + 1]["l"] <= z["prox"]:
                        k += 1
                k += 1
            if filled is not None and times[filled] >= start_ms:
                cands.append((filled, z))
        busy_until = 0
        for filled, z in sorted(cands, key=lambda c: (c[0], -c[1]["prox"])):
            if times[filled] <= busy_until:
                continue
            t = h4[filled]["t"]
            entry, A = z["prox"], a4[filled - 1]
            liq = [l for (tc, l) in lows if tc <= t and z["dist"] * 0.97 <= l <= z["dist"] * 1.003]
            close_lvl = min([z["dist"]] + liq) - 0.25 * A
            hard = min(close_lvl - 0.5 * A, entry - 1.5 * A)
            above = sorted(s["prox"] for s in sup if s["formed"] <= t < s["dead"] and s["prox"] > entry * 1.01)
            if not above:
                continue
            t2 = above[0] * 0.997
            risk = entry - hard + entry * COST + hard * COST
            rr2 = (t2 * (1 - COST) - entry * (1 + COST)) / risk
            if rr2 < 2:
                continue
            t1_floor = entry + T1_MIN_R * risk  # T1 must pay at least T1_MIN_R
            mids = sorted(h for (tc, h) in highs if tc <= t and max(entry * 1.005, t1_floor) < h < above[0])
            t1 = mids[0] * 0.997 if mids else None
            row = dict(sym=sym, tf=z["tf"], t=t, entry=entry, hard=hard, close=close_lvl, t1=t1, t2=t2,
                       rr2=rr2, stop_pct=100 * (entry - hard) / entry, regime=regime_at(reg, t))
            exit_k = None
            for v in VARIANTS:
                r, k_out = simulate(h4, a4, filled, entry, close_lvl, hard, t1, t2, v)
                row[v] = r
                row[v + "_exit"] = h4[k_out]["t"] if k_out is not None else h4[-1]["t"]
                if v == "half_t1_t2":
                    exit_k = k_out
            trades.append(row)
            busy_until = h4[exit_k]["t"] if exit_k is not None else h4[-1]["t"]
    return trades


def stats(rs):
    n = len(rs)
    if not n:
        return dict(n=0)
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r <= 0]
    eq, peak, mdd = 0.0, 0.0, 0.0
    for r in rs:
        eq += r
        peak = max(peak, eq)
        mdd = max(mdd, peak - eq)
    pf = sum(wins) / -sum(losses) if losses and sum(losses) < 0 else float("inf")
    return dict(n=n, win=round(100 * len(wins) / n, 1), exp=round(sum(rs) / n, 3), total=round(sum(rs), 1),
                pf=round(pf, 2), avg_win=round(sum(wins) / len(wins), 2) if wins else 0,
                avg_loss=round(sum(losses) / len(losses), 2) if losses else 0, max_dd_r=round(mdd, 1))


if __name__ == "__main__":
    datadir, start = sys.argv[1], int(sys.argv[2])
    syms = sys.argv[3:]
    trades = sorted(run(datadir, syms, start), key=lambda r: r["t"])
    json.dump(trades, open(os.path.join(datadir, "trades.json"), "w"))
    print("trades", len(trades))
    for v in VARIANTS:
        print(v, stats([r[v] for r in trades]))
