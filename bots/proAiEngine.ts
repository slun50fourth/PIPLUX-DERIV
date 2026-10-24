/**
 * proAiEngine.ts
 * Pro AI trading engine — clean-room TypeScript port of class `nV` / component `nX`
 * reverse-engineered from dbtraders.com (async chunk 585).
 *
 * How it works
 * ────────────
 *  1. Scans both random_index (Volatility) AND jump_index (Jump) synthetic markets.
 *  2. For every market it tests all 10 entry digits (0-9) against every
 *     PRIMARY × RECOVERY contract pair, scoring each combination.
 *  3. Selects the highest-scoring setup (symbol + entry digit + contracts).
 *  4. Opens a live tick stream and waits for the exact entry digit to appear.
 *  5. Places a 1-tick PRIMARY trade (e.g. DIGITOVER 2).
 *     - WIN  → counts consecutive wins; after 3 rescans markets.
 *     - LOSS → switches to the RECOVERY contract at stake × multiplier.
 *  6. Session ends when takeProfit or stopLoss is reached, or stop() is called.
 *
 * Edge score formula (per primary × recovery pair, per digit):
 *   edgeScore = 0.70×(wilsonLB − d) + 0.30×(recentWinRate − d)
 *   where d = theoretical random win probability for the contract type.
 */

import type {
  DerivApiClient,
  DerivTick,
  ContractSpec,
  ProAiSetup,
  ProAiConfig,
  ProAiCallbacks,
} from './aiScannerTypes';
import { parsePrice, getPipSize, extractLastDigit, wilsonLowerBound } from './entryScanner';

// ---------------------------------------------------------------------------
// Contract pools — mirrors nD (primary) and nM (recovery) constants
// ---------------------------------------------------------------------------

/** Primary contracts used in initial trade. */
export const PRIMARY_CONTRACTS: ContractSpec[] = [
  { type: 'DIGITOVER',  barrier: 2, label: 'Over 2'  },
  { type: 'DIGITUNDER', barrier: 8, label: 'Under 8' },
];

/** Recovery contracts used after a primary loss. */
export const RECOVERY_CONTRACTS: ContractSpec[] = [
  { type: 'DIGITOVER',  barrier: 4, label: 'Over 4'  },
  { type: 'DIGITUNDER', barrier: 5, label: 'Under 5' },
  { type: 'DIGITEVEN',  label: 'Even' },
  { type: 'DIGITODD',   label: 'Odd'  },
];

/** Markets scanned by Pro AI (Volatility + Jump indices). */
export const PRO_AI_MARKETS: Array<{ symbol: string; submarket: 'random_index' | 'jump_index' }> = [
  // Volatility indices
  { symbol: 'R_10',    submarket: 'random_index' },
  { symbol: 'R_25',    submarket: 'random_index' },
  { symbol: 'R_50',    submarket: 'random_index' },
  { symbol: 'R_75',    submarket: 'random_index' },
  { symbol: 'R_100',   submarket: 'random_index' },
  { symbol: '1HZ10V',  submarket: 'random_index' },
  { symbol: '1HZ25V',  submarket: 'random_index' },
  { symbol: '1HZ50V',  submarket: 'random_index' },
  { symbol: '1HZ75V',  submarket: 'random_index' },
  { symbol: '1HZ100V', submarket: 'random_index' },
  // Jump indices
  { symbol: 'JD10',  submarket: 'jump_index' },
  { symbol: 'JD25',  submarket: 'jump_index' },
  { symbol: 'JD50',  submarket: 'jump_index' },
  { symbol: 'JD75',  submarket: 'jump_index' },
  { symbol: 'JD100', submarket: 'jump_index' },
];

/** Default session config — mirrors `nq` constant in source. */
export const DEFAULT_PRO_AI_CONFIG: Required<ProAiConfig> = {
  stake:      0.50,
  multiplier: 2,
  takeProfit: 5,
  stopLoss:   10,
  ticks:      100,
};

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

