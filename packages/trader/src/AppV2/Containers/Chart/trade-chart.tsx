import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { TTicksStreamResponse } from '@deriv/api';
import {
    ChartBarrierStore,
    isAccumulatorContract,
    isContractSupportedAndStarted,
    isTurbosContract,
    isVanillaContract,
    TRADE_TYPES,
} from '@deriv/shared';
import { observer, useStore } from '@deriv/stores';
import { useDevice } from '@deriv-com/ui';

import { filterByContractType } from 'Modules/Contract/Components/ContractAudit/positions-helper';
import useActiveSymbols from 'AppV2/Hooks/useActiveSymbols';
import useDefaultSymbol from 'AppV2/Hooks/useDefaultSymbol';
import { SmartChart } from 'Modules/SmartChart';
import AccumulatorsChartElements from 'Modules/SmartChart/Components/Markers/accumulators-chart-elements';
import ToolbarWidgets from 'Modules/SmartChart/Components/toolbar-widgets';
import TopWidgets from 'Modules/SmartChart/Components/top-widgets';
import { useSmartChartsAdapter } from 'Modules/SmartChart/Hooks/useSmartChartsAdapter';
import { CHART_CONSTANTS, getMarketsOrder } from 'Modules/SmartChart/Utils/chart-utils';
import { useTraderStore } from 'Stores/useTraderStores';

type TickSpotData = NonNullable<TTicksStreamResponse['tick']>;

type TBottomWidgetsParams = {
    digits: number[];
    tick: TickSpotData | null;
};

// Helper to determine if a digit is a winning outcome for the current contract type and target
const isWinningDigit = (
    digit: number,
    contract_type?: string,
    trade_type_tab?: string,
    last_digit?: number
): boolean => {
    const type = (trade_type_tab || contract_type || '').toUpperCase();
    if (type.includes('OVER') && !type.includes('UNDER')) {
        return last_digit !== undefined && last_digit !== null && digit > last_digit;
    }
    if (type === 'DIGITOVER_UNDER' || type === 'OVER_UNDER') {
        return last_digit !== undefined && last_digit !== null && digit > last_digit;
    }
    if (type.includes('UNDER')) {
        return last_digit !== undefined && last_digit !== null && digit < last_digit;
    }
    if (type.includes('MATCH') && !type.includes('DIFF')) {
        return last_digit !== undefined && last_digit !== null && digit === last_digit;
    }
    if (type === 'DIGITMATCH_DIFF' || type === 'MATCH_DIFF') {
        return last_digit !== undefined && last_digit !== null && digit === last_digit;
    }
    if (type.includes('DIFF')) {
        return last_digit !== undefined && last_digit !== null && digit !== last_digit;
    }
    if (type.includes('EVEN') && !type.includes('ODD')) {
        return digit % 2 === 0;
    }
    if (type === 'DIGITEVEN_ODD' || type === 'EVEN_ODD') {
        return digit % 2 === 0;
    }
    if (type.includes('ODD')) {
        return digit % 2 !== 0;
    }
    return false;
};

