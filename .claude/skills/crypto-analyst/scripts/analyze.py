#!/usr/bin/env python3
"""Fetch public market data and compute the crypto-analyst technical/quant tables.

Usage: python3 analyze.py BTC [--levels 81185,79900,85288] [--json out.json]

Sources (keyless, reachable from the cloud env): OKX (candles, funding, OI),
alternative.me (fear & greed), CoinGecko (BTC dominance). Binance/Bybit/Farside
are blocked here (451/403) and are not called.
"""
import argparse, json, math, sys, urllib.request, datetime as dt

UA = {"User-Agent": "Mozilla/5.0"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def ts(ms):
    return dt.datetime.fromtimestamp(int(ms) / 1000, dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def candles(sym, bar, limit=300):
    d = get(f"https://www.okx.com/api/v5/market/candles?instId={sym}-USDT&bar={bar}&limit={limit}")["data"]
    d = sorted(d, key=lambda x: int(x[0]))
    return [dict(t=int(x[0]), o=float(x[1]), h=float(x[2]), l=float(x[3]), c=float(x[4]), v=float(x[5])) for x in d]


def ema(v, k):
    a = 2 / (k + 1); e = sum(v[:k]) / k
    for x in v[k:]:
        e = a * x + (1 - a) * e
    return e


def sma(v, k):
    return sum(v[-k:]) / k if len(v) >= k else None


def rsi(c, k=14):
    g = l = 0.0
    for i in range(1, k + 1):
        d = c[i] - c[i - 1]; g += max(d, 0); l += max(-d, 0)
    g /= k; l /= k
    for i in range(k + 1, len(c)):
        d = c[i] - c[i - 1]; g = (g * (k - 1) + max(d, 0)) / k; l = (l * (k - 1) + max(-d, 0)) / k
    return 100 - 100 / (1 + g / l) if l else 100.0


def atr(b, k=14):
    tr = [max(b[i]["h"] - b[i]["l"], abs(b[i]["h"] - b[i - 1]["c"]), abs(b[i]["l"] - b[i - 1]["c"])) for i in range(1, len(b))]
    a = sum(tr[:k]) / k
    for x in tr[k:]:
        a = (a * (k - 1) + x) / k
    return a


def pivots(b, k=3):
    H, L = [], []
    for i in range(k, len(b) - k):
        w = b[i - k:i + k + 1]
        if b[i]["h"] == max(x["h"] for x in w): H.append((ts(b[i]["t"])[:10], b[i]["h"]))
        if b[i]["l"] == min(x["l"] for x in w): L.append((ts(b[i]["t"])[:10], b[i]["l"]))
    return H, L


def describe(seq, kind):
    """Compare last pivots with the 0.2% 'equal' rule."""
    out = []
    for (d0, a), (d1, b) in zip(seq, seq[1:]):
        ch = (b / a - 1) * 100
        word = "متساوٍ" if abs(ch) < 0.2 else (("أعلى" if ch > 0 else "أدنى"))
        out.append(f"{d1}: {b:g} ({kind} {word}، {ch:+.2f}%)")
    return out


Phi = lambda z: 0.5 * (1 + math.erf(z / math.sqrt(2)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("symbol")
    ap.add_argument("--levels", default="", help="comma-separated prices for touch probabilities")
    ap.add_argument("--json")
    a = ap.parse_args()
    s = a.symbol.upper(); R = {"symbol": s, "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}

    d = candles(s, "1Dutc"); h4 = candles(s, "4H"); w = candles(s, "1Wutc", 120)
    c = [x["c"] for x in d]; p = h4[-1]["c"]
    R["price"] = p; R["price_candle_4h_open"] = ts(h4[-1]["t"])
    R["chg_24h_pct"] = (p / h4[-7]["c"] - 1) * 100; R["chg_7d_pct"] = (p / c[-8] - 1) * 100

    for name, b in (("1D", d), ("4H", h4)):
        cc = [x["c"] for x in b]
        R[name] = dict(ema20=ema(cc, 20), ema50=ema(cc, 50), sma50=sma(cc, 50), sma200=sma(cc, 200), rsi14=rsi(cc), atr14=atr(b))
    H, L = pivots(d)
    R["structure_highs"] = describe(H[-4:], "قمة"); R["structure_lows"] = describe(L[-4:], "قاع")
    # Fibonacci on the last major swing: highest high / lowest low of last 90 days
    seg = d[-90:]; hi = max(seg, key=lambda x: x["h"]); lo = min(seg, key=lambda x: x["l"])
    up = lo["t"] < hi["t"]; rng = hi["h"] - lo["l"]
    R["fib_swing"] = f"{'صاعدة' if up else 'هابطة'}: {lo['l']:g} ({ts(lo['t'])[:10]}) → {hi['h']:g} ({ts(hi['t'])[:10]})"
    R["fib"] = {str(r): (hi["h"] - rng * r) if up else (lo["l"] + rng * r) for r in (0.382, 0.5, 0.618, 0.786)}

    lr = [math.log(c[i] / c[i - 1]) for i in range(1, len(c))]
    sd = lambda x: math.sqrt(sum((v - sum(x) / len(x)) ** 2 for v in x) / (len(x) - 1))
    s14, s30 = sd(lr[-14:]), sd(lr[-30:])
    m20 = sma(c, 20); sd20 = math.sqrt(sum((v - m20) ** 2 for v in c[-20:]) / 20)
    R["quant"] = dict(vol_daily_14=s14 * 100, vol_daily_30=s30 * 100, vol_annual_30=s30 * math.sqrt(365) * 100,
                      atr14_usd=R["1D"]["atr14"], atr14_pct=R["1D"]["atr14"] / p * 100,
                      zscore_20=(p - m20) / sd20, bb_upper=m20 + 2 * sd20, bb_lower=m20 - 2 * sd20,
                      range7_1s=(p * math.exp(-s30 * 7 ** .5), p * math.exp(s30 * 7 ** .5)),
                      range7_2s=(p * math.exp(-2 * s30 * 7 ** .5), p * math.exp(2 * s30 * 7 ** .5)))
    if a.levels:
        R["touch7d"] = {lv: 2 * (1 - Phi(abs(math.log(float(lv) / p)) / (s30 * 7 ** .5))) * 100 for lv in a.levels.split(",")}

    try:
        fh = get(f"https://www.okx.com/api/v5/public/funding-rate-history?instId={s}-USDT-SWAP&limit=100")["data"]
        fr = get(f"https://www.okx.com/api/v5/public/funding-rate?instId={s}-USDT-SWAP")["data"][0]
        last30 = [float(x["realizedRate"] or x["fundingRate"]) for x in fh[:90]]
        R["funding"] = dict(current_pct=float(fr["fundingRate"]) * 100, avg_8h_pct=sum(last30) / len(last30) * 100,
                            sum_30d_pct=sum(last30) * 100, source="OKX", time=ts(fr["ts"]))
    except Exception as e:
        R["funding"] = f"غير متاح: {e}"
    try:
        oi = get(f"https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy={s}&period=1D")["data"]
        oi = sorted(oi, key=lambda x: int(x[0]))
        R["open_interest"] = dict(now_usd=float(oi[-1][1]), chg_7d_pct=(float(oi[-1][1]) / float(oi[-8][1]) - 1) * 100,
                                  chg_30d_pct=(float(oi[-1][1]) / float(oi[-31][1]) - 1) * 100 if len(oi) > 30 else None,
                                  source="OKX (all OKX contracts)", time=ts(oi[-1][0]))
    except Exception as e:
        R["open_interest"] = f"غير متاح: {e}"
    try:
        fg = get("https://api.alternative.me/fng/?limit=30")["data"]
        R["fear_greed"] = dict(now=int(fg[0]["value"]), label=fg[0]["value_classification"], week_ago=int(fg[7]["value"]),
                               month_ago=int(fg[-1]["value"]), time=ts(int(fg[0]["timestamp"]) * 1000))
    except Exception as e:
        R["fear_greed"] = f"غير متاح: {e}"
    try:
        g = get("https://api.coingecko.com/api/v3/global")["data"]
        R["btc_dominance_pct"] = g["market_cap_percentage"]["btc"]; R["dominance_time"] = ts(g["updated_at"] * 1000)
    except Exception as e:
        R["btc_dominance_pct"] = f"غير متاح: {e}"

    print(json.dumps(R, ensure_ascii=False, indent=1, default=lambda x: round(x, 6)))
    if a.json:
        json.dump(R, open(a.json, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    sys.exit(main())