/** Theoretical random win probability for a contract type. */
function randomEdge(spec: ContractSpec): number {
  switch (spec.type) {
    case 'DIGITOVER':
      return spec.barrier !== undefined ? (9 - spec.barrier) / 10 : 0.5;
    case 'DIGITUNDER':
      return spec.barrier !== undefined ? spec.barrier / 10 : 0.5;
    case 'DIGITEVEN':
    case 'DIGITODD':
      return 0.5;
  }
}

/** Check if a last digit wins under a contract spec. */
function digitWins(digit: number, spec: ContractSpec): boolean {
  switch (spec.type) {
    case 'DIGITOVER':  return digit > (spec.barrier ?? 5);
    case 'DIGITUNDER': return digit < (spec.barrier ?? 5);
    case 'DIGITEVEN':  return digit % 2 === 0;
    case 'DIGITODD':   return digit % 2 === 1;
  }
}

// ---------------------------------------------------------------------------
// Per-market, per-pair scoring  (mirrors nP)
// ---------------------------------------------------------------------------

/**
 * Back-tests a primary × recovery pair for a given entry digit.
 * Returns the edge score, or null if insufficient data.
 *
 * Edge score = 0.70×(wilsonLB − d_primary) + 0.30×(recentWinRate − d_recovery)
 *
 * Uses the last 100 live ticks for scoring (configurable via `tickWindow`).
 */
export function scoreSetup(
  ticks: DerivTick[],
  primary: ContractSpec,
  recovery: ContractSpec,
  entryDigit: number,
  pipSize: number,
  tickWindow = 100,
): number | null {
  const window = ticks.slice(-tickWindow);
  if (window.length < 10) return null;

  const primaryWins: boolean[]  = [];
  const recoveryWins: boolean[] = [];

  for (const tick of window) {
    const price = parsePrice(tick.quote);
    if (price === null) continue;
    const digit = extractLastDigit(price, pipSize);
    if (digit === null) continue;
    if (digit !== entryDigit) continue;

    primaryWins.push(digitWins(digit, primary));
    recoveryWins.push(digitWins(digit, recovery));
  }

  if (primaryWins.length < 5) return null;

  const pWins   = primaryWins.filter(Boolean).length;
  const pTotal  = primaryWins.length;
  const rWins   = recoveryWins.filter(Boolean).length;
  const rTotal  = recoveryWins.length;

  const wilsonLB      = wilsonLowerBound(pWins, pTotal);
  const recentWinRate = rTotal > 0 ? rWins / rTotal : 0;

  const dPrimary  = randomEdge(primary);
  const dRecovery = randomEdge(recovery);

  return 0.70 * (wilsonLB - dPrimary) + 0.30 * (recentWinRate - dRecovery);
}

// ---------------------------------------------------------------------------
// Market scanner
// ---------------------------------------------------------------------------

/**
 * Fetches tick history for one market and finds the best primary×recovery×digit.
 */
