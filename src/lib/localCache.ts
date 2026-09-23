/**
 * A thin localStorage wrapper for "don't re-show a loading spinner for
 * data we already fetched a moment ago" — used by OpportunitiesView and
 * TradeHistoryView, whose full scan (76 coins × 4 timeframes) takes a
 * visible few seconds even though the server itself caches each pair for
 * 60-120s. Reading a cached copy on mount lets the page paint the previous
 * result instantly while a fresh scan still runs in the background and
 * replaces it. localStorage rather than sessionStorage specifically:
 * sessionStorage is scoped to one browser tab, so the exact "reloads every
 * time I open it" complaint this exists to fix would still happen for
 * anyone opening the page in a new tab, from a bookmark, or after fully
 * closing and reopening the browser — all common on mobile. This is
 * purely a per-viewer "don't blank the screen" nicety, never a source of
 * truth: the background scan is what actually keeps the data correct, and
 * a private window or blocked storage just means every visit shows the
 * loading state again, not that anything breaks.
 */
interface CacheEnvelope<T> {
  storedAt: number;
  value: T;
}

/** A cached entry older than this is treated as if it were never there. */
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readLocalCache<T>(key: string, maxAgeMs: number = DEFAULT_MAX_AGE_MS): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (Date.now() - parsed.storedAt > maxAgeMs) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function writeLocalCache<T>(key: string, value: T): void {
  try {
    const envelope: CacheEnvelope<T> = { storedAt: Date.now(), value };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Private browsing, storage disabled, or quota exceeded — the page
    // still works, it just re-scans from a blank state next visit.
  }
}
