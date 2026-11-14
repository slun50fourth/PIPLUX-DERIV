import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import { RUN_PANEL_BOTS, TRunPanelBot } from './bots-catalog';
import './bots-panel.scss';

const waitForDerivWorkspace = async () => {
    if (window.Blockly?.derivWorkspace) return window.Blockly.derivWorkspace;
    for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (window.Blockly?.derivWorkspace) return window.Blockly.derivWorkspace;
    }
    return null;
};

type TBotsPanel = {
    is_drawer_open?: boolean;
};

const BotsPanel = observer(({ is_drawer_open }: TBotsPanel) => {
    const { dashboard, run_panel } = useStore();
    const { isDesktop } = useDevice();
    const [loadingBotId, setLoadingBotId] = React.useState<string | null>(null);
    const [activeBotId, setActiveBotId] = React.useState<string | null>(null);
    const [statusMessage, setStatusMessage] = React.useState<{ tone: 'info' | 'warning'; text: string } | null>(null);

    const handleLoadBot = async (bot: TRunPanelBot) => {
        if (loadingBotId) return;

        if (run_panel.is_running || run_panel.is_stop_button_visible) {
            setStatusMessage({
                tone: 'warning',
                text: localize('Stop your active bot before switching strategies.'),
            });
            return;
        }

        setLoadingBotId(bot.id);
        setStatusMessage(null);

        try {
            if (dashboard.active_tab !== DBOT_TABS.BOT_BUILDER) {
                dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            }

            const workspace = await waitForDerivWorkspace();
            if (!workspace) {
                setStatusMessage({
                    tone: 'warning',
                    text: localize('Workspace is still initialising. Please try again.'),
                });
                return;
            }

            const result = await load({
                block_string: bot.xml,
                strategy_id: bot.id,
                file_name: bot.name,
                workspace,
                from: save_types.LOCAL,
                drop_event: {},
                showIncompatibleStrategyDialog: false,
                show_snackbar: true,
            });

            if (result?.error) {
                setStatusMessage({
                    tone: 'warning',
                    text: result.error,
                });
                return;
            }

            setActiveBotId(bot.id);
            setStatusMessage({
                tone: 'info',
                text: `${bot.name} ${localize('loaded into your workspace and ready to run.')}`,
            });

            if (!isDesktop && is_drawer_open) {
                setTimeout(() => run_panel.toggleDrawer(false), 300);
            }
        } catch (error) {
            setStatusMessage({
                tone: 'warning',
                text: (error as Error)?.message || localize('Could not load bot into workspace.'),
            });
        } finally {
            setLoadingBotId(null);
        }
    };

    const handleRunOrStopLoadedBot = async (bot: TRunPanelBot) => {
        if (run_panel.is_running || run_panel.is_stop_button_visible) {
            run_panel.onStopBotClick();
            return;
        }

        if (activeBotId !== bot.id) {
            await handleLoadBot(bot);
        }

        await run_panel.onRunButtonClick();
    };

    const featuredBot = RUN_PANEL_BOTS[0];
    const libraryBots = RUN_PANEL_BOTS.slice(1);

    const renderBotCard = (bot: TRunPanelBot) => {
        const isFeatured = Boolean(bot.featured);
        const isActive = activeBotId === bot.id;
        const isLoading = loadingBotId === bot.id;
        const isRunning = run_panel.is_running || run_panel.is_stop_button_visible;

        return (
            <li
                key={bot.id}
                className={classNames('bots-panel__card', {
                    'bots-panel__card--featured': isFeatured,
                    'bots-panel__card--active': isActive,
                })}
                data-bot-id={bot.id}
            >
                <div className='bots-panel__card-top'>
                    <span
                        className={classNames('bots-panel__badge', {
                            'bots-panel__badge--gold': isFeatured,
                        })}
                    >
                        {isFeatured && (
                            <svg width='11' height='11' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
                                <path d='M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z' />
                            </svg>
                        )}
                        {bot.badge}
                    </span>
                    <span className='bots-panel__market-tag' title={bot.symbolCode}>
                        {bot.marketLabel}
                    </span>
                </div>

                <div className='bots-panel__title-row'>
                    <h3 className='bots-panel__title'>{bot.name}</h3>
                    <span className='bots-panel__category'>{bot.category}</span>
                </div>

                <p className='bots-panel__summary'>{bot.summary}</p>

                <div className='bots-panel__metrics'>
                    {bot.metrics.map(metric => (
                        <div key={metric.label} className='bots-panel__metric'>
                            <span className='bots-panel__metric-label'>{metric.label}</span>
                            <span
                                className={classNames('bots-panel__metric-value', {
                                    'bots-panel__metric-value--gold': metric.accent === 'gold',
                                })}
                            >
                                {metric.value}
                            </span>
                        </div>
                    ))}
                </div>

                <div className='bots-panel__actions'>
                    <button
                        type='button'
                        className={classNames('bots-panel__btn', {
                            'bots-panel__btn--loaded': isActive,
                            'bots-panel__btn--gold': !isActive && isFeatured,
                            'bots-panel__btn--outline-gold': !isActive && !isFeatured,
                        })}
                        aria-disabled={isLoading || isRunning ? 'true' : undefined}
                        aria-busy={isLoading ? 'true' : undefined}
                        onClick={() => handleLoadBot(bot)}
                        data-testid={`dt-use-bot-${bot.id}`}
                    >
                        {isLoading ? (
                            <Localize i18n_default_text='Loading...' />
                        ) : isActive ? (
                            <Localize i18n_default_text='Loaded' />
                        ) : (
                            <Localize i18n_default_text='Use Bot' />
                        )}
                        <span className='bots-panel__visually-hidden'>{` ${bot.name}`}</span>
                    </button>

                    {isActive && (
                        <button
                            type='button'
                            className={classNames('bots-panel__btn', {
                                'bots-panel__btn--stop': isRunning,
                                'bots-panel__btn--gold': !isRunning,
                            })}
                            onClick={() => handleRunOrStopLoadedBot(bot)}
                            data-testid={`dt-run-bot-${bot.id}`}
                        >
                            {isRunning ? (
                                <Localize i18n_default_text='Stop' />
                            ) : (
                                <>
                                    <svg
                                        width='11'
                                        height='11'
                                        viewBox='0 0 24 24'
                                        fill='currentColor'
                                        aria-hidden='true'
                                    >
                                        <path d='M8 5v14l11-7z' />
                                    </svg>
                                    <Localize i18n_default_text='Run Bot' />
                                </>
                            )}
                            <span className='bots-panel__visually-hidden'>{` ${bot.name}`}</span>
                        </button>
                    )}
                </div>
            </li>
        );
    };

    return (
        <section className='bots-panel' aria-labelledby='bots-panel-heading' data-testid='dt-bots-panel'>
            <header className='bots-panel__header'>
                <div className='bots-panel__eyebrow-row'>
                    <span className='bots-panel__eyebrow'>
                        <span className='bots-panel__eyebrow-dot' aria-hidden='true' />
                        <Localize i18n_default_text='PIPLUX Bot Suite' />
                    </span>
                    <span className='bots-panel__count-pill'>
                        {`${RUN_PANEL_BOTS.length} `}
                        <Localize i18n_default_text='Strategies' />
                    </span>
                </div>
                <h2 id='bots-panel-heading' className='bots-panel__heading'>
                    <Localize i18n_default_text='Automated Trading Bots' />
                </h2>
                <p className='bots-panel__subcopy'>
                    <Localize i18n_default_text='One-click Blockly strategies tuned for Deriv markets.' />
                </p>

                {statusMessage && (
                    <div
                        role={statusMessage.tone === 'warning' ? 'alert' : 'status'}
                        aria-live='polite'
                        className={classNames('bots-panel__status', `bots-panel__status--${statusMessage.tone}`)}
                    >
                        <span>{statusMessage.text}</span>
                    </div>
                )}
            </header>

            <div className='bots-panel__scroll'>
                <ul className='bots-panel__list'>
                    {featuredBot && renderBotCard(featuredBot)}
                    {libraryBots.length > 0 && (
                        <li className='bots-panel__divider' aria-hidden='true'>
                            <Localize i18n_default_text='Additional Strategies' />
                        </li>
                    )}
                    {libraryBots.map(bot => renderBotCard(bot))}
                </ul>
            </div>
        </section>
    );
});

export default BotsPanel;
