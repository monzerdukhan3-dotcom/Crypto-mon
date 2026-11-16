#!/usr/bin/env python3
"""US spot Bitcoin ETF daily net flows (US$m) and the crypto-analyst ETF score.

Source: https://api.cryptoetf.today/api/etf-flow/bitcoin (public, no key; data is T+1).
Figures match the Farside table. The newest row is dropped while funds have not reported.

  python3 -I etf_flows.py            # last 10 trading days + 5-day score
  python3 -I etf_flows.py --json     # machine-readable
  python3 -I etf_flows.py --save F   # also save the full history to F (for research)
"""
import argparse, json, sys, urllib.request

URL = "https://api.cryptoetf.today/api/etf-flow/bitcoin"
FUNDS = ["blackrock", "fidelity", "bitwise", "twentyOneShares", "invesco", "franklin", "valkyrie",
         "vanEck", "wisdomTree", "morganStanley", "grayscale", "grayscaleBtc"]


def fetch():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    rows = json.load(urllib.request.urlopen(req, timeout=30))
    rows = sorted(rows, key=lambda r: r["date"])
    # the latest row is a placeholder (all zeros) until funds report
    while rows and rows[-1]["total"] == 0 and all(not rows[-1].get(f) for f in FUNDS):
        rows.pop()
    return rows


def score(sum5):
    """crypto-analyst thresholds: above +100M = +1, -300M..+100M = 0, below -300M = -1."""
    return 1 if sum5 > 100 else (-1 if sum5 < -300 else 0)


def summary(rows):
    last5 = rows[-5:]
    sum5 = sum(r["total"] for r in last5)
    ibit_streak, sign = 0, None
    for r in reversed(rows):
        s = (r["blackrock"] > 0) - (r["blackrock"] < 0)
        if s == 0 or (sign is not None and s != sign):
            break
        sign, ibit_streak = s, ibit_streak + 1
    return dict(
        source=URL, latest_date=rows[-1]["date"],
        last10=[dict(date=r["date"], total=round(r["total"], 1), ibit=round(r["blackrock"], 1), fbtc=round(r["fidelity"], 1)) for r in rows[-10:]],
        sum5=round(sum5, 1), score=score(sum5),
        big_days=[dict(date=r["date"], total=round(r["total"], 1)) for r in last5 if abs(r["total"]) > 200],
        ibit_streak_days=ibit_streak * (sign or 0),
        sum20=round(sum(r["total"] for r in rows[-20:]), 1))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--save")
    args = ap.parse_args()
    rows = fetch()
    if args.save:
        json.dump(rows, open(args.save, "w"))
    s = summary(rows)
    if args.json:
        json.dump(s, sys.stdout, indent=1)
        sys.exit(0)
    print(f"BTC spot ETF net flows (US$m), latest {s['latest_date']} — {URL}")
    for r in s["last10"]:
        print(f"  {r['date']}  total {r['total']:>8}  IBIT {r['ibit']:>8}  FBTC {r['fbtc']:>8}")
    print(f"5-day sum {s['sum5']}M -> score {s['score']:+d} | 20-day sum {s['sum20']}M | IBIT streak {s['ibit_streak_days']:+d} days")
    if s["big_days"]:
        print("days over 200M:", ", ".join(f"{d['date']} {d['total']}" for d in s["big_days"]))
