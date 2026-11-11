import React from 'react';

export const PENDING_SCANNER_SETUP_KEY = 'piplux_pending_scanner_setup';

export type PendingScannerSetup = {
    symbol: string;
    contractType: string;
    lastDigit: number;
    ts: number;
};

type UseApplyScannerSetupArgs = {
    active_symbols: Array<{ underlying_symbol?: string }>;
    onChange: (event: { target: { name: string; value: unknown } }) => void;
};

/**
 * Applies a pending AI Scanner market setup selected from the Home hub once
 * Trader's active symbols have finished loading.
 */
const useApplyScannerSetup = ({ active_symbols, onChange }: UseApplyScannerSetupArgs) => {
    const appliedRef = React.useRef(false);

    React.useEffect(() => {
        if (appliedRef.current || !active_symbols.length) return;

        try {
            const raw = sessionStorage.getItem(PENDING_SCANNER_SETUP_KEY);
            if (!raw) return;

            const setup = JSON.parse(raw) as PendingScannerSetup;
            sessionStorage.removeItem(PENDING_SCANNER_SETUP_KEY);

            if (!setup?.symbol || Date.now() - Number(setup.ts || 0) > 30_000) return;

            appliedRef.current = true;
            onChange({ target: { name: 'symbol', value: setup.symbol } });
            onChange({ target: { name: 'contract_type', value: setup.contractType || 'over_under' } });
            if (typeof setup.lastDigit === 'number') {
                setTimeout(() => {
                    onChange({ target: { name: 'last_digit', value: setup.lastDigit } });
                }, 80);
            }
        } catch {
            sessionStorage.removeItem(PENDING_SCANNER_SETUP_KEY);
        }
    }, [active_symbols.length, onChange]);
};

export default useApplyScannerSetup;
