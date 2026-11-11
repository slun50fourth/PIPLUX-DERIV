import { TActiveSymbolsResponse } from '@deriv/api';

import sortSymbols from '../sort-symbols-utils';

describe('sortSymbols', () => {
    it('should sort symbols correctly according to market order', () => {
        const symbolsList = [
            {
                underlying_symbol: 'BTCUSD',
                display_order: 1,
                exchange_is_open: 1,
                market: 'cryptocurrency',
                submarket: 'non_stable_coin',
                is_trading_suspended: 0,
                subgroup: 'crypto',
            },
            {
                underlying_symbol: 'EURUSD',
                display_order: 2,
                exchange_is_open: 1,
                market: 'forex',
                submarket: 'major_pairs',
                is_trading_suspended: 0,
                subgroup: 'major',
            },
            {
                underlying_symbol: 'OTC_N225',
                display_order: 3,
                exchange_is_open: 1,
                market: 'indices',
                submarket: 'asia_oceania_OTC',
                is_trading_suspended: 0,
                subgroup: 'asia',
            },
            {
                underlying_symbol: 'GOLD',
                display_order: 4,
                exchange_is_open: 1,
                market: 'commodities',
                submarket: 'metals',
                is_trading_suspended: 0,
                subgroup: 'metals',
            },
            {
                underlying_symbol: '1HZ100V',
                display_order: 5,
                exchange_is_open: 1,
                market: 'synthetic_index',
                submarket: 'random_index',
                is_trading_suspended: 0,
                subgroup: 'volatility',
            },
        ];
        const sortedSymbols = sortSymbols(symbolsList as NonNullable<TActiveSymbolsResponse['active_symbols']>);
        expect(sortedSymbols).toEqual([
            {
                underlying_symbol: '1HZ100V',
                display_order: 5,
                exchange_is_open: 1,
                market: 'synthetic_index',
                submarket: 'random_index',
                is_trading_suspended: 0,
                subgroup: 'volatility',
            },
            {
                underlying_symbol: 'EURUSD',
                display_order: 2,
                exchange_is_open: 1,
                market: 'forex',
                submarket: 'major_pairs',
                is_trading_suspended: 0,
                subgroup: 'major',
            },
            {
                underlying_symbol: 'OTC_N225',
                display_order: 3,
                exchange_is_open: 1,
                market: 'indices',
                submarket: 'asia_oceania_OTC',
                is_trading_suspended: 0,
                subgroup: 'asia',
            },
            {
                underlying_symbol: 'BTCUSD',
                display_order: 1,
                exchange_is_open: 1,
                market: 'cryptocurrency',
                submarket: 'non_stable_coin',
                is_trading_suspended: 0,
                subgroup: 'crypto',
            },
            {
                underlying_symbol: 'GOLD',
                display_order: 4,
                exchange_is_open: 1,
                market: 'commodities',
                submarket: 'metals',
                is_trading_suspended: 0,
                subgroup: 'metals',
            },
        ]);
    });
    it('should handle symbols with same market correctly', () => {
        const symbolsList = [
            {
                underlying_symbol: 'GBPUSD',
                display_order: 1,
                exchange_is_open: 1,
                market: 'forex',
                submarket: 'major_pairs',
                is_trading_suspended: 0,
                subgroup: 'major',
            },
            {
                underlying_symbol: 'EURUSD',
                display_order: 2,
                exchange_is_open: 1,
                market: 'forex',
                submarket: 'major_pairs',
                is_trading_suspended: 0,
                subgroup: 'major',
            },
            {
                underlying_symbol: 'ETHUSD',
                display_order: 3,
                exchange_is_open: 1,
                market: 'cryptocurrency',
                submarket: 'non_stable_coin',
                is_trading_suspended: 0,
                subgroup: 'crypto',
            },
            {
                underlying_symbol: 'BTCUSD',
                display_order: 4,
                exchange_is_open: 1,
                market: 'cryptocurrency',
                submarket: 'non_stable_coin',
                is_trading_suspended: 0,
                subgroup: 'crypto',
            },
        ];

        const sortedSymbols = sortSymbols(symbolsList as NonNullable<TActiveSymbolsResponse['active_symbols']>);
        expect(sortedSymbols).toEqual([
            {
                underlying_symbol: 'GBPUSD',
                display_order: 1,
                exchange_is_open: 1,
                market: 'forex',
                submarket: 'major_pairs',
                is_trading_suspended: 0,
                subgroup: 'major',
            },
            {
                underlying_symbol: 'EURUSD',
                display_order: 2,
                exchange_is_open: 1,
                market: 'forex',
                submarket: 'major_pairs',
                is_trading_suspended: 0,
                subgroup: 'major',
            },
            {
                underlying_symbol: 'ETHUSD',
                display_order: 3,
                exchange_is_open: 1,
                market: 'cryptocurrency',
                submarket: 'non_stable_coin',
                is_trading_suspended: 0,
                subgroup: 'crypto',
            },
            {
                underlying_symbol: 'BTCUSD',
                display_order: 4,
                exchange_is_open: 1,
                market: 'cryptocurrency',
                submarket: 'non_stable_coin',
                is_trading_suspended: 0,
                subgroup: 'crypto',
            },
        ]);
    });

    it('should order Volatility indices starting with (1s) 10..100 then plain 10..100', () => {
        const volatilitySymbols = [
            { underlying_symbol: '1HZ75V', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: '1HZ10V', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: 'R_50', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: 'R_25', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: '1HZ25V', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: '1HZ90V', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: 'R_75', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: '1HZ15V', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: 'R_10', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: '1HZ50V', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: 'R_100', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: '1HZ30V', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
            { underlying_symbol: '1HZ100V', market: 'synthetic_index', submarket: 'random_index', subgroup: 'synthetics' },
        ];

        const sorted = sortSymbols(volatilitySymbols as NonNullable<TActiveSymbolsResponse['active_symbols']>);
        expect(sorted.map(s => s.underlying_symbol)).toEqual([
            '1HZ10V',
            '1HZ15V',
            '1HZ25V',
            '1HZ30V',
            '1HZ50V',
            '1HZ75V',
            '1HZ90V',
            '1HZ100V',
            'R_10',
            'R_25',
            'R_50',
            'R_75',
            'R_100',
        ]);
    });
});
