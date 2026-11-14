import {
    APEX_AI_XML,
    APEX_RANGE_AI_XML,
    ENTRY_SCANNER_XML,
    OVER_1_UNDER_8_RECOVERY_OVER_4_XML,
} from './bots-xml-data';

export type TBotMetric = {
    label: string;
    value: string;
    accent?: 'gold' | 'neutral';
};

export type TRunPanelBot = {
    id: string;
    name: string;
    badge: string;
    marketLabel: string;
    symbolCode: string;
    category: string;
    summary: string;
    metrics: TBotMetric[];
    xml: string;
    featured?: boolean;
};

/** Curated PIPLUX bots rendered in the RunPanel "Bots" tab, led by Over 1 Under 8 Recovery Over 4. */
export const RUN_PANEL_BOTS: readonly TRunPanelBot[] = [
    {
        id: 'piplux-bot-over-1-under-8-recovery-over-4',
        name: 'Over 1 Under 8 Recovery Over 4',
        badge: 'Featured Strategy',
        marketLabel: 'Vol 15 (1s)',
        symbolCode: '1HZ15V',
        category: 'Digits · Dual Recovery',
        summary: 'Alternates Over 1 & Under 8 after every win, then deploys Over 4 recovery with 2x martingale on losses.',
        metrics: [
            { label: 'Default Stake', value: '$20.00', accent: 'gold' },
            { label: 'Take Profit', value: '$200.00', accent: 'gold' },
            { label: 'Recovery', value: 'Over 4 · Lvl 4' },
            { label: 'Multiplier', value: '2x Martingale' },
        ],
        xml: OVER_1_UNDER_8_RECOVERY_OVER_4_XML,
        featured: true,
    },
    {
        id: 'piplux-bot-apex-range-ai',
        name: 'Apex Range AI',
        badge: 'Multi-Market',
        marketLabel: 'Vol 25 (1s)',
        symbolCode: '1HZ25V',
        category: 'Digits · Range Over/Under',
        summary: 'Scans consecutive last-digit thresholds for Over/Under entries with adaptive recovery.',
        metrics: [
            { label: 'Default Stake', value: '$0.80' },
            { label: 'Take Profit', value: '$10.00' },
            { label: 'Stop Loss', value: '$50.00' },
            { label: 'Multiplier', value: '2x Martingale' },
        ],
        xml: APEX_RANGE_AI_XML,
    },
    {
        id: 'piplux-bot-apex-ai',
        name: 'Apex AI',
        badge: 'Adaptive Logic',
        marketLabel: 'Volatility 25',
        symbolCode: 'R_25',
        category: 'Digits · Hybrid Matrix',
        summary: 'Combines Over/Under and Even/Odd digit filters with structured martingale staking.',
        metrics: [
            { label: 'Default Stake', value: '$1.00' },
            { label: 'Take Profit', value: '$10.00' },
            { label: 'Stop Loss', value: '$50.00' },
            { label: 'Multiplier', value: '2x Martingale' },
        ],
        xml: APEX_AI_XML,
    },
    {
        id: 'piplux-bot-entry-scanner',
        name: 'Entry Scanner Bot',
        badge: 'Digit Trigger',
        marketLabel: 'Volatility 10',
        symbolCode: 'R_10',
        category: 'Digits · Trigger Entry',
        summary: 'Waits for a confirmed Digit 4 trigger before launching Over 1 contracts with Over 4 recovery.',
        metrics: [
            { label: 'Default Stake', value: '$0.50' },
            { label: 'Win Target', value: '5 Wins' },
            { label: 'Stop Loss', value: '$50.00' },
            { label: 'Multiplier', value: '2x Martingale' },
        ],
        xml: ENTRY_SCANNER_XML,
    },
];
