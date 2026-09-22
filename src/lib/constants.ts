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
  { symbol: "XRP", label: "XRP (XRP)", pair: "XRP_USDT" },
  { symbol: "ADA", label: "Cardano (ADA)", pair: "ADA_USDT" },
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
  { symbol: "EGLD", label: "MultiversX (EGLD)", pair: "EGLD_USDT" },
  { symbol: "UNI", label: "Uniswap (UNI)", pair: "UNI_USDT" },
  { symbol: "LDO", label: "Lido DAO (LDO)", pair: "LDO_USDT" },
  { symbol: "CRV", label: "Curve DAO (CRV)", pair: "CRV_USDT" },
  { symbol: "SNX", label: "Synthetix (SNX)", pair: "SNX_USDT" },
  { symbol: "GMX", label: "GMX (GMX)", pair: "GMX_USD" },
  { symbol: "COMP", label: "Compound (COMP)", pair: "COMP_USDT" },
  { symbol: "1INCH", label: "1inch (1INCH)", pair: "1INCH_USDT" },
  { symbol: "FET", label: "Fetch.ai (FET)", pair: "FET_USDT" },
  { symbol: "RENDER", label: "Render (RENDER)", pair: "RENDER_USDT" },
  { symbol: "WLD", label: "Worldcoin (WLD)", pair: "WLD_USDT" },
  { symbol: "GRT", label: "The Graph (GRT)", pair: "GRT_USDT" },
  { symbol: "ONDO", label: "Ondo (ONDO)", pair: "ONDO_USDT" },
  { symbol: "SAND", label: "The Sandbox (SAND)", pair: "SAND_USDT" },
  { symbol: "MANA", label: "Decentraland (MANA)", pair: "MANA_USD" },
  { symbol: "AXS", label: "Axie Infinity (AXS)", pair: "AXS_USDT" },
  // Polygon rebranded MATIC to POL — the exchange only lists the new ticker.
  { symbol: "POL", label: "Polygon (POL)", pair: "POL_USDT" },
  { symbol: "XLM", label: "Stellar (XLM)", pair: "XLM_USDT" },
  { symbol: "VET", label: "VeChain (VET)", pair: "VET_USDT" },
  { symbol: "THETA", label: "Theta Network (THETA)", pair: "THETA_USDT" },
  { symbol: "FLOW", label: "Flow (FLOW)", pair: "FLOW_USDT" },
  { symbol: "CHZ", label: "Chiliz (CHZ)", pair: "CHZ_USDT" },
  { symbol: "ENJ", label: "Enjin Coin (ENJ)", pair: "ENJ_USDT" },
  { symbol: "MASK", label: "Mask Network (MASK)", pair: "MASK_USDT" },
  { symbol: "BLUR", label: "Blur (BLUR)", pair: "BLUR_USD" },
  { symbol: "RUNE", label: "THORChain (RUNE)", pair: "RUNE_USDT" },
  { symbol: "KAVA", label: "Kava (KAVA)", pair: "KAVA_USDT" },
  { symbol: "NEO", label: "NEO (NEO)", pair: "NEO_USDT" },
  { symbol: "XTZ", label: "Tezos (XTZ)", pair: "XTZ_USDT" },
  { symbol: "QTUM", label: "Qtum (QTUM)", pair: "QTUM_USD" },
  { symbol: "ZIL", label: "Zilliqa (ZIL)", pair: "ZIL_USD" },
  { symbol: "ONE", label: "Harmony (ONE)", pair: "ONE_USDT" },
  { symbol: "ANKR", label: "Ankr (ANKR)", pair: "ANKR_USD" },
  { symbol: "BAT", label: "Basic Attention Token (BAT)", pair: "BAT_USDT" },
  { symbol: "ZRX", label: "0x Protocol (ZRX)", pair: "ZRX_USD" },
  { symbol: "CTSI", label: "Cartesi (CTSI)", pair: "CTSI_USDT" },
  { symbol: "API3", label: "API3 (API3)", pair: "API3_USD" },
  { symbol: "BAND", label: "Band Protocol (BAND)", pair: "BAND_USD" },
  { symbol: "RSR", label: "Reserve Rights (RSR)", pair: "RSR_USDT" },
  { symbol: "C98", label: "Coin98 (C98)", pair: "C98_USD" },
  { symbol: "ALICE", label: "MyNeighborAlice (ALICE)", pair: "ALICE_USD" },
  { symbol: "STX", label: "Stacks (STX)", pair: "STX_USDT" },
  { symbol: "TAO", label: "Bittensor (TAO)", pair: "TAO_USD" },
  { symbol: "JTO", label: "Jito (JTO)", pair: "JTO_USD" },
  { symbol: "W", label: "Wormhole (W)", pair: "W_USD" },
  { symbol: "ETHFI", label: "Ether.fi (ETHFI)", pair: "ETHFI_USD" },
  { symbol: "LPT", label: "Livepeer (LPT)", pair: "LPT_USDT" },
  { symbol: "ARKM", label: "Arkham (ARKM)", pair: "ARKM_USD" },
  { symbol: "PENDLE", label: "Pendle (PENDLE)", pair: "PENDLE_USDT" },
  { symbol: "WOO", label: "WOO Network (WOO)", pair: "WOO_USD" },
  { symbol: "JUP", label: "Jupiter (JUP)", pair: "JUP_USDT" },
  { symbol: "PYTH", label: "Pyth Network (PYTH)", pair: "PYTH_USDT" },
  { symbol: "STRK", label: "Starknet (STRK)", pair: "STRK_USDT" },
  { symbol: "JOE", label: "JOE (JOE)", pair: "JOE_USD" },
  { symbol: "ZK", label: "ZKsync (ZK)", pair: "ZK_USDT" },
  { symbol: "STG", label: "Stargate Finance (STG)", pair: "STG_USD" },
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
