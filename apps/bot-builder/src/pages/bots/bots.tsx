import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { load, save_types } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { Localize, localize } from '@deriv-com/translations';
import { PIPLUX_BOTS, TPipluxBot } from './bots-catalog';
import './bots.scss';

const waitForDerivWorkspace = async () => {
    if (window.Blockly?.derivWorkspace) return window.Blockly.derivWorkspace;
    for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (window.Blockly?.derivWorkspace) return window.Blockly.derivWorkspace;
    }
    return null;
};

const BotsPage = observer(() => {
    const { dashboard, run_panel } = useStore();
    const [loadingBotId, setLoadingBotId] = React.useState<string | null>(null);
    const [activeBotId, setActiveBotId] = React.useState<string | null>(null);
    const [statusMessage, setStatusMessage] = React.useState<{ tone: 'info' | 'warning'; text: string } | null>(null);

    const handleLoadBot = async (bot: TPipluxBot) => {
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
                text: `${bot.name} ${localize('loaded into Bot Builder and ready to run.')}`,
            });

            if (dashboard.active_tab !== DBOT_TABS.BOT_BUILDER) {
                dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
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

    const handleRunOrStopLoadedBot = async (bot: TPipluxBot) => {
        if (run_panel.is_running || run_panel.is_stop_button_visible) {
            run_panel.onStopBotClick();
            return;
        }
        if (activeBotId === bot.id) {
            if (dashboard.active_tab !== DBOT_TABS.BOT_BUILDER) {
                dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            }
            await run_panel.onRunButtonClick();
        }
    };

    const featuredBot = PIPLUX_BOTS[0];
    const libraryBots = PIPLUX_BOTS.slice(1);

    const renderBotCard = (bot: TPipluxBot) => {
        const isFeatured = !!bot.featured;
        const isLoading = loadingBotId === bot.id;
        const isActive = activeBotId === bot.id;
        const isRunning = isActive && (run_panel.is_running || run_panel.is_stop_button_visible);

        return (
            <article
                key={bot.id}
                className={classNames('bots-card', {
                    'bots-card--featured': isFeatured,
                    'bots-card--active': isActive,
                })}
                data-testid={`dt-bot-card-${bot.id}`}
            >
                <header className='bots-card__header'>
                    <div className='bots-card__badges'>
                        <span
                            className={classNames('bots-card__badge', {
                                'bots-card__badge--gold': isFeatured,
                            })}
                        >
                            {isFeatured && <span aria-hidden='true'>★ </span>}
                            {bot.badge}
                        </span>
                        <div className='bots-card__badges-end'>
                            {isActive && (
                                <span className='bots-card__active-pill'>
                                    <Localize i18n_default_text='Active' />
                                </span>
                            )}
                            <span className='bots-card__market'>{bot.marketLabel}</span>
                        </div>
                    </div>

                    <hgroup className='bots-card__title-group'>
                        <h3 className='bots-card__title'>{bot.name}</h3>
                        <p className='bots-card__category'>{bot.category}</p>
                    </hgroup>
                </header>

                <p className='bots-card__summary'>{bot.summary}</p>

                <dl className='bots-card__metrics'>
                    {bot.metrics.map(metric => (
                        <div key={metric.label} className='bots-card__metric'>
                            <dt className='bots-card__metric-label'>{metric.label}</dt>
                            <dd
                                className={classNames('bots-card__metric-value', {
                                    'bots-card__metric-value--gold': metric.accent === 'gold',
                                })}
                            >
                                {metric.value}
                            </dd>
                        </div>
                    ))}
                </dl>

                <footer className='bots-card__footer'>
                    <button
                        type='button'
                        className={classNames('bots-card__btn', {
                            'bots-card__btn--gold': isFeatured && !isActive,
                            'bots-card__btn--loaded': isActive,
                            'bots-card__btn--outline-gold': !isFeatured && !isActive,
                        })}
                        aria-disabled={isLoading || isRunning ? 'true' : undefined}
                        aria-busy={isLoading ? 'true' : undefined}
                        onClick={() => handleLoadBot(bot)}
                        data-testid={`dt-use-bot-${bot.id}`}
                    >
                        {isLoading ? (
                            <Localize i18n_default_text='Loading...' />
                        ) : isActive ? (
                            <Localize i18n_default_text='Load in Builder' />
                        ) : (
                            <Localize i18n_default_text='Use Bot' />
                        )}
                        <span className='bots-page__visually-hidden'>{` ${bot.name}`}</span>
                    </button>

                    {isActive && (
                        <button
                            type='button'
                            className={classNames('bots-card__btn', {
                                'bots-card__btn--stop': isRunning,
                                'bots-card__btn--gold': !isRunning,
                            })}
                            onClick={() => handleRunOrStopLoadedBot(bot)}
                            data-testid={`dt-run-bot-${bot.id}`}
                        >
                            {isRunning ? (
                                <Localize i18n_default_text='Stop' />
                            ) : (
                                <>
                                    <svg
                                        width='12'
                                        height='12'
                                        viewBox='0 0 24 24'
                                        fill='currentColor'
                                        aria-hidden='true'
                                    >
                                        <path d='M8 5v14l11-7z' />
                                    </svg>
                                    <Localize i18n_default_text='Run Bot' />
                                </>
                            )}
                            <span className='bots-page__visually-hidden'>{` ${bot.name}`}</span>
                        </button>
                    )}
                </footer>
            </article>
        );
    };

    return (
        <section className='bots-page' aria-labelledby='bots-page-heading' data-testid='dt-bots-page'>
            <div className='bots-page__inner'>
                <header className='bots-page__hero'>
                    <div className='bots-page__hero-copy'>
                        <span className='bots-page__eyebrow'>
                            <span className='bots-page__eyebrow-dot' aria-hidden='true' />
                            <Localize i18n_default_text='PIPLUX Bot Suite' />
                        </span>
                        <h1 id='bots-page-heading' className='bots-page__heading'>
                            <Localize i18n_default_text='Automated Trading Bots' />
                        </h1>
                        <p className='bots-page__subcopy'>
                            <Localize i18n_default_text='Ready-to-trade Blockly strategies tuned for Deriv synthetic indices. Select any bot to load it directly into Bot Builder.' />
                        </p>
                    </div>

                    <div className='bots-page__hero-stats'>
                        <span className='bots-page__pill'>
                            {`${PIPLUX_BOTS.length} `}
                            <Localize i18n_default_text='Verified Strategies' />
                        </span>
                        <span className='bots-page__pill bots-page__pill--subtle'>
                            <Localize i18n_default_text='1-Click Builder Import' />
                        </span>
                    </div>
                </header>

                {statusMessage && (
                    <div
                        role={statusMessage.tone === 'warning' ? 'alert' : 'status'}
                        aria-live='polite'
                        className={classNames('bots-page__status', `bots-page__status--${statusMessage.tone}`)}
                    >
                        <span>{statusMessage.text}</span>
                    </div>
                )}

                {featuredBot && (
                    <div className='bots-page__spotlight'>
                        {renderBotCard(featuredBot)}
                    </div>
                )}

                {libraryBots.length > 0 && (
                    <div className='bots-page__library'>
                        <div className='bots-page__section-header'>
                            <h2 className='bots-page__section-title'>
                                <Localize i18n_default_text='Additional Strategies' />
                            </h2>
                            <span className='bots-page__section-line' aria-hidden='true' />
                        </div>
                        <div className='bots-page__grid'>{libraryBots.map(bot => renderBotCard(bot))}</div>
                    </div>
                )}
            </div>
        </section>
    );
});

export default BotsPage;
