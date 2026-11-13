/**
 * BotBuilder — hosts the PIPLUX Bot Builder (apps/bot-builder, built from
 * deriv-com/trading-bot-template) in a same-origin <iframe> served from /deriv-bot/.
 *
 * Auth: no token passing. The iframe is same-origin, so it reads the OAuth session
 * (sessionStorage `auth_info`, localStorage `active_loginid`) this site already wrote.
 *
 * postMessage protocol (see apps/bot-builder/src/app/piplux-bridge.ts):
 *   Child → Parent : { type: 'newdtrader:ready' }
 *                    { type: 'dbot:xml-loaded', ok, error? }
 *                    { type: 'piplux:need-login' } | { type: 'piplux:auth-invalid' }
 *   Parent → Child : { type: 'dbot:load-xml', xml, strategyName?, autoRun? }
 *                    { type: 'dbot:run-bot' } | { type: 'dbot:stop-bot' }
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@deriv/stores';
import { botBuilderBus } from 'Services/bot-builder-bus';
import { generateOAuthURL } from 'Services/oauth';
import './bot-builder.scss';

// Trailing slash matters: the app's router basename is "/deriv-bot" and only has an index route.
// Bump the query string to bust caches after rebuilding apps/bot-builder.
const BOT_BUILDER_URL = '/deriv-bot/?v=7';

// ---------------------------------------------------------------------------
// BotBuilderBridge component — the actual iframe mount
// ---------------------------------------------------------------------------
interface BotBuilderBridgeProps {
    pendingXml?: string | null;
    pendingRun?: boolean;
    onXmlLoaded?: () => void;
}

const BotBuilderBridge: React.FC<BotBuilderBridgeProps> = observer(({ pendingXml, pendingRun, onXmlLoaded }) => {
    const { client } = useStore();
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isReady, setIsReady] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const lastLoginid = useRef(client.loginid);

    const sendToChild = useCallback((payload: object) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return;
        try {
            win.postMessage(payload, window.location.origin);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[BotBuilder] postMessage failed:', e);
        }
    }, []);

    const goToLogin = useCallback(async () => {
        const url = await generateOAuthURL();
        if (url) window.location.replace(url);
    }, []);

    // Messages from the iframe (same-origin, and only from our own iframe)
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.source !== iframeRef.current?.contentWindow) return;
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            switch (data.type) {
                case 'newdtrader:ready':
                    setIsReady(true);
                    setIsLoading(false);
                    break;
                case 'dbot:xml-loaded':
                    setLoadError(data.ok ? null : data.error || 'Could not load this strategy into the Bot Builder.');
                    break;
                case 'piplux:need-login':
                case 'piplux:auth-invalid':
                    goToLogin();
                    break;
                default:
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [goToLogin]);

    // The iframe reads the active account from shared storage on boot, so reload it after an account switch.
    useEffect(() => {
        if (lastLoginid.current === client.loginid) return;
        lastLoginid.current = client.loginid;
        if (isReady && iframeRef.current) {
            setIsReady(false);
            setIsLoading(true);
            iframeRef.current.src = BOT_BUILDER_URL;
        }
    }, [client.loginid, isReady]);

    // Deliver pending XML (AI Scanner / free bots / upload). The child waits for its own workspace.
    useEffect(() => {
        if (!isReady || !pendingXml) return;
        sendToChild({ type: 'dbot:load-xml', xml: pendingXml, autoRun: !!pendingRun });
        onXmlLoaded?.();
    }, [isReady, pendingXml, pendingRun, sendToChild, onXmlLoaded]);

    return (
        <div className='bot-builder-bridge'>
            {isLoading && (
                <div className='bot-builder-bridge__loading'>
                    <div className='bot-builder-bridge__spinner' />
                    <span>Loading Bot Builder…</span>
                </div>
            )}
            {loadError && (
                <div className='bot-builder-bridge__loading' role='alert'>
                    <span>{loadError}</span>
                </div>
            )}
            <iframe
                ref={iframeRef}
                src={BOT_BUILDER_URL}
                className='bot-builder-bridge__iframe'
                title='PIPLUX Bot Builder'
                sandbox='allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads'
                allow='clipboard-read; clipboard-write'
                onLoad={() => setIsLoading(false)}
            />
        </div>
    );
});

// ---------------------------------------------------------------------------
// Main BotBuilder page
// ---------------------------------------------------------------------------

const BotBuilder: React.FC = observer(() => {
    const [pendingXml, setPendingXml] = useState<string | null>(null);
    const [pendingRun, setPendingRun] = useState(false);

    useEffect(() => {
        const unsub = botBuilderBus.onLoadXml((xml, opts) => {
            setPendingXml(xml);
            setPendingRun(!!opts.autoRun);
        });
        return () => unsub();
    }, []);

    return (
        <div className='bot-builder-page'>
            <BotBuilderBridge
                pendingXml={pendingXml}
                pendingRun={pendingRun}
                onXmlLoaded={() => {
                    setPendingXml(null);
                    setPendingRun(false);
                }}
            />
        </div>
    );
});

export default BotBuilder;
