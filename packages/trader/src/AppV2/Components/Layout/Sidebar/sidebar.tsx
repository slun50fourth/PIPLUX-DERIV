import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import classNames from 'classnames';

import { useMobileBridge } from '@deriv/api';
import { Button, Flyout, Text } from '@deriv/components';
import {
    LabelPairedLifeRingSmRegularIcon,
    LegacyHomeNewIcon,
    StandaloneCircleUserFillIcon,
    StandaloneCircleUserRegularIcon,
    StandaloneClockThreeFillIcon,
    StandaloneClockThreeRegularIcon,
    StandaloneFileRegularIcon,
    StandaloneGlobeFillIcon,
    StandaloneGlobeRegularIcon,
    StandaloneMoonRegularIcon,
    StandaloneSearchBoldIcon,
    StandaloneSunBrightRegularIcon,
} from '@deriv/quill-icons';
// [AI]
import {
    getBrandLogo,
    getBrandLogoDark,
    getBrandName,
    getHomeUrl,
    getHelpCentreUrl,
    isFeatureEnabled,
    routes,
} from '@deriv/shared';
// [/AI]
import { observer, useStore } from '@deriv/stores';
import { Localize, localize, useTranslations } from '@deriv-com/translations';

import { PositionsDrawerContent, PositionsDrawerFooter } from './PositionsDrawer';
import { AiScannerDrawerContent } from 'AppV2/Components/AiScannerDrawer';

import AccountSelector from './account-selector';
import LanguageSelector from './language-selector';

type TSidebarItem = {
    id: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    isActive: boolean;
    badge?: number;
    dataTestId?: string;
};

