/** A ticker symbol, e.g. "BTC". The tradable set is a fixed list — see SUPPORTED_SYMBOLS below. */
export type Symbol = string;

export interface SymbolInfo {
  symbol: Symbol;
  label: string;
  /** Trading pair as used by most exchange APIs, e.g. BTC_USDT */
  pair: string;
  /** CoinGecko's own coin id (its `/coins/{id}` slug), for fetching live fundamental data. */
  coingeckoId: string;
}

/**
 * The full, fixed set of coins the app covers — a specific list, not a
 * dynamically ranked "top N by volume". /api/symbols serves this list as-is;
 * every other page (dashboard's coin picker, trade history, opportunities
 * scan) is built on top of it.
 */
export const SUPPORTED_SYMBOLS: SymbolInfo[] = [
  { symbol: "BTC", label: "Bitcoin (BTC)", pair: "BTC_USDT", coingeckoId: "bitcoin" },
  { symbol: "ETH", label: "Ethereum (ETH)", pair: "ETH_USDT", coingeckoId: "ethereum" },
  { symbol: "SOL", label: "Solana (SOL)", pair: "SOL_USDT", coingeckoId: "solana" },
  { symbol: "XRP", label: "XRP (XRP)", pair: "XRP_USDT", coingeckoId: "ripple" },
  { symbol: "ADA", label: "Cardano (ADA)", pair: "ADA_USDT", coingeckoId: "cardano" },
  { symbol: "AVAX", label: "Avalanche (AVAX)", pair: "AVAX_USDT", coingeckoId: "avalanche-2" },
  { symbol: "LINK", label: "Chainlink (LINK)", pair: "LINK_USDT", coingeckoId: "chainlink" },
  { symbol: "DOT", label: "Polkadot (DOT)", pair: "DOT_USDT", coingeckoId: "polkadot" },
  { symbol: "NEAR", label: "NEAR Protocol (NEAR)", pair: "NEAR_USDT", coingeckoId: "near" },
  { symbol: "APT", label: "Aptos (APT)", pair: "APT_USDT", coingeckoId: "aptos" },
  { symbol: "ARB", label: "Arbitrum (ARB)", pair: "ARB_USDT", coingeckoId: "arbitrum" },
  { symbol: "OP", label: "Optimism (OP)", pair: "OP_USDT", coingeckoId: "optimism" },
  { symbol: "ATOM", label: "Cosmos (ATOM)", pair: "ATOM_USDT", coingeckoId: "cosmos" },
  { symbol: "SUI", label: "Sui (SUI)", pair: "SUI_USDT", coingeckoId: "sui" },
  { symbol: "SEI", label: "Sei (SEI)", pair: "SEI_USDT", coingeckoId: "sei-network" },
  { symbol: "TIA", label: "Celestia (TIA)", pair: "TIA_USDT", coingeckoId: "celestia" },
  { symbol: "INJ", label: "Injective (INJ)", pair: "INJ_USDT", coingeckoId: "injective-protocol" },
  { symbol: "ICP", label: "Internet Computer (ICP)", pair: "ICP_USDT", coingeckoId: "internet-computer" },
  { symbol: "ETC", label: "Ethereum Classic (ETC)", pair: "ETC_USDT", coingeckoId: "ethereum-classic" },
  { symbol: "ALGO", label: "Algorand (ALGO)", pair: "ALGO_USDT", coingeckoId: "algorand" },
  { symbol: "EGLD", label: "MultiversX (EGLD)", pair: "EGLD_USDT", coingeckoId: "elrond-erd-2" },
  { symbol: "UNI", label: "Uniswap (UNI)", pair: "UNI_USDT", coingeckoId: "uniswap" },
  { symbol: "LDO", label: "Lido DAO (LDO)", pair: "LDO_USDT", coingeckoId: "lido-dao" },
  { symbol: "CRV", label: "Curve DAO (CRV)", pair: "CRV_USDT", coingeckoId: "curve-dao-token" },
  { symbol: "SNX", label: "Synthetix (SNX)", pair: "SNX_USDT", coingeckoId: "havven" },
  { symbol: "GMX", label: "GMX (GMX)", pair: "GMX_USD", coingeckoId: "gmx" },
  { symbol: "COMP", label: "Compound (COMP)", pair: "COMP_USDT", coingeckoId: "compound-governance-token" },
  { symbol: "1INCH", label: "1inch (1INCH)", pair: "1INCH_USDT", coingeckoId: "1inch" },
  { symbol: "FET", label: "Fetch.ai (FET)", pair: "FET_USDT", coingeckoId: "fetch-ai" },
  { symbol: "RENDER", label: "Render (RENDER)", pair: "RENDER_USDT", coingeckoId: "render-token" },
  { symbol: "WLD", label: "Worldcoin (WLD)", pair: "WLD_USDT", coingeckoId: "worldcoin-wld" },
  { symbol: "GRT", label: "The Graph (GRT)", pair: "GRT_USDT", coingeckoId: "the-graph" },
  { symbol: "ONDO", label: "Ondo (ONDO)", pair: "ONDO_USDT", coingeckoId: "ondo-finance" },
  { symbol: "SAND", label: "The Sandbox (SAND)", pair: "SAND_USDT", coingeckoId: "the-sandbox" },
  { symbol: "MANA", label: "Decentraland (MANA)", pair: "MANA_USD", coingeckoId: "decentraland" },
  { symbol: "AXS", label: "Axie Infinity (AXS)", pair: "AXS_USDT", coingeckoId: "axie-infinity" },
  // Polygon rebranded MATIC to POL — the exchange only lists the new ticker.
  { symbol: "POL", label: "Polygon (POL)", pair: "POL_USDT", coingeckoId: "polygon-ecosystem-token" },
  { symbol: "XLM", label: "Stellar (XLM)", pair: "XLM_USDT", coingeckoId: "stellar" },
  { symbol: "VET", label: "VeChain (VET)", pair: "VET_USDT", coingeckoId: "vechain" },
  { symbol: "THETA", label: "Theta Network (THETA)", pair: "THETA_USDT", coingeckoId: "theta-token" },
  { symbol: "FLOW", label: "Flow (FLOW)", pair: "FLOW_USDT", coingeckoId: "flow" },
  { symbol: "CHZ", label: "Chiliz (CHZ)", pair: "CHZ_USDT", coingeckoId: "chiliz" },
  { symbol: "ENJ", label: "Enjin Coin (ENJ)", pair: "ENJ_USDT", coingeckoId: "enjincoin" },
  { symbol: "MASK", label: "Mask Network (MASK)", pair: "MASK_USDT", coingeckoId: "mask-network" },
  { symbol: "BLUR", label: "Blur (BLUR)", pair: "BLUR_USD", coingeckoId: "blur" },
  { symbol: "RUNE", label: "THORChain (RUNE)", pair: "RUNE_USDT", coingeckoId: "thorchain" },
  { symbol: "KAVA", label: "Kava (KAVA)", pair: "KAVA_USDT", coingeckoId: "kava" },
  { symbol: "NEO", label: "NEO (NEO)", pair: "NEO_USDT", coingeckoId: "neo" },
  { symbol: "XTZ", label: "Tezos (XTZ)", pair: "XTZ_USDT", coingeckoId: "tezos" },
  { symbol: "QTUM", label: "Qtum (QTUM)", pair: "QTUM_USD", coingeckoId: "qtum" },
  { symbol: "ZIL", label: "Zilliqa (ZIL)", pair: "ZIL_USD", coingeckoId: "zilliqa" },
  { symbol: "ONE", label: "Harmony (ONE)", pair: "ONE_USDT", coingeckoId: "harmony" },
  { symbol: "ANKR", label: "Ankr (ANKR)", pair: "ANKR_USD", coingeckoId: "ankr" },
  { symbol: "BAT", label: "Basic Attention Token (BAT)", pair: "BAT_USDT", coingeckoId: "basic-attention-token" },
  { symbol: "ZRX", label: "0x Protocol (ZRX)", pair: "ZRX_USD", coingeckoId: "0x" },
  { symbol: "CTSI", label: "Cartesi (CTSI)", pair: "CTSI_USDT", coingeckoId: "cartesi" },
  { symbol: "API3", label: "API3 (API3)", pair: "API3_USD", coingeckoId: "api3" },
  { symbol: "BAND", label: "Band Protocol (BAND)", pair: "BAND_USD", coingeckoId: "band-protocol" },
  { symbol: "RSR", label: "Reserve Rights (RSR)", pair: "RSR_USDT", coingeckoId: "reserve-rights-token" },
  { symbol: "C98", label: "Coin98 (C98)", pair: "C98_USD", coingeckoId: "coin98" },
  { symbol: "ALICE", label: "MyNeighborAlice (ALICE)", pair: "ALICE_USD", coingeckoId: "my-neighbor-alice" },
  { symbol: "STX", label: "Stacks (STX)", pair: "STX_USDT", coingeckoId: "blockstack" },
  { symbol: "TAO", label: "Bittensor (TAO)", pair: "TAO_USD", coingeckoId: "bittensor" },
  { symbol: "JTO", label: "Jito (JTO)", pair: "JTO_USD", coingeckoId: "jito-governance-token" },
  { symbol: "W", label: "Wormhole (W)", pair: "W_USD", coingeckoId: "wormhole" },
  { symbol: "ETHFI", label: "Ether.fi (ETHFI)", pair: "ETHFI_USD", coingeckoId: "ether-fi" },
  { symbol: "LPT", label: "Livepeer (LPT)", pair: "LPT_USDT", coingeckoId: "livepeer" },
  { symbol: "ARKM", label: "Arkham (ARKM)", pair: "ARKM_USD", coingeckoId: "arkham" },
  { symbol: "PENDLE", label: "Pendle (PENDLE)", pair: "PENDLE_USDT", coingeckoId: "pendle" },
  { symbol: "WOO", label: "WOO Network (WOO)", pair: "WOO_USD", coingeckoId: "woo-network" },
  { symbol: "JUP", label: "Jupiter (JUP)", pair: "JUP_USDT", coingeckoId: "jupiter-exchange-solana" },
  { symbol: "PYTH", label: "Pyth Network (PYTH)", pair: "PYTH_USDT", coingeckoId: "pyth-network" },
  { symbol: "STRK", label: "Starknet (STRK)", pair: "STRK_USDT", coingeckoId: "starknet" },
  { symbol: "JOE", label: "JOE (JOE)", pair: "JOE_USD", coingeckoId: "joe" },
  { symbol: "ZK", label: "ZKsync (ZK)", pair: "ZK_USDT", coingeckoId: "zksync" },
  { symbol: "STG", label: "Stargate Finance (STG)", pair: "STG_USD", coingeckoId: "stargate-finance" },
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

/**
 * Timeframes new trade plans are suggested on — 15m excluded (2026-09-24):
 * across the full symbol list its real backtest win rate sat at ~43%
 * (158 losses vs. 120 wins), far below every other timeframe (77-87%),
 * so the site no longer proposes fresh entries there. This only gates
 * *new* signals: the chart, its candles and zones, and /history and
 * /track-record's own past 15m performance are untouched — a visitor can
 * still pick 15m to watch price action, and the real historical record
 * (wins and losses alike) stays visible rather than quietly disappearing.
 */
export const TRADE_SUGGESTION_TIMEFRAMES: Timeframe[] = TIMEFRAMES.filter((t) => t.value !== "15m").map(
  (t) => t.value
);

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "1d": 24 * 60 * 60,
};
