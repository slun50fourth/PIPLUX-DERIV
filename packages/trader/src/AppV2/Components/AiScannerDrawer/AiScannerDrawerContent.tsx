import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Localize } from '@deriv-com/translations';
import { useTraderStore } from 'Stores/useTraderStores';
import {
    runEntryScan,
    buildBotXml,
    sanitiseConfig,
    defaultDerivApiClient,
    SCAN_MARKETS,
} from './entryScanner';
import { APEX_RANGE_AI_XML_TEMPLATE } from './apexRangeXmlTemplate';
import type { ScanResult } from './aiScannerTypes';
import './AiScannerDrawer.scss';

interface AiScannerDrawerContentProps {
    onClose?: () => void;
}

export const AiScannerDrawerContent: React.FC<AiScannerDrawerContentProps> = observer(({ onClose }) => {
    const { onChange } = useTraderStore();
    const [isScanning, setIsScanning] = useState(false);
    const [tickCount, setTickCount] = useState<number>(500);
    const [progress, setProgress] = useState<{ completed: number; total: number; currentSymbol?: string }>({
        completed: 0,
        total: SCAN_MARKETS.length,
    });
    const [bestResult, setBestResult] = useState<ScanResult | null>(null);
    const [allResults, setAllResults] = useState<ScanResult[]>([]);
    const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

    const handleRunScan = async () => {
        setIsScanning(true);
        setAppliedNotice(null);
        setProgress({ completed: 0, total: SCAN_MARKETS.length });

        try {
            const { best, allResults: results } = await runEntryScan(
                defaultDerivApiClient,
                { tickCount },
                (completed, total, currentBest, symbol) => {
                    setProgress({ completed, total, currentSymbol: symbol });
                    if (currentBest) {
                        setBestResult(currentBest);
                    }
                }
            );

            setBestResult(best);
            setAllResults(results);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Scan failed:', error);
        } finally {
            setIsScanning(false);
        }
    };

    const handleApply = (result: ScanResult) => {
        onChange({ target: { name: 'symbol', value: result.symbol } });
        onChange({ target: { name: 'contract_type', value: 'over_under' } });
        onChange({ target: { name: 'last_digit', value: result.profile.initialPrediction } });

        const marketName = SCAN_MARKETS.find(m => m.symbol === result.symbol)?.displayName || result.symbol;
        setAppliedNotice(`Applied ${marketName} (Over ${result.profile.initialPrediction}) to trader!`);

        setTimeout(() => {
            setAppliedNotice(null);
            onClose?.();
        }, 1200);
    };

    const handleDownloadXml = (result: ScanResult) => {
        const config = sanitiseConfig({ tickCount });
        const xml = buildBotXml(APEX_RANGE_AI_XML_TEMPLATE, result, config);

        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Apex_AI_${result.symbol}_Digit${result.entryPointDigit}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getMarketName = (symbol: string) => {
        return SCAN_MARKETS.find(m => m.symbol === symbol)?.displayName || symbol;
    };

    return (
        <div className='ai-scanner-drawer'>
            {/* Header info */}
            <div className='ai-scanner-drawer__header'>
                <div className='ai-scanner-drawer__header-badge'>
                    <span className='ai-scanner-drawer__header-badge-dot' />
                    <Localize i18n_default_text='Reverse Engineered AI' />
                </div>
                <h2 className='ai-scanner-drawer__header-title'>
                    <Localize i18n_default_text='Statistical Entry Scanner' />
                </h2>
                <p className='ai-scanner-drawer__header-subtitle'>
                    <Localize i18n_default_text='Scans all 10 synthetic volatility markets using Wilson lower bound confidence intervals to identify statistical entry edges.' />
                </p>
            </div>

            {/* Controls */}
            <div className='ai-scanner-drawer__controls'>
                <span className='ai-scanner-drawer__controls-label'>
                    <Localize i18n_default_text='Historical Tick Window' />
                </span>
                <div className='ai-scanner-drawer__controls-ticks'>
                    {[100, 250, 500, 1000].map(count => (
                        <button
                            key={count}
                            type='button'
                            className={`ai-scanner-drawer__controls-ticks-btn ${
                                tickCount === count ? 'ai-scanner-drawer__controls-ticks-btn--active' : ''
                            }`}
                            onClick={() => setTickCount(count)}
                            disabled={isScanning}
                        >
                            {count}
                        </button>
                    ))}
                </div>

                <button
                    type='button'
                    className='ai-scanner-drawer__controls-scan-btn'
                    onClick={handleRunScan}
                    disabled={isScanning}
                >
                    {isScanning ? (
                        <>
                            <span>🔄</span>
                            <Localize i18n_default_text='Scanning 10 Markets...' />
                        </>
                    ) : (
                        <>
                            <span>⚡</span>
                            <Localize i18n_default_text='Run Market Scan' />
                        </>
                    )}
                </button>
            </div>

            {/* Live Progress */}
            {isScanning && (
                <div className='ai-scanner-drawer__progress'>
                    <div className='ai-scanner-drawer__progress-text'>
                        <span>
                            <Localize
                                i18n_default_text='Scanning {{symbol}}...'
                                values={{ symbol: getMarketName(progress.currentSymbol || '') }}
                            />
                        </span>
                        <span>
                            {progress.completed} / {progress.total}
                        </span>
                    </div>
                    <div className='ai-scanner-drawer__progress-bar-bg'>
                        <div
                            className='ai-scanner-drawer__progress-bar-fill'
                            style={{
                                width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                            }}
                        />
                    </div>
                </div>
            )}

            {appliedNotice && (
                <div
                    style={{
                        padding: '10px 12px',
                        background: 'rgba(0, 255, 136, 0.2)',
                        border: '1px solid #00ff88',
                        color: '#00ff88',
                        borderRadius: '8px',
                        marginBottom: '14px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        textAlign: 'center',
                    }}
                >
                    ✓ {appliedNotice}
                </div>
            )}

            {/* Top Recommendation (Hero Card) */}
            {bestResult && (
                <div className='ai-scanner-drawer__hero'>
                    <div className='ai-scanner-drawer__hero-header'>
                        <span className='ai-scanner-drawer__hero-header-label'>
                            <Localize i18n_default_text='Top Statistical Edge' />
                        </span>
                        <span className='ai-scanner-drawer__hero-header-rank'>#1 Best</span>
                    </div>

                    <div className='ai-scanner-drawer__hero-market'>
                        {getMarketName(bestResult.symbol)}
                    </div>
                    <div className='ai-scanner-drawer__hero-profile'>
                        {bestResult.profile.label}
                    </div>

                    <div className='ai-scanner-drawer__hero-trigger-box'>
                        <div className='ai-scanner-drawer__hero-trigger-box-digit'>
                            {bestResult.entryPointDigit}
                        </div>
                        <div className='ai-scanner-drawer__hero-trigger-box-desc'>
                            <Localize
                                i18n_default_text='Wait for <strong>Digit {{digit}}</strong> to appear, then place <strong>{{contract}} {{barrier}}</strong>.'
                                values={{
                                    digit: bestResult.entryPointDigit,
                                    contract: bestResult.profile.contractType === 'DIGITOVER' ? 'Over' : 'Under',
                                    barrier: bestResult.profile.initialPrediction,
                                }}
                            />
                        </div>
                    </div>

                    <div className='ai-scanner-drawer__hero-metrics'>
                        <div className='ai-scanner-drawer__hero-metrics-card'>
                            <div className='ai-scanner-drawer__hero-metrics-card-title'>
                                <Localize i18n_default_text='Win Rate' />
                            </div>
                            <div className='ai-scanner-drawer__hero-metrics-card-val ai-scanner-drawer__hero-metrics-card-val--accent'>
                                {Math.round((bestResult.metrics.wins / bestResult.metrics.total) * 1000) / 10}%
                            </div>
                        </div>

                        <div className='ai-scanner-drawer__hero-metrics-card'>
                            <div className='ai-scanner-drawer__hero-metrics-card-title'>
                                <Localize i18n_default_text='Wilson Lower Bound' />
                            </div>
                            <div className='ai-scanner-drawer__hero-metrics-card-val'>
                                {Math.round(bestResult.metrics.wilsonLB * 1000) / 10}%
                            </div>
                        </div>

                        <div className='ai-scanner-drawer__hero-metrics-card'>
                            <div className='ai-scanner-drawer__hero-metrics-card-title'>
                                <Localize i18n_default_text='Stability' />
                            </div>
                            <div className='ai-scanner-drawer__hero-metrics-card-val'>
                                {Math.round(bestResult.metrics.stability * 100)}%
                            </div>
                        </div>

                        <div className='ai-scanner-drawer__hero-metrics-card'>
                            <div className='ai-scanner-drawer__hero-metrics-card-title'>
                                <Localize i18n_default_text='Sample Size' />
                            </div>
                            <div className='ai-scanner-drawer__hero-metrics-card-val'>
                                {bestResult.metrics.total} entries
                            </div>
                        </div>
                    </div>

                    <div className='ai-scanner-drawer__hero-actions'>
                        <button
                            type='button'
                            className='ai-scanner-drawer__hero-actions-apply'
                            onClick={() => handleApply(bestResult)}
                        >
                            <span>🎯</span>
                            <Localize i18n_default_text='Apply Setup to Trader' />
                        </button>
                        <button
                            type='button'
                            className='ai-scanner-drawer__hero-actions-xml'
                            onClick={() => handleDownloadXml(bestResult)}
                        >
                            <span>💾</span>
                            <Localize i18n_default_text='Download DBot XML' />
                        </button>
                    </div>
                </div>
            )}

            {/* Other Scanned Markets */}
            {allResults.length > 0 && (
                <div className='ai-scanner-drawer__list'>
                    <div className='ai-scanner-drawer__list-title'>
                        <Localize i18n_default_text='All Evaluated Markets' />
                    </div>
                    <div className='ai-scanner-drawer__list-items'>
                        {allResults.map((item, idx) => {
                            const winPct = Math.round((item.metrics.wins / item.metrics.total) * 1000) / 10;
                            return (
                                <div key={`${item.symbol}_${idx}`} className='ai-scanner-drawer__list-item'>
                                    <div className='ai-scanner-drawer__list-item-info'>
                                        <span className='ai-scanner-drawer__list-item-name'>
                                            {getMarketName(item.symbol)}
                                        </span>
                                        <span className='ai-scanner-drawer__list-item-sub'>
                                            Trigger: Digit {item.entryPointDigit} → {item.profile.label}
                                        </span>
                                    </div>
                                    <div className='ai-scanner-drawer__list-item-stats'>
                                        <div className='ai-scanner-drawer__list-item-rate'>{winPct}%</div>
                                        <button
                                            type='button'
                                            className='ai-scanner-drawer__list-item-btn'
                                            onClick={() => handleApply(item)}
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty state when not scanned yet */}
            {!bestResult && !isScanning && (
                <div className='ai-scanner-drawer__empty'>
                    <span className='ai-scanner-drawer__empty-icon' style={{ fontSize: '32px' }}>
                        📡
                    </span>
                    <p className='ai-scanner-drawer__empty-text'>
                        <Localize i18n_default_text='Click "Run Market Scan" above to analyze all 10 synthetic volatility markets and discover optimal entry digits.' />
                    </p>
                </div>
            )}
        </div>
    );
});

export default AiScannerDrawerContent;