async function scanOneMarket(
  api: DerivApiClient,
  symbol: string,
  submarket: 'random_index' | 'jump_index',
  tickWindow: number,
): Promise<ProAiSetup | null> {
  let response: { history?: { prices?: (string | number)[]; times?: number[] } };
  try {
    response = await api.send<typeof response>({
      ticks_history: symbol,
      count: tickWindow,
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

  const firstPrice = parsePrice(ticks[0].quote);
  if (firstPrice === null) return null;
  const pipSize = getPipSize(ticks[0].quote);

  let bestScore  = -Infinity;
  let bestSetup: ProAiSetup | null = null;

  for (const primary of PRIMARY_CONTRACTS) {
    for (const recovery of RECOVERY_CONTRACTS) {
      for (let digit = 0; digit <= 9; digit++) {
        const score = scoreSetup(ticks, primary, recovery, digit, pipSize, tickWindow);
        if (score === null) continue;
        if (score > bestScore) {
          bestScore = score;
          bestSetup = { symbol, submarket, primary, recovery, entryDigit: digit, pipSize, edgeScore: score };
        }
      }
    }
  }

  return bestSetup;
}

// ---------------------------------------------------------------------------
// ProAiSession class  (mirrors class nV)
// ---------------------------------------------------------------------------

/** Thrown internally when the user calls stop() to abort the session. */
class SessionStopped extends Error {
  constructor() { super('Pro AI session stopped by user.'); }
}

/** Sentinel returned by waitForEntry when stop() is called mid-stream. */
const STOP_SIGNAL = Symbol('stop');

/**
 * Pro AI trading session.
 *
 * Usage:
 * ```ts
 * const session = new ProAiSession(api, callbacks);
 * await session.start({ stake: 0.5, multiplier: 2, takeProfit: 5, stopLoss: 10 });
 * // later:
 * session.stop();
 * ```
 */
export class ProAiSession {
  private stopped = false;
  private uncertain = false;   // true while a purchase is open / unresolved
  private wakes: Array<() => void> = [];

  constructor(
    private readonly api: DerivApiClient,
    private readonly callbacks: ProAiCallbacks = {},
  ) {}

  /** Whether a trade is currently open (prevents double-entry). */
  get hasUnresolvedPurchase(): boolean {
    return this.uncertain;
  }

  /** Gracefully stop the session. */
  stop(): void {
    this.stopped = true;
    for (const wake of this.wakes) wake();
  }

  // ── Internal guard ────────────────────────────────────────────────────────

  private guard(): void {
    if (this.stopped) throw new SessionStopped();
  }

  // ── Scan all markets ──────────────────────────────────────────────────────

  /**
   * Scans all Pro AI markets and returns the best-scoring setup.
   * Mirrors the scanning portion of nV.
   */
  async scan(tickWindow: number): Promise<ProAiSetup | null> {
    this.guard();

    const results = await Promise.allSettled(
      PRO_AI_MARKETS.map(({ symbol, submarket }) =>
        scanOneMarket(this.api, symbol, submarket, tickWindow)
      )
    );

    let best: ProAiSetup | null = null;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        if (!best || r.value.edgeScore > best.edgeScore) {
          best = r.value;
        }
      }
    }

    if (best) this.callbacks.onScanComplete?.(best);
    return best;
  }

  // ── Live tick stream ──────────────────────────────────────────────────────

  /**
   * Subscribes to a live tick stream and resolves with the first tick whose
   * last digit equals `entryDigit`.  Returns STOP_SIGNAL if stop() is called.
   */
  private waitForEntry(symbol: string, pipSize: number, entryDigit: number): Promise<typeof STOP_SIGNAL | DerivTick> {
    return new Promise(resolve => {
      if (this.stopped) { resolve(STOP_SIGNAL); return; }

      const wake = () => resolve(STOP_SIGNAL);
      this.wakes.push(wake);

      const sub = this.api.subscribe<{ tick?: { quote?: string | number; epoch?: number } }>(
        { ticks: symbol },
        msg => {
          if (this.stopped) { sub.unsubscribe(); resolve(STOP_SIGNAL); return; }
          const raw   = msg?.tick?.quote ?? (msg as any)?.quote;
          const epoch = msg?.tick?.epoch ?? 0;
          if (raw === undefined) return;
          const price = parsePrice(raw);
          if (price === null) return;
          const currentPipSize = (msg as any)?.tick?.pip_size ?? pipSize;
          const digit = extractLastDigit(price, currentPipSize);
          if (digit === null) return;

          // Notify live UI of current tick
          this.callbacks.onTick?.(digit, price);

          if (digit !== entryDigit) return;

          sub.unsubscribe();
          this.wakes = this.wakes.filter(w => w !== wake);
          this.callbacks.onEntry?.(digit);
          resolve({ quote: raw, epoch });
        }
      );
    });
  }

  // ── Trade execution ───────────────────────────────────────────────────────

  /**
   * Sends a 1-tick digit contract proposal + buy and waits for the open contract
   * to close.  Returns { won, profit }.
   */
  private async executeTrade(
    symbol: string,
    spec: ContractSpec,
    stake: number,
    currency: string,
  ): Promise<{ won: boolean; profit: number }> {
    this.guard();
    this.uncertain = true;

    try {
      // Build proposal parameters
      const params: Record<string, unknown> = {
        proposal: 1,
        amount: stake,
        basis: 'stake',
        contract_type: spec.type,
        currency,
        duration: 1,
        duration_unit: 't',
        symbol,
        underlying_symbol: symbol,
      };
      if (spec.barrier !== undefined) params.barrier = String(spec.barrier);

      const propResp = await this.api.send<{
        proposal?: { id?: string; ask_price?: number };
        error?: { message?: string };
      }>(params);

      if (propResp.error) throw new Error(propResp.error.message ?? 'Proposal failed');
      const proposalId = propResp.proposal?.id;
      if (!proposalId) throw new Error('No proposal ID returned');

      // Buy the contract
      const buyResp = await this.api.send<{
        buy?: { contract_id?: number };
        error?: { message?: string };
      }>({ buy: proposalId, price: stake });

      if (buyResp.error) throw new Error(buyResp.error.message ?? 'Buy failed');
      const contractId = buyResp.buy?.contract_id;
      if (!contractId) throw new Error('No contract ID returned');

      // Poll proposal_open_contract until settled
      const result = await this.pollContractResult(contractId);
      return result;
    } finally {
      this.uncertain = false;
    }
  }

  /**
   * Polls `proposal_open_contract` until the contract is no longer open.
   */
  private pollContractResult(contractId: number): Promise<{ won: boolean; profit: number }> {
    return new Promise((resolve, reject) => {
      if (this.stopped) { reject(new SessionStopped()); return; }

      let resolved = false;
      let timer: any = null;

      const finish = (won: boolean, profit: number) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        try { sub?.unsubscribe?.(); } catch {}
        resolve({ won, profit });
      };

      const fail = (err: Error) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        try { sub?.unsubscribe?.(); } catch {}
        reject(err);
      };

      const sub = this.api.subscribe<{
        proposal_open_contract?: {
          is_sold?: number;
          profit?: number;
          status?: string;
          is_expired?: number;
        };
        error?: { message?: string };
      }>(
        { proposal_open_contract: 1, contract_id: contractId, subscribe: 1 },
        msg => {
          if (msg?.error) {
            fail(new Error(msg.error.message || 'Contract settlement error'));
            return;
          }
          const poc = msg?.proposal_open_contract;
          if (!poc) return;
          if (poc.is_sold || poc.status === 'won' || poc.status === 'lost') {
            const won = poc.status === 'won' || Number(poc.profit ?? 0) > 0;
            const profit = Number(poc.profit ?? 0);
            finish(won, profit);
          }
        }
      );

      // Fallback timer: 20s max for 1-tick contract
      timer = setTimeout(async () => {
        if (resolved) return;
        try {
          const oneOff = await this.api.send<{
            proposal_open_contract?: { is_sold?: number; profit?: number; status?: string };
          }>({ proposal_open_contract: 1, contract_id: contractId });
          const poc = oneOff?.proposal_open_contract;
          if (poc && (poc.is_sold || poc.status === 'won' || poc.status === 'lost')) {
            finish(poc.status === 'won' || Number(poc.profit ?? 0) > 0, Number(poc.profit ?? 0));
            return;
          }
        } catch {}
        fail(new Error('Contract settlement timeout (20s)'));
      }, 20000);
    });
  }

  // ── Main trading loop ─────────────────────────────────────────────────────

  /**
   * Start a Pro AI trading session.
   *
   * @param config   Session configuration
   * @param currency Account currency (e.g. "USD")
   */
  async start(
    config: ProAiConfig = {},
    currency = 'USD',
    initialSetup?: ProAiSetup | null
  ): Promise<void> {
    const cfg: Required<ProAiConfig> = {
      stake:      Math.max(0.01, config.stake      ?? DEFAULT_PRO_AI_CONFIG.stake),
      multiplier: Math.max(1,    config.multiplier ?? DEFAULT_PRO_AI_CONFIG.multiplier),
      takeProfit: Math.max(0.01, config.takeProfit ?? DEFAULT_PRO_AI_CONFIG.takeProfit),
      stopLoss:   Math.max(0.01, config.stopLoss   ?? DEFAULT_PRO_AI_CONFIG.stopLoss),
      ticks:      Math.min(500,  Math.max(10, config.ticks ?? DEFAULT_PRO_AI_CONFIG.ticks)),
    };

    let sessionPnl  = 0;
    let winStreak   = 0;
    let currentStake = cfg.stake;

    try {
      // Use pre-scanned setup if available, otherwise scan
      let setup = initialSetup ?? (await this.scan(cfg.ticks));
      if (!setup) throw new Error('No suitable market found during initial scan.');

      while (!this.stopped) {
        // ── Wait for entry signal ──────────────────────────────────────────
        const entryResult = await this.waitForEntry(setup.symbol, setup.pipSize, setup.entryDigit);
        if (entryResult === STOP_SIGNAL) break;
        this.guard();

        // ── Primary trade ──────────────────────────────────────────────────
        const primaryResult = await this.executeTrade(setup.symbol, setup.primary, currentStake, currency);
        sessionPnl += primaryResult.profit;
        this.callbacks.onTradeResult?.(primaryResult.won, primaryResult.profit, sessionPnl);

        if (primaryResult.won) {
          winStreak++;
          currentStake = cfg.stake;   // reset to base stake

          // After 3 consecutive wins, rescan for best market
          if (winStreak >= 3) {
            winStreak = 0;
            const newSetup = await this.scan(cfg.ticks);
            if (newSetup) setup = newSetup;
          }
        } else {
          // ── Recovery trade ─────────────────────────────────────────────
          winStreak = 0;
          const recoveryStake = currentStake * cfg.multiplier;
          this.callbacks.onRecovery?.(setup.recovery, recoveryStake);

          const recoveryResult = await this.executeTrade(setup.symbol, setup.recovery, recoveryStake, currency);
          sessionPnl += recoveryResult.profit;
          this.callbacks.onTradeResult?.(recoveryResult.won, recoveryResult.profit, sessionPnl);

          // Always rescan after recovery attempt
          const newSetup = await this.scan(cfg.ticks);
          if (newSetup) setup = newSetup;

          // Reset stake for next primary cycle
          currentStake = cfg.stake;
        }

        // ── Session limit checks ───────────────────────────────────────────
        if (sessionPnl >= cfg.takeProfit) {
          this.callbacks.onSessionEnd?.('takeProfit', sessionPnl);
          return;
        }
        if (sessionPnl <= -cfg.stopLoss) {
          this.callbacks.onSessionEnd?.('stopLoss', sessionPnl);
          return;
        }
      }

      // Exited loop via stop()
      this.callbacks.onSessionEnd?.('stopped', sessionPnl);
    } catch (err) {
      if (err instanceof SessionStopped) {
        this.callbacks.onSessionEnd?.('stopped', sessionPnl);
        return;
      }
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      this.callbacks.onSessionEnd?.('error', sessionPnl);
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create and immediately start a Pro AI session.
 *
 * @returns The running session (call session.stop() to halt).
 */
export function startProAi(
  api: DerivApiClient,
  config: ProAiConfig,
  callbacks: ProAiCallbacks,
  currency = 'USD',
  initialSetup?: ProAiSetup | null
): ProAiSession {
  const session = new ProAiSession(api, callbacks);
  session.start(config, currency, initialSetup).catch(err => {
    callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
  });
  return session;
}