// Overlay component that renders digit circles with a bouncing cursor
const DigitCircle = ({
    digit,
    percentage,
    isLatest,
    isMin,
    isMax,
    isDarkMode,
    isMobile,
    isActive,
    isWinning,
    onClick,
}: {
    digit: number;
    percentage: number;
    isLatest: boolean;
    isMin: boolean;
    isMax: boolean;
    isDarkMode: boolean;
    isMobile?: boolean;
    isActive: boolean;
    isWinning?: boolean;
    onClick?: () => void;
}) => {
    const getBottomBorderColor = () => {
        if (isMin) return '#ef4444'; // red for least frequent
        if (isMax) return '#14b8a6'; // teal/green for most frequent
        if (isWinning) return '#22c55e'; // green for winning digit
        return isDarkMode ? '#475569' : '#cbd5e1';
    };

    const size = isMobile ? '46px' : '40px';

    const getBgColor = () => {
        if (isActive && isWinning) return '#22c55e';
        if (isActive) return isDarkMode ? '#ffffff' : '#1e293b';
        if (isWinning) return isDarkMode ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4';
        return isDarkMode ? '#243042' : '#ffffff'; // Lighter dark background for better contrast in dark mode
    };

    const getBorderColor = () => {
        if (isActive && isWinning) return '#16a34a';
        if (isWinning) return '#22c55e';
        return isDarkMode ? '#334155' : '#e2e8f0';
    };

    const getTextColor = () => {
        if (isActive && isWinning) return '#ffffff';
        if (isActive) return isDarkMode ? '#1e293b' : '#ffffff';
        if (isWinning) return isDarkMode ? '#4ade80' : '#15803d';
        return isDarkMode ? '#f1f5f9' : '#1e293b';
    };

    const getPercentColor = () => {
        if (isActive && isWinning) return '#f0fdf4';
        if (isActive) return isDarkMode ? '#475569' : '#e2e8f0';
        if (isMin) return '#ef4444';
        if (isMax) return '#14b8a6';
        if (isWinning) return isDarkMode ? '#86efac' : '#16a34a';
        return isDarkMode ? '#94a3b8' : '#64748b';
    };

    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                position: 'relative',
                paddingBottom: isMobile ? '14px' : '12px',
                margin: isMobile ? '0 6px' : '0 2px',
                cursor: 'pointer',
                pointerEvents: 'auto',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '9999px',
                    border: `2px solid ${getBorderColor()}`,
                    borderBottomColor: getBottomBorderColor(),
                    backgroundColor: getBgColor(),
                    boxShadow: isWinning ? '0 0 8px rgba(34, 197, 94, 0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
                    transition: 'all 0.25s ease',
                    width: size,
                    height: size,
                    boxSizing: 'border-box',
                }}
            >
                <span
                    style={{
                        fontWeight: '700',
                        color: getTextColor(),
                        fontSize: isMobile ? '15px' : '13px',
                        lineHeight: 1,
                    }}
                >
                    {digit}
                </span>
                <span
                    style={{
                        color: getPercentColor(),
                        fontWeight: '500',
                        fontSize: isMobile ? '10px' : '9px',
                        lineHeight: 1,
                        marginTop: '2px',
                    }}
                >
                    {percentage.toFixed(1).replace(/\.0$/, '')}%
                </span>
            </div>
            {isLatest && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: isMobile ? '4px' : '2px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '5px solid transparent',
                        borderRight: '5px solid transparent',
                        borderBottom: '6px solid #ef4444', // Red triangle pointer under active digit
                        animation: 'digit-bounce 0.6s ease infinite alternate',
                    }}
                />
            )}
        </div>
    );
};

