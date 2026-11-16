"""Live demand-zone scan with the same rules as backtest_zones.py (CLAUDE.md rules).

Usage: python3 research/scan_live.py SYM [SYM ...]
Prints candidate zones below the current price with entry, close level, hard stop,
T1 (>= 1.5R net) and T2 (nearest live supply zone, >= 2R net). Read-only, OKX public data.
"""
import json, math, os, sys, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from backtest_zones import COST, atr, ema, swing_highs, swing_lows, zones

URL = "https://www.okx.com/api/v5/market/candles?instId={}-USDT&bar={}&limit=300"


def candles(sym, bar):
    req = urllib.request.Request(URL.format(sym, bar), headers={"User-Agent": "Mozilla/5.0"})
    rows = json.load(urllib.request.urlopen(req, timeout=20))["data"]
    return [dict(t=int(r[0]), o=float(r[1]), h=float(r[2]), l=float(r[3]), c=float(r[4]))
            for r in reversed(rows) if r[8] == "1"]


def ewma_vol(closes, lam=0.94):
    rets = [math.log(closes[i] / closes[i - 1]) for i in range(1, len(closes))]
    v = rets[0] ** 2
    for r in rets[1:]:
        v = lam * v + (1 - lam) * r * r
    return math.sqrt(v * 365)


def scan(sym):
    d1, h4 = candles(sym, "1Dutc"), candles(sym, "4H")
    live = candles(sym, "4H")[-1]["c"] if h4 else None
    req = urllib.request.Request(f"https://www.okx.com/api/v5/market/ticker?instId={sym}-USDT", headers={"User-Agent": "Mozilla/5.0"})
    price = float(json.load(urllib.request.urlopen(req, timeout=20))["data"][0]["last"])
    a4 = atr(h4)[-1]
    vol = ewma_vol([r["c"] for r in d1])
    e50 = ema([r["c"] for r in d1], 50)[-1]
    highs, lows = swing_highs(h4), swing_lows(h4)
    sup = zones(d1, "S", "1D") + zones(h4, "S", "4H")
    out = []
    for z in zones(h4, "D", "4H"):  # 4H demand zones only (CLAUDE.md rule 2)
        if not (price * 0.85 < z["prox"] < price):
            continue
        after = [b for b in h4 if b["t"] >= z["formed"]]
        if any(b["c"] < z["dist"] for b in after):
            continue  # closed below: dead
        touches, inside = 0, False
        for b in after:
            if b["l"] <= z["prox"] and not inside:
                touches, inside = touches + 1, True
            elif b["l"] > z["prox"]:
                inside = False
        if touches > 1:
            continue
        entry = z["prox"]
        liq = [l for (t, l) in lows if z["dist"] * 0.97 <= l <= z["dist"] * 1.003]
        close_lvl = min([z["dist"]] + liq) - 0.25 * a4
        hard = min(close_lvl - 0.5 * a4, entry - 1.5 * a4)  # = base - 0.75 ATR; hard stop only
        risk = entry - hard + entry * COST + hard * COST
        live_sup = [s["prox"] for s in sup if s["prox"] > entry * 1.01
                    and not any(b["c"] > s["dist"] for b in h4 if b["t"] >= s["formed"])]
        if not live_sup:
            continue
        t2 = min(live_sup) * 0.997
        rr2 = (t2 * (1 - COST) - entry * (1 + COST)) / risk
        if rr2 < 2:
            continue
        floor = entry + 1.5 * risk
        mids = sorted(h for (t, h) in highs if floor < h < min(live_sup))
        t1 = mids[0] * 0.997 if mids else None
        rr1 = (t1 * (1 - COST) - entry * (1 + COST)) / risk if t1 else None
        sd_day = vol / math.sqrt(365)
        noise = 2 * (1 - 0.5 * (1 + math.erf(((entry - hard) / entry / sd_day) / math.sqrt(2))))
        out.append(dict(sym=sym, price=price, tf=z["tf"], zone=(round(z["dist"], 6), round(z["prox"], 6)), touches=touches,
                        entry=entry, close=close_lvl, hard=hard, t1=t1, rr1=rr1, t2=t2, rr2=rr2,
                        dist_pct=100 * (entry / price - 1), stop_pct=100 * (entry - hard) / entry,
                        vol=100 * vol, above_e50=price > e50, noise=noise))
    return out


if __name__ == "__main__":
    rows = []
    for s in sys.argv[1:]:
        try:
            rows += scan(s)
        except Exception as e:
            print(s, "error", e, file=sys.stderr)
    rows.sort(key=lambda r: -r["dist_pct"])
    for r in rows:
        print(json.dumps({k: (round(v, 6) if isinstance(v, float) else v) for k, v in r.items()}))
