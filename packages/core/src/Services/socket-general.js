import { getPropertyValue, getSocketURL, mapErrorMessage } from '@deriv/shared';
import { localize } from '@deriv-com/translations';

import { fetchOTP } from './accounts-api';
import { clearTokens, ensureValidToken, generateOAuthURL, hasStoredSession } from './oauth';
import WS from './ws-methods';

import ServerTime from '_common/base/server_time';
import BinarySocket from '_common/base/socket_base';

let client_store, common_store;

// TODO: update commented statements to the corresponding functions from app
const BinarySocketGeneral = (() => {
    // Removed session management variables - not needed for trading app

    let responseTimeoutErrorTimer = null;
    let keepAliveTimer = null;
    let wakeupProbeTimer = null;
    let is_lifecycle_listeners_attached = false;

    const clearKeepAlive = () => {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
        clearTimeout(wakeupProbeTimer);
        wakeupProbeTimer = null;
    };

    const startKeepAlive = () => {
        clearKeepAlive();
        keepAliveTimer = setInterval(() => {
            if (navigator.onLine !== false && BinarySocket.hasReadyState(1)) {
                BinarySocket.send({ time: 1 }).catch(() => {});
            }
        }, 25000);
    };

    const verifyConnectionOnWakeup = () => {
        if (navigator.onLine === false) return;

        if (!BinarySocket.getSocket() || BinarySocket.hasReadyState(2, 3)) {
            BinarySocket.openNewConnection();
            return;
        }

        if (BinarySocket.hasReadyState(1)) {
            clearTimeout(wakeupProbeTimer);
            wakeupProbeTimer = setTimeout(() => {
                // Socket did not answer wakeup probe (half-open zombie connection after idle/sleep)
                if (navigator.onLine !== false) {
                    BinarySocket.closeAndOpenNewConnection();
                }
            }, 4000);

            BinarySocket.send({ time: 1 }).catch(() => {
                clearTimeout(wakeupProbeTimer);
                if (BinarySocket.hasReadyState(2, 3)) {
                    BinarySocket.openNewConnection();
                }
            });
        }
    };

    const attachLifecycleListeners = () => {
        if (is_lifecycle_listeners_attached || typeof window === 'undefined') return;
        is_lifecycle_listeners_attached = true;

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                verifyConnectionOnWakeup();
            }
        });
        window.addEventListener('focus', verifyConnectionOnWakeup);
    };

    const refreshWSUrl = async () => {
        if (!hasStoredSession()) {
            return BinarySocket.getWSUrl();
        }

        const loginid =
            client_store?.loginid ||
            sessionStorage.getItem('active_loginid') ||
            localStorage.getItem('active_loginid');
        if (!loginid) {
            return BinarySocket.getWSUrl();
        }

        const token = await ensureValidToken();
        if (!token) {
            // Both access_token and refresh_token expired/revoked — redirect cleanly to OAuth instead of stalling.
            clearTokens();
            generateOAuthURL().then(url => window.location.replace(url));
            return null;
        }

        return fetchOTP(loginid);
    };

    const onDisconnect = () => {
        clearTimeout(responseTimeoutErrorTimer);
        clearKeepAlive();
        common_store.setIsSocketOpened(false);
    };

    const onConnectionError = () => {
        // Keep active_loginid intact and auto-dismiss once BinarySocket recovers
        common_store.setError(true, {
            message: localize('Connection failed. Please refresh this page to continue.'),
            redirectOnClick: () => {
                common_store.setError(false, null);
                BinarySocket.closeAndOpenNewConnection();
            },
        });
    };

    const onOpen = is_ready => {
        clearTimeout(wakeupProbeTimer);
        responseTimeoutErrorTimer = setTimeout(() => {
            const expectedResponseTypes = WS?.get?.()?.expect_response_types || {};
            const pendingResponseTypes = Object.keys(expectedResponseTypes).filter(
                key => expectedResponseTypes[key].state === 'pending'
            );

            const error = new Error('deriv-api: no message received after 30s');
            error.userId = client_store?.loginid;

            // eslint-disable-next-line no-console
            console.error(error.message, { websocketUrl: getSocketURL(), pendingResponseTypes });
        }, 30000);

        if (is_ready) {
            if (common_store?.has_error) {
                common_store.setError(false, null);
            }
            ServerTime.init(() => common_store.setServerTime(ServerTime.get()));
            common_store.setIsSocketOpened(true);
            startKeepAlive();
        }
    };

    const onMessage = response => {
        clearTimeout(responseTimeoutErrorTimer);
        clearTimeout(wakeupProbeTimer);
        handleError(response);

        switch (response.msg_type) {
            case 'balance':
                if (response.balance && response.balance.loginid) {
                    if (!client_store.is_authorize) {
                        // First balance after (re)connect — use it as auth confirmation
                        authorizeAccount(response);
                    } else {
                        // Subsequent balance updates — just update the balance
                        ResponseHandlers.balanceActiveAccount(response);
                    }
                }
                break;
            // no default
        }
    };

    const setBalanceActiveAccount = obj_balance => {
        client_store.setBalanceActiveAccount(obj_balance);
    };

    const handleError = response => {
        const msg_type = response.msg_type;
        const error_code = getPropertyValue(response, ['error', 'code']);
        switch (error_code) {
            case 'WrongResponse':
                if (msg_type === 'balance') {
                    WS.forgetAll('balance').then(subscribeBalance);
                }
                break;
            case 'RateLimit':
                common_store.setError(true, {
                    message: localize('You have reached the rate limit of requests per second. Please try later.'),
                });
                break;
            case 'InvalidAppID':
                common_store.setError(true, { message: mapErrorMessage(response.error) });
                break;
            case 'DisabledClient':
                common_store.setError(true, { message: mapErrorMessage(response.error) });
                break;
            case 'AuthorizationRequired': {
                if (msg_type === 'buy') {
                    return;
                }
                client_store.logout();
                break;
            }
            case 'InvalidToken': {
                // Do NOT reload — that causes an infinite loop when the token is gone.
                // Instead clear tokens and redirect to a fresh OAuth login.
                clearTokens();
                generateOAuthURL().then(url => window.location.replace(url));
                break;
            }
            default:
                break;
        }
    };

    const init = store => {
        client_store = store.client;
        common_store = store.common;
        attachLifecycleListeners();

        return {
            onDisconnect,
            onOpen,
            onMessage,
            onConnectionError,
            refreshWSUrl,
        };
    };

    const subscribeBalance = () => {
        WS.subscribeBalance(ResponseHandlers.balanceActiveAccount);
    };

    const authorizeAccount = response => {
        // Balance response now contains authorization data
        // Transform if needed to match authorize format
        let authorize_data = response;

        // If response is balance format, transform to authorize format
        if (response.balance && !response.authorize) {
            // The v4 balance response only contains financial fields.
            // Fall back to active_loginid as user_id so active_user_id is never empty.
            const fallback_user_id =
                response.balance.user_id ||
                sessionStorage.getItem('active_loginid') ||
                localStorage.getItem('active_loginid') ||
                '';
            authorize_data = {
                authorize: {
                    loginid: response.balance.loginid,
                    balance: response.balance.balance,
                    currency: response.balance.currency,
                    email: response.balance.email || '',
                    landing_company_name: response.balance.landing_company_name || '',
                    country: response.balance.country || '',
                    user_id: fallback_user_id,
                    preferred_language: response.balance.preferred_language || '',
                },
            };
        }

        client_store.responseAuthorize(authorize_data);
        client_store.setIsAuthorize(true); // Set BEFORE anything that depends on it
        BinarySocket.sendBuffered(); // Now buffered calls see is_authorize = true
    };

    return {
        init,
        setBalanceActiveAccount,
        authorizeAccount,
    };
})();

export default BinarySocketGeneral;

const ResponseHandlers = (() => {
    const balanceActiveAccount = response => {
        if (!response.error) {
            const balance = response.balance?.balance || response.balance;
            if (balance !== undefined && balance !== null && balance !== '') {
                BinarySocketGeneral.setBalanceActiveAccount({
                    balance,
                    loginid: client_store?.loginid,
                });
            }
        }
    };

    return {
        balanceActiveAccount,
    };
})();
