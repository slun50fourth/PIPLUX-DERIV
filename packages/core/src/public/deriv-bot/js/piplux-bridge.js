/**
 * PIPLUX Deriv Bot Bridge (v3 <-> v4 WebSocket, Auth & DBot XML Adapter)
 * Bridges Binary Bot / DBot (Blockly) to Deriv Options API v4 (wss://api.derivws.com),
 * registers DBot/Apollo custom blocks, and synchronizes authentication & bot commands
 * with the PIPLUX DTrader parent shell.
 */
(function () {
    'use strict';

    // 1. Suppress legacy ChartIQ domain license alert if cached chunk triggers it
    window.dataLayer = window.dataLayer || [];
    try {
        localStorage.setItem('welcomeFinished', 'true');
        if (!localStorage.getItem('showHeader')) {
            localStorage.setItem('showHeader', 'false');
        }
    } catch (e) {}

    var origAlert = window.alert;
    window.alert = function (msg) {
        if (typeof msg === 'string' && msg.indexOf('Not licensed for domain') !== -1) {
            return;
        }
        return origAlert.apply(window, arguments);
    };

    var API_V4_BASE = 'https://api.derivws.com';
    var PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';
    var APP_ID = '33oOut0fWuGWjsRPBBp38';

    var MARKET_NAMES = {
        synthetic_index: 'Derived',
        volidx: 'Derived',
        forex: 'Forex',
        indices: 'Stock Indices',
        commodities: 'Commodities',
        cryptocurrency: 'Cryptocurrencies',
        basket_index: 'Baskets',
        random_index: 'Derived'
    };

    var SUBMARKET_NAMES = {
        random_index: 'Continuous Indices',
        random_daily: 'Daily Reset Indices',
        crash_index: 'Crash/Boom Indices',
        jump_index: 'Jump Indices',
        step_index: 'Step Indices',
        range_break: 'Range Break Indices',
        major_pairs: 'Major Pairs',
        minor_pairs: 'Minor Pairs',
        smart_fx: 'Smart FX',
        forex_basket: 'Forex Basket',
        commodity_basket: 'Commodities Basket',
        americas: 'American Indices',
        asia_oceania: 'Asian Indices',
        europe_africa: 'European Indices',
        metals: 'Metals',
        energy: 'Energy',
        non_stable_coin: 'Crypto'
    };

    var DEFAULT_ASSET_CATEGORIES = [
        ['callput', 'Up/Down', '1t'],
        ['callputequal', 'Up/Down Equals', '1t'],
        ['touchnotouch', 'Touch/No Touch', '5t'],
        ['endsinout', 'Ends In/Out', '2m'],
        ['staysinout', 'Stays In/Goes Out', '2m'],
        ['asian', 'Asians', '5t'],
        ['digits', 'Digits', '1t'],
        ['highlowticks', 'High/Low Ticks', '5t'],
        ['reset', 'Reset Call/Reset Put', '5t'],
        ['runs', 'Only Ups/Only Downs', '1t']
    ];

    var cachedSymbolsList = [
        ['R_10', 'Volatility 10 Index'],
        ['R_25', 'Volatility 25 Index'],
        ['R_50', 'Volatility 50 Index'],
        ['R_75', 'Volatility 75 Index'],
        ['R_100', 'Volatility 100 Index'],
        ['1HZ10V', 'Volatility 10 (1s) Index'],
        ['1HZ25V', 'Volatility 25 (1s) Index'],
        ['1HZ50V', 'Volatility 50 (1s) Index'],
        ['1HZ75V', 'Volatility 75 (1s) Index'],
        ['1HZ100V', 'Volatility 100 (1s) Index'],
        ['JD10', 'Jump 10 Index'],
        ['JD25', 'Jump 25 Index'],
        ['JD50', 'Jump 50 Index'],
        ['JD75', 'Jump 75 Index'],
        ['JD100', 'Jump 100 Index']
    ];

    // 2. Auth state management (shared origin + postMessage)
    function getAuthState() {
        try {
            var authInfoRaw = sessionStorage.getItem('auth_info') || localStorage.getItem('auth_info');
            var authInfo = authInfoRaw ? JSON.parse(authInfoRaw) : null;
            var accessToken = (authInfo && authInfo.access_token) || null;
            var activeAccountId =
                sessionStorage.getItem('active_loginid') ||
                localStorage.getItem('active_loginid') ||
                localStorage.getItem('account_id') ||
                null;
            var currentAccountRaw = localStorage.getItem('current_account');
            var currentAccount = currentAccountRaw ? JSON.parse(currentAccountRaw) : null;

            return {
                accessToken: accessToken,
                accountId: activeAccountId || (currentAccount && currentAccount.account_id) || null,
                account: currentAccount
            };
        } catch (e) {
            return { accessToken: null, accountId: null, account: null };
        }
    }

    function syncTokensToBotStorage(accessToken, accountId, accountObj) {
        if (!accessToken || !accountId) return false;
        try {
            var isVirtual = accountId.indexOf('VR') === 0 || (accountObj && accountObj.account_type === 'demo');
            var currency = (accountObj && accountObj.currency) || 'USD';
            var balance = accountObj && accountObj.balance !== undefined ? Number(accountObj.balance) : (isVirtual ? 10000 : 0);
            var email = (accountObj && accountObj.email) || '';

            var tokenEntry = {
                accountName: accountId,
                token: accessToken,
                loginInfo: {
                    loginid: accountId,
                    currency: currency,
                    balance: balance,
                    is_virtual: isVirtual ? 1 : 0,
                    country: 'us',
                    email: email,
                    fullname: accountId,
                    landing_company_name: 'svg',
                    landing_company_fullname: 'Deriv (SVG) LLC',
                    user_id: 1
                },
                hasRealityCheck: false,
                hasTradeLimitation: false
            };

            var existingRaw = localStorage.getItem('tokenList');
            var currentId = localStorage.getItem('activeToken');
            var needsUpdate = true;
            if (existingRaw && currentId === accessToken) {
                try {
                    var parsed = JSON.parse(existingRaw);
                    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].accountName === accountId && parsed[0].loginInfo) {
                        needsUpdate = false;
                    }
                } catch (e) {}
            }

            localStorage.setItem('tokenList', JSON.stringify([tokenEntry]));
            localStorage.setItem('activeToken', accessToken);
            localStorage.setItem('active_loginid', accountId);
            return needsUpdate;
        } catch (e) {
            return false;
        }
    }

    // Perform initial sync before bot bundle executes
    var initialAuth = getAuthState();
    if (initialAuth.accessToken && initialAuth.accountId) {
        syncTokensToBotStorage(initialAuth.accessToken, initialAuth.accountId, initialAuth.account);
    }

    // Fetch OTP WebSocket URL for authenticated trading
    function fetchOtpWsUrl(accountId, accessToken) {
        return fetch(API_V4_BASE + '/trading/v1/options/accounts/' + encodeURIComponent(accountId) + '/otp', {
            method: 'POST',
            headers: {
                'Deriv-App-ID': APP_ID,
                'Authorization': 'Bearer ' + accessToken
            }
        })
            .then(function (res) {
                if (!res.ok) throw new Error('OTP status ' + res.status);
                return res.json();
            })
            .then(function (json) {
                if (json && json.data && json.data.url) {
                    return json.data.url;
                }
                throw new Error('No OTP url');
            });
    }

    // 3. Normalizers for v3 <-> v4 messages
    function toNumIfNumeric(val) {
        if (typeof val !== 'string') return val;
        var trimmed = val.trim();
        if (!trimmed) return val;
        var n = Number(trimmed);
        return Number.isFinite(n) ? n : val;
    }

    var NUMERIC_FIELDS = [
        'amount', 'ask_price', 'balance', 'bid_price', 'buy_price', 'commission',
        'current_spot', 'entry_spot', 'entry_tick', 'exit_spot', 'payout',
        'pip_size', 'price', 'profit', 'sell_price', 'sell_spot', 'spot'
    ];

    function normalizeNumbers(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
        var out = Object.assign({}, obj);
        for (var i = 0; i < NUMERIC_FIELDS.length; i++) {
            var k = NUMERIC_FIELDS[i];
            if (k in out) {
                out[k] = toNumIfNumeric(out[k]);
            }
        }
        return out;
    }

    function formatPipString(rawPip) {
        if (!rawPip || !Number.isFinite(rawPip) || rawPip <= 0) return '0.01';
        if (rawPip < 1) {
            var decimals = Math.min(10, Math.max(1, Math.round(-Math.log10(rawPip))));
            return rawPip.toFixed(decimals);
        }
        return String(rawPip);
    }

    function normalizeSymbolItem(s) {
        if (!s || typeof s !== 'object') return s;
        var out = Object.assign({}, s);
        var sym = out.symbol || out.underlying_symbol || '';
        out.symbol = sym;
        out.underlying_symbol = sym;
        out.symbol_type = out.symbol_type || out.underlying_symbol_type || 'stockindex';
        out.display_name = out.display_name || out.underlying_symbol_name || sym;
        out.market = out.market || 'volidx';
        if (out.market === 'synthetic_index') {
            out.market = 'volidx';
        }
        out.market_display_name = out.market_display_name || MARKET_NAMES[out.market] || out.market;
        out.submarket = out.submarket || 'random_index';
        out.submarket_display_name = out.submarket_display_name || SUBMARKET_NAMES[out.submarket] || out.submarket;
        out.subgroup = out.subgroup || 'none';
        out.subgroup_display_name = out.subgroup_display_name || out.subgroup;
        if (out.exchange_is_open === undefined) out.exchange_is_open = 1;
        if (out.is_trading_suspended === undefined) out.is_trading_suspended = 0;

        var rawPip = out.pip !== undefined ? Number(out.pip) : (out.pip_size !== undefined ? Number(out.pip_size) : 0.01);
        if (rawPip >= 1) {
            rawPip = Math.pow(10, -rawPip);
        }
        if (!rawPip || !Number.isFinite(rawPip)) rawPip = 0.01;
        out.pip = formatPipString(rawPip);
        out.pip_size = rawPip;
        return out;
    }

    function normalizeContractAvailableItem(c) {
        if (!c || typeof c !== 'object') return null;
        var out = Object.assign({}, c);
        out.start_type = out.start_type || 'spot';
        out.expiry_type = out.expiry_type || 'tick';

        var cat = out.contract_category;
        var ctype = out.contract_type;

        if (cat === 'callput') {
            out.barrier_category = 'euro_atm';
            out.contract_category = 'callput';
            out.contract_category_display = 'Up/Down';
            out.contract_display = ctype === 'PUT' ? 'Fall' : 'Rise';
            out.barriers = 0;
        } else if (cat === 'higherlower' || ctype === 'HIGHER' || ctype === 'LOWER') {
            out.barrier_category = 'euro_non_atm';
            out.contract_category = 'callput';
            out.contract_category_display = 'Up/Down';
            out.contract_type = ctype === 'LOWER' ? 'PUT' : (ctype === 'HIGHER' ? 'CALL' : ctype);
            out.contract_display = out.contract_type === 'PUT' ? 'Lower' : 'Higher';
            out.barriers = 1;
        } else if (cat === 'callputequal') {
            out.barrier_category = 'euro_atm';
            out.contract_category = 'callputequal';
            out.contract_category_display = 'Up/Down Equals';
            out.contract_display = ctype === 'PUTE' ? 'Fall Equals' : 'Rise Equals';
            out.barriers = 0;
        } else if (cat === 'endsinout') {
            if (ctype === 'EXPIRYMISSE' || ctype === 'EXPIRYRANGEE') return null;
            out.barrier_category = 'euro_non_atm';
            out.contract_category = 'endsinout';
            out.contract_category_display = 'Ends In/Out';
            out.barriers = 2;
            out.high_barrier = out.high_barrier || '+0.50';
            out.low_barrier = out.low_barrier || '-0.50';
        } else if (cat === 'staysinout') {
            out.barrier_category = 'american';
            out.contract_category = 'staysinout';
            out.contract_category_display = 'Stays In/Goes Out';
            out.barriers = 2;
            out.high_barrier = out.high_barrier || '+0.50';
            out.low_barrier = out.low_barrier || '-0.50';
        } else if (cat === 'touchnotouch') {
            out.barrier_category = 'american';
            out.contract_category = 'touchnotouch';
            out.contract_category_display = 'Touch/No Touch';
            out.barriers = 1;
        } else if (cat === 'asian') {
            out.barrier_category = 'asian';
            out.contract_category = 'asian';
            out.contract_category_display = 'Asians';
            out.barriers = 0;
        } else if (cat === 'digits') {
            out.barrier_category = 'non_financial';
            out.contract_category = 'digits';
            out.contract_category_display = 'Digits';
            if (!out.last_digit_range) out.last_digit_range = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
        } else if (cat === 'highlowticks') {
            out.barrier_category = 'american';
            out.contract_category = 'highlowticks';
            out.contract_category_display = 'High/Low Ticks';
        } else if (cat === 'reset') {
            out.barrier_category = 'reset';
            out.contract_category = 'reset';
            out.contract_category_display = 'Reset Call/Reset Put';
            out.barriers = 0;
        } else if (cat === 'runs') {
            out.barrier_category = 'american';
            out.contract_category = 'runs';
            out.contract_category_display = 'Only Ups/Only Downs';
            out.barriers = 0;
        } else {
            return null;
        }

        return out;
    }

    function normalizeOpenContract(poc) {
        if (!poc || typeof poc !== 'object') return poc;
        var out = normalizeNumbers(normalizeSymbolItem(poc));
        var entrySpot = out.entry_spot !== undefined ? out.entry_spot : out.entry_tick;
        var exitSpot = out.exit_spot !== undefined ? out.exit_spot : out.sell_spot;
        var exitTime = out.exit_spot_time !== undefined ? out.exit_spot_time : out.sell_spot_time;
        out.entry_spot = entrySpot;
        out.entry_tick = entrySpot;
        out.exit_spot = exitSpot;
        out.exit_tick = exitSpot;
        out.exit_spot_time = exitTime;
        out.exit_tick_time = out.exit_tick_time !== undefined ? out.exit_tick_time : exitTime;
        out.sell_spot = out.sell_spot !== undefined ? out.sell_spot : exitSpot;
        out.sell_spot_time = out.sell_spot_time !== undefined ? out.sell_spot_time : exitTime;
        out.entry_tick_display_value = out.entry_tick_display_value || out.entry_spot_display_value || (entrySpot !== undefined ? String(entrySpot) : '');
        out.exit_tick_display_value = out.exit_tick_display_value || out.sell_spot_display_value || (exitSpot !== undefined ? String(exitSpot) : '');
        return out;
    }

    function transformOutgoingRequest(req) {
        var copy = Object.assign({}, req);
        delete copy.passthrough;

        if ('active_symbols' in copy) {
            delete copy.landing_company;
            delete copy.landing_company_short;
            delete copy.product_type;
            delete copy.loginid;
            delete copy.barrier_category;
        } else if ('contracts_for' in copy) {
            delete copy.currency;
            delete copy.landing_company;
            delete copy.landing_company_short;
            delete copy.product_type;
            delete copy.loginid;
        } else if ('proposal' in copy) {
            if (copy.symbol && !copy.underlying_symbol) {
                copy.underlying_symbol = copy.symbol;
            }
            delete copy.symbol;
            delete copy.loginid;
            delete copy.barrier_range;
            delete copy.product_type;
            delete copy.date_start;
            delete copy.trade_risk_profile;
            delete copy.trading_period_start;
        } else if ('buy' in copy) {
            delete copy.loginid;
            if (copy.parameters && typeof copy.parameters === 'object') {
                var p = Object.assign({}, copy.parameters);
                if (p.symbol && !p.underlying_symbol) {
                    p.underlying_symbol = p.symbol;
                }
                delete p.symbol;
                delete p.barrier_range;
                delete p.product_type;
                delete p.date_start;
                copy.parameters = p;
            }
        } else if ('balance' in copy || 'proposal_open_contract' in copy || 'sell' in copy || 'cancel' in copy || 'portfolio' in copy || 'profit_table' in copy || 'statement' in copy || 'transaction' in copy) {
            delete copy.loginid;
            delete copy.account;
        }

        return copy;
    }

    function transformIncomingResponse(data, origReq) {
        if (!data || typeof data !== 'object') return data;
        var out = Object.assign({}, data);

        if (origReq && typeof origReq === 'object') {
            out.echo_req = Object.assign({}, out.echo_req || {}, origReq);
            if (origReq.passthrough && !out.passthrough) {
                out.passthrough = origReq.passthrough;
            }
        } else if (out.echo_req && out.echo_req.passthrough && !out.passthrough) {
            out.passthrough = out.echo_req.passthrough;
        }

        switch (out.msg_type) {
            case 'active_symbols':
                if (Array.isArray(out.active_symbols)) {
                    out.active_symbols = out.active_symbols.map(normalizeSymbolItem);
                    var seen = {};
                    var list = [];
                    for (var i = 0; i < out.active_symbols.length; i++) {
                        var s = out.active_symbols[i];
                        if (s && s.symbol && !seen[s.symbol]) {
                            seen[s.symbol] = true;
                            list.push([s.symbol, s.display_name || s.symbol]);
                        }
                    }
                    if (list.length > 0) {
                        cachedSymbolsList = list;
                    }
                }
                break;

            case 'contracts_for':
                if (out.contracts_for && Array.isArray(out.contracts_for.available)) {
                    var mapped = [];
                    for (var j = 0; j < out.contracts_for.available.length; j++) {
                        var item = normalizeContractAvailableItem(out.contracts_for.available[j]);
                        if (item) mapped.push(item);
                    }
                    out.contracts_for = Object.assign(
                        { open: null, close: null, spot: 100, feed_license: 'realtime', non_available: [] },
                        out.contracts_for,
                        { available: mapped }
                    );
                }
                break;

            case 'tick':
                if (out.tick) {
                    out.tick = normalizeNumbers(normalizeSymbolItem(out.tick));
                    if (out.subscription && out.subscription.id && !out.tick.id) {
                        out.tick.id = out.subscription.id;
                    }
                }
                break;

            case 'history':
                if (out.pip_size !== undefined && out.pip === undefined) {
                    out.pip = out.pip_size;
                }
                break;

            case 'candles':
                if (Array.isArray(out.candles)) {
                    out.candles = out.candles.map(normalizeNumbers);
                }
                break;

            case 'ohlc':
                if (out.ohlc) {
                    out.ohlc = normalizeNumbers(normalizeSymbolItem(out.ohlc));
                    if (out.subscription && out.subscription.id && !out.ohlc.id) {
                        out.ohlc.id = out.subscription.id;
                    }
                }
                break;

            case 'proposal':
                if (out.proposal) {
                    out.proposal = normalizeNumbers(out.proposal);
                }
                break;

            case 'buy':
                if (out.buy) {
                    out.buy = normalizeNumbers(out.buy);
                }
                break;

            case 'proposal_open_contract':
                if (out.proposal_open_contract) {
                    out.proposal_open_contract = normalizeOpenContract(out.proposal_open_contract);
                    if (typeof window.__pipluxOnContractUpdate === 'function') {
                        try {
                            window.__pipluxOnContractUpdate(out.proposal_open_contract);
                        } catch (e) {}
                    }
                }
                break;

            case 'balance':
                if (out.balance) {
                    var auth = getAuthState();
                    out.balance = normalizeNumbers(out.balance);
                    if (!out.balance.loginid && auth.accountId) {
                        out.balance.loginid = auth.accountId;
                    }
                    if (!out.balance.currency) {
                        out.balance.currency = (auth.account && auth.account.currency) || 'USD';
                    }
                }
                break;

            case 'trading_times':
                if (out.trading_times && Array.isArray(out.trading_times.markets)) {
                    for (var mIdx = 0; mIdx < out.trading_times.markets.length; mIdx++) {
                        var mkt = out.trading_times.markets[mIdx];
                        if (mkt && Array.isArray(mkt.submarkets)) {
                            for (var smIdx = 0; smIdx < mkt.submarkets.length; smIdx++) {
                                var sub = mkt.submarkets[smIdx];
                                if (sub && Array.isArray(sub.symbols)) {
                                    for (var syIdx = 0; syIdx < sub.symbols.length; syIdx++) {
                                        var symObj = sub.symbols[syIdx];
                                        if (symObj) {
                                            symObj.symbol = symObj.symbol || symObj.underlying_symbol || '';
                                            symObj.name = symObj.name || symObj.display_name || symObj.underlying_symbol_name || symObj.symbol;
                                            symObj.feed_license = symObj.feed_license || 'realtime';
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                break;
        }

        return out;
    }

    // 4. WebSocket Proxy Class
    var NativeWebSocket = window.WebSocket;

    function PipluxWebSocketProxy(url, protocols) {
        var shouldIntercept =
            typeof url === 'string' &&
            (url.indexOf('binaryws.com') !== -1 || url.indexOf('/websockets/v3') !== -1);

        if (!shouldIntercept) {
            return protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
        }

        this.url = url;
        this.readyState = NativeWebSocket.CONNECTING;
        this.protocol = '';
        this.extensions = '';
        this.bufferedAmount = 0;
        this.binaryType = 'blob';
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;

        this._listeners = { open: [], message: [], error: [], close: [] };
        this._reqMap = {};
        this._sendQueue = [];
        this._isAuthenticatedSocket = false;
        this._closedByApp = false;
        this._innerWs = null;

        this._connect(PUBLIC_WS_URL);
    }

    PipluxWebSocketProxy.CONNECTING = NativeWebSocket.CONNECTING;
    PipluxWebSocketProxy.OPEN = NativeWebSocket.OPEN;
    PipluxWebSocketProxy.CLOSING = NativeWebSocket.CLOSING;
    PipluxWebSocketProxy.CLOSED = NativeWebSocket.CLOSED;

    PipluxWebSocketProxy.prototype.CONNECTING = NativeWebSocket.CONNECTING;
    PipluxWebSocketProxy.prototype.OPEN = NativeWebSocket.OPEN;
    PipluxWebSocketProxy.prototype.CLOSING = NativeWebSocket.CLOSING;
    PipluxWebSocketProxy.prototype.CLOSED = NativeWebSocket.CLOSED;

    PipluxWebSocketProxy.prototype._emit = function (type, ev) {
        var handler = this['on' + type];
        if (typeof handler === 'function') {
            try {
                handler.call(this, ev);
            } catch (e) {
                console.error('[PipluxWS] Handler error on ' + type + ':', e);
            }
        }
        var list = this._listeners[type] || [];
        for (var i = 0; i < list.length; i++) {
            try {
                list[i].call(this, ev);
            } catch (e) {
                console.error('[PipluxWS] Listener error on ' + type + ':', e);
            }
        }
    };

    PipluxWebSocketProxy.prototype._dispatchSyntheticMessage = function (payload) {
        var self = this;
        setTimeout(function () {
            if (self._closedByApp) return;
            var raw = JSON.stringify(payload);
            var ev;
            try {
                ev = new MessageEvent('message', { data: raw });
            } catch (e) {
                ev = { type: 'message', data: raw, target: self };
            }
            self._emit('message', ev);
        }, 5);
    };

    PipluxWebSocketProxy.prototype._connect = function (targetUrl, onConnectedCallback) {
        var self = this;
        var ws = new NativeWebSocket(targetUrl);
        this._innerWs = ws;

        ws.onopen = function (ev) {
            if (self._innerWs !== ws) return;
            var wasOpen = self.readyState === NativeWebSocket.OPEN;
            self.readyState = NativeWebSocket.OPEN;

            while (self._sendQueue.length > 0) {
                var item = self._sendQueue.shift();
                ws.send(item);
            }

            if (typeof onConnectedCallback === 'function') {
                onConnectedCallback();
            }

            if (!wasOpen) {
                self._emit('open', ev);
            }
        };

        ws.onmessage = function (ev) {
            if (self._innerWs !== ws) return;
            try {
                var parsed = JSON.parse(ev.data);
                var reqId = parsed && parsed.req_id;
                var origReq = reqId !== undefined ? self._reqMap[reqId] : null;
                var transformed = transformIncomingResponse(parsed, origReq);
                var rawOut = JSON.stringify(transformed);
                var synthEv;
                try {
                    synthEv = new MessageEvent('message', { data: rawOut });
                } catch (e) {
                    synthEv = { type: 'message', data: rawOut, target: self };
                }
                self._emit('message', synthEv);
            } catch (e) {
                self._emit('message', ev);
            }
        };

        ws.onerror = function (ev) {
            if (self._innerWs !== ws) return;
            self._emit('error', ev);
        };

        ws.onclose = function (ev) {
            if (self._innerWs !== ws) return;
            self.readyState = NativeWebSocket.CLOSED;
            self._emit('close', ev);
        };
    };

    PipluxWebSocketProxy.prototype.addEventListener = function (type, fn) {
        if (!this._listeners[type]) this._listeners[type] = [];
        if (this._listeners[type].indexOf(fn) === -1) {
            this._listeners[type].push(fn);
        }
    };

    PipluxWebSocketProxy.prototype.removeEventListener = function (type, fn) {
        if (!this._listeners[type]) return;
        var idx = this._listeners[type].indexOf(fn);
        if (idx !== -1) this._listeners[type].splice(idx, 1);
    };

    PipluxWebSocketProxy.prototype.close = function () {
        this._closedByApp = true;
        this.readyState = NativeWebSocket.CLOSED;
        if (this._innerWs) {
            try {
                this._innerWs.close();
            } catch (e) {}
        }
    };

    PipluxWebSocketProxy.prototype.send = function (rawData) {
        var self = this;
        var req;
        try {
            req = JSON.parse(rawData);
        } catch (e) {
            if (this._innerWs && this._innerWs.readyState === NativeWebSocket.OPEN) {
                this._innerWs.send(rawData);
            } else {
                this._sendQueue.push(rawData);
            }
            return;
        }

        var reqId = req.req_id;
        if (reqId !== undefined) {
            this._reqMap[reqId] = req;
        }

        if ('asset_index' in req) {
            var assetIndexPayload = cachedSymbolsList.map(function (pair) {
                return [pair[0], pair[1], DEFAULT_ASSET_CATEGORIES];
            });
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'asset_index',
                req_id: reqId,
                asset_index: assetIndexPayload
            });
            return;
        }

        if ('website_status' in req) {
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'website_status',
                req_id: reqId,
                website_status: {
                    clients_country: 'us',
                    site_status: 'up',
                    message: '',
                    currencies_config: {
                        USD: { fractional_digits: 2, type: 'fiat' }
                    }
                }
            });
            return;
        }

        if ('landing_company' in req) {
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'landing_company',
                req_id: reqId,
                landing_company: {
                    financial_company: { name: 'Deriv (SVG) LLC', shortcode: 'svg', has_reality_check: 0 },
                    gaming_company: { name: 'Deriv (SVG) LLC', shortcode: 'svg', has_reality_check: 0 }
                }
            });
            return;
        }

        if ('landing_company_details' in req) {
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'landing_company_details',
                req_id: reqId,
                landing_company_details: {
                    has_reality_check: 0,
                    name: 'Deriv (SVG) LLC',
                    shortcode: 'svg',
                    country: 'svg'
                }
            });
            return;
        }

        if ('get_settings' in req) {
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'get_settings',
                req_id: reqId,
                get_settings: { country_code: 'us', country: 'United States' }
            });
            return;
        }

        if ('get_account_status' in req) {
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'get_account_status',
                req_id: reqId,
                get_account_status: { status: ['authenticated'], risk_classification: 'low' }
            });
            return;
        }

        if ('get_limits' in req) {
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'get_limits',
                req_id: reqId,
                get_limits: {
                    account_balance: 100000,
                    daily_transfers: {},
                    lifetime_limit: 100000,
                    num_of_days: 30,
                    num_of_days_limit: 100000,
                    open_positions: 100,
                    payout: 50000,
                    withdrawal_for_x_days_monetary: 0,
                    withdrawal_since_inception_monetary: 0
                }
            });
            return;
        }

        if ('payout_currencies' in req) {
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'payout_currencies',
                req_id: reqId,
                payout_currencies: ['USD']
            });
            return;
        }

        if ('logout' in req) {
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'logout',
                req_id: reqId,
                logout: 1
            });
            return;
        }

        if ('authorize' in req) {
            var authState = getAuthState();
            var accountId = authState.accountId || 'VRTC000000';
            var accessToken = authState.accessToken || req.authorize;
            var acc = authState.account;
            var isVirtual = accountId.indexOf('VR') === 0 || (acc && acc.account_type === 'demo');
            var currency = (acc && acc.currency) || 'USD';
            var balance = acc && acc.balance !== undefined ? Number(acc.balance) : 10000;

            var sendAuthorizeSuccess = function () {
                self._dispatchSyntheticMessage({
                    echo_req: req,
                    msg_type: 'authorize',
                    req_id: reqId,
                    authorize: {
                        email: (acc && acc.email) || '',
                        currency: currency,
                        balance: balance,
                        loginid: accountId,
                        is_virtual: isVirtual ? 1 : 0,
                        landing_company_name: 'svg',
                        landing_company_fullname: 'Deriv (SVG) LLC',
                        country: 'us',
                        user_id: 1,
                        account_list: [
                            {
                                loginid: accountId,
                                currency: currency,
                                is_virtual: isVirtual ? 1 : 0,
                                is_disabled: 0,
                                account_type: 'trading',
                                landing_company_name: 'svg'
                            }
                        ]
                    }
                });
            };

            if (!this._isAuthenticatedSocket && accessToken && authState.accountId) {
                fetchOtpWsUrl(authState.accountId, accessToken)
                    .then(function (otpUrl) {
                        var oldWs = self._innerWs;
                        self._isAuthenticatedSocket = true;
                        self._connect(otpUrl, function () {
                            if (oldWs) {
                                try {
                                    oldWs.close();
                                } catch (e) {}
                            }
                            sendAuthorizeSuccess();
                        });
                    })
                    .catch(function () {
                        sendAuthorizeSuccess();
                    });
            } else {
                sendAuthorizeSuccess();
            }
            return;
        }

        if ('balance' in req && !this._isAuthenticatedSocket) {
            var bAuth = getAuthState();
            var bAcc = bAuth.account;
            var bId = bAuth.accountId || 'VRTC000000';
            var bCurr = (bAcc && bAcc.currency) || 'USD';
            var bVal = bAcc && bAcc.balance !== undefined ? Number(bAcc.balance) : 10000;
            this._dispatchSyntheticMessage({
                echo_req: req,
                msg_type: 'balance',
                req_id: reqId,
                balance: {
                    balance: bVal,
                    currency: bCurr,
                    loginid: bId,
                    id: 'synth-balance-sub'
                }
            });
            return;
        }

        var v4Req = transformOutgoingRequest(req);
        var serialized = JSON.stringify(v4Req);
        if (this._innerWs && this._innerWs.readyState === NativeWebSocket.OPEN) {
            this._innerWs.send(serialized);
        } else {
            this._sendQueue.push(serialized);
        }
    };

    window.WebSocket = PipluxWebSocketProxy;

    // 5. DBot (is_dbot="true") XML -> Binary Bot XML Converter + Custom Block Definitions
    function convertDbotXmlDom(xmlDom) {
        if (!xmlDom) return xmlDom;
        try {
            // Ensure all <variable> elements have a type="" attribute (required by Binary Bot's Blockly.Xml.domToVariables)
            var varNodes = xmlDom.querySelectorAll('variable');
            for (var v = 0; v < varNodes.length; v++) {
                if (varNodes[v].getAttribute('type') === null) {
                    varNodes[v].setAttribute('type', '');
                }
            }

            // Normalize <arg varid="..."> -> varId
            var argNodes = xmlDom.querySelectorAll('arg');
            for (var a = 0; a < argNodes.length; a++) {
                if (argNodes[a].hasAttribute('varid') && !argNodes[a].hasAttribute('varId')) {
                    argNodes[a].setAttribute('varId', argNodes[a].getAttribute('varid'));
                }
            }

            // Convert shadow/block math_number_positive -> math_number
            var mathPos = xmlDom.querySelectorAll('[type="math_number_positive"]');
            for (var m = 0; m < mathPos.length; m++) {
                mathPos[m].setAttribute('type', 'math_number');
            }

            // Normalize synthetic_index -> volidx so both Blockly MARKET_LIST and SmartCharts _processSymbols match
            var marketFields = xmlDom.querySelectorAll('field[name="MARKET_LIST"]');
            for (var mf = 0; mf < marketFields.length; mf++) {
                if (marketFields[mf].textContent === 'synthetic_index') {
                    marketFields[mf].textContent = 'volidx';
                }
            }

            // Convert DBot text_join (with VARIABLE + STACK of text_statement) -> variables_set + standard text_join
            var textJoins = Array.prototype.slice.call(xmlDom.querySelectorAll('block[type="text_join"]'));
            for (var tj = 0; tj < textJoins.length; tj++) {
                var tjBlock = textJoins[tj];
                var varField = null;
                var stackStmt = null;
                for (var cIdx = 0; cIdx < tjBlock.children.length; cIdx++) {
                    var ch = tjBlock.children[cIdx];
                    if (ch.tagName === 'field' && ch.getAttribute('name') === 'VARIABLE') varField = ch;
                    if (ch.tagName === 'statement' && ch.getAttribute('name') === 'STACK') stackStmt = ch;
                }
                if (varField && stackStmt) {
                    var items = [];
                    var cur = stackStmt.querySelector('block[type="text_statement"]');
                    while (cur) {
                        var valNode = null;
                        var nextBlock = null;
                        for (var k = 0; k < cur.children.length; k++) {
                            if (cur.children[k].tagName === 'value' && cur.children[k].getAttribute('name') === 'TEXT') {
                                valNode = cur.children[k];
                            } else if (cur.children[k].tagName === 'next') {
                                nextBlock = cur.children[k].querySelector('block[type="text_statement"]');
                            }
                        }
                        if (valNode) items.push(valNode);
                        cur = nextBlock;
                    }

                    // Transform tjBlock into variables_set
                    tjBlock.setAttribute('type', 'variables_set');
                    varField.setAttribute('name', 'VAR');
                    tjBlock.removeChild(stackStmt);

                    var innerJoin = xmlDom.ownerDocument.createElement('block');
                    innerJoin.setAttribute('type', 'text_join');
                    var mut = xmlDom.ownerDocument.createElement('mutation');
                    mut.setAttribute('items', String(items.length));
                    innerJoin.appendChild(mut);

                    for (var it = 0; it < items.length; it++) {
                        items[it].setAttribute('name', 'ADD' + it);
                        innerJoin.appendChild(items[it]);
                    }

                    var valWrapper = xmlDom.ownerDocument.createElement('value');
                    valWrapper.setAttribute('name', 'VALUE');
                    valWrapper.appendChild(innerJoin);
                    tjBlock.appendChild(valWrapper);
                }
            }

            // Convert DBot trade_definition -> Binary Bot trade + tradeOptions
            var tradeDefs = Array.prototype.slice.call(xmlDom.querySelectorAll('block[type="trade_definition"]'));
            for (var td = 0; td < tradeDefs.length; td++) {
                var tdBlock = tradeDefs[td];
                tdBlock.setAttribute('type', 'trade');

                var extractedFields = {};
                var tradeOptionsStmt = null;
                var submarketStmt = null;

                for (var idx = 0; idx < tdBlock.children.length; idx++) {
                    var child = tdBlock.children[idx];
                    if (child.tagName === 'statement' && child.getAttribute('name') === 'TRADE_OPTIONS') {
                        tradeOptionsStmt = child;
                    } else if (child.tagName === 'statement' && child.getAttribute('name') === 'SUBMARKET') {
                        submarketStmt = child;
                    }
                }

                if (tradeOptionsStmt) {
                    var allFields = tradeOptionsStmt.querySelectorAll('field');
                    for (var fIdx = 0; fIdx < allFields.length; fIdx++) {
                        var f = allFields[fIdx];
                        var fname = f.getAttribute('name');
                        if (fname) {
                            extractedFields[fname] = f.textContent;
                        }
                    }
                    tdBlock.removeChild(tradeOptionsStmt);
                }

                var fieldOrder = [
                    ['MARKET_LIST', 'volidx'],
                    ['SUBMARKET_LIST', 'random_index'],
                    ['SYMBOL_LIST', 'R_100'],
                    ['TRADETYPECAT_LIST', 'callput'],
                    ['TRADETYPE_LIST', 'risefall'],
                    ['TYPE_LIST', 'both'],
                    ['CANDLEINTERVAL_LIST', '60'],
                    ['TIME_MACHINE_ENABLED', 'FALSE'],
                    ['RESTARTONERROR', 'TRUE']
                ];

                var firstChild = tdBlock.firstChild;
                for (var fo = 0; fo < fieldOrder.length; fo++) {
                    var key = fieldOrder[fo][0];
                    var val = extractedFields[key] !== undefined ? extractedFields[key] : fieldOrder[fo][1];
                    if (key === 'MARKET_LIST' && val === 'synthetic_index') val = 'volidx';
                    var newField = xmlDom.ownerDocument.createElement('field');
                    newField.setAttribute('name', key);
                    newField.textContent = val;
                    tdBlock.insertBefore(newField, firstChild);
                }

                if (submarketStmt) {
                    var tdOpt = submarketStmt.querySelector('block[type="trade_definition_tradeoptions"]');
                    if (tdOpt) {
                        tdOpt.setAttribute('type', 'tradeOptions');
                        var hasCurrency = false;
                        for (var c2 = 0; c2 < tdOpt.children.length; c2++) {
                            if (tdOpt.children[c2].tagName === 'field' && tdOpt.children[c2].getAttribute('name') === 'CURRENCY_LIST') {
                                hasCurrency = true;
                            }
                        }
                        if (!hasCurrency) {
                            var currField = xmlDom.ownerDocument.createElement('field');
                            currField.setAttribute('name', 'CURRENCY_LIST');
                            currField.textContent = 'USD';
                            tdOpt.insertBefore(currField, tdOpt.firstChild);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[PipluxBridge] XML conversion notice:', e);
        }
        return xmlDom;
    }

    function registerCustomBlocklyBlocks() {
        if (!window.Blockly || !window.Blockly.Blocks || !window.Blockly.JavaScript) return false;
        if (window.Blockly.__pipluxExtended) return true;
        window.Blockly.__pipluxExtended = true;

        var Blockly = window.Blockly;

        // Hook Blockly.Xml.textToDom so any XML loaded via toolbar, drag-drop, or postMessage is auto-converted
        var origTextToDom = Blockly.Xml.textToDom;
        Blockly.Xml.textToDom = function (text) {
            var dom = origTextToDom.call(Blockly.Xml, text);
            return convertDbotXmlDom(dom);
        };

        if (!Blockly.Blocks.math_number_positive && Blockly.Blocks.math_number) {
            Blockly.Blocks.math_number_positive = Blockly.Blocks.math_number;
            Blockly.JavaScript.math_number_positive = Blockly.JavaScript.math_number;
        }

        // Register apollo_purchase & apollo_purchase2 blocks
        var purchaseChoices = [
            ['Over', 'DIGITOVER'],
            ['Under', 'DIGITUNDER'],
            ['Even', 'DIGITEVEN'],
            ['Odd', 'DIGITODD'],
            ['Matches', 'DIGITMATCH'],
            ['Differs', 'DIGITDIFF'],
            ['Rise', 'CALL'],
            ['Fall', 'PUT'],
            ['Touch', 'ONETOUCH'],
            ['No Touch', 'NOTOUCH']
        ];

        ['apollo_purchase', 'apollo_purchase2'].forEach(function (blockName) {
            if (!Blockly.Blocks[blockName]) {
                Blockly.Blocks[blockName] = {
                    init: function () {
                        this.appendDummyInput()
                            .appendField('Purchase')
                            .appendField(new Blockly.FieldDropdown(purchaseChoices), 'PURCHASE_LIST');
                        this.appendValueInput('PREDICTION').setCheck('Number').appendField('Prediction');
                        this.setPreviousStatement(true, null);
                        this.setNextStatement(false, null);
                        this.setColour('#f29c1f');
                    }
                };
                Blockly.JavaScript[blockName] = function (block) {
                    var ctype = block.getFieldValue('PURCHASE_LIST') || 'CALL';
                    return "Bot.purchase('" + ctype + "');\n";
                };
            }
        });

        // Register last_digits_condition block
        if (!Blockly.Blocks.last_digits_condition) {
            Blockly.Blocks.last_digits_condition = {
                init: function () {
                    this.appendValueInput('N').setCheck('Number').appendField('Last');
                    this.appendDummyInput()
                        .appendField('digits are')
                        .appendField(
                            new Blockly.FieldDropdown([
                                ['<=', 'LESS_OR_EQUAL'],
                                ['>=', 'GREATER_OR_EQUAL'],
                                ['<', 'LESS'],
                                ['>', 'GREATER'],
                                ['=', 'EQUAL'],
                                ['All Even', 'ALL_EVEN'],
                                ['All Odd', 'ALL_ODD']
                            ]),
                            'CONDITION'
                        );
                    this.appendValueInput('COMPARE_VALUE').setCheck('Number');
                    this.setInputsInline(true);
                    this.setOutput(true, 'Boolean');
                    this.setColour('#dedede');
                }
            };
            Blockly.JavaScript.last_digits_condition = function (block) {
                var n = Blockly.JavaScript.valueToCode(block, 'N', Blockly.JavaScript.ORDER_ATOMIC) || '1';
                var cond = block.getFieldValue('CONDITION') || 'LESS_OR_EQUAL';
                var cmp = Blockly.JavaScript.valueToCode(block, 'COMPARE_VALUE', Blockly.JavaScript.ORDER_ATOMIC) || '0';
                var code =
                    '(Bot.getLastDigitList().slice(-(' +
                    n +
                    ')).every(function(d) { ' +
                    (cond === 'LESS_OR_EQUAL'
                        ? 'return d <= (' + cmp + ');'
                        : cond === 'GREATER_OR_EQUAL'
                        ? 'return d >= (' + cmp + ');'
                        : cond === 'LESS'
                        ? 'return d < (' + cmp + ');'
                        : cond === 'GREATER'
                        ? 'return d > (' + cmp + ');'
                        : cond === 'ALL_EVEN'
                        ? 'return d % 2 === 0;'
                        : cond === 'ALL_ODD'
                        ? 'return d % 2 !== 0;'
                        : 'return d === (' + cmp + ');') +
                    ' }))';
                return [code, Blockly.JavaScript.ORDER_FUNCTION_CALL];
            };
        }

        return true;
    }

    var blocklyHookTimer = setInterval(function () {
        if (registerCustomBlocklyBlocks()) {
            clearInterval(blocklyHookTimer);
        }
    }, 50);

    // 6. DBTraders UI Controller (Left Sidebar, Right Drawer, Bottom Run Dock, Quick Strategy Modal)
    var dbStats = {
        totalStake: 0,
        totalPayout: 0,
        runs: 0,
        lost: 0,
        won: 0,
        profit: 0,
        currency: 'USD',
        settledContracts: {}
    };

    function formatMoney(val, curr) {
        var n = Number(val) || 0;
        return n.toFixed(2) + ' ' + (curr || dbStats.currency || 'USD');
    }

    function renderDbStats() {
        var elStake = document.getElementById('db-stat-stake');
        var elPayout = document.getElementById('db-stat-payout');
        var elRuns = document.getElementById('db-stat-runs');
        var elLost = document.getElementById('db-stat-lost');
        var elWon = document.getElementById('db-stat-won');
        var elProfit = document.getElementById('db-stat-profit');

        if (elStake) elStake.textContent = formatMoney(dbStats.totalStake);
        if (elPayout) elPayout.textContent = formatMoney(dbStats.totalPayout);
        if (elRuns) elRuns.textContent = String(dbStats.runs);
        if (elLost) elLost.textContent = String(dbStats.lost);
        if (elWon) elWon.textContent = String(dbStats.won);
        if (elProfit) {
            var p = Number(dbStats.profit) || 0;
            elProfit.textContent = (p > 0 ? '+' : '') + formatMoney(p);
            elProfit.className = 'db-stat-value' + (p > 0 ? ' positive' : p < 0 ? ' negative' : '');
        }
    }

    function appendJournalEntry(message, type) {
        var jList = document.getElementById('db-journal-list');
        if (!jList) return;
        var item = document.createElement('div');
        item.className = 'db-journal-item' + (type === 'success' ? ' success' : type === 'error' ? ' error' : '');
        var now = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' GMT';
        item.innerHTML = '<div class="db-journal-time">' + now + '</div><div>' + message + '</div>';
        jList.insertBefore(item, jList.firstChild);
    }

    window.__pipluxOnContractUpdate = function (poc) {
        if (!poc || !poc.contract_id) return;
        var cid = String(poc.contract_id);
        if (poc.currency) dbStats.currency = poc.currency;

        var emptyState = document.getElementById('db-empty-state');
        var txList = document.getElementById('db-tx-list');
        if (emptyState) emptyState.style.display = 'none';
        var activeTab = document.querySelector('.db-drawer-tab.active');
        if (txList && (!activeTab || activeTab.getAttribute('data-tab') !== 'journal')) {
            txList.style.display = 'flex';
        }

        var existingCard = document.getElementById('db-tx-' + cid);
        var buyPrice = Number(poc.buy_price) || 0;
        var profit = Number(poc.profit) || 0;
        var isSold = Boolean(poc.is_sold || poc.status === 'won' || poc.status === 'lost');

        if (!existingCard && txList) {
            existingCard = document.createElement('div');
            existingCard.id = 'db-tx-' + cid;
            existingCard.className = 'db-tx-item';
            txList.insertBefore(existingCard, txList.firstChild);
        }

        if (existingCard) {
            var profitClass = profit >= 0 ? 'win' : 'loss';
            var statusLabel = isSold ? (profit >= 0 ? '+' : '') + profit.toFixed(2) + ' ' + dbStats.currency : 'OPEN';
            existingCard.innerHTML =
                '<div>' +
                '<div class="db-tx-symbol">' + (poc.display_name || poc.underlying || 'Volatility Index') + ' (' + (poc.contract_type || 'TRADE') + ')</div>' +
                '<div class="db-tx-meta">Entry: ' + (poc.entry_tick_display_value || poc.entry_spot || '-') + ' &rarr; Exit: ' + (poc.exit_tick_display_value || poc.current_spot_display_value || '-') + ' | Stake: ' + buyPrice.toFixed(2) + '</div>' +
                '</div>' +
                '<div class="db-tx-profit ' + (isSold ? profitClass : '') + '">' + statusLabel + '</div>';
        }

        if (isSold && !dbStats.settledContracts[cid]) {
            dbStats.settledContracts[cid] = true;
            var sellPrice = Number(poc.sell_price !== undefined ? poc.sell_price : buyPrice + profit) || 0;
            dbStats.totalStake += buyPrice;
            dbStats.totalPayout += sellPrice;
            dbStats.runs += 1;
            if (profit >= 0) {
                dbStats.won += 1;
                appendJournalEntry('Contract #' + cid + ' WON: +' + profit.toFixed(2) + ' ' + dbStats.currency, 'success');
            } else {
                dbStats.lost += 1;
                appendJournalEntry('Contract #' + cid + ' LOST: ' + profit.toFixed(2) + ' ' + dbStats.currency, 'error');
            }
            dbStats.profit += profit;
            renderDbStats();
        }
    };

    function syncLegacySummaryPanel() {
        var sp = document.getElementById('summaryPanel');
        if (!sp) return;
        var tRuns = sp.querySelector('.totalRuns');
        var tStake = sp.querySelector('.totalStake');
        var tPayout = sp.querySelector('.totalPayout');
        var tWins = sp.querySelector('.totalWins');
        var tLosses = sp.querySelector('.totalLosses');
        var tProfit = sp.querySelector('.totalProfit');

        if (tRuns && tRuns.textContent.trim() !== '') {
            var parsedRuns = parseInt(tRuns.textContent.trim(), 10);
            if (!isNaN(parsedRuns) && parsedRuns > dbStats.runs) {
                dbStats.runs = parsedRuns;
                dbStats.totalStake = parseFloat((tStake && tStake.textContent) || '0') || dbStats.totalStake;
                dbStats.totalPayout = parseFloat((tPayout && tPayout.textContent) || '0') || dbStats.totalPayout;
                dbStats.won = parseInt((tWins && tWins.textContent) || '0', 10) || dbStats.won;
                dbStats.lost = parseInt((tLosses && tLosses.textContent) || '0', 10) || dbStats.lost;
                dbStats.profit = parseFloat((tProfit && tProfit.textContent) || '0') || dbStats.profit;
                renderDbStats();
            }
        }
    }

    function applyQuickStrategyOverrides(xmlDom, opts) {
        if (!xmlDom || !opts) return xmlDom;
        try {
            if (opts.symbol) {
                var symFields = xmlDom.querySelectorAll('field[name="SYMBOL_LIST"]');
                for (var i = 0; i < symFields.length; i++) {
                    symFields[i].textContent = opts.symbol;
                    var subField = symFields[i].parentNode && symFields[i].parentNode.querySelector('field[name="SUBMARKET_LIST"]');
                    if (subField) {
                        subField.textContent = opts.symbol.indexOf('1HZ') === 0 ? 'continuous_indices' : 'random_index';
                    }
                }
            }

            var varSetBlocks = xmlDom.querySelectorAll('block[type="variables_set"]');
            for (var v = 0; v < varSetBlocks.length; v++) {
                var vf = varSetBlocks[v].querySelector('field[name="VAR"]');
                var numField = varSetBlocks[v].querySelector('block[type="math_number"] field[name="NUM"]');
                if (vf && numField) {
                    var vName = (vf.textContent || '').trim().toLowerCase();
                    if ((vName === 'stake' || vName === 'initial stake' || vName === 'win stake') && opts.stake) {
                        numField.textContent = String(opts.stake);
                    } else if ((vName.indexOf('mart') !== -1 || vName === 'multiplier') && opts.martingale) {
                        numField.textContent = String(opts.martingale);
                    } else if ((vName.indexOf('take profit') !== -1 || vName === 'target profit') && opts.tp) {
                        numField.textContent = String(opts.tp);
                    } else if (vName.indexOf('stop loss') !== -1 && opts.sl) {
                        numField.textContent = String(opts.sl);
                    }
                }
            }
        } catch (e) {}
        return xmlDom;
    }

    function fitWorkspaceForViewport() {
        if (!window.Blockly || !window.Blockly.mainWorkspace) return;
        var ws = window.Blockly.mainWorkspace;
        try {
            if (window.innerWidth <= 768) {
                if (ws.toolbox_) {
                    ws.toolbox_.width = 0;
                }
                ws.scale = 0.72;
                ws.scrollX = 12;
                ws.scrollY = 50;
                if (typeof ws.translate === 'function') {
                    ws.translate(ws.scrollX, ws.scrollY);
                }
            } else {
                if (ws.toolbox_) {
                    ws.toolbox_.width = 220;
                }
            }
        } catch (e) {}
    }

    function loadXmlStringIntoWorkspace(xmlText, overrides) {
        registerCustomBlocklyBlocks();
        if (!window.Blockly || !window.Blockly.mainWorkspace) return false;
        var xmlDom = window.Blockly.Xml.textToDom(xmlText);
        if (overrides) {
            xmlDom = applyQuickStrategyOverrides(xmlDom, overrides);
        }
        window.Blockly.Events.setGroup('load');
        window.Blockly.mainWorkspace.clear();
        window.Blockly.Xml.domToWorkspace(xmlDom, window.Blockly.mainWorkspace);
        window.Blockly.Events.setGroup(false);
        if (window.Blockly.mainWorkspace.cleanUp) {
            window.Blockly.mainWorkspace.cleanUp();
        }
        fitWorkspaceForViewport();
        appendJournalEntry('Strategy loaded into workspace successfully.', 'success');
        return true;
    }

    function initDbTradersUi() {
        if (window.__dbTradersUiInitialized) return;
        window.__dbTradersUiInitialized = true;

        // 1. Live GMT Clock
        var clockEl = document.getElementById('db-clock-text');
        function updateClock() {
            if (!clockEl) return;
            var d = new Date();
            clockEl.textContent = d.toISOString().replace('T', ' ').substring(0, 19) + ' GMT';
        }
        updateClock();
        setInterval(updateClock, 1000);

        // 2. Run / Stop Dock Button
        var runToggleBtn = document.getElementById('db-run-toggle-btn');
        var runIcon = document.getElementById('db-run-icon');
        var runLabel = document.getElementById('db-run-label');

        function isBotCurrentlyRunning() {
            var stopBtn = document.getElementById('stopButton');
            var runBtn = document.getElementById('runButton');
            if (!stopBtn || !runBtn) return false;
            var stopDisplay = window.getComputedStyle(stopBtn).display;
            var runDisplay = window.getComputedStyle(runBtn).display;
            return stopDisplay !== 'none' && runDisplay === 'none';
        }

        function syncRunButtonUi() {
            if (!runToggleBtn) return;
            var running = isBotCurrentlyRunning();
            if (running) {
                runToggleBtn.classList.add('is-running');
                if (runIcon) runIcon.innerHTML = '&#9632;';
                if (runLabel) runLabel.textContent = 'Stop';
            } else {
                runToggleBtn.classList.remove('is-running');
                if (runIcon) runIcon.innerHTML = '&#9654;';
                if (runLabel) runLabel.textContent = 'Run';
            }
            syncLegacySummaryPanel();
        }

        if (runToggleBtn) {
            runToggleBtn.addEventListener('click', function () {
                var running = isBotCurrentlyRunning();
                if (running) {
                    var stopBtn = document.getElementById('stopButton');
                    if (stopBtn) stopBtn.click();
                    appendJournalEntry('Bot stopped by user.', 'info');
                } else {
                    var runBtn = document.getElementById('runButton');
                    if (runBtn) runBtn.click();
                    appendJournalEntry('Bot started.', 'success');
                }
                setTimeout(syncRunButtonUi, 80);
            });
        }
        setInterval(syncRunButtonUi, 300);

        // 3. Execution Speed Toggle
        var speedToggle = document.getElementById('db-speed-toggle');
        var speedText = document.getElementById('db-speed-text');
        if (speedToggle) {
            speedToggle.addEventListener('click', function () {
                var isFast = speedToggle.classList.toggle('fast');
                if (speedText) {
                    speedText.textContent = isFast ? 'FAST SPEED' : 'NORMAL SPEED';
                }
            });
        }

        // 4. Right Drawer Tabs, Collapse & Mobile Bottom Sheet Handle
        var drawerTabs = document.querySelectorAll('.db-drawer-tab');
        var emptyState = document.getElementById('db-empty-state');
        var txList = document.getElementById('db-tx-list');
        var journalList = document.getElementById('db-journal-list');

        for (var t = 0; t < drawerTabs.length; t++) {
            drawerTabs[t].addEventListener('click', function () {
                for (var k = 0; k < drawerTabs.length; k++) {
                    drawerTabs[k].classList.remove('active');
                }
                this.classList.add('active');
                var tabName = this.getAttribute('data-tab');
                var hasTx = txList && txList.children.length > 0;
                var hasJournal = journalList && journalList.children.length > 0;

                if (tabName === 'journal') {
                    if (emptyState) emptyState.style.display = hasJournal ? 'none' : 'flex';
                    if (txList) txList.style.display = 'none';
                    if (journalList) journalList.style.display = hasJournal ? 'flex' : 'none';
                } else {
                    if (emptyState) emptyState.style.display = hasTx ? 'none' : 'flex';
                    if (txList) txList.style.display = hasTx ? 'flex' : 'none';
                    if (journalList) journalList.style.display = 'none';
                }
            });
        }

        var drawerCollapseBtn = document.getElementById('db-drawer-collapse-btn');
        if (drawerCollapseBtn) {
            drawerCollapseBtn.addEventListener('click', function () {
                var collapsed = document.body.classList.toggle('db-drawer-collapsed');
                drawerCollapseBtn.innerHTML = collapsed ? '&#10094;' : '&#10095;';
                setTimeout(function () {
                    window.dispatchEvent(new Event('resize'));
                }, 50);
            });
        }

        var mobileDrawerHandle = document.getElementById('db-mobile-drawer-handle');
        if (mobileDrawerHandle) {
            mobileDrawerHandle.addEventListener('click', function () {
                document.body.classList.toggle('db-mobile-drawer-open');
            });
        }

        var resetBtn = document.getElementById('db-summary-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                dbStats.totalStake = 0;
                dbStats.totalPayout = 0;
                dbStats.runs = 0;
                dbStats.lost = 0;
                dbStats.won = 0;
                dbStats.profit = 0;
                dbStats.settledContracts = {};
                renderDbStats();
                if (txList) {
                    txList.innerHTML = '';
                    txList.style.display = 'none';
                }
                if (journalList) {
                    journalList.innerHTML = '';
                    journalList.style.display = 'none';
                }
                if (emptyState) emptyState.style.display = 'flex';
                var legacyClear = document.getElementById('summaryClearButton');
                if (legacyClear) legacyClear.click();
            });
        }

        // 5. Left Sidebar Block Search & Mobile Blocks Menu Toggle
        var searchInput = document.getElementById('db-block-search');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                var q = (this.value || '').trim().toLowerCase();
                var rows = document.querySelectorAll('.blocklyTreeRow');
                for (var r = 0; r < rows.length; r++) {
                    var label = rows[r].querySelector('.blocklyTreeLabel');
                    var txt = label ? (label.textContent || '').toLowerCase() : '';
                    var itemWrapper = rows[r].parentNode;
                    if (!q || txt.indexOf(q) !== -1) {
                        rows[r].style.display = '';
                        if (itemWrapper) itemWrapper.style.display = '';
                    } else {
                        rows[r].style.display = 'none';
                    }
                }
            });
        }

        var mobileBlocksToggle = document.getElementById('db-mobile-blocks-toggle');
        if (mobileBlocksToggle) {
            mobileBlocksToggle.addEventListener('click', function () {
                document.body.classList.toggle('db-mobile-menu-open');
            });
        }

        // Close mobile blocks menu when clicking on the Blockly canvas
        var blocklyArea = document.getElementById('blocklyArea');
        if (blocklyArea) {
            blocklyArea.addEventListener('pointerdown', function (ev) {
                if (window.innerWidth <= 768 && document.body.classList.contains('db-mobile-menu-open')) {
                    var inToolbox = ev.target && ev.target.closest && ev.target.closest('.blocklyToolboxDiv, .blocklyFlyout, #db-left-panel-header, #db-mobile-blocks-toggle');
                    if (!inToolbox) {
                        document.body.classList.remove('db-mobile-menu-open');
                    }
                }
            });
        }

        // 6. Quick Strategy Modal
        var qsBackdrop = document.getElementById('db-qs-modal-backdrop');
        var qsOpenBtn = document.getElementById('db-quick-strategy-btn');
        var qsMobileBtn = document.getElementById('db-mobile-quick-btn');
        var qsCloseBtn = document.getElementById('db-qs-close');
        var qsLoadBtn = document.getElementById('db-qs-load-btn');
        var qsRunBtn = document.getElementById('db-qs-run-btn');

        function openQsModal() {
            if (qsBackdrop) qsBackdrop.classList.add('open');
        }
        function closeQsModal() {
            if (qsBackdrop) qsBackdrop.classList.remove('open');
        }

        if (qsOpenBtn) qsOpenBtn.addEventListener('click', openQsModal);
        if (qsMobileBtn) qsMobileBtn.addEventListener('click', openQsModal);
        if (qsCloseBtn) qsCloseBtn.addEventListener('click', closeQsModal);
        if (qsBackdrop) {
            qsBackdrop.addEventListener('click', function (ev) {
                if (ev.target === qsBackdrop) closeQsModal();
            });
        }

        function handleQsAction(autoRun) {
            var presetEl = document.getElementById('db-qs-preset');
            var symEl = document.getElementById('db-qs-symbol');
            var stakeEl = document.getElementById('db-qs-stake');
            var martEl = document.getElementById('db-qs-martingale');
            var tpEl = document.getElementById('db-qs-tp');
            var slEl = document.getElementById('db-qs-sl');

            var url = (presetEl && presetEl.value) || '/bots/Apex_Range_AI.xml';
            var overrides = {
                symbol: symEl ? symEl.value : '1HZ100V',
                stake: stakeEl ? stakeEl.value : '1',
                martingale: martEl ? martEl.value : '2',
                tp: tpEl ? tpEl.value : '10',
                sl: slEl ? slEl.value : '50'
            };

            fetch(url)
                .then(function (r) {
                    return r.text();
                })
                .then(function (xmlText) {
                    loadXmlStringIntoWorkspace(xmlText, overrides);
                    closeQsModal();
                    document.body.classList.remove('db-mobile-menu-open');
                    if (autoRun) {
                        setTimeout(function () {
                            var runBtn = document.getElementById('runButton');
                            if (runBtn) runBtn.click();
                        }, 250);
                    }
                })
                .catch(function (err) {
                    console.error('[PipluxBridge] Failed to load Quick Strategy XML:', err);
                });
        }

        if (qsLoadBtn) {
            qsLoadBtn.addEventListener('click', function () {
                handleQsAction(false);
            });
        }
        if (qsRunBtn) {
            qsRunBtn.addEventListener('click', function () {
                handleQsAction(true);
            });
        }

        // Trigger resize after Blockly injects so #blocklyDiv matches the new layout dimensions
        window.addEventListener('resize', function () {
            setTimeout(fitWorkspaceForViewport, 20);
        });
        setTimeout(function () {
            window.dispatchEvent(new Event('resize'));
            fitWorkspaceForViewport();
        }, 300);
        setTimeout(function () {
            window.dispatchEvent(new Event('resize'));
            fitWorkspaceForViewport();
        }, 1200);
    }

    // 7. Parent <-> Iframe PostMessage & UI Hooks
    function notifyParentReady() {
        try {
            window.parent.postMessage({ type: 'newdtrader:ready' }, '*');
        } catch (e) {}
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDbTradersUi);
    } else {
        initDbTradersUi();
    }

    window.addEventListener('load', function () {
        initDbTradersUi();
        registerCustomBlocklyBlocks();
        notifyParentReady();
        setTimeout(notifyParentReady, 1000);
        setTimeout(function () {
            window.dispatchEvent(new Event('resize'));
            fitWorkspaceForViewport();
        }, 600);
        setTimeout(function () {
            fitWorkspaceForViewport();
        }, 1800);

        document.addEventListener(
            'click',
            function (ev) {
                var target = ev.target;
                while (target && target !== document) {
                    if (target.id === 'login' || target.id === 'toolbox-login') {
                        ev.preventDefault();
                        ev.stopPropagation();
                        try {
                            window.top.location.href = '/';
                        } catch (e) {}
                        return;
                    }
                    target = target.parentNode;
                }
            },
            true
        );
    });

    window.addEventListener('message', function (event) {
        if (!event.data || typeof event.data !== 'object') return;
        var data = event.data;

        if (data.type === 'newdtrader:auth') {
            var accessToken = data.auth && data.auth.access_token;
            var accountId = data.activeAccountId;
            if (accessToken && accountId) {
                var currentAuth = getAuthState();
                var didChange = syncTokensToBotStorage(accessToken, accountId, currentAuth.account);
                if (didChange) {
                    window.location.reload();
                }
            }
        }

        if (data.type === 'dbot:load-xml' && data.xml) {
            try {
                registerCustomBlocklyBlocks();
                if (window.Blockly && window.Blockly.mainWorkspace) {
                    var xmlDom = window.Blockly.Xml.textToDom(data.xml);
                    window.Blockly.Events.setGroup('load');
                    window.Blockly.mainWorkspace.clear();
                    window.Blockly.Xml.domToWorkspace(xmlDom, window.Blockly.mainWorkspace);
                    window.Blockly.Events.setGroup(false);
                    if (window.Blockly.mainWorkspace.cleanUp) {
                        window.Blockly.mainWorkspace.cleanUp();
                    }
                }
            } catch (e) {
                console.error('[PipluxBridge] Error loading XML into Blockly:', e);
            }
        }

        if (data.type === 'dbot:run-bot') {
            var runBtn = document.getElementById('runButton');
            if (runBtn) runBtn.click();
        }

        if (data.type === 'dbot:stop-bot') {
            var stopBtn = document.getElementById('stopButton');
            if (stopBtn) stopBtn.click();
        }
    });
})();