const BottomWidgetsMobile = observer(({ digits, tick }: TBottomWidgetsParams) => {
    const { setDigitStats, setTickData } = useTraderStore();

    // Using bottom widgets in V2 to get tick data for all trade types and to get digit stats for Digit trade types
    React.useEffect(() => {
        setTickData(tick);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    React.useEffect(() => {
        setDigitStats(digits);
        // For digits array, which is coming from SmartChart, reference is not always changing.
        // As it is the same, this useEffect was not triggered on every array update.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digits.join('-')]);

    // render no bottom widgets on chart
    return null;
});

const TradeChart = observer(() => {
    const { ui, common, contract_trade, portfolio, client } = useStore();
    const { isMobile } = useDevice();
    const { is_logged_in } = client;
    const {
        accumulator_barriers_data,
        accumulator_contract_barriers_data,
        chart_type,
        granularity,
        has_crossed_accu_barriers,
        markers_array,
        updateChartType,
        updateGranularity,
        updateAccumulatorBarriersData,
    } = contract_trade;
    const ref = React.useRef<{ hasPredictionIndicators(): void; triggerPopup(arg: () => void): void }>(null);
    const { all_positions, removePositionById: onClickRemove } = portfolio;
    const { is_chart_countdown_visible, is_chart_layout_default, is_dark_mode_on, active_sidebar_flyout } = ui;
    const { current_language, is_socket_opened } = common;
    const { activeSymbols: active_symbols } = useActiveSymbols();
    const { symbol } = useDefaultSymbol();
    const {
        barriers_flattened: extra_barriers,
        chartStateChange,
        chart_layout,
        contract_type,
        exportLayout,
        has_alternative_source,
        has_barrier,
        main_barrier_flattened: main_barrier,
        setChartStatus,
        show_digits_stats,
        onChange,
        setTickData,
        prev_contract_type,
        tick_data,
        digit_stats,
        last_digit,
        trade_type_tab,
    } = useTraderStore();
    const is_accumulator = isAccumulatorContract(contract_type);
    const timeoutsMapRef = React.useRef<Map<number, NodeJS.Timeout>>(new Map());
    const settings = {
        countdown: is_chart_countdown_visible,
        isHighestLowestMarkerEnabled: false, // TODO: Pending UI,
        language: current_language.toLowerCase(),
        position: is_chart_layout_default ? 'bottom' : 'left',
        theme: is_dark_mode_on ? 'dark' : 'light',
        ...(is_accumulator
            ? {
                  whitespace: CHART_CONSTANTS.ACCUMULATOR_WHITESPACE,
                  minimumLeftBars: isMobile ? CHART_CONSTANTS.ACCUMULATOR_MIN_LEFT_BARS_MOBILE : undefined,
              }
            : {}),
        ...(has_barrier ? { whitespace: CHART_CONSTANTS.BARRIER_WHITESPACE } : {}),
    };

    const { current_spot, current_spot_time } = accumulator_barriers_data || {};

    const topWidgets = React.useCallback(
        () => <TopWidgets onSymbolChange={symbol => onChange({ target: { name: 'symbol', value: symbol } })} />,
        [onChange]
    );

    // Use centralized SmartCharts adapter hook
    const { chartData, isLoading, error, getQuotes, subscribeQuotes, unsubscribeQuotes, retryFetchChartData } =
        useSmartChartsAdapter({
            debug: false,
            activeSymbols: active_symbols,
            is_accumulator,
            updateAccumulatorBarriersData,
            setTickData,
            current_language,
        });

    React.useEffect(() => {
        if ((is_accumulator || show_digits_stats) && ref.current?.hasPredictionIndicators()) {
            const cancelCallback = () => onChange({ target: { name: 'contract_type', value: prev_contract_type } });
            ref.current?.triggerPopup(cancelCallback);
        }
    }, [is_accumulator, onChange, prev_contract_type, show_digits_stats]);

    const barriers: ChartBarrierStore[] = main_barrier ? [main_barrier, ...extra_barriers] : extra_barriers;

    // max ticks to display for mobile view for tick chart
    const max_ticks =
        granularity === 0 ? CHART_CONSTANTS.MAX_TICKS_MOBILE_TICK : CHART_CONSTANTS.MAX_TICKS_MOBILE_CANDLE;

    // Filter positions based on current symbol and contract type
    const filtered_positions = all_positions.filter(
        p =>
            isContractSupportedAndStarted(symbol, p.contract_info) &&
            (isTurbosContract(contract_type) || isVanillaContract(contract_type)
                ? filterByContractType(
                      p.contract_info,
                      isTurbosContract(contract_type) ? TRADE_TYPES.TURBOS.SHORT : TRADE_TYPES.VANILLA.CALL
                  ) ||
                  filterByContractType(
                      p.contract_info,
                      isTurbosContract(contract_type) ? TRADE_TYPES.TURBOS.LONG : TRADE_TYPES.VANILLA.PUT
                  )
                : filterByContractType(p.contract_info, contract_type))
    );

    // Get IDs of closed positions to auto-remove
    const closed_positions_ids =
        filtered_positions &&
        filtered_positions.filter(position => position.contract_info?.is_sold).map(p => p.contract_info.contract_id);

    // Automatically remove closed positions after 8 seconds
    React.useEffect(() => {
        const timeoutsMap = timeoutsMapRef.current;
        const currentClosedIds = new Set(closed_positions_ids);

        // Start timers for newly closed positions
        closed_positions_ids.forEach(positionId => {
            if (!timeoutsMap.has(Number(positionId))) {
                const timeout = setTimeout(() => {
                    onClickRemove(positionId);
                    timeoutsMap.delete(Number(positionId));
                }, CHART_CONSTANTS.CLOSED_POSITION_REMOVE_TIMEOUT);
                timeoutsMap.set(Number(positionId), timeout);
            }
        });

        // Clear timers for positions that are no longer in the closed list
        timeoutsMap.forEach((timeout, positionId) => {
            if (!currentClosedIds.has(positionId)) {
                clearTimeout(timeout);
                timeoutsMap.delete(positionId);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [closed_positions_ids]);

    // Cleanup all timeouts on unmount
    React.useEffect(() => {
        const timeoutsMap = timeoutsMapRef.current;
        return () => {
            timeoutsMap.forEach(timeout => clearTimeout(timeout));
            timeoutsMap.clear();
        };
    }, []);

    if (!symbol || !active_symbols.length) return null;

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
                <div>Loading chart data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '400px',
                    gap: '16px',
                }}
            >
                <div>Error loading chart data: {error.message}</div>
                <button onClick={retryFetchChartData} style={{ padding: '8px 16px', cursor: 'pointer' }}>
                    Retry
                </button>
            </div>
        );
    }

    if (!chartData || !chartData.tradingTimes) return null;

    // Build digit overlay outside the main chart fragment
    // Build digit overlay outside the main chart fragment
    const isDigitsMarket =
        show_digits_stats ||
        !!(
            contract_type &&
            (contract_type.toUpperCase().includes('DIGIT') || contract_type.toUpperCase().includes('OVER_UNDER'))
        );

    const shouldShowOverlay = isDigitsMarket;
    const shouldHideChart = isMobile && shouldShowOverlay;

    const latestDigit = (() => {
        if (!tick_data?.quote) return null;
        const pip = tick_data.pip_size ? +tick_data.pip_size : 2;
        return parseInt(tick_data.quote.toFixed(pip).slice(-1));
    })();

    // digit_stats from SmartChart are raw counts over the last 1000 ticks (same as store.digit_stats).
    // Official formula from digit.tsx: percentage = (count * 100) / 1000
    const processedStats: number[] = (() => {
        if (!digit_stats || digit_stats.length !== 10) return Array(10).fill(0);
        return digit_stats.map((count: number) => parseFloat(((count * 100) / 1000).toFixed(1)));
    })();

    // Dynamically find which digit is min (red) and which is max (green)
    const minVal = processedStats.length ? Math.min(...processedStats) : -1;
    const maxVal = processedStats.length ? Math.max(...processedStats) : -1;
    const hasData = processedStats.some((v: number) => v > 0);

    // Only show winning-digit highlights while a digit contract is live (placed but not yet sold).
    const has_active_contract = filtered_positions.some(p => !p.contract_info?.is_sold);

    return (
        <>
            {/* The underlying Chart Engine (Hidden visually on mobile for Digits) */}
            <div
                style={
                    shouldHideChart
                        ? {
                              position: 'absolute',
                              opacity: 0,
                              left: '-9999px',
                              pointerEvents: 'none',
                              width: '1px',
                              height: '1px',
                          }
                        : { display: 'contents' }
                }
            >
                <SmartChart
                    key={show_digits_stats ? symbol : 'trade-chart'}
                    drawingToolFloatingMenuPosition={
                        isMobile
                            ? CHART_CONSTANTS.MOBILE_DRAWING_TOOL_POSITION
                            : CHART_CONSTANTS.DESKTOP_DRAWING_TOOL_POSITION
                    }
                    ref={ref}
                    barriers={barriers}
                    contracts_array={markers_array}
                    bottomWidgets={BottomWidgetsMobile}
                    showLastDigitStats
                    chartControlsWidgets={null}
                    chartStatusListener={(v: boolean) => setChartStatus(!v, true)}
                    chartType={chart_type}
                    chartData={chartData}
                    getQuotes={getQuotes}
                    subscribeQuotes={subscribeQuotes}
                    unsubscribeQuotes={unsubscribeQuotes}
                    enabledNavigationWidget={!isMobile}
                    enabledChartFooter={false}
                    id='trade'
                    isMobile={isMobile}
                    isVerticalScrollEnabled={!isMobile}
                    maxTick={isMobile ? max_ticks : undefined}
                    granularity={show_digits_stats || is_accumulator ? 0 : granularity}
                    settings={settings}
                    allowTickChartTypeOnly={show_digits_stats || is_accumulator}
                    stateChangeListener={chartStateChange}
                    symbol={symbol}
                    // Enable chart native TopWidgets for desktop, keep hidden for mobile
                    topWidgets={isMobile ? () => <div /> : topWidgets}
                    isConnectionOpened={is_socket_opened}
                    clearChart={false}
                    toolbarWidget={() => {
                        return (
                            <ToolbarWidgets updateChartType={updateChartType} updateGranularity={updateGranularity} />
                        );
                    }}
                    importedLayout={chart_layout}
                    onExportLayout={exportLayout}
                    shouldFetchTradingTimes={false}
                    hasAlternativeSource={has_alternative_source}
                    getMarketsOrder={getMarketsOrder}
                    should_zoom_out_on_yaxis={is_accumulator}
                    yAxisMargin={{
                        top: isMobile ? CHART_CONSTANTS.Y_AXIS_MARGIN_MOBILE : CHART_CONSTANTS.Y_AXIS_MARGIN_DESKTOP,
                    }}
                    isLive
                    leftMargin={
                        !isMobile && active_sidebar_flyout
                            ? CHART_CONSTANTS.LEFT_MARGIN_WITH_DRAWER
                            : CHART_CONSTANTS.LEFT_MARGIN_DEFAULT
                    }
                >
                    {is_accumulator && (
                        <AccumulatorsChartElements
                            all_positions={all_positions}
                            current_spot={current_spot}
                            current_spot_time={current_spot_time}
                            has_crossed_accu_barriers={has_crossed_accu_barriers}
                            should_show_profit_text={!!accumulator_contract_barriers_data.accumulators_high_barrier}
                            symbol={symbol}
                            is_mobile={isMobile}
                        />
                    )}
                </SmartChart>
            </div>

            {/* Mobile Digits view: Grid replaces the chart visually */}
            {shouldHideChart && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'flex-start',
                        alignItems: 'center',
                        height: 'auto',
                        width: '100%',
                        gap: '12px',
                        padding: '12px 0 0 0',
                        boxSizing: 'border-box',
                        backgroundColor: 'transparent',
                        pointerEvents: 'none',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', width: '100%' }}>
                        {processedStats.slice(0, 5).map((percentage: number, idx: number) => {
                            const digit = idx;
                            const is_winning = has_active_contract && isWinningDigit(digit, contract_type, trade_type_tab, last_digit);
                            return (
                                <DigitCircle
                                    key={digit}
                                    digit={digit}
                                    percentage={percentage}
                                    isLatest={digit === latestDigit}
                                    isMin={hasData && percentage === minVal}
                                    isMax={hasData && percentage === maxVal}
                                    isDarkMode={is_dark_mode_on}
                                    isMobile={true}
                                    isActive={digit === last_digit}
                                    isWinning={is_winning}
                                    onClick={() => onChange({ target: { name: 'last_digit', value: digit } })}
                                />
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', width: '100%' }}>
                        {processedStats.slice(5, 10).map((percentage: number, idx: number) => {
                            const digit = idx + 5;
                            const is_winning = has_active_contract && isWinningDigit(digit, contract_type, trade_type_tab, last_digit);
                            return (
                                <DigitCircle
                                    key={digit}
                                    digit={digit}
                                    percentage={percentage}
                                    isLatest={digit === latestDigit}
                                    isMin={hasData && percentage === minVal}
                                    isMax={hasData && percentage === maxVal}
                                    isDarkMode={is_dark_mode_on}
                                    isMobile={true}
                                    isActive={digit === last_digit}
                                    isWinning={is_winning}
                                    onClick={() => onChange({ target: { name: 'last_digit', value: digit } })}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Inject bounce keyframe into document head */}
            {typeof document !== 'undefined' &&
                createPortal(
                    <style>{`@keyframes digit-bounce { from { transform: translateY(0); } to { transform: translateY(-4px); } }`}</style>,
                    document.head
                )}

            {/* Desktop Digits view: Floating horizontal row of circles at the bottom of the chart */}
            {!isMobile &&
                isDigitsMarket &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        style={{
                            position: 'fixed',
                            bottom: '32px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 9999,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            pointerEvents: 'none',
                            maxWidth: '520px',
                            width: '100%',
                            padding: '0 12px',
                            boxSizing: 'border-box',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                backgroundColor: 'transparent',
                                padding: '0',
                                pointerEvents: 'auto',
                                overflow: 'hidden',
                                flexWrap: 'nowrap',
                            }}
                        >
                            {processedStats.map((percentage: number, digit: number) => {
                                const is_winning = has_active_contract && isWinningDigit(digit, contract_type, trade_type_tab, last_digit);
                                return (
                                    <DigitCircle
                                        key={digit}
                                        digit={digit}
                                        percentage={percentage}
                                        isLatest={digit === latestDigit}
                                        isMin={hasData && percentage === minVal}
                                        isMax={hasData && percentage === maxVal}
                                        isDarkMode={is_dark_mode_on}
                                        isMobile={false}
                                        isActive={digit === last_digit}
                                        isWinning={is_winning}
                                        onClick={() => onChange({ target: { name: 'last_digit', value: digit } })}
                                    />
                                );
                            })}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
});
export default TradeChart;
