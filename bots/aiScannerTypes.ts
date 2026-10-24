/**
 * aiScannerTypes.ts
 * Shared TypeScript interfaces for the Entry Scanner and Pro AI engines.
 * Clean-room implementation based on reverse-engineering of the dbtraders.com
 * AI module (async chunk 585). No minified source copied.
 */

// ---------------------------------------------------------------------------
// Shared tick / price helpers
// ---------------------------------------------------------------------------

/** A single historical or live tick returned by Deriv WebSocket. */
export interface DerivTick {
  /** Raw price string as returned by the API (e.g. "1234.567") */
  quote: string | number;
  /** Unix epoch (seconds) */
  epoch: number;
}

/** Result of parsing a tick's last digit. */
export interface ParsedTick {
  price: number;
  lastDigit: number;
  pipSize: number;
}

// ---------------------------------------------------------------------------
// Entry Scanner types
// ---------------------------------------------------------------------------

/**
 * A strategy profile tested by the Entry Scanner.
 * Each profile combines a primary contract type + barrier with a
 * recovery contract type + barrier.
 */
export interface ScanProfile {
  /** Unique profile identifier */
  id: string;
  /** Human-readable label */
  label: string;
  /** Primary contract type e.g. "DIGITOVER" | "DIGITUNDER" */
  contractType: 'DIGITOVER' | 'DIGITUNDER';
  /** Primary barrier digit (inclusive edge) */
  initialPrediction: number;
  /** Recovery barrier digit */
  recoveryPrediction: number;
}

/** Per-market, per-profile backtest metrics */
export interface BacktestMetrics {
  wins: number;
  total: number;
  /** Wilson lower-bound win rate (90 % CI) */
  wilsonLB: number;
  /** Win rate over the most-recent window */
  recentWinRate: number;
  /** Standard-deviation-based stability score (0-1) */
  stability: number;
  /** Sample-size penalty factor (0-1, reaches 1 at ≥18 ticks) */
  samplePenalty: number;
  /** Combined quality score 0-1 */
  qualityScore: number;
}

/** The best result found by the Entry Scanner across all markets. */
export interface ScanResult {
  symbol: string;
  /** Deriv submarket group e.g. "random_index" */
  submarket: string;
  profile: ScanProfile;
  /** Digit (0-9) that triggers contract entry */
  entryPointDigit: number;
  metrics: BacktestMetrics;
}

/** User-facing configuration for the Entry Scanner. */
export interface ScanConfig {
  /** Number of historical ticks to fetch per market (100 – 5000) */
  tickCount?: number;
  /** Base stake per trade (USD, min 0.35) */
  stake?: number;
  /** Martingale multiplier on loss */
  martingale?: number;
  /** Number of consecutive wins before resetting multiplier */
  numberOfWins?: number;
  /** Session stop-loss in USD */
  stopLoss?: number;
  /** Use martingale recovery (true/false) */
  useMartingale?: boolean;
}

// ---------------------------------------------------------------------------
// Pro AI types
// ---------------------------------------------------------------------------

/** A primary or recovery contract specification used by Pro AI. */
export interface ContractSpec {
  /** Deriv contract type */
  type: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';
  /** Barrier digit – only relevant for DIGITOVER / DIGITUNDER */
  barrier?: number;
  /** Human-readable label */
  label: string;
}

/** A tested primary + recovery pair with edge scoring. */
export interface ProAiSetup {
  symbol: string;
  submarket: 'random_index' | 'jump_index';
  primary: ContractSpec;
  recovery: ContractSpec;
  /** Entry digit (0-9) that triggers the primary contract */
  entryDigit: number;
  pipSize: number;
  /** Combined edge score (higher = better) */
  edgeScore: number;
}

/** User-facing configuration for a Pro AI trading session. */
export interface ProAiConfig {
  /** Base stake (USD, default 0.50) */
  stake?: number;
  /** Recovery stake multiplier on primary loss (default 2) */
  multiplier?: number;
  /** Session take-profit target in USD (default 5) */
  takeProfit?: number;
  /** Session stop-loss limit in USD (default 10) */
  stopLoss?: number;
  /** Live-tick look-back window for edge scoring (default 100) */
  ticks?: number;
}

/** Callbacks provided by the UI layer to receive Pro AI events. */
export interface ProAiCallbacks {
  onScanComplete?: (setup: ProAiSetup) => void;
  onEntry?: (digit: number) => void;
  onTradeResult?: (won: boolean, profit: number, balance: number) => void;
  onRecovery?: (spec: ContractSpec, stake: number) => void;
  onSessionEnd?: (reason: 'takeProfit' | 'stopLoss' | 'stopped' | 'error', pnl: number) => void;
  onError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Deriv WebSocket API minimal surface (used by both engines)
// ---------------------------------------------------------------------------

/** Minimal Deriv WebSocket send/subscribe interface consumed by the engines.
 *  In the PIPLUX-DERIV monorepo this is satisfied by packages/api-v2. */
export interface DerivApiClient {
  send<T = unknown>(request: Record<string, unknown>): Promise<T>;
  subscribe<T = unknown>(
    request: Record<string, unknown>,
    onMessage: (msg: T) => void
  ): { unsubscribe: () => void };
}
