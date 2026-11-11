import React from 'react';

import { useMobileBridge } from '@deriv/api';
import { observer, useStore } from '@deriv/stores';
import { ThemeProvider } from '@deriv-com/quill-ui';
import { getInitialLanguage, useTranslations } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';

import { useLocation } from 'react-router-dom';

import { hasStoredSession } from 'Services/oauth';

import ErrorBoundary from './Components/Elements/Errors/error-boundary.jsx';
import LandscapeBlocker from './Components/Elements/LandscapeBlocker';
import AppToastMessages from './Containers/app-toast-messages.jsx';
import AppContents from './Containers/Layout/app-contents.jsx';
import BottomNav from './Containers/Layout/bottom-nav';
import Header from './Containers/Layout/header';
import AppModals from './Containers/Modals';
import Routes from './Containers/Routes/routes.jsx';
import Devtools from './Devtools';
import AiScannerModal from './Components/Elements/AiScanner';

const AppContent: React.FC<{ passthrough: any }> = observer(({ passthrough }) => {
    const store = useStore();
    const { current_language } = store.common;
    const { is_dark_mode_on } = store.ui;

    const { isMobile } = useDevice();
    const location = useLocation();
    const isLandingPage = location.pathname === '/' || location.pathname === '/landing' || location.pathname === '/landing/';
    const isHomeHub =
        isLandingPage && (store.client.is_logged_in || store.client.is_logging_in || hasStoredSession());
    const isBotPage = location.pathname === '/bot' || location.pathname.startsWith('/bot/');

    const { switchLanguage } = useTranslations();
    const { isBridgeAvailable, sendBridgeEvent } = useMobileBridge();

    const html = document.documentElement;

    React.useEffect(() => {
        switchLanguage(current_language);
        html?.setAttribute('lang', current_language.toLowerCase());
        html?.setAttribute('dir', current_language.toLowerCase() === 'ar' ? 'rtl' : 'ltr');
    }, [current_language, switchLanguage, html]);

    // Send trading:config event when language or theme changes
    React.useEffect(() => {
        if (isBridgeAvailable) {
            const language = current_language || getInitialLanguage();
            sendBridgeEvent('trading:config', {
                lang: language,
                theme: is_dark_mode_on ? 'dark' : 'light',
            });
        }
    }, [isBridgeAvailable, sendBridgeEvent, current_language, is_dark_mode_on]);

    if (isLandingPage && !isHomeHub) {
        return (
            <React.Fragment>
                <LandscapeBlocker />
                <ErrorBoundary root_store={store}>
                    <Routes {...({ passthrough } as any)} />
                </ErrorBoundary>
                <AppToastMessages />
            </React.Fragment>
        );
    }

    return (
        <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
            <LandscapeBlocker />
            {!isHomeHub && (isMobile || isBotPage) && <Header />}
            <ErrorBoundary root_store={store}>
                {isHomeHub ? (
                    <Routes {...({ passthrough } as any)} />
                ) : (
                    <AppContents>
                        <Routes {...({ passthrough } as any)} />
                    </AppContents>
                )}
            </ErrorBoundary>
            {(isMobile || isBotPage || isHomeHub) && <BottomNav />}
            <ErrorBoundary root_store={store}>
                <AppModals />
            </ErrorBoundary>
            <AppToastMessages />
            <Devtools />
            {!isHomeHub && <AiScannerModal />}
        </ThemeProvider>
    );
});

export default AppContent;
