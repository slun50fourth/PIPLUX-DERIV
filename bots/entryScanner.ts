/**
 * entryScanner.ts
 * Entry Scanner engine — clean-room TypeScript port of the `n4` React component
 * reverse-engineered from dbtraders.com (async chunk 585).
 *
 * What it does
 * ────────────
 *  1. Fetches historical tick data for every Deriv synthetic (random_index) market.
 *  2. Backtests four strategy profiles across all 10 entry digits (0-9).
 *  3. Selects the best market / digit / profile using a composite quality score.
 *  4. Builds a ready-to-inject Deriv DBot Blockly XML document.
 *
 * Quality score formula (same weights as the original):
 *   score = 0.50×WilsonLB + 0.25×RecentWinRate + 0.15×Stability + 0.10×SamplePenalty
 *
 * Minimum acceptance thresholds:
 *   sampleSize   ≥ 18
 *   recentSample ≥ 8
 *   validationWR ≥ 0.45
 */

// #![forbid(unsafe_code)] - clean TypeScript without unsafe casts

import type {
  DerivApiClient,
  DerivTick,
  ScanProfile,
  BacktestMetrics,
  ScanResult,
  ScanConfig,
} from './aiScannerTypes';

// ---------------------------------------------------------------------------
// Constants — mirroring nW[] from dbtraders.com source
// ---------------------------------------------------------------------------

/** The four strategy profiles the scanner evaluates per market. */
export const SCAN_PROFILES: ScanProfile[] = [
  {
    id: 'over_1_over_4',
    label: 'Over 1  →  Recovery Over 4',
    contractType: 'DIGITOVER',
    initialPrediction: 1,
    recoveryPrediction: 4,
  },
  {
    id: 'over_2_over_4',
    label: 'Over 2  →  Recovery Over 4',
    contractType: 'DIGITOVER',
    initialPrediction: 2,
    recoveryPrediction: 4,
  },
  {
    id: 'under_8_under_5',
    label: 'Under 8  →  Recovery Under 5',
    contractType: 'DIGITUNDER',
    initialPrediction: 8,
    recoveryPrediction: 5,
  },
  {
    id: 'under_7_under_5',
    label: 'Under 7  →  Recovery Under 5',
    contractType: 'DIGITUNDER',
    initialPrediction: 7,
    recoveryPrediction: 5,
  },
];

/** Synthetic markets scanned (Deriv random_index group). */
export const SCAN_MARKETS: Array<{ symbol: string; submarket: string }> = [
  { symbol: 'R_10',   submarket: 'random_index' },
  { symbol: 'R_25',   submarket: 'random_index' },
  { symbol: 'R_50',   submarket: 'random_index' },
  { symbol: 'R_75',   submarket: 'random_index' },
  { symbol: 'R_100',  submarket: 'random_index' },
  { symbol: '1HZ10V', submarket: 'random_index' },
  { symbol: '1HZ25V', submarket: 'random_index' },
  { symbol: '1HZ50V', submarket: 'random_index' },
  { symbol: '1HZ75V', submarket: 'random_index' },
  { symbol: '1HZ100V',submarket: 'random_index' },
];

/** Default scan configuration (mirrors n3 sanitiser defaults). */
export const DEFAULT_SCAN_CONFIG: Required<ScanConfig> = {
  tickCount:    500,
  stake:        0.50,
  martingale:   2,
  numberOfWins: 5,
  stopLoss:     50,
  useMartingale: true,
};

// ---------------------------------------------------------------------------
// Minimum thresholds
// ---------------------------------------------------------------------------
const MIN_SAMPLE        = 18;
const MIN_RECENT_SAMPLE = 8;
const MIN_WIN_RATE      = 0.45;
const RECENT_WINDOW     = 30;   // ticks used for recent win-rate
const STABILITY_WINDOW  = 5;    // chunk size for stability calculation

// ---------------------------------------------------------------------------
// Tick parsing helpers (mirrors nY / nK / nJ / nO)
// ---------------------------------------------------------------------------

/**
 * Parse a raw price value to a finite number, or null on failure.
 * Mirrors: `nY`
 */
export function parsePrice(raw: string | number): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Determine pip size (decimal places) from a price string.
 * Clamped to [0, 5].  Mirrors: `nK`
 */
export function getPipSize(price: string | number): number {
  const s = price.toString();
  if (!s.includes('.')) return 2;
  const decimals = s.split('.')[1]?.length ?? 2;
  return Math.min(Math.max(decimals, 0), 5);
}

