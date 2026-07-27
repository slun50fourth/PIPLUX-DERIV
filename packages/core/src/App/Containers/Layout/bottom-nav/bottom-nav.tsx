import React from 'react';
import { matchPath, useHistory, useLocation } from 'react-router';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';

import { useMobileBridge } from '@deriv/api';
import {
    StandaloneBarsRegularIcon,
    StandaloneChartAreaFillIcon,
    StandaloneChartAreaRegularIcon,
    StandaloneFileFillIcon,
    StandaloneFileRegularIcon,
    StandaloneHouseBlankFillIcon,
    StandaloneHouseBlankRegularIcon,
} from '@deriv/quill-icons';
import { getBrandUrl, routes } from '@deriv/shared';
import { useStore } from '@deriv/stores';
import { Badge, Navigation } from '@deriv-com/quill-ui';
import { Localize } from '@deriv-com/translations';

type BottomNavProps = {
    className?: string;
};

const BottomNav = observer(({ className }: BottomNavProps) => {
    const history = useHistory();
    const location = useLocation();
    const { client, common } = useStore();
    const { currency, is_logged_in } = client;
    const { current_language } = common;
    const { sendBridgeEvent } = useMobileBridge();

    const bottomNavItems = React.useMemo(
        () => [
            {
                icon: <StandaloneHouseBlankRegularIcon iconSize='sm' fill='var(--color-text-primary)' />,
                activeIcon: <StandaloneHouseBlankFillIcon iconSize='sm' />,
                label: <Localize i18n_default_text='Home' />,
                path: null,
                action: 'home' as const,
            },
            {
                icon: <StandaloneChartAreaRegularIcon iconSize='sm' fill='var(--color-text-primary)' />,
                activeIcon: <StandaloneChartAreaFillIcon iconSize='sm' />,
                label: <Localize i18n_default_text='Trade' />,
                path: routes.trader,
            },
            ...(is_logged_in
                ? [
                      {
                          icon: <StandaloneFileRegularIcon iconSize='sm' fill='var(--color-text-primary)' />,
                          activeIcon: <StandaloneFileFillIcon iconSize='sm' />,
                          label: <Localize i18n_default_text='Reports' />,
                          path: routes.reports,
                      },
                  ]
                : []),
            {
                icon: <StandaloneBarsRegularIcon iconSize='sm' fill='var(--color-text-primary)' />,
                activeIcon: <StandaloneBarsRegularIcon iconSize='sm' />,
                label: <Localize i18n_default_text='Menu' />,
                path: routes.menu,
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [is_logged_in]
    );

    const selectedIndex = React.useMemo(() => {
        if (matchPath(location.pathname, { path: routes.contract, exact: true })) {
            return -1; // No icon highlighted for contract details page
        }
        if (
            location.pathname === routes.reports ||
            location.pathname.startsWith(`${routes.reports}/`) ||
            location.pathname === routes.positions ||
            location.pathname === routes.profit ||
            location.pathname === routes.statement
        ) {
            const reportsIdx = bottomNavItems.findIndex(item => item.path === routes.reports);
            if (reportsIdx > -1) return reportsIdx;
        }
        const idx = bottomNavItems.findIndex(item => item.path === location.pathname);
        return idx > -1 ? idx : 1; // Default to Trade
    }, [bottomNavItems, location.pathname]);

    const handleSelect = (index: number) => {
        const item = bottomNavItems[index];

        if (item.action === 'home') {
            history.push(routes.landing);
            return;
        }

        if (item.path) {
            history.push(item.path);
        }
    };

    return (
        <Navigation.Bottom
            className={classNames('bottom-nav-container', className)}
            onChange={(_, index) => handleSelect(index)}
        >
            {bottomNavItems.map((item, index) => (
                <Navigation.BottomAction
                    key={index}
                    index={index}
                    activeIcon={<></>}
                    icon={index === selectedIndex ? item.activeIcon : item.icon}
                    label={item.label}
                    selected={index === selectedIndex}
                    showLabel
                    className={classNames(
                        'bottom-nav-item',
                        index === selectedIndex && 'bottom-nav-item--active',
                        item.path === routes.reports && 'bottom-nav-item--reports'
                    )}
                />
            ))}
        </Navigation.Bottom>
    );
});

export default BottomNav;
