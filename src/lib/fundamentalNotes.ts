export interface FundamentalNote {
  symbol: string;
  text: string;
  /** Unix seconds. */
  updatedAt: number;
}

const STORAGE_KEY = "crypto-mon:fundamental-notes";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Manually-written fundamental-analysis notes, one per symbol. There is no
 * live news API connected yet, so this is an admin-editable substitute
 * rather than anything auto-generated — see /admin. Browser-local
 * (localStorage) for now: edits made here are only visible in the same
 * browser that made them, not broadcast to other visitors.
 */
export function loadFundamentalNotes(): Record<string, FundamentalNote> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getFundamentalNote(symbol: string): FundamentalNote | null {
  return loadFundamentalNotes()[symbol] ?? null;
}

export function saveFundamentalNote(symbol: string, text: string): FundamentalNote {
  const notes = loadFundamentalNotes();
  const note: FundamentalNote = { symbol, text, updatedAt: Math.floor(Date.now() / 1000) };
  notes[symbol] = note;

  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // Storage full or unavailable (private browsing) — edit just won't persist this time.
    }
  }

  return note;
}

export function deleteFundamentalNote(symbol: string): void {
  const notes = loadFundamentalNotes();
  delete notes[symbol];
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // Ignore — nothing to clean up if storage isn't available.
    }
  }
}