/**
 * Extract the last digit of a price given its pip size.
 * Mirrors: `nJ`
 */
export function extractLastDigit(price: number, pipSize: number): number | null {
  const fixed = price.toFixed(pipSize);
  const ch = fixed[fixed.length - 1];
  const d = Number(ch);
  return Number.isInteger(d) ? d : null;
}

// ---------------------------------------------------------------------------
// Win-condition check (mirrors nL)
// ---------------------------------------------------------------------------

/**
 * Returns true if `digit` satisfies the contract win condition.
 */
export function checkWin(
  digit: number,
  contractType: 'DIGITOVER' | 'DIGITUNDER',
  barrier: number
): boolean {
  switch (contractType) {
    case 'DIGITOVER':  return digit > barrier;
    case 'DIGITUNDER': return digit < barrier;
  }
}

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

/**
 * Wilson score lower bound (one-sided, z = 1.64 ≈ 90 % CI).
 * Returns 0 when total = 0.
 * Mirrors: `n0`
 */
export function wilsonLowerBound(wins: number, total: number, z = 1.64): number {
  if (total === 0) return 0;
  const p = wins / total;
  const z2 = z * z;
  return (p + z2 / (2 * total) - z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) /
         (1 + z2 / total);
}

/**
 * Chunk-based win-rate stability.
 * Splits ticks into chunks of `chunkSize`, computes per-chunk win-rate,
 * then returns 1 − normalised standard deviation (higher = more stable).
 */
function computeStability(winFlags: boolean[], chunkSize = STABILITY_WINDOW): number {
  if (winFlags.length < chunkSize) return 0;
  const chunks: number[] = [];
  for (let i = 0; i + chunkSize <= winFlags.length; i += chunkSize) {
    const slice = winFlags.slice(i, i + chunkSize);
    chunks.push(slice.filter(Boolean).length / chunkSize);
  }
  if (chunks.length < 2) return chunks[0] ?? 0;
  const mean = chunks.reduce((s, v) => s + v, 0) / chunks.length;
  const variance = chunks.reduce((s, v) => s + (v - mean) ** 2, 0) / chunks.length;
  return Math.max(0, 1 - Math.sqrt(variance));
}

// ---------------------------------------------------------------------------
// Backtest a single profile against one market's tick history
// Mirrors: n1 (quality scoring) and nP (core backtest)
// ---------------------------------------------------------------------------

/**
 * Back-tests a profile for a given entry digit against tick data.
 * Returns null when acceptance thresholds are not met.
 */
export function backtestProfile(
  ticks: DerivTick[],
  profile: ScanProfile,
  entryDigit: number
): BacktestMetrics | null {
  if (ticks.length < MIN_SAMPLE) return null;

  // Determine pip size from the first tick
  const firstPrice = parsePrice(ticks[0].quote);
  if (firstPrice === null) return null;
  const pipSize = getPipSize(ticks[0].quote);

  // Build sequence of (lastDigit, isEntry, won) tuples
  // In Deriv 1-tick digit contracts, entry occurs on tick i when digit === entryDigit,
  // and the contract resolves on tick i + 1.
  const entries: boolean[] = [];

  for (let i = 0; i < ticks.length - 1; i++) {
    const tick = ticks[i];
    const price = parsePrice(tick.quote);
    if (price === null) continue;
    const digit = extractLastDigit(price, pipSize);
    if (digit === null) continue;
    if (digit !== entryDigit) continue;

    // This tick triggered an entry — check if the exit tick (i + 1) satisfied the contract
    const nextTick = ticks[i + 1];
    const nextPrice = parsePrice(nextTick.quote);
    if (nextPrice === null) continue;
    const nextDigit = extractLastDigit(nextPrice, pipSize);
    if (nextDigit === null) continue;

    entries.push(checkWin(nextDigit, profile.contractType, profile.initialPrediction));
  }

  if (entries.length < MIN_SAMPLE) return null;

  const wins  = entries.filter(Boolean).length;
  const total = entries.length;
  const winRate = wins / total;
  if (winRate < MIN_WIN_RATE) return null;

  // Recent window
  const recentSlice  = entries.slice(-RECENT_WINDOW);
  if (recentSlice.length < MIN_RECENT_SAMPLE) return null;
  const recentWins   = recentSlice.filter(Boolean).length;
  const recentWinRate = recentWins / recentSlice.length;

  // Statistical metrics
  const wilsonLB    = wilsonLowerBound(wins, total);
  const stability   = computeStability(entries);
  const samplePenalty = Math.min(1, total / MIN_SAMPLE);   // saturates at 1 when total ≥ MIN_SAMPLE

  // Composite quality score (same weights as original)
  const qualityScore =
    0.50 * wilsonLB +
    0.25 * recentWinRate +
    0.15 * stability +
    0.10 * samplePenalty;

  return {
    wins,
    total,
    wilsonLB,
    recentWinRate,
    stability,
    samplePenalty,
    qualityScore,
  };
}

