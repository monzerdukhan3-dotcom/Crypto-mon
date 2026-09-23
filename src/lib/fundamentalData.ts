import { SUPPORTED_SYMBOLS } from "./constants";

const COINGECKO_ID_BY_SYMBOL = new Map(SUPPORTED_SYMBOLS.map((s) => [s.symbol, s.coingeckoId]));

export interface FundamentalData {
  symbol: string;
  name: string;
  /** Project description from CoinGecko, HTML stripped and trimmed to a readable length. English-only — CoinGecko rarely has an Arabic description for anything past the largest few coins. */
  description: string | null;
  marketCapRank: number | null;
  sentimentUpPct: number | null;
  sentimentDownPct: number | null;
  homepage: string | null;
}

interface CoinGeckoCoinResponse {
  name: string;
  description?: { en?: string };
  market_cap_rank: number | null;
  sentiment_votes_up_percentage: number | null;
  sentiment_votes_down_percentage: number | null;
  links?: { homepage?: string[] };
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "").trim();
}

/** Cuts to a whole sentence near `maxLength` rather than mid-word, falling back to a hard cut + ellipsis only if no sentence break is found in a reasonable range. */
function truncateReadably(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf(". ");
  return lastPeriod > maxLength * 0.5 ? truncated.slice(0, lastPeriod + 1) : `${truncated}…`;
}

/**
 * Live fundamental profile — project description, market cap rank, and
 * community sentiment — from CoinGecko's public coin-detail endpoint. Works
 * with no setup at all (a public endpoint, no key required), and no
 * per-symbol config beyond the coingeckoId already on each SUPPORTED_SYMBOLS
 * entry.
 *
 * Cached for 30 minutes: this data changes slowly, and CoinGecko's
 * key-less tier enforces a very tight shared rate limit (a handful of
 * requests a minute, confirmed directly) — caching keeps repeat visits to
 * the same coin from hitting it directly every time, so once a coin's data
 * has been fetched once, every visitor for the next 30 minutes gets it from
 * cache instead of triggering a new call.
 *
 * If COINGECKO_API_KEY is set (a free "Demo" key from
 * coingecko.com/en/api/pricing — no payment needed, just a signup), it's
 * sent as CoinGecko's own demo-tier header for a meaningfully higher rate
 * limit than the anonymous tier. Entirely optional: without it, this still
 * works, just more likely to hit the rate limit on a coin that isn't
 * already warm in cache.
 */
export async function getFundamentalData(symbol: string): Promise<FundamentalData | null> {
  const coingeckoId = COINGECKO_ID_BY_SYMBOL.get(symbol.toUpperCase());
  if (!coingeckoId) return null;

  const url = new URL(`https://api.coingecko.com/api/v3/coins/${coingeckoId}`);
  url.searchParams.set("localization", "false");
  url.searchParams.set("tickers", "false");
  url.searchParams.set("market_data", "false");
  url.searchParams.set("community_data", "false");
  url.searchParams.set("developer_data", "false");

  const apiKey = process.env.COINGECKO_API_KEY;
  const res = await fetch(url, {
    next: { revalidate: 1800 },
    headers: apiKey ? { "x-cg-demo-api-key": apiKey } : undefined,
  });
  if (!res.ok) {
    throw new Error(`CoinGecko API request failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as CoinGeckoCoinResponse;
  const rawDescription = json.description?.en ?? "";

  return {
    symbol: symbol.toUpperCase(),
    name: json.name,
    description: rawDescription ? truncateReadably(stripHtml(rawDescription), 600) : null,
    marketCapRank: json.market_cap_rank ?? null,
    sentimentUpPct: json.sentiment_votes_up_percentage ?? null,
    sentimentDownPct: json.sentiment_votes_down_percentage ?? null,
    homepage: json.links?.homepage?.find((h) => h) ?? null,
  };
}
