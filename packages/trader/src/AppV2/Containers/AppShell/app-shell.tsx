import React from 'react';
import { useLocation } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import { routes } from '@deriv/shared';
import { useStore } from '@deriv/stores';
import { useDevice } from '@deriv-com/ui';

import Sidebar from 'AppV2/Components/Layout/Sidebar/sidebar';
import { AiScannerMobileDrawer } from 'AppV2/Components/AiScannerDrawer';

import Router from '../../Routes/router';

import './app-shell.scss';

const AppShell = observer(() => {
    const { ui } = useStore();
    const { active_sidebar_flyout } = ui;
    const { isMobile } = useDevice();
    const location = useLocation();

    React.useEffect(() => {
        const isMainTradeRoute =
            location.pathname === routes.index ||
            location.pathname === routes.trader ||
            location.pathname.startsWith(`${routes.trader}/`);
        if (active_sidebar_flyout && !isMainTradeRoute) {
            ui.closeSidebarFlyout();
        }
    }, [location.pathname]);

    return (
        <div className='app-shell'>
            {!isMobile && <Sidebar />}
            <div className='app-shell__main-content'>
                <Router />
            </div>
            {isMobile && (
                <AiScannerMobileDrawer
                    isOpen={active_sidebar_flyout === 'ai_scanner'}
                    onClose={() => ui.closeSidebarFlyout()}
                />
            )}
        </div>
    );
});

export default AppShell;
