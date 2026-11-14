"""Download OKX spot candles (1Dutc, 4H) with paging and cache them as JSON."""
import json, os, sys, time, urllib.request

BASE = "https://www.okx.com/api/v5/market/history-candles"


def fetch(inst, bar, since_ms):
    out, after = [], None
    while True:
        url = f"{BASE}?instId={inst}&bar={bar}&limit=100" + (f"&after={after}" if after else "")
        for attempt in range(5):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=20) as r:
                    data = json.load(r)["data"]
                break
            except Exception:
                time.sleep(2 ** attempt)
        else:
            raise RuntimeError(url)
        if not data:
            break
        out.extend(data)
        after = data[-1][0]
        if int(after) < since_ms:
            break
        time.sleep(0.12)
    rows = sorted({int(r[0]): r for r in out}.values(), key=lambda r: int(r[0]))
    # keep confirmed candles only (r[8] == "1")
    return [dict(t=int(r[0]), o=float(r[1]), h=float(r[2]), l=float(r[3]), c=float(r[4]))
            for r in rows if int(r[0]) >= since_ms and r[8] == "1"]


if __name__ == "__main__":
    outdir, since = sys.argv[1], int(sys.argv[2])
    for sym in sys.argv[3:]:
        for bar in ("1Dutc", "4H"):
            path = os.path.join(outdir, f"{sym}_{bar}.json")
            if os.path.exists(path):
                continue
            rows = fetch(f"{sym}-USDT", bar, since)
            json.dump(rows, open(path, "w"))
            print(sym, bar, len(rows), flush=True)
