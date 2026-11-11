import React from 'react';
import { useHistory } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import { addComma, getCurrencyDisplayCode, getWhoAmIURL, routes } from '@deriv/shared';
import { useStore } from '@deriv/stores';
import { fetchAccounts, type TAccount } from 'Services/accounts-api';
import { hasStoredSession } from 'Services/oauth';
import WS from 'Services/ws-methods';

import {
    runEntryScanAll,
    SCAN_MARKET_NAMES,
    SCAN_MARKETS,
} from '../../../../../bots/entryScanner';
import type { DerivApiClient, ScanResult } from '../../../../../bots/aiScannerTypes';

import './PipluxHome.scss';

type PnlRange = '3d' | '7d' | '30d';
type EvalFilter = 'all' | 'high' | '1s';
type MarketTabId = 'synthetics' | 'forex' | 'crypto' | 'commodities';

type PnlBarBucket = {
    label: string;
    value: number;
    trades: number;
    wins: number;
};

type WatchlistQuote = {
    symbol: string;
    name: string;
    desc: string;
    price: number | null;
    delta: number;
    decimals: number;
    history: number[];
};

const PENDING_SCANNER_SETUP_KEY = 'piplux_pending_scanner_setup';
const SCANNER_CACHE_KEY = 'piplux_home_scanner_cache_v1';
const SCANNER_CACHE_TTL_MS = 60_000;
const HIDE_BALANCE_KEY = 'piplux_hide_balance';

const WATCHLIST_CATALOG: Record<MarketTabId, Array<{ symbol: string; name: string; desc: string; decimals: number }>> = {
    synthetics: [
        { symbol: '1HZ10V', name: 'Volatility 10 (1s)', desc: 'Deriv 1-sec Synthetic Index', decimals: 2 },
        { symbol: '1HZ75V', name: 'Volatility 75 (1s)', desc: 'High-beta 1-sec Synthetic', decimals: 2 },
        { symbol: 'JD25', name: 'Jump 25 Index', desc: 'Poisson jump volatility', decimals: 2 },
        { symbol: 'BOOM1000', name: 'Boom 1000 Index', desc: 'Spike probability 1000', decimals: 2 },
    ],
    forex: [
        { symbol: 'frxEURUSD', name: 'EUR / USD', desc: 'Euro / US Dollar Spot', decimals: 5 },
        { symbol: 'frxGBPUSD', name: 'GBP / USD', desc: 'British Pound / US Dollar', decimals: 5 },
        { symbol: 'frxUSDJPY', name: 'USD / JPY', desc: 'US Dollar / Japanese Yen', decimals: 2 },
    ],
    crypto: [
        { symbol: 'cryBTCUSD', name: 'BTC / USD', desc: 'Bitcoin Index', decimals: 2 },
        { symbol: 'cryETHUSD', name: 'ETH / USD', desc: 'Ethereum Index', decimals: 2 },
    ],
    commodities: [
        { symbol: 'frxXAUUSD', name: 'XAU / USD', desc: 'Gold Spot Bullion', decimals: 2 },
        { symbol: 'frxXAGUSD', name: 'XAG / USD', desc: 'Silver Spot Ounce', decimals: 2 },
    ],
};

const MARKET_TABS: Array<{ id: MarketTabId; label: string }> = [
    { id: 'synthetics', label: 'Synthetics' },
    { id: 'forex', label: 'Forex' },
    { id: 'crypto', label: 'Crypto' },
    { id: 'commodities', label: 'Commodities' },
];

const DAILY_TARGET_PRESETS = [10, 50, 100, 250];
const TICK_WINDOW_OPTIONS = [100, 250, 500, 1000];

const buildDerivApiClient = (): DerivApiClient => {
    const wsAny = WS as unknown as Record<string, any>;
    return {
        send: async <T = unknown>(req: Record<string, unknown>): Promise<T> => {
            if (req.ticks_history && typeof wsAny?.getTicksHistory === 'function') {
                return (await wsAny.getTicksHistory(req)) as T;
            }
            if (typeof wsAny?.send === 'function') {
                return (await wsAny.send(req)) as T;
            }
            if (typeof wsAny?.get === 'function' && typeof wsAny.get()?.send === 'function') {
                return (await wsAny.get().send(req)) as T;
            }
            if (typeof wsAny?.authorized?.send === 'function') {
                return (await wsAny.authorized.send(req)) as T;
            }
            throw new Error('Deriv WebSocket connection is not initialized');
        },
        subscribe: <T = unknown>(req: Record<string, unknown>, onMessage: (msg: T) => void) => {
            if (req.ticks && typeof wsAny?.subscribeTicks === 'function') {
                const sub = wsAny.subscribeTicks(req.ticks, onMessage);
                return {
                    unsubscribe: () => {
                        if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe();
                    },
                };
            }
            if (typeof wsAny?.subscribe === 'function') {
                const sub = wsAny.subscribe(req, onMessage);
                return {
                    unsubscribe: () => {
                        if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe();
                    },
                };
            }
            throw new Error('Deriv WebSocket subscribe is not available');
        },
    };
};

const getGreetingText = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
};

const getLocalDayKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatCurrencyValue = (amount: number, currency: string, { signed = false } = {}) => {
    const code = getCurrencyDisplayCode(currency || 'USD') || 'USD';
    const symbol = code === 'USD' ? '$' : `${code} `;
    const absStr = addComma(Math.abs(amount).toFixed(2), 2);
    if (signed) {
        return `${amount >= 0 ? '+ ' : '- '}${symbol}${absStr}`;
    }
    return `${symbol} ${absStr}`.replace('$  ', '$ ');
};

