/**
 * aiScannerTypes.ts
 * Shared TypeScript interfaces for the Entry Scanner.
 */

export interface DerivTick {
    quote: string | number;
    epoch: number;
}

export interface ParsedTick {
    price: number;
    lastDigit: number;
    pipSize: number;
}

export interface ScanProfile {
    id: string;
    label: string;
    contractType: 'DIGITOVER' | 'DIGITUNDER';
    initialPrediction: number;
    recoveryPrediction: number;
}

export interface BacktestMetrics {
    wins: number;
    total: number;
    wilsonLB: number;
    recentWinRate: number;
    stability: number;
    samplePenalty: number;
    qualityScore: number;
}

export interface ScanResult {
    symbol: string;
    submarket: string;
    profile: ScanProfile;
    entryPointDigit: number;
    metrics: BacktestMetrics;
}

export interface ScanConfig {
    tickCount?: number;
    stake?: number;
    martingale?: number;
    numberOfWins?: number;
    stopLoss?: number;
    useMartingale?: boolean;
}

export interface DerivApiClient {
    send<T = unknown>(request: Record<string, unknown>): Promise<T>;
    subscribe<T = unknown>(
        request: Record<string, unknown>,
        onMessage: (msg: T) => void
    ): { unsubscribe: () => void };
}
