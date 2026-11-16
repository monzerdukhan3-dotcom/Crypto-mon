"""Forecast log: record every probability given to the user, then score it against prices.

A forecast is "ASSET touches LEVEL (from above or below) within H days, probability P".
Scoring uses OKX 1H candles that start after the forecast time, so nothing known
before the forecast counts. Reports the Brier score (0 = perfect, 0.25 = coin flip at 50%)
and a calibration table: when we said ~70%, how often did it happen?

  python3 research/forecast_log.py add BTC below 62300 7 0.60 --made 2026-11-14T22:28 --note "..."
  python3 research/forecast_log.py score
Log file: state/forecasts/forecasts.jsonl (one JSON object per line).
"""
import argparse, datetime, json, os, time, urllib.request

LOG = os.path.join(os.path.dirname(__file__), "..", "state", "forecasts", "forecasts.jsonl")
HOUR, DAY = 3_600_000, 86_400_000
URL = "https://www.okx.com/api/v5/market/history-candles?instId={}-USDT&bar=1H&limit=100&after={}"


def read():
    if not os.path.exists(LOG):
        return []
    return [json.loads(l) for l in open(LOG) if l.strip()]


def candles(asset, start, end):
    out, after = [], end + 1
    while after > start:
        req = urllib.request.Request(URL.format(asset, after), headers={"User-Agent": "Mozilla/5.0"})
        data = json.load(urllib.request.urlopen(req, timeout=20))["data"]
        if not data:
            break
        out += [(int(r[0]), float(r[2]), float(r[3])) for r in data]
        after = int(data[-1][0])
        time.sleep(0.12)
    return sorted(c for c in set(out) if start <= c[0] <= end)


def resolve(f, now):
    made = int(datetime.datetime.fromisoformat(f["made"]).replace(tzinfo=datetime.UTC).timestamp() * 1000)
    start = (made // HOUR + 1) * HOUR  # first full 1H candle after the forecast
    deadline = int(made + f["days"] * DAY)
    hit = any((h >= f["level"]) if f["side"] == "above" else (l <= f["level"])
              for (_, h, l) in candles(f["asset"], start, min(deadline, now)))
    if hit:
        return 1
    return 0 if now >= deadline else None


def score():
    now = int(time.time() * 1000)
    rows = []
    for f in read():
        o = resolve(f, now)
        rows.append((f, o))
        print(f"{f['made']} {f['asset']:5} {f['side']:5} {f['level']:<10g} {f['days']}d p={f['prob']:.2f} -> "
              f"{'pending' if o is None else ('YES' if o else 'no')}  {f.get('note', '')}")
    done = [(f["prob"], o) for f, o in rows if o is not None]
    if not done:
        return
    n = len(done)
    brier = sum((p - o) ** 2 for p, o in done) / n
    base = sum(o for _, o in done) / n
    print(f"\nresolved {n}, pending {len(rows) - n}")
    print(f"Brier {brier:.3f}  (always-50% = 0.250; always-base-rate = {base * (1 - base):.3f}; lower is better)")
    for lo, hi in ((0, 0.3), (0.3, 0.5), (0.5, 0.7), (0.7, 1.01)):
        b = [(p, o) for p, o in done if lo <= p < hi]
        if b:
            print(f"  said {lo:.0%}-{min(hi, 1):.0%}: n={len(b)} avg forecast {sum(p for p, _ in b) / len(b):.0%} -> happened {sum(o for _, o in b) / len(b):.0%}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("asset"); a.add_argument("side", choices=["above", "below"])
    a.add_argument("level", type=float); a.add_argument("days", type=float); a.add_argument("prob", type=float)
    a.add_argument("--made", default=None, help="UTC time, e.g. 2026-11-14T22:28 (default: now)")
    a.add_argument("--note", default="")
    sub.add_parser("score")
    args = ap.parse_args()
    if args.cmd == "add":
        made = args.made or datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M")
        os.makedirs(os.path.dirname(LOG), exist_ok=True)
        with open(LOG, "a") as fh:
            fh.write(json.dumps(dict(made=made, asset=args.asset, side=args.side, level=args.level,
                                     days=args.days, prob=args.prob, note=args.note), ensure_ascii=False) + "\n")
        print("logged", made, args.asset, args.side, args.level, args.days, args.prob)
    else:
        score()
