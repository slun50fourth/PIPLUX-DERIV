import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { getSignupUrl, getHelpCentreUrl, redirectToLogin, routes } from '@deriv/shared';
import { useStore } from '@deriv/stores';
import './LandingPage.scss';

interface TickerAsset {
  id: string;
  name: string;
  category: string;
  price: number;
  change: number;
  isUp: boolean;
  digits: number;
}

const INITIAL_TICKERS: TickerAsset[] = [
  { id: 'R_75', name: 'Volatility 75 (1s)', category: 'Synthetic Index', price: 684215.42, change: +1.84, isUp: true, digits: 2 },
  { id: '1000_CRASH', name: 'Crash 1000 Index', category: 'Synthetic Index', price: 9412.30, change: -0.42, isUp: false, digits: 2 },
  { id: '500_BOOM', name: 'Boom 500 Index', category: 'Synthetic Index', price: 4210.85, change: +2.15, isUp: true, digits: 2 },
  { id: 'frxEURUSD', name: 'EUR / USD', category: 'Forex Major', price: 1.08942, change: +0.12, isUp: true, digits: 5 },
  { id: 'frxXAUUSD', name: 'Gold (XAU/USD)', category: 'Precious Metal', price: 2384.60, change: +0.78, isUp: true, digits: 2 },
  { id: 'cryBTCUSD', name: 'Bitcoin (BTC/USD)', category: 'Crypto', price: 67450.00, change: +3.45, isUp: true, digits: 2 },
];

