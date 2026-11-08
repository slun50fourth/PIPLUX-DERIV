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
import { useHistory } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { routes } from '@deriv/shared';
import { useStore } from '@deriv/stores';
import { botBuilderBus } from 'Services/bot-builder-bus';
import { generateOAuthURL } from 'Services/oauth';
import './bot-builder.scss';

// Trailing slash matters: the app's router basename is "/deriv-bot" and only has an index route.
// Bump the query string to bust caches after rebuilding apps/bot-builder.
const BOT_BUILDER_URL = '/deriv-bot/?v=1';

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
// Main BotBuilder page — tabs: Builder | Free Bots | Upload
// ---------------------------------------------------------------------------

type Tab = 'builder' | 'free_bots' | 'upload';

// Free preset bots available for one-click loading
const FREE_BOTS = [
    {
        id: 'apex_range',
        name: 'Apex Range AI',
        description: 'Multi-market digit range bot with martingale recovery.',
        xmlFile: '/bots/Apex_Range_AI.xml',
    },
    {
        id: 'apex',
        name: 'Apex AI',
        description: 'Classic Apex strategy for Deriv synthetics.',
        xmlFile: '/bots/Apex_AI.xml',
    },
    {
        id: 'entry_scanner',
        name: 'Entry Scanner Bot',
        description: 'Base template for the AI Entry Scanner strategy.',
        xmlFile: '/bots/entry_scanner_template.xml',
    },
];

const BotBuilder: React.FC = observer(() => {
    const history = useHistory();
    const [activeTab, setActiveTab] = useState<Tab>('builder');
    const [pendingXml, setPendingXml] = useState<string | null>(null);
    const [pendingRun, setPendingRun] = useState(false);
    const [loadingBot, setLoadingBot] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const unsub = botBuilderBus.onLoadXml((xml, opts) => {
            setPendingXml(xml);
            setPendingRun(!!opts.autoRun);
            setActiveTab('builder');
        });
        return () => unsub();
    }, []);

    const handleFreeBot = async (bot: (typeof FREE_BOTS)[0]) => {
        setLoadingBot(bot.id);
        try {
            const res = await fetch(bot.xmlFile);
            if (!res.ok) throw new Error(`Failed to fetch ${bot.xmlFile}`);
            const xml = await res.text();
            setPendingXml(xml);
            setPendingRun(false);
            setActiveTab('builder');
        } catch (e) {
            console.error('[BotBuilder] Failed to load free bot:', e);
        } finally {
            setLoadingBot(null);
        }
    };

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result as string;
            if (content) {
                let xml = content;
                const match = content.match(/<xml[\s\S]*?<\/xml>/i);
                if (match) {
                    xml = match[0];
                }
                setPendingXml(xml);
                setPendingRun(false);
                setActiveTab('builder');
            }
        };
        reader.readAsText(file);
        // Reset input so same file can be re-uploaded
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className='bot-builder-page'>
            {/* ── Tab Bar ── */}
            <div className='bot-builder-page__tabs'>
                <button
                    className='bot-builder-page__back-btn'
                    onClick={() => history.push(routes.trader)}
                    title='Return to Manual Trading chart'
                >
                    ← Manual Trader
                </button>
                <button
                    className={`bot-builder-page__tab ${activeTab === 'builder' ? 'bot-builder-page__tab--active' : ''}`}
                    onClick={() => setActiveTab('builder')}
                >
                    🤖 Bot Builder
                </button>
                <button
                    className={`bot-builder-page__tab ${activeTab === 'free_bots' ? 'bot-builder-page__tab--active' : ''}`}
                    onClick={() => setActiveTab('free_bots')}
                >
                    📦 Free Bots
                </button>
                <button
                    className={`bot-builder-page__tab ${activeTab === 'upload' ? 'bot-builder-page__tab--active' : ''}`}
                    onClick={() => setActiveTab('upload')}
                >
                    ⬆️ Upload XML/HTML
                </button>
            </div>

            {/* ── Builder Tab (kept mounted so tab switches preserve workspace state) ── */}
            <div style={{ display: activeTab === 'builder' ? 'flex' : 'none', flex: 1, minHeight: 0, width: '100%' }}>
                <BotBuilderBridge
                    pendingXml={pendingXml}
                    pendingRun={pendingRun}
                    onXmlLoaded={() => {
                        setPendingXml(null);
                        setPendingRun(false);
                    }}
                />
            </div>

            {/* ── Free Bots Tab ── */}
            {activeTab === 'free_bots' && (
                <div className='bot-builder-page__free-bots'>
                    <h2>Free Bot Library</h2>
                    <p className='bot-builder-page__free-bots-subtitle'>
                        Click any bot to load it into the Bot Builder instantly.
                    </p>
                    <div className='bot-builder-page__bots-grid'>
                        {FREE_BOTS.map(bot => (
                            <div key={bot.id} className='bot-card'>
                                <div className='bot-card__icon'>🤖</div>
                                <div className='bot-card__info'>
                                    <h3>{bot.name}</h3>
                                    <p>{bot.description}</p>
                                </div>
                                <button
                                    className='bot-card__load-btn'
                                    onClick={() => handleFreeBot(bot)}
                                    disabled={loadingBot === bot.id}
                                >
                                    {loadingBot === bot.id ? 'Loading…' : 'Load Bot'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Upload Tab ── */}
            {activeTab === 'upload' && (
                <div className='bot-builder-page__upload'>
                    <h2>Upload Your Bot File</h2>
                    <p>Select a <code>.xml</code> or <code>.html</code> bot file (supports DBot XML and Microsoft Edge HTML Documents).</p>
                    <div className='bot-builder-page__upload-zone'>
                        <div className='bot-builder-page__upload-icon'>📂</div>
                        <p>Drag & drop or click to select</p>
                        <input
                            ref={fileInputRef}
                            type='file'
                            accept='.xml,.html,.htm,text/xml,text/html'
                            className='bot-builder-page__upload-input'
                            onChange={handleUpload}
                            id='bot-xml-upload'
                        />
                        <label htmlFor='bot-xml-upload' className='bot-builder-page__upload-btn'>
                            Choose XML or HTML Bot File
                        </label>
                    </div>
                    <div className='bot-builder-page__upload-tips'>
                        <h4>Supported Formats</h4>
                        <ul>
                            <li>Deriv DBot and Binary Bot XML files (<code>.xml</code>).</li>
                            <li>Microsoft Edge HTML Document bot files (<code>.html</code>, <code>.htm</code>).</li>
                            <li>Files are loaded directly into the visual Bot Builder workspace.</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
});

export default BotBuilder;
