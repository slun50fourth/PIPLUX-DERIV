import React, { useState, useEffect, useRef } from 'react';
import './ai-scanner.scss';
import WS from 'Services/ws-methods';
import { useStore } from '@deriv/stores';

import {
  runEntryScan,
  buildBotXml,
  injectXmlIntoBlockly,
  startEntryScannerTrade,
  EntryScannerSession,
} from '../../../../../../../bots/entryScanner';
import {
  startProAi,
  ProAiSession,
} from '../../../../../../../bots/proAiEngine';
import type {
  DerivApiClient,
  ScanResult,
  ScanConfig,
  ProAiConfig,
  ProAiSetup,
} from '../../../../../../../bots/aiScannerTypes';
import { sound } from './audioEffects';

type ViewMode = 'closed' | 'choose' | 'entry_scanner' | 'pro_ai';

export const AiScannerModal: React.FC = () => {
  const store = useStore();
  const currency = store?.client?.currency || 'USD';

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('choose');

  // Entry Scanner states
  const [ticksCount, setTicksCount] = useState(500);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 10, market: '' });
  const [bestResult, setBestResult] = useState<ScanResult | null>(null);
  const [statusText, setStatusText] = useState('Not scanned yet');

  // Scanner parameters popup states
  const [showParamsPopup, setShowParamsPopup] = useState(false);
  const [params, setParams] = useState<ScanConfig>({
    stake: 0.5,
    martingale: 2,
    numberOfWins: 5,
    stopLoss: 50,
    useMartingale: true,
  });

  // Active Live Trading state (for Entry Scanner & Pro AI)
  const [isTradingActive, setIsTradingActive] = useState(false);
  const [tradingStatus, setTradingStatus] = useState<string>('Idle');
  const [liveLastDigit, setLiveLastDigit] = useState<number | null>(null);
  const [liveLastPrice, setLiveLastPrice] = useState<number | null>(null);
  const [currentTradeStake, setCurrentTradeStake] = useState<number>(0.5);
  const [wonCount, setWonCount] = useState(0);
  const [lostCount, setLostCount] = useState(0);
  const [sessionPnl, setSessionPnl] = useState(0);
  const activeSessionRef = useRef<EntryScannerSession | ProAiSession | null>(null);

  // Pro AI states
  const [proAiScanning, setProAiScanning] = useState(false);
  const [proAiSetup, setProAiSetup] = useState<ProAiSetup | null>(null);
  const [proAiConfig, setProAiConfig] = useState<ProAiConfig>({
    stake: 0.5,
    multiplier: 2,
    takeProfit: 5,
    stopLoss: 10,
    ticks: 100,
  });

  // Create DerivApiClient adapter
  const getApiClient = (): DerivApiClient => {
    const wsInstance: any = WS || (window as any).BinarySocket || (window as any).WS;
    return {
      send: (req) => wsInstance.send(req),
      subscribe: (req, onMessage) => {
        const sub = wsInstance.subscribe(req, onMessage);
        return {
          unsubscribe: () => {
            if (sub && typeof sub.unsubscribe === 'function') {
              sub.unsubscribe();
            }
          },
        };
      },
    };
  };

  // Stop active trading on unmount
  useEffect(() => {
    return () => {
      if (activeSessionRef.current) {
        activeSessionRef.current.stop();
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Entry Scanner Actions
  // ---------------------------------------------------------------------------

  const handleStartScan = async () => {
    setIsScanning(true);
    setBestResult(null);
    setStatusText('Scanning markets in parallel...');
    sound.playBeep();

    try {
      const api = getApiClient();
      const res = await runEntryScan(
        api,
        { tickCount: ticksCount },
        (completed, total, latest) => {
          setScanProgress({
            current: completed,
            total,
            market: latest?.symbol || `Market ${completed}`,
          });
        }
      );

      if (res) {
        setBestResult(res);
        const qualityPct = (res.metrics.qualityScore * 100).toFixed(2);
        setStatusText(
          `Best market: ${res.symbol} | ${res.profile.label} | Entry ${res.entryPointDigit} | Quality ${qualityPct}%`
        );
        sound.playSuccess();
        sound.speak(`Best market found on ${res.symbol}. Entry digit is ${res.entryPointDigit}.`);
      } else {
        setStatusText('No high-probability signal found. Try increasing ticks or rescan.');
        sound.playError();
      }
    } catch (err) {
      setStatusText('Scan encountered an error. Please check your connection and retry.');
      sound.playError();
    } finally {
      setIsScanning(false);
    }
  };

  // Called when "Load and Run Bot" is clicked in Entry Scanner view
  const handleOpenParameters = () => {
    if (!bestResult) return;
    setShowParamsPopup(true);
  };

  // Called when "Load and Run" is confirmed inside the parameters popup
  const handleExecuteEntryBot = async () => {
    if (!bestResult) return;
    setShowParamsPopup(false);
    setIsTradingActive(true);
    setWonCount(0);
    setLostCount(0);
    setSessionPnl(0);
    setCurrentTradeStake(params.stake || 0.5);
    setTradingStatus(`Monitoring ${bestResult.symbol} for entry digit [${bestResult.entryPointDigit}]...`);
    sound.playSuccess();
    sound.speak(`Scanner bot loaded for ${bestResult.symbol}. Trade engine is ready.`);

    // 1. If Blockly exists, populate workspace
    try {
      const templateXml = `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false"></xml>`;
      buildBotXml(templateXml, bestResult, {
        tickCount: ticksCount,
        stake: params.stake || 0.5,
        martingale: params.martingale || 2,
        numberOfWins: params.numberOfWins || 5,
        stopLoss: params.stopLoss || 50,
        useMartingale: params.useMartingale ?? true,
      });
      injectXmlIntoBlockly(templateXml);
    } catch {
      // Blockly not present or not on DBot page — fallback to direct execution
    }

    // 2. Start direct WebSocket trade execution
    const api = getApiClient();
    const session = startEntryScannerTrade(
      api,
      bestResult,
      params,
      {
        onTick: (digit, price) => {
          setLiveLastDigit(digit);
          setLiveLastPrice(price);
        },
        onEntry: (digit, contractType, barrier, stake, isRecovery) => {
          setCurrentTradeStake(stake);
          setTradingStatus(
            `Triggered on digit ${digit}! Buying ${contractType} ${barrier} ($${stake.toFixed(2)})${
              isRecovery ? ' [RECOVERY]' : ''
            }...`
          );
          sound.playBeep();
        },
        onTradeResult: (won, profit, totalPnl, nextStake, consecutiveWins) => {
          if (won) {
            setWonCount((c) => c + 1);
            sound.playSuccess();
          } else {
            setLostCount((c) => c + 1);
            sound.playError();
          }
          setSessionPnl(totalPnl);
          setCurrentTradeStake(nextStake);
          setTradingStatus(
            won
              ? `WON +$${profit.toFixed(2)}! Streak: ${consecutiveWins}. Waiting for digit [${bestResult.entryPointDigit}]...`
              : `LOST -$${Math.abs(profit).toFixed(2)}. Recovery next stake: $${nextStake.toFixed(2)}.`
          );
        },
        onSessionEnd: (reason, pnl) => {
          setIsTradingActive(false);
          const pnlStr = `$${pnl.toFixed(2)}`;
          if (reason === 'targetWins') {
            sound.playSuccess();
            sound.speak(`Target wins achieved! Net profit ${pnlStr}.`);
            setTradingStatus(`Target wins completed! Final PnL: ${pnlStr}`);
          } else if (reason === 'stopLoss') {
            sound.playError();
            sound.speak(`Stop loss reached. Trading stopped.`);
            setTradingStatus(`Stop loss reached. Final PnL: ${pnlStr}`);
          } else {
            setTradingStatus(`Session stopped. Final PnL: ${pnlStr}`);
          }
        },
        onError: (err) => {
          sound.playError();
          setTradingStatus(`Error: ${err.message}`);
        },
      },
      currency
    );

    activeSessionRef.current = session;
  };

  const handleStopTrading = () => {
    if (activeSessionRef.current) {
      activeSessionRef.current.stop();
      activeSessionRef.current = null;
    }
    setIsTradingActive(false);
    setTradingStatus('Trading stopped by user.');
    sound.speak('Trading stopped.');
  };

  // ---------------------------------------------------------------------------
  // Pro AI Actions
  // ---------------------------------------------------------------------------

  const handleProAiScan = async () => {
    setProAiScanning(true);
    sound.playBeep();
    try {
      const api = getApiClient();
      const session = new ProAiSession(api);
      const best = await session.scan(proAiConfig.ticks || 100);
      if (best) {
        setProAiSetup(best);
        sound.playSuccess();
        sound.speak(`Pro AI found best setup on ${best.symbol}. Primary ${best.primary.label}.`);
      } else {
        sound.playError();
      }
    } catch {
      sound.playError();
    } finally {
      setProAiScanning(false);
    }
  };

  const handleStartProAiTrading = () => {
    if (!proAiSetup) return;
    setIsTradingActive(true);
    setWonCount(0);
    setLostCount(0);
    setSessionPnl(0);
    setCurrentTradeStake(proAiConfig.stake || 0.5);
    setTradingStatus(`Pro AI active on ${proAiSetup.symbol}. Waiting for entry digit [${proAiSetup.entryDigit}]...`);
    sound.playSuccess();
    sound.speak(`Pro AI started on ${proAiSetup.symbol}.`);

    const api = getApiClient();
    const session = startProAi(
      api,
      proAiConfig,
      {
        onScanComplete: (setup) => setProAiSetup(setup),
        onTick: (digit, price) => {
          setLiveLastDigit(digit);
          setLiveLastPrice(price);
        },
        onEntry: (digit, contract, stake) => {
          setCurrentTradeStake(stake);
          setTradingStatus(`Pro AI entry on ${digit}! Buying ${contract.label} ($${stake.toFixed(2)})...`);
          sound.playBeep();
        },
        onTradeResult: (won, profit, totalPnl) => {
          if (won) {
            setWonCount((c) => c + 1);
            sound.playSuccess();
          } else {
            setLostCount((c) => c + 1);
            sound.playError();
          }
          setSessionPnl(totalPnl);
        },
        onRecovery: (spec, recoveryStake) => {
          setCurrentTradeStake(recoveryStake);
          setTradingStatus(`Pro AI switched to Recovery: ${spec.label} ($${recoveryStake.toFixed(2)})`);
        },
        onSessionEnd: (reason, pnl) => {
          setIsTradingActive(false);
          setTradingStatus(`Pro AI ended (${reason}). PnL: $${pnl.toFixed(2)}`);
          if (reason === 'takeProfit') sound.playSuccess();
          else if (reason === 'stopLoss') sound.playError();
        },
        onError: (err) => {
          sound.playError();
          setTradingStatus(`Pro AI Error: ${err.message}`);
        },
      },
      currency
    );

    activeSessionRef.current = session;
  };

  return (
    <>
      {/* Floating AI Button at Bottom Right (Screenshots 1-4) */}
      <button
        className="ai-floating-trigger"
        onClick={() => {
          setIsOpen(true);
          if (view === 'closed') setView('choose');
        }}
        title="Open AI Scanner"
      >
        <span className="ai-floating-trigger__badge">AI</span>
      </button>

      {/* Main Modal Dialog */}
      {isOpen && (
        <div className="ai-modal-overlay" onClick={() => !isScanning && !showParamsPopup && setIsOpen(false)}>
          <div className="ai-modal-container" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="ai-modal-header">
              <h2>
                {view === 'choose' && 'AI Scanner'}
                {view === 'entry_scanner' && 'Entry Scanner'}
                {view === 'pro_ai' && 'Pro AI'}
              </h2>
              <button
                className="ai-modal-header__close"
                onClick={() => setIsOpen(false)}
                disabled={isScanning}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="ai-modal-body">
              {/* VIEW 1: CHOICE SCREEN (Screenshot 1) */}
              {view === 'choose' && (
                <div className="ai-choice-view">
                  <div className="ai-choice-view__subtitle">Choose how you want to scan and trade.</div>

                  {/* Option 1: Entry Scanner */}
                  <div
                    className="ai-choice-view__card"
                    onClick={() => setView('entry_scanner')}
                  >
                    <div className="ai-choice-view__number">1</div>
                    <div className="ai-choice-view__content">
                      <h3>Entry Scanner</h3>
                      <p>Find a market and load its settings into your bot.</p>
                    </div>
                    <span className="ai-choice-view__arrow">→</span>
                  </div>

                  {/* Option 2: Pro AI */}
                  <div
                    className="ai-choice-view__card"
                    onClick={() => setView('pro_ai')}
                  >
                    <div className="ai-choice-view__number">2</div>
                    <div className="ai-choice-view__content">
                      <h3>Pro AI</h3>
                      <p>Scan eligible markets and execute trades with automatic recovery selection.</p>
                    </div>
                    <span className="ai-choice-view__arrow">→</span>
                  </div>
                </div>
              )}

              {/* VIEW 2: ENTRY SCANNER (Screenshots 2 & 3) */}
              {view === 'entry_scanner' && (
                <div>
                  <button
                    type="button"
                    className="scanner-back"
                    onClick={() => setView('choose')}
                    disabled={isScanning}
                  >
                    ← Scanner options
                  </button>

                  {/* Top Radar / HUD Graphic */}
                  <div className="radar-hud">
                    <div className="radar-hud__grid" />
                    <svg
                      className={`radar-hud__icon ${isScanning ? 'radar-hud__icon--spinning' : ''}`}
                      viewBox="0 0 48 48"
                      fill="none"
                    >
                      <g stroke="currentColor" strokeWidth="1.2" opacity="0.8">
                        <circle cx="24" cy="24" r="18" strokeDasharray="3 3" />
                        <circle cx="24" cy="24" r="10" />
                        <line x1="24" y1="6" x2="24" y2="42" />
                        <line x1="6" y1="24" x2="42" y2="24" />
                        <circle cx="24" cy="24" r="3" fill="currentColor" />
                      </g>
                    </svg>
                    <div className="radar-hud__label">
                      {isScanning ? 'SCANNING MARKETS' : 'AWAITING SCAN'}
                    </div>
                    <div className="radar-hud__sub">
                      {isScanning ? scanProgress.market || 'Scanning...' : 'Tap Scan to begin'}
                    </div>
                  </div>

                  {/* Scanned Results Display (Screenshot 3) */}
                  {bestResult && (
                    <div className="scanner-fields-grid">
                      <div className="scanner-field scanner-fields-grid--full">
                        <label>Selected Market</label>
                        <input
                          type="text"
                          readOnly
                          value={`${bestResult.symbol} (${bestResult.submarket})`}
                        />
                      </div>
                      <div className="scanner-field">
                        <label>Trade Type</label>
                        <input type="text" readOnly value={bestResult.profile.label} />
                      </div>
                      <div className="scanner-field">
                        <label>Prediction Path</label>
                        <input
                          type="text"
                          readOnly
                          value={`${bestResult.profile.initialPrediction} -> recovery ${bestResult.profile.recoveryPrediction}`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Ticks Input */}
                  <div className="scanner-field" style={{ marginBottom: 16 }}>
                    <label>Ticks Number (100-5000)</label>
                    <input
                      type="number"
                      min={100}
                      max={5000}
                      value={ticksCount}
                      onChange={(e) => setTicksCount(Number(e.target.value))}
                      disabled={isScanning}
                    />
                  </div>

                  {/* Progress Bar (during scanning) */}
                  {isScanning && (
                    <div className="scanner-progress">
                      <div className="scanner-progress__head">
                        <span>{scanProgress.market || 'Scanning market...'}</span>
                        <strong>
                          {scanProgress.current}/{scanProgress.total}
                        </strong>
                      </div>
                      <div className="scanner-progress__track">
                        <div
                          className="scanner-progress__fill"
                          style={{
                            width: `${Math.min(
                              100,
                              scanProgress.total ? (scanProgress.current / scanProgress.total) * 100 : 0
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Status Box */}
                  <div
                    className={`scanner-status-box ${
                      bestResult ? 'scanner-status-box--success' : ''
                    }`}
                  >
                    {statusText}
                  </div>

                  {/* Bottom Action Buttons (Screenshot 3) */}
                  <div className="scanner-actions">
                    <button
                      type="button"
                      className="scanner-actions__primary"
                      onClick={handleStartScan}
                      disabled={isScanning || isTradingActive}
                    >
                      {isScanning ? 'Scanning Best Market...' : 'Scan for Best Market'}
                    </button>
                    <button
                      type="button"
                      className="scanner-actions__secondary"
                      onClick={handleOpenParameters}
                      disabled={!bestResult || isScanning || isTradingActive}
                    >
                      Load and Run Bot
                    </button>
                  </div>

                  {/* Live Trading HUD Overlay when trading is active */}
                  {isTradingActive && (
                    <div className="live-trading-hud">
                      <div className="live-trading-hud__header">
                        <h4>TRADING ACTIVE</h4>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          Live Digit: <strong style={{ color: '#38bdf8' }}>{liveLastDigit ?? '-'}</strong> ({liveLastPrice ?? '-'})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 8 }}>
                        {tradingStatus}
                      </div>
                      <div className="live-trading-hud__metrics">
                        <div className="live-trading-hud__metric-box">
                          <span>Wins</span>
                          <strong style={{ color: '#10b981' }}>{wonCount}</strong>
                        </div>
                        <div className="live-trading-hud__metric-box">
                          <span>Losses</span>
                          <strong style={{ color: '#ef4444' }}>{lostCount}</strong>
                        </div>
                        <div className="live-trading-hud__metric-box">
                          <span>Current Stake</span>
                          <strong>${currentTradeStake.toFixed(2)}</strong>
                        </div>
                        <div className="live-trading-hud__metric-box">
                          <span>Session PnL</span>
                          <strong className={sessionPnl >= 0 ? 'profit-pos' : 'profit-neg'}>
                            {sessionPnl >= 0 ? `+$${sessionPnl.toFixed(2)}` : `-$${Math.abs(sessionPnl).toFixed(2)}`}
                          </strong>
                        </div>
                      </div>
                      <button className="live-trading-hud__stop-btn" onClick={handleStopTrading}>
                        Stop Trading
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 3: PRO AI VIEW */}
              {view === 'pro_ai' && (
                <div>
                  <button
                    type="button"
                    className="scanner-back"
                    onClick={() => setView('choose')}
                    disabled={proAiScanning}
                  >
                    ← Scanner options
                  </button>

                  <div className="radar-hud">
                    <div className="radar-hud__grid" />
                    <div className="radar-hud__label">PRO AI ENGINE</div>
                    <div className="radar-hud__sub">Autonomous recovery & edge-based selection</div>
                  </div>

                  {proAiSetup && (
                    <div className="scanner-fields-grid">
                      <div className="scanner-field">
                        <label>Symbol</label>
                        <input type="text" readOnly value={proAiSetup.symbol} />
                      </div>
                      <div className="scanner-field">
                        <label>Entry Digit</label>
                        <input type="text" readOnly value={proAiSetup.entryDigit} />
                      </div>
                      <div className="scanner-field">
                        <label>Primary</label>
                        <input type="text" readOnly value={proAiSetup.primary.label} />
                      </div>
                      <div className="scanner-field">
                        <label>Recovery</label>
                        <input type="text" readOnly value={proAiSetup.recovery.label} />
                      </div>
                    </div>
                  )}

                  <div className="param-modal__grid" style={{ marginBottom: 16 }}>
                    <div className="scanner-field">
                      <label>Base Stake</label>
                      <input
                        type="number"
                        step="0.01"
                        value={proAiConfig.stake}
                        onChange={(e) => setProAiConfig({ ...proAiConfig, stake: Number(e.target.value) })}
                      />
                    </div>
                    <div className="scanner-field">
                      <label>Multiplier</label>
                      <input
                        type="number"
                        step="0.1"
                        value={proAiConfig.multiplier}
                        onChange={(e) => setProAiConfig({ ...proAiConfig, multiplier: Number(e.target.value) })}
                      />
                    </div>
                    <div className="scanner-field">
                      <label>Take Profit ($)</label>
                      <input
                        type="number"
                        value={proAiConfig.takeProfit}
                        onChange={(e) => setProAiConfig({ ...proAiConfig, takeProfit: Number(e.target.value) })}
                      />
                    </div>
                    <div className="scanner-field">
                      <label>Stop Loss ($)</label>
                      <input
                        type="number"
                        value={proAiConfig.stopLoss}
                        onChange={(e) => setProAiConfig({ ...proAiConfig, stopLoss: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  <div className="scanner-actions">
                    <button
                      type="button"
                      className="scanner-actions__primary"
                      onClick={handleProAiScan}
                      disabled={proAiScanning || isTradingActive}
                    >
                      {proAiScanning ? 'Scanning 15 Markets...' : 'Scan for Best Setup'}
                    </button>
                    <button
                      type="button"
                      className="scanner-actions__secondary"
                      onClick={handleStartProAiTrading}
                      disabled={!proAiSetup || isTradingActive}
                    >
                      Start Pro AI
                    </button>
                  </div>

                  {isTradingActive && (
                    <div className="live-trading-hud">
                      <div className="live-trading-hud__header">
                        <h4>PRO AI LIVE TRADING</h4>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          Digit: <strong style={{ color: '#38bdf8' }}>{liveLastDigit ?? '-'}</strong>
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#cbd5e1', marginBottom: 8 }}>
                        {tradingStatus}
                      </div>
                      <div className="live-trading-hud__metrics">
                        <div className="live-trading-hud__metric-box">
                          <span>Wins</span>
                          <strong style={{ color: '#10b981' }}>{wonCount}</strong>
                        </div>
                        <div className="live-trading-hud__metric-box">
                          <span>Losses</span>
                          <strong style={{ color: '#ef4444' }}>{lostCount}</strong>
                        </div>
                        <div className="live-trading-hud__metric-box">
                          <span>Stake</span>
                          <strong>${currentTradeStake.toFixed(2)}</strong>
                        </div>
                        <div className="live-trading-hud__metric-box">
                          <span>PnL</span>
                          <strong className={sessionPnl >= 0 ? 'profit-pos' : 'profit-neg'}>
                            {sessionPnl >= 0 ? `+$${sessionPnl.toFixed(2)}` : `-$${Math.abs(sessionPnl).toFixed(2)}`}
                          </strong>
                        </div>
                      </div>
                      <button className="live-trading-hud__stop-btn" onClick={handleStopTrading}>
                        Stop Pro AI
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POPUP SUB-MODAL: SCANNER PARAMETERS (Screenshot 4) */}
      {showParamsPopup && (
        <div className="param-modal-overlay" onClick={() => setShowParamsPopup(false)}>
          <div className="param-modal" onClick={(e) => e.stopPropagation()}>
            <div className="param-modal__header">
              <h3>Scanner Parameters</h3>
            </div>
            <div className="param-modal__body">
              <div className="param-modal__grid">
                <div className="param-modal__field">
                  <label>Stake</label>
                  <input
                    type="number"
                    min="0.35"
                    step="0.01"
                    value={params.stake}
                    onChange={(e) => setParams({ ...params, stake: Number(e.target.value) })}
                  />
                </div>
                <div className="param-modal__field">
                  <label>Martingale</label>
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={params.martingale}
                    onChange={(e) => setParams({ ...params, martingale: Number(e.target.value) })}
                  />
                </div>
                <div className="param-modal__field">
                  <label>Number of Wins</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={params.numberOfWins}
                    onChange={(e) => setParams({ ...params, numberOfWins: Number(e.target.value) })}
                  />
                </div>
                <div className="param-modal__field">
                  <label>Stop Loss</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={params.stopLoss}
                    onChange={(e) => setParams({ ...params, stopLoss: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="param-modal__toggle-row">
                <span>Use Martingale</span>
                <button
                  type="button"
                  className={`param-modal__toggle ${params.useMartingale ? 'is-on' : ''}`}
                  onClick={() => setParams({ ...params, useMartingale: !params.useMartingale })}
                >
                  <span />
                </button>
              </div>
            </div>

            <div className="param-modal__actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setShowParamsPopup(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-run"
                onClick={handleExecuteEntryBot}
              >
                Load and Run
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AiScannerModal;
