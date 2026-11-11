import React from 'react';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mockStore, StoreProvider } from '@deriv/stores';
import { botBuilderBus } from 'Services/bot-builder-bus';

import PipluxHome from '../PipluxHome';
import LandingPage from '../LandingPage';

jest.mock('Services/accounts-api', () => ({
    fetchAccounts: jest.fn(() =>
        Promise.resolve([
            {
                account_id: 'CR999001',
                balance: 56000.46,
                currency: 'USD',
                group: 'row',
                status: 'active',
                account_type: 'real',
                created_at: '2026-01-01',
                email: 'slun@example.com',
                last_access_at: '2026-11-11',
                name: '',
                server_id: '1',
                rights: {},
            },
            {
                account_id: 'DEM999002',
                balance: 10000.0,
                currency: 'USD',
                group: 'row',
                status: 'active',
                account_type: 'demo',
                created_at: '2026-01-01',
                email: 'slun@example.com',
                last_access_at: '2026-11-11',
                name: '',
                server_id: '1',
                rights: {},
            },
        ])
    ),
}));

jest.mock('Services/ws-methods', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    return {
        __esModule: true,
        default: {
            authorized: {
                send: jest.fn((req: Record<string, unknown>) => {
                    if (req.get_settings) {
                        return Promise.resolve({
                            get_settings: {
                                first_name: 'Slun',
                                last_name: 'Trader',
                            },
                        });
                    }
                    return Promise.resolve({});
                }),
                profitTable: jest.fn(() =>
                    Promise.resolve({
                        profit_table: {
                            transactions: [
                                { buy_price: 100, sell_price: 280, sell_time: nowSec - 120 },
                                { buy_price: 50, sell_price: 120, sell_time: nowSec - 60 },
                            ],
                        },
                    })
                ),
            },
            send: jest.fn((req: Record<string, unknown>) => {
                if (req.ticks_history) {
                    return Promise.resolve({
                        history: {
                            prices: ['100.12', '100.25', '100.38'],
                            times: [nowSec - 10, nowSec - 5, nowSec],
                        },
                    });
                }
                return Promise.resolve({});
            }),
            subscribeTicks: jest.fn(() => ({ unsubscribe: jest.fn() })),
        },
    };
});

jest.mock('../../../../../../bots/entryScanner', () => {
    const actual = jest.requireActual('../../../../../../bots/entryScanner');
    return {
        ...actual,
        runEntryScanAll: jest.fn(() =>
            Promise.resolve({
                best: {
                    symbol: '1HZ10V',
                    submarket: 'random_index',
                    entryPointDigit: 6,
                    profile: {
                        id: 'over_1_over_4',
                        label: 'Over 1 → Recovery Over 4',
                        contractType: 'DIGITOVER',
                        initialPrediction: 1,
                        recoveryPrediction: 4,
                    },
                    metrics: {
                        wins: 25,
                        total: 25,
                        wilsonLB: 0.9,
                        recentWinRate: 1,
                        stability: 0.95,
                        samplePenalty: 1,
                        qualityScore: 0.96,
                    },
                },
                allResults: [
                    {
                        symbol: '1HZ10V',
                        submarket: 'random_index',
                        entryPointDigit: 6,
                        profile: {
                            id: 'over_1_over_4',
                            label: 'Over 1 → Recovery Over 4',
                            contractType: 'DIGITOVER',
                            initialPrediction: 1,
                            recoveryPrediction: 4,
                        },
                        metrics: {
                            wins: 25,
                            total: 25,
                            wilsonLB: 0.9,
                            recentWinRate: 1,
                            stability: 0.95,
                            samplePenalty: 1,
                            qualityScore: 0.96,
                        },
                    },
                ],
            })
        ),
    };
});

