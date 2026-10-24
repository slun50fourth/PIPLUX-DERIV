/**
 * entryScanner.ts
 * Clean-room TypeScript port of the reverse-engineered Entry Scanner engine.
 */

import { WS } from '@deriv/shared';
import type {
    DerivApiClient,
    DerivTick,
    ScanProfile,
    BacktestMetrics,
    ScanResult,
    ScanConfig,
} from './aiScannerTypes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SCAN_PROFILES: ScanProfile[] = [
    {
        id: 'over_1_over_4',
        label: 'Over 1 → Recovery Over 4',
        contractType: 'DIGITOVER',
        initialPrediction: 1,
        recoveryPrediction: 4,
    },
    {
        id: 'over_2_over_4',
        label: 'Over 2 → Recovery Over 4',
        contractType: 'DIGITOVER',
        initialPrediction: 2,
        recoveryPrediction: 4,
    },
    {
        id: 'under_8_under_5',
        label: 'Under 8 → Recovery Under 5',
        contractType: 'DIGITUNDER',
        initialPrediction: 8,
        recoveryPrediction: 5,
    },
    {
        id: 'under_7_under_5',
        label: 'Under 7 → Recovery Under 5',
        contractType: 'DIGITUNDER',
        initialPrediction: 7,
        recoveryPrediction: 5,
    },
];

export const SCAN_MARKETS: Array<{ symbol: string; submarket: string; displayName: string }> = [
    { symbol: 'R_10',    submarket: 'random_index', displayName: 'Volatility 10 Index' },
    { symbol: 'R_25',    submarket: 'random_index', displayName: 'Volatility 25 Index' },
    { symbol: 'R_50',    submarket: 'random_index', displayName: 'Volatility 50 Index' },
    { symbol: 'R_75',    submarket: 'random_index', displayName: 'Volatility 75 Index' },
    { symbol: 'R_100',   submarket: 'random_index', displayName: 'Volatility 100 Index' },
    { symbol: '1HZ10V',  submarket: 'random_index', displayName: 'Volatility 10 (1s) Index' },
    { symbol: '1HZ25V',  submarket: 'random_index', displayName: 'Volatility 25 (1s) Index' },
    { symbol: '1HZ50V',  submarket: 'random_index', displayName: 'Volatility 50 (1s) Index' },
    { symbol: '1HZ75V',  submarket: 'random_index', displayName: 'Volatility 75 (1s) Index' },
    { symbol: '1HZ100V', submarket: 'random_index', displayName: 'Volatility 100 (1s) Index' },
];

export const DEFAULT_SCAN_CONFIG: Required<ScanConfig> = {
    tickCount: 500,
    stake: 0.5,
    martingale: 2,
    numberOfWins: 5,
    stopLoss: 50,
    useMartingale: true,
};

