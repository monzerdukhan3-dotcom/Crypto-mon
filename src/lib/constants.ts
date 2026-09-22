/** A ticker symbol, e.g. "BTC". The tradable set is a fixed list — see SUPPORTED_SYMBOLS below. */
export type Symbol = string;

export interface SymbolInfo {
  symbol: Symbol;
  label: string;
  /** Trading pair as used by most exchange APIs, e.g. BTC_USDT */
  pair: string;
}

/**
 * The full, fixed set of coins the app covers — a specific list, not a
 * dynamically ranked "top N by volume". /api/symbols serves this list as-is;
 * every other page (dashboard's coin picker, trade history, opportunities
 * scan) is built on top of it.
 */
export const SUPPORTED_SYMBOLS: SymbolInfo[] = [
  { symbol: "BTC", label: "Bitcoin (BTC)", pair: "BTC_USDT" },
  { symbol: "ETH", label: "Ethereum (ETH)", pair: "ETH_USDT" },
  { symbol: "SOL", label: "Solana (SOL)", pair: "SOL_USDT" },
  { symbol: "BNB", label: "BNB (BNB)", pair: "BNB_USDT" },
  { symbol: "XRP", label: "XRP (XRP)", pair: "XRP_USDT" },
  { symbol: "ADA", label: "Cardano (ADA)", pair: "ADA_USDT" },
  { symbol: "DOGE", label: "Dogecoin (DOGE)", pair: "DOGE_USDT" },
  { symbol: "TRX", label: "TRON (TRX)", pair: "TRX_USDT" },
  { symbol: "AVAX", label: "Avalanche (AVAX)", pair: "AVAX_USDT" },
  { symbol: "LINK", label: "Chainlink (LINK)", pair: "LINK_USDT" },
  { symbol: "DOT", label: "Polkadot (DOT)", pair: "DOT_USDT" },
  { symbol: "NEAR", label: "NEAR Protocol (NEAR)", pair: "NEAR_USDT" },
  { symbol: "APT", label: "Aptos (APT)", pair: "APT_USDT" },
  { symbol: "ARB", label: "Arbitrum (ARB)", pair: "ARB_USDT" },
  { symbol: "OP", label: "Optimism (OP)", pair: "OP_USDT" },
  { symbol: "ATOM", label: "Cosmos (ATOM)", pair: "ATOM_USDT" },
  { symbol: "SUI", label: "Sui (SUI)", pair: "SUI_USDT" },
  { symbol: "SEI", label: "Sei (SEI)", pair: "SEI_USDT" },
  { symbol: "TIA", label: "Celestia (TIA)", pair: "TIA_USDT" },
  { symbol: "INJ", label: "Injective (INJ)", pair: "INJ_USDT" },
  { symbol: "ICP", label: "Internet Computer (ICP)", pair: "ICP_USDT" },
  { symbol: "ETC", label: "Ethereum Classic (ETC)", pair: "ETC_USDT" },
  { symbol: "ALGO", label: "Algorand (ALGO)", pair: "ALGO_USDT" },
  { symbol: "FTM", label: "Fantom (FTM)", pair: "FTM_USDT" },
  { symbol: "EGLD", label: "MultiversX (EGLD)", pair: "EGLD_USDT" },
  { symbol: "UNI", label: "Uniswap (UNI)", pair: "UNI_USDT" },
  { symbol: "AAVE", label: "Aave (AAVE)", pair: "AAVE_USDT" },
  { symbol: "LDO", label: "Lido DAO (LDO)", pair: "LDO_USDT" },
  { symbol: "CRV", label: "Curve DAO (CRV)", pair: "CRV_USDT" },
  { symbol: "MKR", label: "Maker (MKR)", pair: "MKR_USDT" },
  { symbol: "SNX", label: "Synthetix (SNX)", pair: "SNX_USDT" },
  { symbol: "DYDX", label: "dYdX (DYDX)", pair: "DYDX_USDT" },
  { symbol: "GMX", label: "GMX (GMX)", pair: "GMX_USDT" },
  { symbol: "COMP", label: "Compound (COMP)", pair: "COMP_USDT" },
  { symbol: "1INCH", label: "1inch (1INCH)", pair: "1INCH_USDT" },
  { symbol: "PEPE", label: "Pepe (PEPE)", pair: "PEPE_USDT" },
  { symbol: "BONK", label: "Bonk (BONK)", pair: "BONK_USDT" },
  { symbol: "WIF", label: "dogwifhat (WIF)", pair: "WIF_USDT" },
  { symbol: "FLOKI", label: "Floki (FLOKI)", pair: "FLOKI_USDT" },
  { symbol: "FET", label: "Fetch.ai (FET)", pair: "FET_USDT" },
  { symbol: "RENDER", label: "Render (RENDER)", pair: "RENDER_USDT" },
  { symbol: "WLD", label: "Worldcoin (WLD)", pair: "WLD_USDT" },
  { symbol: "GRT", label: "The Graph (GRT)", pair: "GRT_USDT" },
  { symbol: "ONDO", label: "Ondo (ONDO)", pair: "ONDO_USDT" },
  { symbol: "SAND", label: "The Sandbox (SAND)", pair: "SAND_USDT" },
  { symbol: "MANA", label: "Decentraland (MANA)", pair: "MANA_USDT" },
  { symbol: "AXS", label: "Axie Infinity (AXS)", pair: "AXS_USDT" },
  { symbol: "CFX", label: "Conflux (CFX)", pair: "CFX_USDT" },
];

export type Timeframe = "15m" | "1h" | "4h" | "1d";

export interface TimeframeInfo {
  value: Timeframe;
  label: string;
}

export const TIMEFRAMES: TimeframeInfo[] = [
  { value: "15m", label: "15 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "4h", label: "4 Hours" },
  { value: "1d", label: "1 Day" },
];

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
};
