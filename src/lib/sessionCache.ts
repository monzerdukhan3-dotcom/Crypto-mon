/**
 * A thin sessionStorage wrapper for "don't re-show a loading spinner for
 * data we already fetched a moment ago" — used by OpportunitiesView and
 * TradeHistoryView, whose full scan (76 coins × 4 timeframes) takes a
 * visible few seconds even though the server itself caches each pair for
 * 60-120s. Reading a cached copy on mount lets the page paint the previous
 * result instantly while a fresh scan still runs in the background and
 * replaces it — this is purely a per-tab "don't blank the screen" nicety,
 * never a source of truth: the background scan is what actually keeps the
 * data correct, and a private window or blocked storage just means every
 * visit shows the loading state again, not that anything breaks.
 */
export function readSessionCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSessionCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing, storage disabled, or quota exceeded — the page
    // still works, it just re-scans from a blank state next visit.
  }
}