// ---------------------------------------------------------------------------
// Market scanner
// ---------------------------------------------------------------------------

/**
 * Fetches tick history for one market and back-tests all profiles × all digits.
 * Returns the best result for that market, or null if no profile passes.
 */
export async function scanMarket(
  api: DerivApiClient,
  symbol: string,
  submarket: string,
  tickCount: number,
  profiles: ScanProfile[]
): Promise<ScanResult | null> {
  // Fetch historical ticks via Deriv WebSocket
  let response: { history?: { prices?: (string | number)[]; times?: number[] } };
  try {
    response = await api.send<typeof response>({
      ticks_history: symbol,
      count: tickCount,
      end: 'latest',
      style: 'ticks',
    });
  } catch {
    return null;
  }

  const prices = response?.history?.prices;
  const times  = response?.history?.times;
  if (!Array.isArray(prices) || prices.length === 0) return null;

  const ticks: DerivTick[] = prices.map((q, i) => ({
    quote: q,
    epoch: times?.[i] ?? 0,
  }));

  let best: ScanResult | null = null;

  for (const profile of profiles) {
    for (let digit = 0; digit <= 9; digit++) {
      const metrics = backtestProfile(ticks, profile, digit);
      if (!metrics) continue;
      if (!best || metrics.qualityScore > best.metrics.qualityScore) {
        best = { symbol, submarket, profile, entryPointDigit: digit, metrics };
      }
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Top-level scan runner
// ---------------------------------------------------------------------------

/** Progress callback fired for each market that completes scanning. */
export type ScanProgressCallback = (
  completed: number,
  total: number,
  latest: ScanResult | null
) => void;

/**
 * Scans all synthetic markets and returns the single best result.
 * Runs markets in parallel (Promise.allSettled).
 */
export async function runEntryScan(
  api: DerivApiClient,
  config: ScanConfig = {},
  onProgress?: ScanProgressCallback
): Promise<ScanResult | null> {
  const tickCount = Math.min(5000, Math.max(100, config.tickCount ?? DEFAULT_SCAN_CONFIG.tickCount));
  const total = SCAN_MARKETS.length;
  let completed = 0;
  let globalBest: ScanResult | null = null;

  const results = await Promise.allSettled(
    SCAN_MARKETS.map(({ symbol, submarket }) =>
      scanMarket(api, symbol, submarket, tickCount, SCAN_PROFILES).then(result => {
        completed++;
        if (result && (!globalBest || result.metrics.qualityScore > globalBest.metrics.qualityScore)) {
          globalBest = result;
        }
        onProgress?.(completed, total, result);
        return result;
      })
    )
  );

  // Consolidate best across all settled promises
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      if (!globalBest || r.value.metrics.qualityScore > globalBest.metrics.qualityScore) {
        globalBest = r.value;
      }
    }
  }

  return globalBest;
}

// ---------------------------------------------------------------------------
// Blockly XML builder  (mirrors n2 / n5 / n8 helpers)
// ---------------------------------------------------------------------------

/**
 * Set a numeric variable value inside a Deriv DBot Blockly XML document.
 * Mirrors: `n2`
 */
function patchNumericVar(doc: Document, varName: string, value: number): void {
  const blocks = doc.querySelectorAll('block[type="variables_set"]');
  for (const block of Array.from(blocks)) {
    const field = Array.from(block.querySelectorAll('field')).find(
      f => f.getAttribute('name') === 'VAR' && f.textContent?.trim() === varName
    );
    if (!field) continue;
    const numField = block.querySelector('value[name="VALUE"] field[name="NUM"]');
    if (numField) numField.textContent = String(value);
  }
}

/**
 * Set a boolean variable value inside a Deriv DBot Blockly XML document.
 * Mirrors: `n5`
 */
function patchBoolVar(doc: Document, varName: string, value: boolean): void {
  const blocks = doc.querySelectorAll('block[type="variables_set"]');
  for (const block of Array.from(blocks)) {
    const field = Array.from(block.querySelectorAll('field')).find(
      f => f.getAttribute('name') === 'VAR' && f.textContent?.trim() === varName
    );
    if (!field) continue;
    const boolField = block.querySelector('value[name="VALUE"] field[name="BOOL"]');
    if (boolField) boolField.textContent = value ? 'TRUE' : 'FALSE';
  }
}

/**
 * Set all `field[name=fieldName]` text nodes in the XML document.
 */
function patchField(doc: Document, fieldName: string, value: string): void {
  doc.querySelectorAll(`field[name="${fieldName}"]`).forEach(el => {
    el.textContent = value;
  });
}

/**
 * Build the final injectable Blockly XML from a template string and scan result.
 * Mirrors: `n8`
 *
 * @param xmlTemplate  Raw XML string of the DBot bot template
 * @param result       Best scan result
 * @param config       Sanitised scan config
 * @returns            Serialised XML string ready for Blockly injection
 */
export function buildBotXml(
  xmlTemplate: string,
  result: ScanResult,
  config: Required<ScanConfig>
): string {
  const parser     = new DOMParser();
  const serializer = new XMLSerializer();
  const doc        = parser.parseFromString(xmlTemplate, 'text/xml');

  // Market / contract fields
  patchField(doc, 'MARKET_LIST',    'synthetic_index');
  patchField(doc, 'SUBMARKET_LIST', result.submarket);
  patchField(doc, 'SYMBOL_LIST',    result.symbol);
  patchField(doc, 'TYPE_LIST',      result.profile.contractType);
  patchField(doc, 'PURCHASE_LIST',  result.profile.contractType);

  // Numeric variables
  patchNumericVar(doc, 'Initial Prediction',  result.profile.initialPrediction);
  patchNumericVar(doc, 'Recovery Prediction', result.profile.recoveryPrediction);
  patchNumericVar(doc, 'Entry Point Digit',   result.entryPointDigit);
  patchNumericVar(doc, 'Stake',               config.stake);
  patchNumericVar(doc, 'Martangle',           config.martingale);
  patchNumericVar(doc, 'Number of Wins',      config.numberOfWins);
  patchNumericVar(doc, 'Stop Loss',           config.stopLoss);

  // Boolean variables
  patchBoolVar(doc, 'Use Martingale', config.useMartingale);

  return serializer.serializeToString(doc);
}

/**
 * Sanitise and clamp a raw ScanConfig to safe bounds.
 * Mirrors: `n3`
 */
export function sanitiseConfig(raw: ScanConfig): Required<ScanConfig> {
  return {
    tickCount:    Math.min(5000, Math.max(100,  raw.tickCount    ?? DEFAULT_SCAN_CONFIG.tickCount)),
    stake:        Math.max(0.35,               raw.stake        ?? DEFAULT_SCAN_CONFIG.stake),
    martingale:   Math.max(1,                  raw.martingale   ?? DEFAULT_SCAN_CONFIG.martingale),
    numberOfWins: Math.max(1, Math.floor(      raw.numberOfWins ?? DEFAULT_SCAN_CONFIG.numberOfWins)),
    stopLoss:     Math.max(1, Math.floor(      raw.stopLoss     ?? DEFAULT_SCAN_CONFIG.stopLoss)),
    useMartingale:                             raw.useMartingale ?? DEFAULT_SCAN_CONFIG.useMartingale,
  };
}

/**
 * Inject the generated XML into the Deriv DBot Blockly workspace (browser only).
 * Requires `window.Blockly` to be present on the page.
 */
export function injectXmlIntoBlockly(xmlString: string): void {
  const w = window as Window & {
    Blockly?: {
      Xml: {
        textToDom: (xml: string) => Element;
        clearWorkspaceAndLoadFromXml: (dom: Element, ws: unknown) => void;
      };
      getMainWorkspace: () => unknown;
    };
    Deriv?: { run_panel?: { run_button?: { click?: () => void } } };
  };

  if (!w.Blockly) throw new Error('Blockly is not loaded on this page.');
  const dom = w.Blockly.Xml.textToDom(xmlString);
  w.Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, w.Blockly.getMainWorkspace());

  // Auto-start the bot if run panel is available
  w.Deriv?.run_panel?.run_button?.click?.();
}