const MIN_SAMPLE = 18;
const MIN_RECENT_SAMPLE = 8;
const MIN_WIN_RATE = 0.45;
const RECENT_WINDOW = 30;
const STABILITY_WINDOW = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parsePrice(raw: string | number): number | null {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

export function getPipSize(price: string | number): number {
    const s = price.toString();
    if (!s.includes('.')) return 2;
    const decimals = s.split('.')[1]?.length ?? 2;
    return Math.min(Math.max(decimals, 0), 5);
}

export function extractLastDigit(price: number, pipSize: number): number | null {
    const fixed = price.toFixed(pipSize);
    const ch = fixed[fixed.length - 1];
    const d = Number(ch);
    return Number.isInteger(d) ? d : null;
}

export function checkWin(
    digit: number,
    contractType: 'DIGITOVER' | 'DIGITUNDER',
    barrier: number
): boolean {
    switch (contractType) {
        case 'DIGITOVER':
            return digit > barrier;
        case 'DIGITUNDER':
            return digit < barrier;
        default:
            return false;
    }
}

export function wilsonLowerBound(wins: number, total: number, z = 1.64): number {
    if (total === 0) return 0;
    const p = wins / total;
    const z2 = z * z;
    return (
        (p + z2 / (2 * total) - z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) /
        (1 + z2 / total)
    );
}

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
// Backtest
// ---------------------------------------------------------------------------

export function backtestProfile(
    ticks: DerivTick[],
    profile: ScanProfile,
    entryDigit: number
): BacktestMetrics | null {
    if (ticks.length < MIN_SAMPLE) return null;

    const firstPrice = parsePrice(ticks[0].quote);
    if (firstPrice === null) return null;
    const pipSize = getPipSize(ticks[0].quote);

    const entries: boolean[] = [];

    // Evaluate tick i + 1 when tick i matches the entry trigger
    for (let i = 0; i < ticks.length - 1; i++) {
        const tick = ticks[i];
        const price = parsePrice(tick.quote);
        if (price === null) continue;
        const digit = extractLastDigit(price, pipSize);
        if (digit === null || digit !== entryDigit) continue;

        const nextTick = ticks[i + 1];
        const nextPrice = parsePrice(nextTick.quote);
        if (nextPrice === null) continue;
        const nextDigit = extractLastDigit(nextPrice, pipSize);
        if (nextDigit === null) continue;

        entries.push(checkWin(nextDigit, profile.contractType, profile.initialPrediction));
    }

    if (entries.length < MIN_SAMPLE) return null;

    const wins = entries.filter(Boolean).length;
    const total = entries.length;
    const winRate = wins / total;
    if (winRate < MIN_WIN_RATE) return null;

    const recentSlice = entries.slice(-RECENT_WINDOW);
    if (recentSlice.length < MIN_RECENT_SAMPLE) return null;
    const recentWins = recentSlice.filter(Boolean).length;
    const recentWinRate = recentWins / recentSlice.length;

    const wilsonLB = wilsonLowerBound(wins, total);
    const stability = computeStability(entries);
    const samplePenalty = Math.min(1, total / MIN_SAMPLE);

    const qualityScore =
        0.5 * wilsonLB +
        0.25 * recentWinRate +
        0.15 * stability +
        0.1 * samplePenalty;

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
// Market Scanner
// ---------------------------------------------------------------------------

export async function scanMarket(
    api: DerivApiClient,
    symbol: string,
    submarket: string,
    tickCount: number,
    profiles: ScanProfile[]
): Promise<ScanResult | null> {
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
    const times = response?.history?.times;
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

export type ScanProgressCallback = (
    completed: number,
    total: number,
    latest: ScanResult | null,
    currentSymbol?: string
) => void;

export async function runEntryScan(
    api: DerivApiClient,
    config: ScanConfig = {},
    onProgress?: ScanProgressCallback
): Promise<{ best: ScanResult | null; allResults: ScanResult[] }> {
    const tickCount = Math.min(5000, Math.max(100, config.tickCount ?? DEFAULT_SCAN_CONFIG.tickCount));
    const total = SCAN_MARKETS.length;
    let completed = 0;
    let globalBest: ScanResult | null = null;
    const allResults: ScanResult[] = [];

    const promises = SCAN_MARKETS.map(async ({ symbol, submarket }) => {
        onProgress?.(completed, total, globalBest, symbol);
        const result = await scanMarket(api, symbol, submarket, tickCount, SCAN_PROFILES);
        completed++;
        if (result) {
            allResults.push(result);
            if (!globalBest || result.metrics.qualityScore > globalBest.metrics.qualityScore) {
                globalBest = result;
            }
        }
        onProgress?.(completed, total, globalBest, symbol);
        return result;
    });

    await Promise.allSettled(promises);

    // Sort descending by qualityScore
    allResults.sort((a, b) => b.metrics.qualityScore - a.metrics.qualityScore);

    return {
        best: globalBest,
        allResults,
    };
}

// ---------------------------------------------------------------------------
// XML Builder
// ---------------------------------------------------------------------------

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

function patchField(doc: Document, fieldName: string, value: string): void {
    doc.querySelectorAll(`field[name="${fieldName}"]`).forEach(el => {
        el.textContent = value;
    });
}

export function buildBotXml(
    xmlTemplate: string,
    result: ScanResult,
    config: Required<ScanConfig>
): string {
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    const doc = parser.parseFromString(xmlTemplate, 'text/xml');

    patchField(doc, 'MARKET_LIST', 'synthetic_index');
    patchField(doc, 'SUBMARKET_LIST', result.submarket);
    patchField(doc, 'SYMBOL_LIST', result.symbol);
    patchField(doc, 'TYPE_LIST', result.profile.contractType);
    patchField(doc, 'PURCHASE_LIST', result.profile.contractType);

    patchNumericVar(doc, 'Initial Prediction', result.profile.initialPrediction);
    patchNumericVar(doc, 'Recovery Prediction', result.profile.recoveryPrediction);
    patchNumericVar(doc, 'Entry Point Digit', result.entryPointDigit);
    patchNumericVar(doc, 'Stake', config.stake);
    patchNumericVar(doc, 'Martangle', config.martingale);
    patchNumericVar(doc, 'Number of Wins', config.numberOfWins);
    patchNumericVar(doc, 'Stop Loss', config.stopLoss);

    patchBoolVar(doc, 'Use Martingale', config.useMartingale);

    return serializer.serializeToString(doc);
}

export function sanitiseConfig(raw: ScanConfig): Required<ScanConfig> {
    return {
        tickCount: Math.min(5000, Math.max(100, raw.tickCount ?? DEFAULT_SCAN_CONFIG.tickCount)),
        stake: Math.max(0.35, raw.stake ?? DEFAULT_SCAN_CONFIG.stake),
        martingale: Math.max(1, raw.martingale ?? DEFAULT_SCAN_CONFIG.martingale),
        numberOfWins: Math.max(1, Math.floor(raw.numberOfWins ?? DEFAULT_SCAN_CONFIG.numberOfWins)),
        stopLoss: Math.max(1, Math.floor(raw.stopLoss ?? DEFAULT_SCAN_CONFIG.stopLoss)),
        useMartingale: raw.useMartingale ?? DEFAULT_SCAN_CONFIG.useMartingale,
    };
}

// ---------------------------------------------------------------------------
// Deriv Client Adapter
// ---------------------------------------------------------------------------

export const defaultDerivApiClient: DerivApiClient = {
    send: async <T = unknown>(request: Record<string, unknown>): Promise<T> => {
        if (typeof WS?.send === 'function') {
            return (await WS.send(request)) as T;
        }
        if (typeof WS?.get === 'function' && typeof WS.get()?.send === 'function') {
            return (await WS.get().send(request)) as T;
        }
        if (typeof WS?.getTicksHistory === 'function' && request.ticks_history) {
            return (await WS.getTicksHistory(request)) as T;
        }
        throw new Error('Deriv WebSocket connection is not initialized');
    },
    subscribe: <T = unknown>(
        request: Record<string, unknown>,
        onMessage: (msg: T) => void
    ) => {
        if (typeof WS?.subscribe === 'function') {
            const sub = WS.subscribe(request, onMessage);
            return {
                unsubscribe: () => {
                    if (sub && typeof sub.unsubscribe === 'function') {
                        sub.unsubscribe();
                    }
                },
            };
        }
        if (typeof WS?.get === 'function' && typeof WS.get()?.subscribe === 'function') {
            const sub = WS.get().subscribe(request).subscribe(onMessage, onMessage);
            return {
                unsubscribe: () => {
                    if (sub && typeof sub.unsubscribe === 'function') {
                        sub.unsubscribe();
                    }
                },
            };
        }
        throw new Error('Deriv WebSocket subscribe is not available');
    },
};