const LandingPage: React.FC = () => {
  const history = useHistory();
  const { client, common } = useStore();
  const { is_logged_in } = client;

  // Live Ticker simulation
  const [tickers, setTickers] = useState<TickerAsset[]>(INITIAL_TICKERS);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Over / Under Simulator State
  const [contractType, setContractType] = useState<'OVER' | 'UNDER'>('OVER');
  const [predictionDigit, setPredictionDigit] = useState<number>(4);
  const [stakeAmount, setStakeAmount] = useState<number>(50);
  const [syntheticMarket, setSyntheticMarket] = useState<string>('Volatility 75 Index');
  const [calcCategory, setCalcCategory] = useState<string>('synthetics');

  // Over / Under Payout Calculation
  const calcOverUnder = () => {
    const winningDigits: number[] = [];

    if (contractType === 'OVER') {
      for (let d = predictionDigit + 1; d <= 9; d++) {
        winningDigits.push(d);
      }
    } else {
      for (let d = 0; d < predictionDigit; d++) {
        winningDigits.push(d);
      }
    }

    const winningCount = winningDigits.length;
    const winProbability = (winningCount / 10) * 100;
    // Multiplier based on Deriv ~2% house margin formula
    const multiplier = winningCount > 0 ? (9.8 / winningCount) : 0;
    const totalPayout = stakeAmount * multiplier;
    const netProfit = Math.max(0, totalPayout - stakeAmount);
    const returnPct = stakeAmount > 0 && winningCount > 0 ? ((netProfit / stakeAmount) * 100) : 0;

    return {
      winningDigits,
      winningCount,
      winProbability,
      multiplier,
      totalPayout,
      netProfit,
      returnPct,
    };
  };

  const ouRes = calcOverUnder();

  // Scroll-reveal using IntersectionObserver
  const revealRef = useRef<IntersectionObserver | null>(null);
  const initReveal = useCallback(() => {
    revealRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('piplux-revealed');
            revealRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.piplux-reveal').forEach(el => {
      revealRef.current?.observe(el);
    });
  }, []);

  useEffect(() => {
    // Small delay so DOM is ready
    const t = setTimeout(initReveal, 100);
    return () => {
      clearTimeout(t);
      revealRef.current?.disconnect();
    };
  }, [initReveal]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTickers(prev =>
        prev.map(t => {
          const deltaPct = (Math.random() - 0.48) * 0.002;
          const newPrice = Math.max(0.0001, t.price * (1 + deltaPct));
          const isUp = newPrice >= t.price;
          return {
            ...t,
            price: newPrice,
            isUp,
          };
        })
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (is_logged_in || urlParams.has('code') || urlParams.has('token1') || urlParams.has('acct1')) {
      history.replace({
        pathname: routes.trader,
        search: window.location.search,
      });
    }
  }, [is_logged_in, history]);

  const handleSignUp = () => {
    window.location.href = getSignupUrl();
  };

  const handleLogin = async () => {
    if (is_logged_in) {
      history.push(routes.trader);
    } else {
      await redirectToLogin(common.current_language);
    }
  };

  const handleGoToTrade = () => {
    history.push(routes.trader);
  };

  const handleHelpCentre = () => {
    window.open(getHelpCentreUrl(), '_blank', 'noopener,noreferrer');
  };

  // Platform Estimator outputs (unused but kept for future use)
  const getCalcResults = () => {
    switch (calcCategory) {
      case 'synthetics':
        return { speed: '< 10ms', payout: 'Up to 95%+', tools: 'SmartCharts & Bot', hours: '24/7 / 365 Days' };
      case 'forex':
        return { speed: '< 15ms', payout: 'Spreads from 0.5', tools: 'MT5 & WebTrader', hours: '24/5 Monday - Friday' };
      case 'metals':
        return { speed: '< 12ms', payout: 'Up to 90%+', tools: 'Advanced Indicators', hours: '24/5 Market Hours' };
      case 'crypto':
        return { speed: '< 10ms', payout: '1:100 Leverage', tools: 'TradingView Charts', hours: '24/7 Weekend Trading' };
      default:
        return { speed: '< 10ms', payout: 'Up to 95%+', tools: 'SmartCharts & Bot', hours: '24/7 / 365 Days' };
    }
  };

  const calcRes = getCalcResults();
  void calcRes; // suppress unused variable warning

  const urlParams = new URLSearchParams(window.location.search);
  const isLoginRedirect = urlParams.has('code') || urlParams.has('token1') || urlParams.has('acct1');

  if (isLoginRedirect) {
    return null;
  }

  return (
    <div className="piplux-landing">
      {/* Background Faded Gold Grid & Glows */}
      <div className="piplux-landing__grid-bg" />
      <div className="piplux-landing__ambient-glow" />
      <div className="piplux-landing__ambient-glow-secondary" />

      <div className="piplux-landing__container">
        {/* Navigation Header */}
        <header className="piplux-landing__nav">
          <div className="piplux-landing__brand" onClick={() => history.push(routes.landing)}>
            <div className="piplux-landing__brand-logo">
              <span className="piplux-landing__logo-p">P</span>
              <span className="piplux-landing__logo-slash">/</span>
              <span className="piplux-landing__logo-l">L</span>
            </div>
            <div className="piplux-landing__brand-name">PIPLUX</div>
          </div>

          <div className="piplux-landing__nav-links">
            <a className="piplux-landing__link" href="#markets">Markets</a>
            <a className="piplux-landing__link" href="#features">Features</a>
            <a className="piplux-landing__link" href="#calculator">Calculator</a>
            <a className="piplux-landing__link" href="#steps">Get Started</a>
            <a className="piplux-landing__link" href="#faq">FAQ</a>
          </div>

          <div className="piplux-landing__nav-actions">
            <button className="piplux-landing__btn-gold" onClick={handleLogin}>
              Log In
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <section className="piplux-landing__hero">
          <h1 className="piplux-landing__hero-title piplux-reveal piplux-reveal--fade-up">
            Trade Synthetic Indices, Forex &amp; Commodities with{' '}
            <span className="piplux-landing__gold-gradient-text">PIPLUX</span>
          </h1>

          <p className="piplux-landing__hero-subtitle piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.15s' }}>
            Experience institutional-grade order execution, 24/7 synthetic market access, interactive SmartCharts,
            and automated trading tools on a platform optimized for seamless user performance.
          </p>

          <div className="piplux-landing__hero-ctas piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.3s' }}>
            <button className="piplux-landing__btn-gold" onClick={handleSignUp}>
              Create Free Account &rarr;
            </button>
            <button className="piplux-landing__btn-outline" onClick={handleGoToTrade}>
              Open PIPLUX WebTrader
            </button>
          </div>

          {/* Stats Bar */}
          <div className="piplux-landing__stats-bar piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.45s' }}>
            <div className="piplux-landing__stat-item">
              <div className="piplux-landing__stat-value">24<span>/7</span></div>
              <div className="piplux-landing__stat-label">Synthetics Trading</div>
            </div>
            <div className="piplux-landing__stat-item">
              <div className="piplux-landing__stat-value">&lt;<span>10ms</span></div>
              <div className="piplux-landing__stat-label">Order Latency</div>
            </div>
            <div className="piplux-landing__stat-item">
              <div className="piplux-landing__stat-value">99.9<span>%</span></div>
              <div className="piplux-landing__stat-label">Platform Uptime</div>
            </div>
            <div className="piplux-landing__stat-item">
              <div className="piplux-landing__stat-value">100<span>+</span></div>
              <div className="piplux-landing__stat-label">Global Assets</div>
            </div>
          </div>
        </section>

        {/* Live Ticker Section */}
        <section id="markets" className="piplux-landing__ticker-section">
          <h2 className="piplux-landing__section-title piplux-reveal piplux-reveal--fade-up">Live Market Quotes</h2>
          <p className="piplux-landing__section-subtitle piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.1s' }}>Real-time pricing for synthetic volatility indices, forex pairs, and commodities.</p>

          <div className="piplux-landing__ticker-grid">
            {tickers.map((item, idx) => (
              <div key={item.id} className="piplux-landing__ticker-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: `${0.05 * idx}s` }}>
                <div className="piplux-landing__ticker-header">
                  <span className="piplux-landing__ticker-name">{item.name}</span>
                  <span className="piplux-landing__ticker-tag">{item.category}</span>
                </div>
                <div className="piplux-landing__ticker-price">
                  {item.price.toFixed(item.digits)}
                </div>
                <div className={`piplux-landing__ticker-change ${item.isUp ? 'piplux-landing__ticker-change--up' : 'piplux-landing__ticker-change--down'}`}>
                  {item.isUp ? '▲' : '▼'} {item.change > 0 ? `+${item.change.toFixed(2)}%` : `${item.change.toFixed(2)}%`}
                </div>
                <div className="piplux-landing__ticker-cta">
                  <button className="piplux-landing__mini-btn" onClick={handleGoToTrade}>
                    Trade Asset
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Why PIPLUX Features */}
        <section id="features" className="piplux-landing__features-section">
          <h2 className="piplux-landing__section-title piplux-reveal piplux-reveal--fade-up">Engineered for Superior Performance</h2>
          <p className="piplux-landing__section-subtitle piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.1s' }}>Everything you need to dominate synthetic indices and financial markets.</p>

          <div className="piplux-landing__features-grid">
            <div className="piplux-landing__feature-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.05s' }}>
              <div className="piplux-landing__feature-icon">⚡</div>
              <h3 className="piplux-landing__feature-title">24/7 Synthetic Indices</h3>
              <p className="piplux-landing__feature-desc">
                Trade proprietary Volatility 75, Crash 1000, Boom 500, and Step Indices 365 days a year without market closures or weekend gaps.
              </p>
            </div>

            <div className="piplux-landing__feature-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.1s' }}>
              <div className="piplux-landing__feature-icon">📈</div>
              <h3 className="piplux-landing__feature-title">Advanced SmartCharts</h3>
              <p className="piplux-landing__feature-desc">
                Analyze market trends effortlessly with real-time tick streaming, multi-timeframe controls, and technical indicators optimized for all traders.
              </p>
            </div>

            <div className="piplux-landing__feature-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.15s' }}>
              <div className="piplux-landing__feature-icon">🤖</div>
              <h3 className="piplux-landing__feature-title">Automated Trading &amp; Bots</h3>
              <p className="piplux-landing__feature-desc">
                Deploy automated trading strategies seamlessly using Deriv Bot and MetaTrader 5 (MT5) integration.
              </p>
            </div>

            <div className="piplux-landing__feature-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.2s' }}>
              <div className="piplux-landing__feature-icon">💎</div>
              <h3 className="piplux-landing__feature-title">Instant Funding &amp; Payouts</h3>
              <p className="piplux-landing__feature-desc">
                Deposit and withdraw funds instantly using multiple local payment gateways, bank transfers, e-wallets, and crypto.
              </p>
            </div>

            <div className="piplux-landing__feature-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.25s' }}>
              <div className="piplux-landing__feature-icon">🛡️</div>
              <h3 className="piplux-landing__feature-title">Negative Balance Protection</h3>
              <p className="piplux-landing__feature-desc">
                Trade with confidence knowing your maximum risk is limited to your account balance, protecting you from extreme market spikes.
              </p>
            </div>

            <div className="piplux-landing__feature-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.3s' }}>
              <div className="piplux-landing__feature-icon">📱</div>
              <h3 className="piplux-landing__feature-title">Multi-Device WebTrader</h3>
              <p className="piplux-landing__feature-desc">
                Access your trading hub from any browser, smartphone, or tablet with lightning fast SmartCharts integration.
              </p>
            </div>
          </div>
        </section>

        {/* Platforms Showcase */}
        <section className="piplux-landing__platforms-section">
          <div className="piplux-landing__platform-box piplux-reveal piplux-reveal--fade-up">
            <div className="piplux-landing__platform-info">
              <h3>PIPLUX Multi-Asset Platform</h3>
              <p>
                Whether you prefer high-frequency synthetic volatility trading, automated drag-and-drop bots, or traditional MT5 charting, PIPLUX provides a unified ecosystem.
              </p>
              <ul className="piplux-landing__platform-list">
                <li><span>✓</span> Deriv WebTrader &amp; SmartCharts</li>
                <li><span>✓</span> MetaTrader 5 (MT5) Standard &amp; Financial</li>
                <li><span>✓</span> Deriv Bot Strategy Builder</li>
                <li><span>✓</span> Deriv X Custom Interface</li>
              </ul>
              <button className="piplux-landing__btn-gold" onClick={handleGoToTrade}>
                Launch Trading Workspace &rarr;
              </button>
            </div>

            <div className="piplux-landing__platform-preview">
              <div className="piplux-landing__preview-topbar">
                <div className="piplux-landing__dots">
                  <span />
                  <span />
                  <span />
                </div>
                <div style={{ fontSize: '12px', color: '#ffd700', fontWeight: 600 }}>PIPLUX TRADER HUB v2.4</div>
              </div>
              <div style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ color: '#fff', fontWeight: 700 }}>Asset: Volatility 75 Index</span>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>Rise / Fall</span>
                </div>
                <div style={{ background: 'rgba(212, 175, 55, 0.08)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(212, 175, 55, 0.2)', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff' }}>
                    <span>Current Spot:</span>
                    <span style={{ color: '#ffd700', fontWeight: 800 }}>684,215.42</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fff', marginTop: '6px' }}>
                    <span>Potential Payout:</span>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>+95.4%</span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 700 }}>RISE ▲</button>
                  <button style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '6px', fontWeight: 700 }}>FALL ▼</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Over / Under Digit Payout Simulator */}
        <section id="calculator" className="piplux-landing__calc-section">
          <h2 className="piplux-landing__section-title piplux-reveal piplux-reveal--fade-up">Over / Under Digit Payout Simulator</h2>
          <p className="piplux-landing__section-subtitle piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.1s' }}>Simulate real-time payouts, win probabilities, and net returns for Over/Under digit contracts on PIPLUX Synthetic Indices.</p>

          <div className="piplux-landing__calc-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.2s' }}>
            <div className="piplux-landing__calc-grid">
              <div>
                {/* Synthetic Market Selector */}
                <div className="piplux-landing__calc-group" style={{ marginBottom: '18px' }}>
                  <label htmlFor="piplux-calc-synthetic-market">Select Synthetic Index</label>
                  <select 
                    id="piplux-calc-synthetic-market"
                    value={syntheticMarket} 
                    onChange={e => setSyntheticMarket(e.target.value)}
                  >
                    <option value="Volatility 75 Index">Volatility 75 Index (24/7)</option>
                    <option value="Volatility 100 Index">Volatility 100 Index (24/7)</option>
                    <option value="Volatility 50 Index">Volatility 50 Index (24/7)</option>
                    <option value="Volatility 25 Index">Volatility 25 Index (24/7)</option>
                    <option value="Volatility 10 Index">Volatility 10 Index (24/7)</option>
                  </select>
                </div>

                {/* Contract Type (Over vs Under) */}
                <div className="piplux-landing__calc-group" style={{ marginBottom: '18px' }}>
                  <label>Contract Trade Type</label>
                  <div className="piplux-landing__type-toggles">
                    <button 
                      type="button"
                      className={`piplux-landing__toggle-btn ${contractType === 'OVER' ? 'piplux-landing__toggle-btn--active-over' : ''}`}
                      onClick={() => setContractType('OVER')}
                    >
                      DIGIT OVER ▲
                    </button>
                    <button 
                      type="button"
                      className={`piplux-landing__toggle-btn ${contractType === 'UNDER' ? 'piplux-landing__toggle-btn--active-under' : ''}`}
                      onClick={() => setContractType('UNDER')}
                    >
                      DIGIT UNDER ▼
                    </button>
                  </div>
                </div>

                {/* Digit Selector (0-9) */}
                <div className="piplux-landing__calc-group" style={{ marginBottom: '18px' }}>
                  <label>Prediction Last Digit ({contractType} {predictionDigit})</label>
                  <div className="piplux-landing__digits-grid">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
                      <button 
                        key={digit}
                        type="button"
                        className={`piplux-landing__digit-btn ${predictionDigit === digit ? 'piplux-landing__digit-btn--active' : ''}`}
                        onClick={() => setPredictionDigit(digit)}
                      >
                        {digit}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stake Slider */}
                <div className="piplux-landing__calc-group">
                  <label htmlFor="piplux-calc-stake-range">Trade Stake ($USD): ${stakeAmount}</label>
                  <input 
                    id="piplux-calc-stake-range"
                    type="range" 
                    min={10} 
                    max={1000} 
                    step={10} 
                    value={stakeAmount} 
                    onChange={e => setStakeAmount(Number(e.target.value))} 
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: '12px', marginTop: '6px' }}>
                    <span>$10</span>
                    <span>$500</span>
                    <span>$1,000</span>
                  </div>
                </div>
              </div>

              {/* Simulation Result Output */}
              <div className="piplux-landing__calc-result-box">
                <div style={{ borderBottom: '1px solid rgba(212, 175, 55, 0.2)', paddingBottom: '12px', marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px' }}>Contract Prediction</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', marginTop: '4px', lineHeight: 1.3, wordBreak: 'break-word' }}>
                    {syntheticMarket} –{' '}
                    <span style={{ color: contractType === 'OVER' ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>{contractType} {predictionDigit}</span>
                  </div>
                </div>

                <div className="piplux-landing__calc-row">
                  <span className="label">Winning Digits:</span>
                  <div className="piplux-landing__winning-pills">
                    {ouRes.winningDigits.length > 0 ? (
                      ouRes.winningDigits.map(d => <span key={d} className="pill">{d}</span>)
                    ) : (
                      <span style={{ color: '#ef4444', fontSize: '12px' }}>No winning digits</span>
                    )}
                  </div>
                </div>

                <div className="piplux-landing__calc-row">
                  <span className="label">Win Probability:</span>
                  <span className="val">{ouRes.winProbability.toFixed(1)}%</span>
                </div>

                <div className="piplux-landing__calc-row">
                  <span className="label">Payout Multiplier:</span>
                  <span className="val">{ouRes.multiplier > 0 ? `${ouRes.multiplier.toFixed(2)}x` : 'N/A'}</span>
                </div>

                <div className="piplux-landing__calc-row">
                  <span className="label">Total Payout Return:</span>
                  <span className="val">${ouRes.totalPayout.toFixed(2)}</span>
                </div>

                <div className="piplux-landing__calc-row">
                  <span className="label">Net Profit Return:</span>
                  <span className="val" style={{ color: '#10b981' }}>
                    +${ouRes.netProfit.toFixed(2)} (+{ouRes.returnPct.toFixed(1)}%)
                  </span>
                </div>

                <button className="piplux-landing__btn-gold" style={{ marginTop: '20px', width: '100%' }} onClick={handleGoToTrade}>
                  Trade Over/Under on PIPLUX &rarr;
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 3 Step Getting Started */}
        <section id="steps" className="piplux-landing__steps-section">
          <h2 className="piplux-landing__section-title">Start Trading in 3 Simple Steps</h2>
          <p className="piplux-landing__section-subtitle">Join thousands of traders on PIPLUX today.</p>

          <div className="piplux-landing__steps-grid">
            <div className="piplux-landing__step-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.05s' }}>
              <div className="piplux-landing__step-num">1</div>
              <h3 className="piplux-landing__step-title">Register Account</h3>
              <p className="piplux-landing__step-desc">
                Sign up in under 60 seconds with your email. No long forms or complex verification to get started.
              </p>
            </div>

            <div className="piplux-landing__step-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.15s' }}>
              <div className="piplux-landing__step-num">2</div>
              <h3 className="piplux-landing__step-title">Fund Your Account</h3>
              <p className="piplux-landing__step-desc">
                Choose from crypto, e-wallets, or local payment channels to deposit funds instantly with zero deposit fees.
              </p>
            </div>

            <div className="piplux-landing__step-card piplux-reveal piplux-reveal--fade-up" style={{ transitionDelay: '0.25s' }}>
              <div className="piplux-landing__step-num">3</div>
              <h3 className="piplux-landing__step-title">Start Trading</h3>
              <p className="piplux-landing__step-desc">
                Access Volatility 75, Crash/Boom, or Forex markets and execute trades instantly on PIPLUX.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="piplux-landing__faq-section">
          <h2 className="piplux-landing__section-title">Frequently Asked Questions</h2>
          <p className="piplux-landing__section-subtitle">Everything you need to know about trading on PIPLUX Deriv Whitelabel.</p>

          <div className="piplux-landing__faq-container piplux-reveal piplux-reveal--fade-up">
            {[
              {
                q: 'What are Synthetic Indices on PIPLUX?',
                a: 'Synthetic indices simulate real-world market volatility using cryptographically secure random number generators audited by independent third parties. They allow you to trade Volatility, Crash/Boom, and Jump indices 24/7 without affected by global events.',
              },
              {
                q: 'How fast are deposits and withdrawals?',
                a: 'Deposits are credited instantly to your account. Withdrawal requests are processed electronically, with crypto and e-wallet transfers completing within minutes.',
              },
              {
                q: 'Can I trade on MetaTrader 5 (MT5) with PIPLUX?',
                a: 'Yes, PIPLUX supports full integration with MetaTrader 5 (MT5), allowing you to trade Forex, CFDs, and Synthetics using expert advisors (EAs) and advanced technical analysis tools.',
              },
              {
                q: 'Is there a minimum deposit requirement?',
                a: 'No minimum deposit is strictly enforced. You can begin trading with as little as $5 to test strategies and explore the PIPLUX interface.',
              },
            ].map((faq, idx) => (
              <div key={idx} className="piplux-landing__faq-item">
                <div 
                  className="piplux-landing__faq-question"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                >
                  <span>{faq.q}</span>
                  <span>{openFaq === idx ? '−' : '+'}</span>
                </div>
                {openFaq === idx && (
                  <div className="piplux-landing__faq-answer">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="piplux-landing__footer">
          <div className="piplux-landing__footer-grid">
            <div className="piplux-landing__footer-about">
              <div className="piplux-landing__brand">
                <div className="piplux-landing__brand-logo">
                  <span className="piplux-landing__logo-p">P</span>
                  <span className="piplux-landing__logo-slash">/</span>
                  <span className="piplux-landing__logo-l">L</span>
                </div>
                <div className="piplux-landing__brand-name">PIPLUX</div>
              </div>
              <p>
                PIPLUX is an official white-label derivatives platform powered by Deriv technology, delivering ultra-fast synthetic indices, Forex, and multi-asset trading solutions worldwide.
              </p>
            </div>

            <div className="piplux-landing__footer-col">
              <h4>Quick Links</h4>
              <ul>
                <li><span onClick={handleGoToTrade}>Trading Hub</span></li>
                <li><a href="#markets">Live Markets</a></li>
                <li><a href="#features">Platform Features</a></li>
                <li><a href="#calculator">Trading Calculator</a></li>
              </ul>
            </div>

            <div className="piplux-landing__footer-col">
              <h4>Platforms</h4>
              <ul>
                <li><span onClick={handleGoToTrade}>PIPLUX WebTrader</span></li>
                <li><span onClick={handleGoToTrade}>MetaTrader 5 (MT5)</span></li>
                <li><span onClick={handleGoToTrade}>Deriv Bot</span></li>
                <li><span onClick={handleGoToTrade}>Deriv X</span></li>
              </ul>
            </div>

            <div className="piplux-landing__footer-col">
              <h4>Support &amp; Legal</h4>
              <ul>
                <li><span onClick={handleHelpCentre}>Help Centre</span></li>
                <li><span onClick={handleSignUp}>Create Account</span></li>
                <li><span onClick={handleHelpCentre}>Terms of Service</span></li>
                <li><span onClick={handleHelpCentre}>Privacy Policy</span></li>
              </ul>
            </div>
          </div>

          <div className="piplux-landing__footer-bottom">
            <p className="piplux-landing__risk-notice">
              Risk Warning: Trading derivatives involves a high level of risk and may not be suitable for all investors. 
              The financial products offered carry a high level of risk and can result in the loss of all your funds. 
              You should never invest money that you cannot afford to lose.
            </p>
            <p>&copy; {new Date().getFullYear()} PIPLUX TRADING HUB. All Rights Reserved. Powered by Deriv Whitelabel Infrastructure.</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
