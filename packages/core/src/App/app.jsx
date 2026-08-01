import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import PropTypes from 'prop-types';

import { APIProvider, useMobileBridge } from '@deriv/api';
import { Loading } from '@deriv/components';
import { initFormErrorMessages, setUrlLanguage, setWebsocket } from '@deriv/shared';
import { StoreProvider } from '@deriv/stores';
import { BreakpointProvider } from '@deriv-com/quill-ui';
import { getInitialLanguage, initializeI18n, TranslationProvider } from '@deriv-com/translations';

import { clearTokens, exchangeCodeForToken } from 'Services/oauth';
import WS from 'Services/ws-methods';

import { FORM_ERROR_MESSAGES } from '../Constants/form-error-messages';

import AppContent from './AppContent';

import 'Sass/app.scss';

const App = ({ root_store }) => {
    const i18nInstance = initializeI18n({
        cdnUrl: process.env.TRANSLATIONS_CDN_URL || '',
    });
    const l = window.location;
    const base = l.pathname.split('/')[1];
    const has_base = /^\/(br_)/.test(l.pathname);
    const { preferred_language } = root_store.client;
    const { is_dark_mode_on } = root_store.ui;
    const is_dark_mode = is_dark_mode_on || JSON.parse(localStorage.getItem('ui_store'))?.is_dark_mode_on;
    const language = preferred_language ?? getInitialLanguage();
    const { isBridgeAvailable, sendBridgeEvent } = useMobileBridge();

    const [is_oauth_exchanging, setIsOAuthExchanging] = React.useState(() => {
        const params = new URLSearchParams(window.location.search);
        return Boolean(params.get('code') || params.get('token1') || params.get('acct1'));
    });

    // Handle OAuth2 callback — the auth server redirects back to / with ?code=...&state=...
    // No separate /callback route needed; we handle it inline here on every mount.
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');

        const cleanURL = () => {
            const url = new URL(window.location.href);
            url.searchParams.delete('code');
            url.searchParams.delete('state');
            window.history.replaceState({}, '', url.toString());
        };

        if (!code) {
            if (!params.get('token1') && !params.get('acct1')) {
                setIsOAuthExchanging(false);
            }
            return; // Normal load — not an OAuth callback
        }

        // Validate CSRF token
        const stored_csrf = sessionStorage.getItem('oauth_csrf_token');
        if (!state || state !== stored_csrf) {
            // eslint-disable-next-line no-console
            console.error('[OAuth] CSRF token mismatch — aborting token exchange');
            clearTokens();
            cleanURL();
            setIsOAuthExchanging(false);
            return;
        }

        sessionStorage.removeItem('oauth_csrf_token');

        exchangeCodeForToken(code)
            .then(() => {
                // Token is now in sessionStorage. Reload directly to /trader
                // so initStore boots straight into WebTrader without flashing the landing page.
                window.location.replace('/trader');
            })
            .catch(err => {
                // eslint-disable-next-line no-console
                console.error('[OAuth] Token exchange failed:', err);
                cleanURL();
                setIsOAuthExchanging(false);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Send trading:ready event to ensure smooth loader transition
    React.useEffect(() => {
        if (isBridgeAvailable) {
            sendBridgeEvent('trading:ready');
        }
    }, [isBridgeAvailable, sendBridgeEvent]);

    // Pull to refresh logic for mobile browsers/PWA
    React.useEffect(() => {
        let touchStartY = 0;
        let isAtTop = false;

        const handleTouchStart = (e) => {
            touchStartY = e.touches[0].clientY;
            
            // Find the closest scrollable container
            const path = e.composedPath();
            const scrollableNode = path.find(node => {
                if (!(node instanceof Element)) return false;
                const style = window.getComputedStyle(node);
                return (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
            });

            if (scrollableNode) {
                isAtTop = scrollableNode.scrollTop === 0;
            } else {
                isAtTop = true;
            }
        };

        const handleTouchEnd = (e) => {
            const touchEndY = e.changedTouches[0].clientY;
            // Only trigger if pulled down significantly (> 150px) while at the top
            if (isAtTop && (touchEndY - touchStartY) > 150) {
                window.location.reload();
            }
        };

        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, []);

    React.useEffect(() => {
        sessionStorage.removeItem('redirect_url');
        const loadSmartchartsStyles = () => {
            import('@deriv-com/smartcharts-champion/dist/smartcharts.css');
        };

        // Check for theme query parameter and set theme accordingly
        const urlParams = new URLSearchParams(window.location.search);
        const themeParam = urlParams.get('theme');
        if (themeParam === 'dark') {
            root_store.ui.setDarkMode(true);
        } else if (themeParam === 'light') {
            root_store.ui.setDarkMode(false);
        }

        // TODO: [translation-to-shared]: add translation implemnentation in shared
        setUrlLanguage(language);
        initFormErrorMessages(FORM_ERROR_MESSAGES);
        root_store.common.setPlatform();
        loadSmartchartsStyles();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const platform_passthrough = {
        root_store,
        WS,
        i18nInstance,
        language,
    };

    setWebsocket(WS);

    React.useEffect(() => {
        const html = document?.querySelector('html');

        if (!html) return;
        if (is_dark_mode) {
            html.classList?.remove('light');
            html.classList?.add('dark');
        } else {
            html.classList?.remove('dark');
            html.classList?.add('light');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (is_oauth_exchanging) {
        return <Loading />;
    }

    return (
        <Router basename={has_base ? `/${base}` : null}>
            <StoreProvider store={root_store}>
                <BreakpointProvider>
                    <APIProvider>
                        <TranslationProvider defaultLang={language} i18nInstance={i18nInstance}>
                            {/* This is required as translation provider uses suspense to reload language */}
                            <React.Suspense fallback={<Loading />}>
                                <AppContent passthrough={platform_passthrough} />
                            </React.Suspense>
                        </TranslationProvider>
                    </APIProvider>
                </BreakpointProvider>
            </StoreProvider>
        </Router>
    );
};

App.propTypes = {
    root_store: PropTypes.object,
};

export default App;