const createSparklinePoints = (points: number[]) => {
    if (points.length < 2) return '0,11 58,11';
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 58;
    const height = 22;
    return points
        .map((val, idx) => {
            const x = (idx / (points.length - 1)) * width;
            const y = height - ((val - min) / range) * (height - 4) - 2;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
};

const isUsefulProfileName = (candidate: unknown, loginid?: string | null): candidate is string => {
    if (typeof candidate !== 'string') return false;
    const clean = candidate.trim();
    if (!clean) return false;
    const lower = clean.toLowerCase();
    if (['demo', 'real', 'virtual', 'deriv', 'user'].includes(lower)) return false;
    if (loginid && clean.toUpperCase() === loginid.toUpperCase()) return false;
    return true;
};

const getTargetStorageKey = (loginid?: string | null) => `piplux_daily_target_${loginid || 'default'}`;
const getDisplayNameCacheKey = (loginid?: string | null) => `piplux_display_name_${loginid || 'default'}`;

type StoredAccountSnapshot = {
    loginid?: string;
    account_id?: string;
    balance?: number | string;
    currency?: string;
    account_type?: 'demo' | 'real';
    is_virtual?: number | boolean;
};

const readStoredAccountSnapshot = (): StoredAccountSnapshot => {
    try {
        const raw = localStorage.getItem('current_account');
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

const loadSavedTarget = (loginid: string | undefined | null, isVirtual: boolean) => {
    const fallback = isVirtual ? 100 : 250;
    try {
        const raw = localStorage.getItem(getTargetStorageKey(loginid));
        const num = Number(raw);
        return Number.isFinite(num) && num >= 10 ? num : fallback;
    } catch {
        return fallback;
    }
};

type ProfitTx = {
    buy_price?: number | string;
    sell_price?: number | string;
    sell_time?: number;
    purchase_time?: number;
};

const PipluxHome: React.FC = observer(() => {
    const history = useHistory();
    const { client, common, ui } = useStore();
    const {
        balance,
        currency,
        email,
        email_address,
        is_logged_in,
        is_virtual,
        loginid,
        switchAccount,
    } = client;
    const { is_socket_opened } = common;

    const storedSnapshot = React.useMemo(
        () => readStoredAccountSnapshot(),
        [loginid, balance, is_virtual, is_logged_in]
    );
    const snapshotLoginId = storedSnapshot.loginid || storedSnapshot.account_id || '';
    const effectiveLoginId = loginid || snapshotLoginId;
    const effectiveIsVirtual = loginid
        ? is_virtual
        : storedSnapshot.account_type
          ? storedSnapshot.account_type === 'demo'
          : typeof storedSnapshot.is_virtual === 'boolean' || typeof storedSnapshot.is_virtual === 'number'
            ? Boolean(storedSnapshot.is_virtual)
            : snapshotLoginId
              ? /^(VR|DEM)/i.test(snapshotLoginId)
              : is_virtual;
    const effectiveCurrency = currency || storedSnapshot.currency || 'USD';

    const scrollerRef = React.useRef<HTMLDivElement>(null);
    const greetingRowRef = React.useRef<HTMLDivElement>(null);
    const modeRowRef = React.useRef<HTMLDivElement>(null);
    const heroRef = React.useRef<HTMLElement>(null);
    const targetInputRef = React.useRef<HTMLInputElement>(null);

    const [displayName, setDisplayName] = React.useState<string>(() => {
        try {
            return sessionStorage.getItem(getDisplayNameCacheKey(effectiveLoginId)) || '';
        } catch {
            return '';
        }
    });
    const [accounts, setAccounts] = React.useState<TAccount[]>([]);
    const [isSwitchingAccount, setIsSwitchingAccount] = React.useState(false);

    const [hideBalance, setHideBalance] = React.useState<boolean>(() => {
        try {
            return localStorage.getItem(HIDE_BALANCE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    // P&L and Daily Target (purely sums today's settled trades — isolated from bot Take Profit)
    const [pnlRange, setPnlRange] = React.useState<PnlRange>('3d');
    const [activeBarIndex, setActiveBarIndex] = React.useState<number | null>(null);
    const [profitTransactions, setProfitTransactions] = React.useState<ProfitTx[]>([]);
    const [dailyTarget, setDailyTarget] = React.useState<number>(() =>
        loadSavedTarget(effectiveLoginId, effectiveIsVirtual)
    );
    const [targetInput, setTargetInput] = React.useState<string>(() =>
        String(loadSavedTarget(effectiveLoginId, effectiveIsVirtual))
    );
    const [targetError, setTargetError] = React.useState<string>('');

    // Evaluated Markets (same AI Scanner engine as AiScannerDrawerContent)
    const [tickCount, setTickCount] = React.useState<number>(500);
    const [isScanning, setIsScanning] = React.useState<boolean>(false);
    const [scanProgress, setScanProgress] = React.useState<{ completed: number; total: number }>({
        completed: 0,
        total: SCAN_MARKETS.length,
    });
    const [evalResults, setEvalResults] = React.useState<ScanResult[]>([]);
    const [lastScanTs, setLastScanTs] = React.useState<number | null>(null);
    const [evalFilter, setEvalFilter] = React.useState<EvalFilter>('all');

    // Global Markets live watchlist
    const [activeMarketTab, setActiveMarketTab] = React.useState<MarketTabId>('synthetics');
    const [quotesByCategory, setQuotesByCategory] = React.useState<Record<MarketTabId, WatchlistQuote[]>>(() => ({
        synthetics: WATCHLIST_CATALOG.synthetics.map(m => ({ ...m, price: null, delta: 0, history: [] })),
        forex: WATCHLIST_CATALOG.forex.map(m => ({ ...m, price: null, delta: 0, history: [] })),
        crypto: WATCHLIST_CATALOG.crypto.map(m => ({ ...m, price: null, delta: 0, history: [] })),
        commodities: WATCHLIST_CATALOG.commodities.map(m => ({ ...m, price: null, delta: 0, history: [] })),
    }));
    const [utcClock, setUtcClock] = React.useState<string>(() => new Date().toISOString().slice(11, 19));
    const [toastMessage, setToastMessage] = React.useState<string>('');

    const notify = React.useCallback((msg: string) => {
        setToastMessage(msg);
    }, []);

    React.useEffect(() => {
        if (!toastMessage) return undefined;
        const timer = setTimeout(() => setToastMessage(''), 3200);
        return () => clearTimeout(timer);
    }, [toastMessage]);

    // Sync saved daily target when switching account/loginid
    React.useEffect(() => {
        const nextTarget = loadSavedTarget(effectiveLoginId, effectiveIsVirtual);
        setDailyTarget(nextTarget);
        setTargetInput(String(nextTarget));
        setTargetError('');
    }, [effectiveLoginId, effectiveIsVirtual]);

    // Update UTC clock
    React.useEffect(() => {
        const timer = setInterval(() => {
            setUtcClock(new Date().toISOString().slice(11, 19));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Scroll shrink behavior for Hero Header
    React.useEffect(() => {
        const scroller = scrollerRef.current;
        const hero = heroRef.current;
        if (!scroller || !hero) return undefined;

        const handleScroll = () => {
            const y = scroller.scrollTop;
            const progress = Math.min(1, y / 120);
            hero.style.setProperty('--scroll-p', progress.toFixed(3));
            hero.classList.toggle('piplux-home__hero--scrolled', y > 24);
            const collapsed = y > 88;
            [greetingRowRef.current, modeRowRef.current].forEach(el => {
                if (!el) return;
                if (collapsed) el.setAttribute('inert', '');
                else el.removeAttribute('inert');
            });
        };

        scroller.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => scroller.removeEventListener('scroll', handleScroll);
    }, []);

    // Scroll & entrance reveal animations (matching LandingPage)
    React.useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return undefined;

        const targets = Array.from(scroller.querySelectorAll('.piplux-home__reveal'));
        if (targets.length === 0) return undefined;

        if (typeof IntersectionObserver === 'undefined') {
            targets.forEach(el => el.classList.add('piplux-home__reveal--visible'));
            return undefined;
        }

        const observerInstance = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('piplux-home__reveal--visible');
                        observerInstance.unobserve(entry.target);
                    }
                });
            },
            { root: scroller, threshold: 0.06, rootMargin: '0px 0px -16px 0px' }
        );

        const viewportBottom = window.innerHeight || 900;
        const rafId = window.requestAnimationFrame(() => {
            targets.forEach(el => {
                const rect = el.getBoundingClientRect();
                if (rect.top <= viewportBottom + 48) {
                    el.classList.add('piplux-home__reveal--visible');
                } else {
                    observerInstance.observe(el);
                }
            });
        });

        return () => {
            window.cancelAnimationFrame(rafId);
            observerInstance.disconnect();
        };
    }, []);

    // 1. Fetch User Name + Available Accounts (Demo/Real) from Deriv Servers
    React.useEffect(() => {
        if (!is_logged_in && !hasStoredSession()) return undefined;
        let cancelled = false;

        const loadUserIdentity = async () => {
            let resolvedName = '';

            // 1a. Fetch user accounts for Demo/Live switcher & account name fallback
            let fetchedAccounts: TAccount[] = [];
            try {
                fetchedAccounts = await fetchAccounts();
                if (!cancelled) setAccounts(fetchedAccounts);
            } catch {
                // Non-fatal: continue with WS / whoami
            }

            // 1b. Query Deriv WS get_settings for first_name / last_name
            try {
                const wsAny = WS as unknown as Record<string, any>;
                const settingsRes = await (wsAny?.authorized?.send
                    ? wsAny.authorized.send({ get_settings: 1 })
                    : wsAny?.send?.({ get_settings: 1 }));
                const gs = settingsRes?.get_settings;
                const fullName = [gs?.first_name, gs?.last_name].filter(Boolean).join(' ').trim();
                if (isUsefulProfileName(fullName, loginid)) {
                    resolvedName = fullName;
                } else if (isUsefulProfileName(gs?.user_name, loginid)) {
                    resolvedName = gs.user_name.trim();
                }
            } catch {
                // Fall through to whoami / accounts
            }

            // 1c. Query OAuth whoami endpoint if WS get_settings has no name
            if (!resolvedName) {
                try {
                    const whoamiRes = await fetch(getWhoAmIURL(), { credentials: 'include' });
                    if (whoamiRes.ok) {
                        const whoamiData = await whoamiRes.json();
                        const traits = whoamiData?.identity?.traits;
                        const traitName =
                            (typeof traits?.first_name === 'string' && traits.first_name) ||
                            (typeof traits?.name === 'string' && traits.name) ||
                            [traits?.name?.first, traits?.name?.last].filter(Boolean).join(' ') ||
                            traits?.username;
                        if (isUsefulProfileName(traitName, loginid)) {
                            resolvedName = traitName.trim();
                        }
                    }
                } catch {
                    // Fall through to account / email
                }
            }

            // 1d. Check active account name from /trading/v1/options/accounts
            if (!resolvedName && fetchedAccounts.length > 0) {
                const activeAcc =
                    fetchedAccounts.find(a => a.account_id === effectiveLoginId) || fetchedAccounts[0];
                if (isUsefulProfileName(activeAcc?.name, effectiveLoginId)) {
                    resolvedName = activeAcc.name.trim();
                }
            }

            // 1e. Final clean fallback: email handle or loginid
            if (!resolvedName) {
                const mail =
                    email ||
                    email_address ||
                    fetchedAccounts.find(a => a.account_id === effectiveLoginId)?.email ||
                    '';
                if (mail && mail.includes('@')) {
                    resolvedName = mail.split('@')[0];
                } else {
                    resolvedName = effectiveLoginId || 'TRADER';
                }
            }

            if (!cancelled) {
                const isFallbackOnly = !isUsefulProfileName(resolvedName, effectiveLoginId);
                if (!is_logged_in && isFallbackOnly) {
                    return;
                }
                const upper = resolvedName.toUpperCase();
                setDisplayName(upper);
                if (!isFallbackOnly) {
                    try {
                        sessionStorage.setItem(getDisplayNameCacheKey(effectiveLoginId), upper);
                    } catch {
                        // Ignore storage failures
                    }
                }
            }
        };

        loadUserIdentity();
        return () => {
            cancelled = true;
        };
    }, [is_logged_in, effectiveLoginId, email, email_address]);

    // 2. Fetch Settled Trades from Deriv Servers for Net Daily P&L & Today's Profit Sum
    React.useEffect(() => {
        if (!is_logged_in || !is_socket_opened) return undefined;
        let cancelled = false;

        const loadProfitTable = async () => {
            try {
                const nowSec = Math.floor(Date.now() / 1000);
                const thirtyDaysAgo = nowSec - 30 * 24 * 60 * 60;
                const wsAny = WS as unknown as Record<string, any>;
                const res = wsAny?.authorized?.profitTable
                    ? await wsAny.authorized.profitTable(200, 0, { date_from: thirtyDaysAgo, date_to: nowSec + 60 })
                    : await wsAny?.profitTable?.(200, 0, { date_from: thirtyDaysAgo, date_to: nowSec + 60 });

                const txs = res?.profit_table?.transactions;
                if (!cancelled && Array.isArray(txs)) {
                    setProfitTransactions(txs);
                }
            } catch {
                // Keep previous transactions on transient error
            }
        };

        loadProfitTable();
        return () => {
            cancelled = true;
        };
    }, [is_logged_in, is_socket_opened, loginid, balance]);

    // 3. AI Scanner — Evaluate All Markets via Deriv WS
    const runEvaluatedScan = React.useCallback(
        async (selectedTicks = tickCount) => {
            if (isScanning) return;
            setIsScanning(true);
            setScanProgress({ completed: 0, total: SCAN_MARKETS.length });

            try {
                const api = buildDerivApiClient();
                const { allResults } = await runEntryScanAll(
                    api,
                    { tickCount: selectedTicks },
                    (completed, total) => {
                        setScanProgress({ completed, total });
                    }
                );
                setEvalResults(allResults);
                const now = Date.now();
                setLastScanTs(now);
                try {
                    sessionStorage.setItem(
                        SCANNER_CACHE_KEY,
                        JSON.stringify({ ts: now, tickCount: selectedTicks, allResults })
                    );
                } catch {
                    // Ignore storage quota errors
                }
            } catch {
                notify('Market scan failed — check connection and retry.');
            } finally {
                setIsScanning(false);
            }
        },
        [isScanning, tickCount, notify]
    );

    React.useEffect(() => {
        if (!is_socket_opened) return;

        try {
            const cachedRaw = sessionStorage.getItem(SCANNER_CACHE_KEY);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw) as { ts: number; tickCount: number; allResults: ScanResult[] };
                if (
                    Date.now() - cached.ts < SCANNER_CACHE_TTL_MS &&
                    Array.isArray(cached.allResults) &&
                    cached.allResults.length > 0
                ) {
                    setEvalResults(cached.allResults);
                    setLastScanTs(cached.ts);
                    setTickCount(cached.tickCount || 500);
                    return;
                }
            }
        } catch {
            // Proceed to fresh scan
        }

        if (evalResults.length === 0 && !isScanning) {
            runEvaluatedScan(tickCount);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_socket_opened]);

    // 4. Global Markets Live Quotes (Real Deriv Ticks for active tab)
    React.useEffect(() => {
        if (!is_socket_opened) return undefined;
        let cancelled = false;
        const subscriptions: Array<{ unsubscribe: () => void }> = [];
        const wsAny = WS as unknown as Record<string, any>;
        const tabAssets = WATCHLIST_CATALOG[activeMarketTab];

        const updateAssetQuote = (symbol: string, price: number) => {
            setQuotesByCategory(prev => {
                const list = prev[activeMarketTab].map(item => {
                    if (item.symbol !== symbol) return item;
                    const nextHist = [...item.history.slice(-11), price];
                    const base = nextHist[0] || price;
                    const delta = base > 0 ? ((price - base) / base) * 100 : 0;
                    return { ...item, price, delta, history: nextHist };
                });
                return { ...prev, [activeMarketTab]: list };
            });
        };

        tabAssets.forEach(async asset => {
            try {
                const histRes = await wsAny?.send?.({
                    ticks_history: asset.symbol,
                    count: 10,
                    end: 'latest',
                    style: 'ticks',
                });
                const prices = histRes?.history?.prices;
                if (!cancelled && Array.isArray(prices) && prices.length > 0) {
                    const nums = prices.map(Number).filter(Number.isFinite);
                    if (nums.length > 0) {
                        const latest = nums[nums.length - 1];
                        const first = nums[0];
                        const delta = first > 0 ? ((latest - first) / first) * 100 : 0;
                        setQuotesByCategory(prev => ({
                            ...prev,
                            [activeMarketTab]: prev[activeMarketTab].map(item =>
                                item.symbol === asset.symbol
                                    ? { ...item, price: latest, delta, history: nums }
                                    : item
                            ),
                        }));
                    }
                }
            } catch {
                // Ignore closed/unsupported symbols gracefully
            }

            try {
                if (typeof wsAny?.subscribeTicks === 'function') {
                    const sub = wsAny.subscribeTicks(asset.symbol, (msg: any) => {
                        const q = Number(msg?.tick?.quote);
                        if (!cancelled && Number.isFinite(q)) {
                            updateAssetQuote(asset.symbol, q);
                        }
                    });
                    if (sub && typeof sub.unsubscribe === 'function') {
                        subscriptions.push(sub);
                    }
                }
            } catch {
                // Ignore subscription errors
            }
        });

        return () => {
            cancelled = true;
            subscriptions.forEach(s => {
                try {
                    s.unsubscribe();
                } catch {
                    // No-op
                }
            });
        };
    }, [activeMarketTab, is_socket_opened]);

    // Aggregate P&L buckets + Today's exact sum
    const { bars, windowTotal, todayProfit, winRate } = React.useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
        const dayMap = new Map<string, { value: number; trades: number; wins: number }>();

        let todaysNet = 0;
        let todaysTrades = 0;
        let todaysWins = 0;

        profitTransactions.forEach(tx => {
            const sellTime = Number(tx.sell_time || tx.purchase_time || 0);
            const buyPrice = Number(tx.buy_price ?? 0);
            const sellPrice = Number(tx.sell_price ?? 0);
            const profit = Number.isFinite(sellPrice - buyPrice) ? sellPrice - buyPrice : 0;
            const dateObj = new Date(sellTime * 1000);
            const key = getLocalDayKey(dateObj);

            const prev = dayMap.get(key) || { value: 0, trades: 0, wins: 0 };
            dayMap.set(key, {
                value: prev.value + profit,
                trades: prev.trades + 1,
                wins: prev.wins + (profit > 0 ? 1 : 0),
            });

            if (sellTime >= startOfToday) {
                todaysNet += profit;
                todaysTrades += 1;
                if (profit > 0) todaysWins += 1;
            }
        });

        const buckets: PnlBarBucket[] = [];
        if (pnlRange === '3d' || pnlRange === '7d') {
            const daysCount = pnlRange === '3d' ? 3 : 7;
            for (let i = daysCount - 1; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
                const key = getLocalDayKey(d);
                const entry = dayMap.get(key) || { value: 0, trades: 0, wins: 0 };
                buckets.push({
                    label: d.toLocaleDateString('en-US', { weekday: 'short' }),
                    value: Number(entry.value.toFixed(2)),
                    trades: entry.trades,
                    wins: entry.wins,
                });
            }
        } else {
            for (let w = 3; w >= 0; w--) {
                let sum = 0;
                let trades = 0;
                let wins = 0;
                for (let dOffset = 0; dOffset < 7; dOffset++) {
                    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (w * 7 + dOffset));
                    const entry = dayMap.get(getLocalDayKey(d));
                    if (entry) {
                        sum += entry.value;
                        trades += entry.trades;
                        wins += entry.wins;
                    }
                }
                buckets.push({
                    label: `Wk ${4 - w}`,
                    value: Number(sum.toFixed(2)),
                    trades,
                    wins,
                });
            }
        }

        const sumWindow = buckets.reduce((acc, b) => acc + b.value, 0);
        const totalTradesWindow = buckets.reduce((acc, b) => acc + b.trades, 0);
        const totalWinsWindow = buckets.reduce((acc, b) => acc + b.wins, 0);
        const computedWinRate =
            todaysTrades > 0
                ? (todaysWins / todaysTrades) * 100
                : totalTradesWindow > 0
                  ? (totalWinsWindow / totalTradesWindow) * 100
                  : 0;

        return {
            bars: buckets,
            windowTotal: Number(sumWindow.toFixed(2)),
            todayProfit: Number(todaysNet.toFixed(2)),
            winRate: Number(computedWinRate.toFixed(1)),
        };
    }, [profitTransactions, pnlRange]);

    const handleToggleBalanceVisibility = () => {
        setHideBalance(prev => {
            const next = !prev;
            try {
                localStorage.setItem(HIDE_BALANCE_KEY, String(next));
            } catch {
                // Ignore storage failures
            }
            return next;
        });
    };

    const handleAccountModeClick = async (targetMode: 'demo' | 'live') => {
        if (isSwitchingAccount) return;
        const currentMode = effectiveIsVirtual ? 'demo' : 'live';
        if (currentMode === targetMode) return;

        setIsSwitchingAccount(true);
        let availableAccounts = accounts;
        if (availableAccounts.length === 0) {
            try {
                availableAccounts = await fetchAccounts();
                setAccounts(availableAccounts);
            } catch {
                // Fall through to validation
            }
        }

        const desiredType = targetMode === 'demo' ? 'demo' : 'real';
        const targetAcc = availableAccounts.find(a => a.account_type === desiredType);

        if (!targetAcc) {
            setIsSwitchingAccount(false);
            if (targetMode === 'live') {
                ui.toggleTryRealModal?.(true);
                notify('No Real account found yet — create one to trade Live.');
            } else {
                notify('No Demo account available.');
            }
            return;
        }

        notify(`Switching to ${targetMode === 'demo' ? 'Demo' : 'Live'} account...`);
        try {
            await Promise.resolve(switchAccount(targetAcc.account_id, targetAcc.account_type));
            window.location.reload();
        } catch {
            setIsSwitchingAccount(false);
            notify('Could not switch account — please retry.');
        }
    };

    const saveDailyTarget = (amount: number) => {
        const rounded = Math.round(amount * 100) / 100;
        setDailyTarget(rounded);
        setTargetInput(String(rounded));
        setTargetError('');
        try {
            localStorage.setItem(getTargetStorageKey(effectiveLoginId), String(rounded));
        } catch {
            // Ignore storage errors
        }
        notify(`Daily target set to $${rounded.toLocaleString('en-US')}`);
    };

    const validateAndSaveTarget = (e: React.FormEvent) => {
        e.preventDefault();
        const cleaned = Number(targetInput.trim().replace(/[$,\s]/g, ''));
        if (!Number.isFinite(cleaned) || cleaned < 10 || cleaned > 50000) {
            setTargetError('Enter a valid target between $10 and $50,000.');
            targetInputRef.current?.focus();
            return;
        }
        saveDailyTarget(cleaned);
    };

    // Exact same Apply flow as AiScannerDrawerContent
    const handleApplyEvaluatedMarket = (result: ScanResult) => {
        try {
            sessionStorage.setItem(
                PENDING_SCANNER_SETUP_KEY,
                JSON.stringify({
                    symbol: result.symbol,
                    contractType: 'over_under',
                    lastDigit: result.profile.initialPrediction,
                    ts: Date.now(),
                })
            );
        } catch {
            // Continue navigation with URL params
        }

        const marketName = SCAN_MARKET_NAMES[result.symbol] || result.symbol;
        notify(`Applying ${marketName} (Over/Under ${result.profile.initialPrediction})...`);
        history.push(`${routes.trader}?symbol=${encodeURIComponent(result.symbol)}&trade_type=over_under`);
    };

    const handleTradeWatchlistAsset = (symbol: string) => {
        history.push(`${routes.trader}?symbol=${encodeURIComponent(symbol)}`);
    };

    const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const idx = MARKET_TABS.findIndex(t => t.id === activeMarketTab);
        if (idx === -1) return;
        let nextIdx = idx;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % MARKET_TABS.length;
        else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + MARKET_TABS.length) % MARKET_TABS.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = MARKET_TABS.length - 1;
        else return;
        e.preventDefault();
        setActiveMarketTab(MARKET_TABS[nextIdx].id);
    };

    const hasLiveBalance = balance !== undefined && balance !== null && String(balance).trim() !== '';
    const rawBalance =
        hasLiveBalance && (Boolean(loginid) || Number(balance) !== 0 || storedSnapshot.balance === undefined)
            ? balance
            : effectiveLoginId && (!loginid || effectiveLoginId === snapshotLoginId)
              ? storedSnapshot.balance
              : undefined;
    const numericBalance = rawBalance !== undefined && rawBalance !== null && rawBalance !== '' ? Number(rawBalance) : NaN;
    const formattedBalance = Number.isFinite(numericBalance)
        ? formatCurrencyValue(numericBalance, effectiveCurrency)
        : '$ ••••••';

    const maxBarAbs = Math.max(...bars.map(b => Math.abs(b.value)), 1);
    const targetPctRaw = dailyTarget > 0 ? Math.round((todayProfit / dailyTarget) * 100) : 0;
    const remainingToTarget = dailyTarget - todayProfit;
    const targetHit = remainingToTarget <= 0;
    const todayStr = formatCurrencyValue(todayProfit, effectiveCurrency, { signed: todayProfit < 0 }).replace(
        /\s+/g,
        ''
    );
    const targetStr = `$${dailyTarget.toLocaleString('en-US')}`;

    const filteredEvalResults = evalResults.filter(item => {
        const winPct = item.metrics.total > 0 ? (item.metrics.wins / item.metrics.total) * 100 : 0;
        if (evalFilter === 'high') return winPct >= 90;
        if (evalFilter === '1s') return item.symbol.startsWith('1HZ');
        return true;
    });

    const scanAgeText = lastScanTs
        ? `Wilson 90% CI · Updated ${Math.max(1, Math.floor((Date.now() - lastScanTs) / 1000))}s ago`
        : 'Wilson 90% CI · Deriv Live Ticks';

    return (
        <div className='piplux-home'>
            {/* Ambient Gold Gridlines & Glowing Orbs (matching LandingPage aesthetic) */}
            <div className='piplux-home__bg-layer' aria-hidden='true'>
                <div className='piplux-home__grid-bg' />
                <div className='piplux-home__ambient-glow' />
                <div className='piplux-home__ambient-glow-secondary' />
                <div className='piplux-home__ambient-glow-accent' />
            </div>

            {/* Sticky / Shrinking Gold Balance Hero Header (State 3 -> State 4) */}
            <header className='piplux-home__hero' ref={heroRef}>
                <div className='piplux-home__hero-inner piplux-home__hero-reveal'>
                    <div className='piplux-home__greeting-row' ref={greetingRowRef}>
                        <div>
                            <p className='piplux-home__salutation'>{getGreetingText()}</p>
                            <p className='piplux-home__handle' data-testid='dt_home_username'>
                                {displayName || effectiveLoginId || 'PIPLUX'}
                            </p>
                        </div>
                        <span className='piplux-home__status-pill'>
                            <span
                                className={`piplux-home__status-dot ${
                                    is_socket_opened ? '' : 'piplux-home__status-dot--offline'
                                }`}
                                aria-hidden='true'
                            />
                            <span>{is_socket_opened ? 'PIPLUX LIVE' : 'CONNECTING'}</span>
                        </span>
                    </div>

                    <div className='piplux-home__balance-core'>
                        <div className='piplux-home__label-row'>
                            <span className='piplux-home__balance-label'>your total balance</span>
                            <button
                                type='button'
                                className='piplux-home__eye-btn'
                                onClick={handleToggleBalanceVisibility}
                                aria-pressed={hideBalance}
                                aria-label={hideBalance ? 'Show total balance' : 'Hide total balance'}
                            >
                                {hideBalance ? (
                                    <svg
                                        viewBox='0 0 24 24'
                                        width='24'
                                        height='24'
                                        fill='none'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        aria-hidden='true'
                                    >
                                        <path d='M17.94 17.94A10.94 10.94 0 0 1 12 18.5C5.8 18.5 2 12 2 12a20.6 20.6 0 0 1 5.06-5.94' />
                                        <path d='M9.9 5.7A10.8 10.8 0 0 1 12 5.5c6.2 0 10 6.5 10 6.5a20.5 20.5 0 0 1-3.16 4.19' />
                                        <line x1='2' y1='2' x2='22' y2='22' />
                                    </svg>
                                ) : (
                                    <svg
                                        viewBox='0 0 24 24'
                                        width='24'
                                        height='24'
                                        fill='none'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                        aria-hidden='true'
                                    >
                                        <path d='M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z' />
                                        <circle cx='12' cy='12' r='3' />
                                    </svg>
                                )}
                            </button>
                        </div>

                        <div className='piplux-home__amount-row'>
                            <h1 className='piplux-home__amount' data-testid='dt_home_balance'>
                                {hideBalance ? '$ ••••••••' : formattedBalance}
                            </h1>
                            <span className='piplux-home__compact-badge' aria-hidden='true'>
                                {effectiveIsVirtual ? 'DEMO' : 'LIVE'}
                            </span>
                        </div>
                    </div>

                    <div className='piplux-home__mode-row' ref={modeRowRef}>
                        <div className='piplux-home__mode-switch' role='group' aria-label='Account wallet mode'>
                            <button
                                type='button'
                                className={`piplux-home__mode-pill ${
                                    effectiveIsVirtual ? 'piplux-home__mode-pill--active' : ''
                                }`}
                                aria-pressed={effectiveIsVirtual}
                                disabled={isSwitchingAccount}
                                onClick={() => handleAccountModeClick('demo')}
                            >
                                Demo
                            </button>
                            <button
                                type='button'
                                className={`piplux-home__mode-pill ${
                                    !effectiveIsVirtual ? 'piplux-home__mode-pill--active' : ''
                                }`}
                                aria-pressed={!effectiveIsVirtual}
                                disabled={isSwitchingAccount}
                                onClick={() => handleAccountModeClick('live')}
                            >
                                Live
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className='piplux-home__scroller' ref={scrollerRef}>
                <main className='piplux-home__main'>
                    <div className='piplux-home__grid'>
                        {/* Card 1: Net Daily P&L (Real Settled Trades from Deriv) */}
                        <section
                            className='piplux-home__card piplux-home__pnl-card piplux-home__reveal'
                            style={{ transitionDelay: '0.05s' }}
                            aria-labelledby='pnl-heading'
                        >
                            <div className='piplux-home__pnl-header'>
                                <div>
                                    <h2 className='piplux-home__pnl-title' id='pnl-heading'>
                                        Net Daily P&amp;L
                                    </h2>
                                    <p className='piplux-home__pnl-sub'>
                                        {pnlRange === '3d'
                                            ? '3-day realized return'
                                            : pnlRange === '7d'
                                              ? '7-day realized return'
                                              : '30-day realized return'}
                                    </p>
                                </div>
                                <div className='piplux-home__pnl-right'>
                                    <span className='piplux-home__pnl-total'>
                                        {formatCurrencyValue(windowTotal, effectiveCurrency, { signed: true })}
                                    </span>
                                    <div className='piplux-home__range-tabs' role='group' aria-label='P&L timeframe'>
                                        {(['3d', '7d', '30d'] as PnlRange[]).map(r => (
                                            <button
                                                key={r}
                                                type='button'
                                                className={`piplux-home__mini-chip ${
                                                    pnlRange === r ? 'piplux-home__mini-chip--active' : ''
                                                }`}
                                                aria-pressed={pnlRange === r}
                                                onClick={() => {
                                                    setPnlRange(r);
                                                    setActiveBarIndex(null);
                                                }}
                                            >
                                                {r.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div
                                className='piplux-home__pnl-chart'
                                role='group'
                                aria-label='Daily profit and loss breakdown'
                            >
                                {bars.map((bar, idx) => {
                                    const pct =
                                        bar.value === 0
                                            ? 6
                                            : Math.max(18, Math.round((Math.abs(bar.value) / maxBarAbs) * 84));
                                    const isPos = bar.value >= 0;
                                    const valStr = `${isPos ? '+' : '-'}$${Math.abs(bar.value).toFixed(2)}`;
                                    return (
                                        <button
                                            key={bar.label}
                                            type='button'
                                            className={`piplux-home__bar-col ${
                                                activeBarIndex === idx ? 'piplux-home__bar-col--active' : ''
                                            }`}
                                            aria-label={`${bar.label}: ${valStr}, ${bar.trades} trades`}
                                            onClick={() =>
                                                setActiveBarIndex(prev => (prev === idx ? null : idx))
                                            }
                                        >
                                            <div className='piplux-home__bar-pos-zone'>
                                                {isPos && (
                                                    <div
                                                        className='piplux-home__bar piplux-home__bar--pos'
                                                        style={{ blockSize: `${pct}%` }}
                                                    >
                                                        <span className='piplux-home__bar-val'>{valStr}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className='piplux-home__bar-neg-zone'>
                                                {!isPos && (
                                                    <div
                                                        className='piplux-home__bar piplux-home__bar--neg'
                                                        style={{ blockSize: `${pct}%` }}
                                                    >
                                                        <span className='piplux-home__bar-val'>{valStr}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <span className='piplux-home__bar-label'>{bar.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className='piplux-home__target-strip'>
                                <div className='piplux-home__target-strip-meta'>
                                    <span>Today&apos;s Target Progress</span>
                                    <span className='piplux-home__mono'>
                                        {Math.max(0, targetPctRaw)}% ({todayStr} / {targetStr})
                                    </span>
                                </div>
                                <progress
                                    className={`piplux-home__progress ${
                                        targetHit ? 'piplux-home__progress--hit' : ''
                                    }`}
                                    value={Math.max(0, Math.min(dailyTarget, todayProfit))}
                                    max={dailyTarget}
                                />
                            </div>

                            <div className='piplux-home__pnl-footnote'>
                                <div className='piplux-home__pnl-stat'>
                                    <span className='piplux-home__pnl-stat-label'>Win Rate</span>
                                    <span className='piplux-home__pnl-stat-val'>{winRate}%</span>
                                </div>
                                <div className='piplux-home__pnl-stat'>
                                    <span className='piplux-home__pnl-stat-label'>Daily Target</span>
                                    <span className='piplux-home__pnl-stat-val'>
                                        {todayStr} / {targetStr}
                                    </span>
                                </div>
                                <div className='piplux-home__pnl-stat'>
                                    <span className='piplux-home__pnl-stat-label'>Goal Status</span>
                                    <span
                                        className={`piplux-home__pnl-stat-val ${
                                            targetHit ? 'piplux-home__pnl-stat-val--hit' : ''
                                        }`}
                                    >
                                        {targetHit
                                            ? 'Target Hit ✓'
                                            : `$${remainingToTarget.toFixed(2)} to go`}
                                    </span>
                                </div>
                            </div>
                        </section>

                        {/* Card 2: Daily Target (Sums Today's Trades — Independent of Bot Take Profit) */}
                        <section
                            className='piplux-home__card piplux-home__target-card piplux-home__reveal'
                            style={{ transitionDelay: '0.13s' }}
                            aria-labelledby='daily-target-heading'
                        >
                            <div className='piplux-home__section-header piplux-home__section-header--compact'>
                                <div>
                                    <h2 className='piplux-home__card-title' id='daily-target-heading'>
                                        Daily Target
                                    </h2>
                                    <p className='piplux-home__card-meta'>
                                        Tracks today&apos;s summed trade profits (does not change bot Take Profit)
                                    </p>
                                </div>
                                <span
                                    className={`piplux-home__pill-tag ${
                                        targetHit ? 'piplux-home__pill-tag--green' : 'piplux-home__pill-tag--gold'
                                    }`}
                                >
                                    {targetHit ? 'Target Reached' : `${Math.max(0, targetPctRaw)}% Complete`}
                                </span>
                            </div>

                            <form
                                className='piplux-home__target-form'
                                aria-labelledby='daily-target-heading'
                                onSubmit={validateAndSaveTarget}
                                noValidate
                            >
                                <div
                                    className='piplux-home__filter-strip'
                                    role='group'
                                    aria-label='Quick daily target presets'
                                >
                                    {DAILY_TARGET_PRESETS.map(preset => (
                                        <button
                                            key={preset}
                                            type='button'
                                            className={`piplux-home__filter-pill ${
                                                dailyTarget === preset ? 'piplux-home__filter-pill--active' : ''
                                            }`}
                                            aria-pressed={dailyTarget === preset}
                                            onClick={() => saveDailyTarget(preset)}
                                        >
                                            ${preset}
                                        </button>
                                    ))}
                                </div>

                                <div className='piplux-home__target-input-row'>
                                    <div className='piplux-home__field'>
                                        <label htmlFor='daily-target-input'>Target Amount (USD)</label>
                                        <input
                                            ref={targetInputRef}
                                            id='daily-target-input'
                                            name='dailyTarget'
                                            type='text'
                                            inputMode='decimal'
                                            enterKeyHint='done'
                                            value={targetInput}
                                            aria-invalid={targetError ? 'true' : undefined}
                                            aria-describedby='daily-target-hint'
                                            onChange={e => {
                                                setTargetInput(e.target.value);
                                                if (targetError) setTargetError('');
                                            }}
                                            required
                                        />
                                    </div>
                                    <button type='submit' className='piplux-home__btn-gold'>
                                        Set Target
                                    </button>
                                </div>

                                <p className='piplux-home__target-hint' id='daily-target-hint'>
                                    Set any goal from $10 to $50,000. Reflects today&apos;s settled trades on Net Daily P&amp;L.
                                </p>
                                {targetError && (
                                    <p className='piplux-home__target-error' role='alert'>
                                        {targetError}
                                    </p>
                                )}
                            </form>

                            <div className='piplux-home__target-summary'>
                                <div className='piplux-home__target-summary-row'>
                                    <span>Today&apos;s Summed Profit</span>
                                    <strong
                                        className={`piplux-home__mono ${
                                            todayProfit >= 0
                                                ? 'piplux-home__mono--positive'
                                                : 'piplux-home__mono--negative'
                                        }`}
                                    >
                                        {todayStr} / {targetStr}
                                    </strong>
                                </div>
                                <div className='piplux-home__target-summary-row'>
                                    <span>Remaining to Goal</span>
                                    <strong
                                        className={`piplux-home__mono ${
                                            targetHit ? 'piplux-home__mono--positive' : ''
                                        }`}
                                    >
                                        {targetHit
                                            ? `+$${Math.abs(remainingToTarget).toFixed(2)} above goal`
                                            : `$${remainingToTarget.toFixed(2)}`}
                                    </strong>
                                </div>
                            </div>
                        </section>

                        {/* Card 3: ALL EVALUATED MARKETS (AEGIS Engine) */}
                        <section
                            className='piplux-home__card piplux-home__eval-card piplux-home__reveal'
                            style={{ transitionDelay: '0.18s' }}
                            aria-labelledby='eval-markets-heading'
                        >
                            <div className='piplux-home__section-header'>
                                <div>
                                    <h2 className='piplux-home__eyebrow' id='eval-markets-heading'>
                                        ALL EVALUATED MARKETS
                                    </h2>
                                    <p className='piplux-home__card-meta'>{scanAgeText}</p>
                                </div>
                                <button
                                    type='button'
                                    className='piplux-home__scan-btn'
                                    disabled={isScanning || !is_socket_opened}
                                    onClick={() => runEvaluatedScan(tickCount)}
                                >
                                    <span aria-hidden='true'>⚡</span>
                                    {isScanning ? 'Scanning...' : 'Re-scan'}
                                </button>
                            </div>

                            <div className='piplux-home__scan-controls'>
                                <div
                                    className='piplux-home__filter-strip'
                                    role='group'
                                    aria-label='Filter evaluated markets'
                                >
                                    <button
                                        type='button'
                                        className={`piplux-home__filter-pill ${
                                            evalFilter === 'all' ? 'piplux-home__filter-pill--active' : ''
                                        }`}
                                        aria-pressed={evalFilter === 'all'}
                                        onClick={() => setEvalFilter('all')}
                                    >
                                        All ({evalResults.length})
                                    </button>
                                    <button
                                        type='button'
                                        className={`piplux-home__filter-pill ${
                                            evalFilter === 'high' ? 'piplux-home__filter-pill--active' : ''
                                        }`}
                                        aria-pressed={evalFilter === 'high'}
                                        onClick={() => setEvalFilter('high')}
                                    >
                                        90%+ Edge
                                    </button>
                                    <button
                                        type='button'
                                        className={`piplux-home__filter-pill ${
                                            evalFilter === '1s' ? 'piplux-home__filter-pill--active' : ''
                                        }`}
                                        aria-pressed={evalFilter === '1s'}
                                        onClick={() => setEvalFilter('1s')}
                                    >
                                        1s Indices
                                    </button>
                                </div>

                                <div className='piplux-home__range-tabs' role='group' aria-label='Scan tick window'>
                                    {TICK_WINDOW_OPTIONS.map(cnt => (
                                        <button
                                            key={cnt}
                                            type='button'
                                            className={`piplux-home__mini-chip ${
                                                tickCount === cnt ? 'piplux-home__mini-chip--active' : ''
                                            }`}
                                            aria-pressed={tickCount === cnt}
                                            disabled={isScanning}
                                            onClick={() => {
                                                setTickCount(cnt);
                                                runEvaluatedScan(cnt);
                                            }}
                                        >
                                            {cnt}t
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {isScanning && (
                                <div className='piplux-home__scan-progress'>
                                    <span>
                                        Scanning 10 synthetic markets ({scanProgress.completed} /{' '}
                                        {scanProgress.total})...
                                    </span>
                                    <progress
                                        className='piplux-home__progress'
                                        value={scanProgress.completed}
                                        max={scanProgress.total}
                                    />
                                </div>
                            )}

                            {filteredEvalResults.length > 0 ? (
                                <ul className='piplux-home__eval-list'>
                                    {filteredEvalResults.map((item, idx) => {
                                        const winPct =
                                            item.metrics.total > 0
                                                ? Math.round((item.metrics.wins / item.metrics.total) * 1000) / 10
                                                : 0;
                                        return (
                                            <li key={`${item.symbol}_${idx}`} className='piplux-home__eval-row'>
                                                <div className='piplux-home__eval-info'>
                                                    <span className='piplux-home__eval-name'>
                                                        {SCAN_MARKET_NAMES[item.symbol] || item.symbol}
                                                    </span>
                                                    <span className='piplux-home__eval-sub'>
                                                        Trigger: Digit {item.entryPointDigit} → {item.profile.label}
                                                    </span>
                                                </div>
                                                <div className='piplux-home__eval-right'>
                                                    <span className='piplux-home__eval-rate'>{winPct}%</span>
                                                    <button
                                                        type='button'
                                                        className='piplux-home__apply-btn'
                                                        onClick={() => handleApplyEvaluatedMarket(item)}
                                                    >
                                                        Apply
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                !isScanning && (
                                    <div className='piplux-home__eval-empty'>
                                        {is_socket_opened
                                            ? 'No setups matched this filter. Try All or hit Re-scan.'
                                            : 'Connecting to Deriv market feed...'}
                                    </div>
                                )
                            )}
                        </section>

                        {/* Card 4: Global Markets & Live Quotes */}
                        <section
                            className='piplux-home__card piplux-home__watchlist-card piplux-home__reveal'
                            style={{ transitionDelay: '0.24s' }}
                            aria-labelledby='watchlist-heading'
                        >
                            <div className='piplux-home__section-header piplux-home__section-header--compact'>
                                <div>
                                    <h2 className='piplux-home__card-title' id='watchlist-heading'>
                                        Global Markets &amp; Live Quotes
                                    </h2>
                                    <p className='piplux-home__card-meta'>
                                        Live Deriv feeds · Tap any asset to trade
                                    </p>
                                </div>
                                <span className='piplux-home__clock'>UTC {utcClock}</span>
                            </div>

                            <div
                                className='piplux-home__market-tabs'
                                role='tablist'
                                aria-label='Asset classes'
                                onKeyDown={handleTabKeyDown}
                            >
                                {MARKET_TABS.map(tab => (
                                    <button
                                        key={tab.id}
                                        type='button'
                                        role='tab'
                                        id={`home-tab-${tab.id}`}
                                        aria-selected={activeMarketTab === tab.id}
                                        className='piplux-home__market-tab'
                                        onClick={() => setActiveMarketTab(tab.id)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div role='tabpanel' aria-labelledby={`home-tab-${activeMarketTab}`} tabIndex={0}>
                                <ul className='piplux-home__ticker-list'>
                                    {quotesByCategory[activeMarketTab].map(asset => {
                                        const isUp = asset.delta >= 0;
                                        const priceText =
                                            asset.price !== null
                                                ? asset.price.toLocaleString('en-US', {
                                                      minimumFractionDigits: asset.decimals,
                                                      maximumFractionDigits: asset.decimals,
                                                  })
                                                : '—';
                                        const deltaText =
                                            asset.price !== null
                                                ? `${isUp ? '+' : ''}${asset.delta.toFixed(2)}%`
                                                : 'Live';
                                        return (
                                            <li key={asset.symbol} className='piplux-home__ticker-row'>
                                                <div className='piplux-home__ticker-meta'>
                                                    <span className='piplux-home__ticker-sym'>{asset.name}</span>
                                                    <span className='piplux-home__ticker-desc'>{asset.desc}</span>
                                                </div>
                                                <svg
                                                    className='piplux-home__ticker-spark'
                                                    viewBox='0 0 58 22'
                                                    aria-hidden='true'
                                                >
                                                    <polyline
                                                        fill='none'
                                                        stroke={isUp ? '#22e58a' : '#ff5b69'}
                                                        strokeWidth='2'
                                                        strokeLinecap='round'
                                                        strokeLinejoin='round'
                                                        points={createSparklinePoints(asset.history)}
                                                    />
                                                </svg>
                                                <div className='piplux-home__ticker-quote'>
                                                    <span className='piplux-home__ticker-price piplux-home__mono'>
                                                        {priceText}
                                                    </span>
                                                    <span
                                                        className={`piplux-home__ticker-delta piplux-home__mono ${
                                                            isUp
                                                                ? 'piplux-home__mono--positive'
                                                                : 'piplux-home__mono--negative'
                                                        }`}
                                                    >
                                                        {deltaText}
                                                    </span>
                                                </div>
                                                <button
                                                    type='button'
                                                    className='piplux-home__trade-btn'
                                                    onClick={() => handleTradeWatchlistAsset(asset.symbol)}
                                                >
                                                    Trade
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        </section>
                    </div>
                </main>
            </div>

            {toastMessage && (
                <div className='piplux-home__toast' role='status' aria-live='polite'>
                    {toastMessage}
                </div>
            )}
        </div>
    );
});

export default PipluxHome;