const Sidebar = observer(() => {
    const { ui, client, portfolio } = useStore();
    const { currentLang } = useTranslations();
    const { is_dark_mode_on, active_sidebar_flyout, setSidebarFlyout, closeSidebarFlyout } = ui;
    const { is_logged_in } = client;
    const { active_positions_count, onMount, onUnmount } = portfolio;
    const location = useLocation();
    const history = useHistory();
    const sidebar_ref = React.useRef<HTMLElement>(null);
    const { sendBridgeEvent } = useMobileBridge();

    React.useEffect(() => {
        onMount();
        return () => onUnmount();
    }, [onMount, onUnmount]);

    const isActiveRoute = (path: string) => {
        if (path === routes.index || path === routes.trader) {
            return (
                location.pathname === routes.index ||
                location.pathname === routes.trader ||
                location.pathname.startsWith(`${routes.trader}/`)
            );
        }
        return location.pathname.startsWith(path);
    };

    const handleThemeToggle = () => {
        ui.setDarkMode(!is_dark_mode_on);
    };

    const handleLanguageToggle = () => {
        setSidebarFlyout(active_sidebar_flyout === 'language' ? null : 'language');
    };

    const handleAccountToggle = () => {
        setSidebarFlyout(active_sidebar_flyout === 'account' ? null : 'account');
    };

    const handleAiScannerToggle = () => {
        setSidebarFlyout(active_sidebar_flyout === 'ai_scanner' ? null : 'ai_scanner');
    };

    const handlePositionsToggle = () => {
        setSidebarFlyout(active_sidebar_flyout === 'positions' ? null : 'positions');
    };

    const handleBotBuilderClick = () => {
        closeSidebarFlyout();
        history.push(routes.bot);
    };

    const handleReportsClick = () => {
        setSidebarFlyout(null);
        history.push(routes.reports);
    };

    const handleHelpCentreClick = () => {
        closeSidebarFlyout();
        window.open(getHelpCentreUrl(), '_blank', 'noopener,noreferrer');
    };

    const handleHomeClick = () => {
        closeSidebarFlyout();
        sendBridgeEvent('trading:home', () => {
            history.push(routes.landing);
        });
    };

    const closeFlyout = () => {
        closeSidebarFlyout();
    };

    // Main navigation items
    const isPositionsActive = active_sidebar_flyout === 'positions';
    const isAiScannerActive = active_sidebar_flyout === 'ai_scanner';
    const isReportsActive = isActiveRoute(routes.reports);

    const navigationItems: TSidebarItem[] = [
        {
            id: 'home',
            icon: <LegacyHomeNewIcon iconSize='xs' fill='var(--color-text-primary)' />,
            label: localize('Home'),
            onClick: handleHomeClick,
            isActive: false,
            dataTestId: 'dt_sidebar_home',
        },
        {
            id: 'ai_scanner',
            icon: (
                <StandaloneSearchBoldIcon
                    fill={isAiScannerActive ? 'var(--color-nav-item-active)' : 'var(--color-text-primary)'}
                    iconSize='sm'
                />
            ),
            label: localize('AI Scanner'),
            onClick: handleAiScannerToggle,
            isActive: isAiScannerActive,
            dataTestId: 'dt_sidebar_ai_scanner',
        },
        {
            id: 'bot_builder',
            icon: (
                <svg
                    width='18'
                    height='18'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='var(--color-text-primary)'
                    strokeWidth='2'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                >
                    <rect x='3' y='11' width='18' height='10' rx='2' />
                    <circle cx='12' cy='5' r='2' />
                    <path d='M12 7v4' />
                    <line x1='8' y1='16' x2='8.01' y2='16' />
                    <line x1='16' y1='16' x2='16.01' y2='16' />
                </svg>
            ),
            label: localize('Bot Builder'),
            onClick: handleBotBuilderClick,
            isActive: isActiveRoute(routes.bot),
            dataTestId: 'dt_sidebar_bot_builder',
        },
        {
            id: 'positions',
            icon: isPositionsActive ? (
                <StandaloneClockThreeFillIcon fill='var(--color-nav-item-active)' iconSize='sm' />
            ) : (
                <StandaloneClockThreeRegularIcon fill='var(--color-text-primary)' iconSize='sm' />
            ),
            label: localize('Positions'),
            onClick: handlePositionsToggle,
            isActive: isPositionsActive,
            badge: active_positions_count,
            dataTestId: 'dt_sidebar_positions',
        },
        {
            id: 'reports',
            icon: <StandaloneFileRegularIcon fill='var(--color-text-primary)' iconSize='sm' />,
            label: localize('Reports'),
            onClick: handleReportsClick,
            isActive: isReportsActive,
            dataTestId: 'dt_sidebar_reports',
        },
    ];

    // Utility items (bottom section)
    const isLanguageActive = active_sidebar_flyout === 'language';
    const isAccountActive = active_sidebar_flyout === 'account';

    const utilityItems = [
        {
            id: 'help',
            icon: <LabelPairedLifeRingSmRegularIcon fill='var(--color-text-primary)' />,
            label: localize('Help'),
            onClick: handleHelpCentreClick,
            isActive: false,
            dataTestId: 'dt_sidebar_help',
        },
        ...(isFeatureEnabled('language_switcher')
            ? [
                  {
                      id: 'language',
                      icon: isLanguageActive ? (
                          <StandaloneGlobeFillIcon fill='var(--color-nav-item-active)' iconSize='sm' />
                      ) : (
                          <StandaloneGlobeRegularIcon fill='var(--color-text-primary)' iconSize='sm' />
                      ),
                      label: localize('Language'),
                      onClick: handleLanguageToggle,
                      isActive: isLanguageActive,
                      dataTestId: 'dt_sidebar_language',
                  },
              ]
            : []),
        ...(isFeatureEnabled('dark_mode')
            ? [
                  {
                      id: 'theme',
                      icon: is_dark_mode_on ? (
                          <StandaloneMoonRegularIcon fill='var(--color-text-primary)' iconSize='sm' />
                      ) : (
                          <StandaloneSunBrightRegularIcon fill='var(--color-text-primary)' iconSize='sm' />
                      ),
                      label: localize('Theme'),
                      onClick: handleThemeToggle,
                      isActive: false,
                      dataTestId: 'dt_sidebar_theme',
                  },
              ]
            : []),
        {
            id: 'account',
            icon: isAccountActive ? (
                <StandaloneCircleUserFillIcon fill='var(--color-nav-item-active)' iconSize='sm' />
            ) : (
                <StandaloneCircleUserRegularIcon fill='var(--color-text-primary)' iconSize='sm' />
            ),
            label: localize('Account'),
            onClick: handleAccountToggle,
            isActive: isAccountActive,
            dataTestId: 'dt_sidebar_account',
        },
    ];

    const getFlyoutContent = () => {
        switch (active_sidebar_flyout) {
            case 'language':
                return {
                    title: <Localize i18n_default_text='Language' />,
                    content: <LanguageSelector onLanguageChange={closeFlyout} />,
                    footer: null,
                };
            case 'account':
                return {
                    title: <Localize i18n_default_text='Account' />,
                    content: <AccountSelector />,
                    footer: null,
                };
                        case 'ai_scanner':
                return {
                    title: <Localize i18n_default_text='AI Market Scanner' />,
                    content: <AiScannerDrawerContent onClose={closeFlyout} />,
                    footer: null,
                };
            case 'positions':
                return {
                    title: <Localize i18n_default_text='Open positions' />,
                    content: <PositionsDrawerContent />,
                    footer: <PositionsDrawerFooter />,
                };
            default:
                return null;
        }
    };

    const flyoutContent = React.useMemo(() => getFlyoutContent(), [active_sidebar_flyout, currentLang]);

    return (
        <React.Fragment>
            <aside
                ref={sidebar_ref}
                className={classNames('sidebar', {
                    sidebar__hidden: !isActiveRoute(routes.index) && !isActiveRoute(routes.trader),
                })}
                data-testid='dt_sidebar'
            >
                {/* Logo Section */}
                <div className='sidebar__header' onClick={() => history.push(routes.landing)} style={{ cursor: 'pointer' }}>
                    {/* [AI] */}
                    <img
                        src={`/${is_dark_mode_on ? getBrandLogoDark() : getBrandLogo()}`}
                        alt={getBrandName()}
                        width={32}
                        height={32}
                        data-testid='dt_sidebar_brand_logo'
                    />
                    {/* [/AI] */}
                </div>
                <div className='sidebar__separator' />
                {/* Main Navigation */}
                <nav className='sidebar__nav'>
                    <div className='sidebar__nav-main'>
                        {navigationItems.map(item => {
                            const shouldShow = item.id === 'home' || is_logged_in;

                            if (!shouldShow) return null;

                            return (
                                <Button
                                    key={item.id}
                                    className={classNames('sidebar__item', {
                                        'sidebar__item--active': item.isActive,
                                    })}
                                    onClick={item.onClick}
                                    data-testid={item.dataTestId}
                                    aria-label={item.label}
                                    type='button'
                                >
                                    <Text className='sidebar__item-icon'>{item.icon}</Text>
                                    <Text className='sidebar__item-label'>{item.label}</Text>
                                    {item.badge !== undefined && item.badge > 0 && (
                                        <Text className='sidebar__item-badge'>{item.badge}</Text>
                                    )}
                                </Button>
                            );
                        })}
                    </div>
                    {/* Utility Section */}
                    <div className='sidebar__nav-utility'>
                        <div className='sidebar__separator' />
                        {utilityItems.map(item => {
                            const shouldShow = item.id === 'account' ? is_logged_in : true;

                            if (!shouldShow) return null;

                            return (
                                <Button
                                    key={item.id}
                                    className={classNames('sidebar__item', {
                                        'sidebar__item--active': item.isActive,
                                    })}
                                    onClick={item.onClick}
                                    data-testid={item.dataTestId}
                                    aria-label={item.label}
                                    type='button'
                                >
                                    <Text className='sidebar__item-icon'>{item.icon}</Text>
                                    <Text className='sidebar__item-label'>{item.label}</Text>
                                </Button>
                            );
                        })}
                    </div>
                </nav>
            </aside>

            {/* Single Flyout with conditional content */}
            <Flyout
                is_open={active_sidebar_flyout !== null}
                onClose={closeFlyout}
                title={flyoutContent?.title}
                footer_content={flyoutContent?.footer}
            >
                {flyoutContent?.content}
            </Flyout>
        </React.Fragment>
    );
});

export default Sidebar;
