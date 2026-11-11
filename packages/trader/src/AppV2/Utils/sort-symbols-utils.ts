import { TActiveSymbolsResponse } from '@deriv/api';
import { localize } from '@deriv-com/translations';

type ActiveSymbols = NonNullable<TActiveSymbolsResponse['active_symbols']>;

type MarketOrderMap = {
    [key: string]: number;
};

// Helper function to get submarket display name
const getSubmarketDisplayName = (submarket: string) => {
    const submarket_display_names: Record<string, string> = {
        major_pairs: localize('Major pairs'),
        minor_pairs: localize('Minor pairs'),
        smart_fx: localize('Smart FX'),
        random_index: localize('Volatility indices'),
        random_daily: localize('Daily reset indices'),
        crash_boom: localize('Crash/Boom'),
        crash_index: localize('Crash/Boom'),
        step_indices: localize('Step indices'),
        step_index: localize('Step indices'),
        range_break: localize('Range break indices'),
        jump_indices: localize('Jump indices'),
        jump_index: localize('Jump indices'),
        cryptocurrency: localize('Cryptocurrencies'),
        non_stable_coin: localize('Cryptocurrencies'),
        metals: localize('Metals'),
        energy: localize('Energy'),
        americas: localize('Americas'),
        americas_OTC: localize('American indices'),
        asia_oceania: localize('Asia/Oceania'),
        asia_oceania_OTC: localize('Asian indices'),
        europe_africa: localize('Europe/Africa'),
        europe_OTC: localize('European indices'),
        otc_index: localize('OTC indices'),
        basket_forex: localize('Forex basket'),
        forex_basket: localize('Forex basket'),
        basket_commodities: localize('Commodities basket'),
        commodity_basket: localize('Commodities basket'),
        basket_cryptocurrency: localize('Cryptocurrency basket'),
    };

    return submarket_display_names[submarket] || submarket;
};

type TVolatilitySortable = {
    underlying_symbol?: string;
    symbol?: string;
    display_name?: string;
    submarket?: string;
};

const getVolatilitySortKey = (symbolObj: TVolatilitySortable): { group: number; value: number } | null => {
    const code = (symbolObj.underlying_symbol || symbolObj.symbol || '').trim();
    const displayName = (symbolObj.display_name || '').trim();

    const oneSecCodeMatch = code.match(/^1HZ(\d+)V$/i);
    if (oneSecCodeMatch) {
        return { group: 0, value: Number(oneSecCodeMatch[1]) };
    }
    const oneSecNameMatch = displayName.match(/volatility\s+(\d+)\s*\(1s\)/i);
    if (oneSecNameMatch) {
        return { group: 0, value: Number(oneSecNameMatch[1]) };
    }

    const plainCodeMatch = code.match(/^R_(\d+)$/i);
    if (plainCodeMatch) {
        return { group: 1, value: Number(plainCodeMatch[1]) };
    }
    const plainNameMatch = displayName.match(/volatility\s+(\d+)\b/i);
    if (plainNameMatch && !/\(1s\)/i.test(displayName)) {
        return { group: 1, value: Number(plainNameMatch[1]) };
    }

    return null;
};

/**
 * Comparator placing Volatility (1s) indices numerically ascending first (10..100),
 * followed by plain Volatility indices numerically ascending (10..100).
 */
export const compareVolatilitySymbols = (a: TVolatilitySortable, b: TVolatilitySortable): number => {
    const keyA = getVolatilitySortKey(a);
    const keyB = getVolatilitySortKey(b);
    if (keyA && keyB) {
        if (keyA.group !== keyB.group) return keyA.group - keyB.group;
        return keyA.value - keyB.value;
    }
    if (keyA) return -1;
    if (keyB) return 1;
    return 0;
};

const sortSymbols = (symbolsList: ActiveSymbols) => {
    const marketSortingOrder = ['synthetic_index', 'forex', 'indices', 'cryptocurrency', 'commodities'];
    const marketOrderMap: MarketOrderMap = marketSortingOrder.reduce(
        (acc: MarketOrderMap, market: string, index: number) => {
            acc[market] = index;
            return acc;
        },
        {}
    );

    return symbolsList.slice().sort((a, b) => {
        const marketOrderA = marketOrderMap[a.market] !== undefined ? marketOrderMap[a.market] : symbolsList.length;
        const marketOrderB = marketOrderMap[b.market] !== undefined ? marketOrderMap[b.market] : symbolsList.length;
        if (marketOrderA !== marketOrderB) {
            return marketOrderA - marketOrderB;
        }
        const submarketCompare = getSubmarketDisplayName(a.submarket).localeCompare(getSubmarketDisplayName(b.submarket));
        if (submarketCompare !== 0) {
            return submarketCompare;
        }
        if (a.submarket === 'random_index' && b.submarket === 'random_index') {
            return compareVolatilitySymbols(a, b);
        }
        return 0;
    });
};

export default sortSymbols;