describe('PipluxHome', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        jest.clearAllMocks();
        (global as any).fetch = jest.fn(() => Promise.resolve({ ok: false }));
    });

    const renderHome = () => {
        const history = createMemoryHistory();
        const store = mockStore({
            client: {
                is_logged_in: true,
                is_virtual: false,
                loginid: 'CR999001',
                balance: '56000.46',
                currency: 'USD',
                email: 'slun@example.com',
                switchAccount: jest.fn(),
            },
            common: {
                is_socket_opened: true,
            },
        });

        const utils = render(
            <StoreProvider store={store}>
                <Router history={history}>
                    <PipluxHome />
                </Router>
            </StoreProvider>
        );

        return { ...utils, history, store };
    };

    it('fetches the user name from Deriv servers and renders balance and Demo/Live switcher', async () => {
        renderHome();

        await waitFor(() => {
            expect(screen.getByTestId('dt_home_username')).toHaveTextContent('SLUN TRADER');
        });
        expect(screen.getByTestId('dt_home_balance')).toHaveTextContent('$ 56,000.46');
        expect(screen.getByRole('button', { name: 'Demo' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('sums today profits from Deriv profit_table and updates Daily Target independently of Bot Builder', async () => {
        const busSpy = jest.spyOn(botBuilderBus, 'loadXml');
        const user = userEvent.setup();
        renderHome();

        // Today settled trades sum = (280-100) + (120-50) = 250; default live target = 250 -> Target Hit
        await waitFor(() => {
            expect(screen.getAllByText('$250.00 / $250').length).toBeGreaterThanOrEqual(2);
        });
        expect(screen.getByText('Target Hit ✓')).toBeInTheDocument();

        // Preset buttons should be $10, $50, $100, $250
        expect(screen.getByRole('button', { name: '$10' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '$50' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '$100' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '$250' })).toBeInTheDocument();

        // Update Daily Target to $500 via custom input and confirm it reflects on Net Daily P&L without touching bots
        const input = screen.getByLabelText('Target Amount (USD)');
        await user.clear(input);
        await user.type(input, '500');
        await user.click(screen.getByRole('button', { name: 'Set Target' }));

        expect(screen.getAllByText('$250.00 / $500').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('$250.00 to go')).toBeInTheDocument();
        expect(busSpy).not.toHaveBeenCalled();
    });

    it('runs AI Scanner evaluation for All Evaluated Markets and applies selected market to Trader', async () => {
        const user = userEvent.setup();
        const { history } = renderHome();

        await waitFor(() => {
            expect(screen.getByText('Volatility 10 (1s) Index')).toBeInTheDocument();
        });
        expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);

        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(history.location.pathname).toBe('/trader');
        expect(history.location.search).toContain('symbol=1HZ10V');
        expect(history.location.search).toContain('trade_type=over_under');

        const pending = JSON.parse(sessionStorage.getItem('piplux_pending_scanner_setup') || '{}');
        expect(pending.symbol).toBe('1HZ10V');
        expect(pending.contractType).toBe('over_under');
        expect(pending.lastDigit).toBe(1);
    });

    it('keeps PipluxHome rendered instead of marketing LandingPage during refresh or Demo/Live reload', () => {
        localStorage.setItem(
            'current_account',
            JSON.stringify({ loginid: 'ROT90789546', balance: '0.40', currency: 'USD', account_type: 'real' })
        );
        sessionStorage.setItem(
            'auth_info',
            JSON.stringify({ access_token: 'test-token', expires_at: Date.now() + 60_000 })
        );

        const history = createMemoryHistory();
        const hydratingStore = mockStore({
            client: {
                is_logged_in: false,
                is_logging_in: true,
                is_virtual: false,
                loginid: '',
                balance: undefined,
                currency: '',
            },
            common: {
                is_socket_opened: false,
            },
        });

        const { container } = render(
            <StoreProvider store={hydratingStore}>
                <Router history={history}>
                    <LandingPage />
                </Router>
            </StoreProvider>
        );

        expect(container.querySelector('.piplux-landing')).toBeNull();
        expect(screen.getByTestId('dt_home_username')).toHaveTextContent('ROT90789546');
        expect(screen.getByTestId('dt_home_balance')).toHaveTextContent('$ 0.40');
    });

    it('renders marketing LandingPage only when logged out with no stored session', () => {
        const history = createMemoryHistory();
        const loggedOutStore = mockStore({
            client: {
                is_logged_in: false,
                is_logging_in: false,
                loginid: '',
            },
        });

        const { container } = render(
            <StoreProvider store={loggedOutStore}>
                <Router history={history}>
                    <LandingPage />
                </Router>
            </StoreProvider>
        );

        expect(container.querySelector('.piplux-landing')).toBeInTheDocument();
        expect(screen.queryByTestId('dt_home_balance')).toBeNull();
    });
});
