import type { Symbol, Timeframe } from "./constants";
import type { Candle } from "./types";

/**
 * Placeholder for fetching OHLCV candle data for technical analysis.
 * Implementation (exchange/API integration) will be added later.
 *
 * API keys must never be hardcoded here — read them from environment
 * variables (see .env.local) via process.env at call time.
 */
export async function getCandles(
  symbol: Symbol,
  timeframe: Timeframe
): Promise<Candle[]> {
  throw new Error(
    `getCandles is not implemented yet (symbol=${symbol}, timeframe=${timeframe})`
  );
}
