const { localize } = require('@deriv-com/translations');
const BinarySocket = require('./socket_base');

/*
 * Monitors the network status and initialises the WebSocket connection
 * 1. online : check the WS status (init/send: blink after timeout, open/message: online)
 * 2. offline: it is offline
 */
const NetworkMonitorBase = (() => {
    // Use getter functions to ensure localize() is called when needed, not at module init
    const getStatusConfig = status => {
        const configs = {
            online: { class: 'online', tooltip: localize('Online') },
            offline: { class: 'offline', tooltip: localize('Offline') },
            blinking: { class: 'blinker', tooltip: localize('Connecting to server') },
        };
        return configs[status];
    };

    let setNetworkStatus;

    const init = (socket_general_functions, fncUpdateUI, client_store) => {
        let last_status, last_is_online;
        setNetworkStatus = status => {
            const is_online = isOnline();
            if (status !== last_status || is_online !== last_is_online) {
                last_status = status;
                last_is_online = is_online;
                fncUpdateUI(getStatusConfig(status), is_online);
            }
        };

        if ('onLine' in navigator) {
            window.addEventListener('online', () => {
                reconnect_attempt = 0;
                setNetworkStatus('blinking');
                reconnectAfter({ timeout: 300 });
            });
            window.addEventListener('offline', () => {
                clearTimeout(reconnect_timeout);
                reconnect_timeout = null;
                BinarySocket.close();
                setNetworkStatus('offline');
            });
        } else {
            // default to always online and fallback to WS checks
            navigator.onLine = true;
        }

        if (isOnline()) {
            const ws_config = { wsEvent, isOnline, ...socket_general_functions };
            BinarySocket.init({ options: ws_config, client: client_store });

            // If a token exists, skip the public connection — client_store.init() will
            // fetch an OTP and open an authenticated connection instead.
            const has_token = !!JSON.parse(sessionStorage.getItem('auth_info') ?? 'null')?.access_token;
            if (!has_token) {
                BinarySocket.openNewConnection();
            }
        }

        setNetworkStatus(isOnline() ? 'blinking' : 'offline');
    };

    const isOnline = () => navigator.onLine;

    // Reconnect with bounded exponential backoff if the network is online
    // and the WebSocket is closed or closing.
    const BACKOFF_DELAYS_MS = [1500, 3000, 5000, 10000, 15000];
    let reconnect_timeout = null;
    let reconnect_attempt = 0;
    function reconnectAfter({ timeout }) {
        clearTimeout(reconnect_timeout);
        reconnect_timeout = setTimeout(() => {
            reconnect_timeout = null;
            if (!isOnline()) return;
            if (!BinarySocket.getSocket() || BinarySocket.hasReadyState(2, 3)) {
                BinarySocket.openNewConnection();
            } else if (BinarySocket.hasReadyState(1)) {
                BinarySocket.send({ time: 1 }).catch(() => {}); // get stable status sooner
            }
        }, timeout);
    }
    const events = {
        init: () => setNetworkStatus(isOnline() ? 'blinking' : 'offline'),
        open: () => {
            reconnect_attempt = 0;
            clearTimeout(reconnect_timeout);
            reconnect_timeout = null;
            setNetworkStatus(isOnline() ? 'online' : 'offline');
        },
        send: () => {},
        message: () => setNetworkStatus('online'),
        close: () => {
            setNetworkStatus(isOnline() ? 'blinking' : 'offline');
            if (isOnline()) {
                const delay = BACKOFF_DELAYS_MS[Math.min(reconnect_attempt, BACKOFF_DELAYS_MS.length - 1)];
                reconnect_attempt++;
                reconnectAfter({ timeout: delay });
            }
        },
    };

    const wsEvent = event => {
        events[event] && events[event](); // eslint-disable-line
    };

    return {
        init,
        wsEvent,
    };
})();

module.exports = NetworkMonitorBase;
