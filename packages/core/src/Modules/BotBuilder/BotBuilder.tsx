/**
 * BotBuilder — Method A Micro-Frontend Bridge
 *
 * Hosts the Blockly-based bot builder in a sandboxed <iframe> and bridges:
 *   - OAuth tokens (auth handshake)
 *   - Account switches (Demo ↔ Real)
 *   - "Load and Run" XML payloads from the AI Scanner
 *
 * The postMessage protocol mirrors what dbtraders.com uses:
 *   Child → Parent : "newdtrader:ready"
 *   Parent → Child : { type: "newdtrader:auth", version: "v2", auth: {...}, ... }
 *   Parent → Child : { type: "dbot:load-xml", xml: "..." }     (PIPLUX extension)
 *   Parent → Child : { type: "dbot:run-bot" }                  (PIPLUX extension)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { routes } from '@deriv/shared';
import { useStore } from '@deriv/stores';
import { botBuilderBus } from 'Services/bot-builder-bus';
import './bot-builder.scss';

// ---------------------------------------------------------------------------
// Config — swap this to your deployed bot builder URL once it's live.
// While testing locally you can set: REACT_APP_BOT_BUILDER_URL=http://localhost:3000/bot
// ---------------------------------------------------------------------------
const BOT_BUILDER_URL: string =
    (window as any).__PIPLUX_BOT_BUILDER_URL__ ||
    process.env.REACT_APP_BOT_BUILDER_URL ||
    '/deriv-bot/bot.html?v=4';

// The origin we'll trust for postMessages from the child iframe
const botOrigin = (() => {
    try {
        if (BOT_BUILDER_URL.startsWith('/')) {
            return window.location.origin;
        }
        return new URL(BOT_BUILDER_URL).origin;
    } catch {
        return '*';
    }
})();

// ---------------------------------------------------------------------------
// Helper: build the auth payload for the child (matches dbtraders protocol)
// ---------------------------------------------------------------------------
function buildAuthPayload(client: any) {
    const accounts: Record<string, { token: string; currency: string; is_virtual: boolean }> = {};
    const accountList: Array<any> = client.account_list || [];

    accountList.forEach((acc: any) => {
        if (acc.loginid && acc.token) {
            accounts[acc.loginid] = {
                token: acc.token,
                currency: acc.currency || 'USD',
                is_virtual: acc.is_virtual ?? false,
            };
        }
    });

    return {
        type: 'newdtrader:auth',
        version: 'v2',
        auth: {
            access_token: client.getToken?.() || client.token || '',
            expires_at: Date.now() + 60 * 60 * 1000, // 1h fallback
        },
        activeAccountId: client.loginid || '',
        accounts,
        otpUrl: null,
    };
}

// ---------------------------------------------------------------------------
// BotBuilderBridge component — the actual iframe mount
// ---------------------------------------------------------------------------
interface BotBuilderBridgeProps {
    pendingXml?: string | null;
    pendingRun?: boolean;
    onXmlLoaded?: () => void;
}

const BotBuilderBridge: React.FC<BotBuilderBridgeProps> = observer(
    ({ pendingXml, pendingRun, onXmlLoaded }) => {
        const { client } = useStore();
        const iframeRef = useRef<HTMLIFrameElement>(null);
        const [isReady, setIsReady] = useState(false);
        const [isLoading, setIsLoading] = useState(true);

        // Send a message to the child iframe safely
        const sendToChild = useCallback(
            (payload: object) => {
                const iframe = iframeRef.current;
                if (!iframe?.contentWindow) return;
                try {
                    iframe.contentWindow.postMessage(payload, botOrigin === '*' ? '*' : botOrigin);
                } catch (e) {
                    console.warn('[BotBuilder] postMessage failed:', e);
                }
            },
            []
        );

        // Send auth on ready
        const sendAuth = useCallback(() => {
            const payload = buildAuthPayload(client);
            sendToChild(payload);
        }, [client, sendToChild]);

        // Listen for messages from the child iframe
        useEffect(() => {
            const handleMessage = (event: MessageEvent) => {
                // Security: only trust our bot builder origin (or any if not set)
                if (botOrigin !== '*' && event.origin !== botOrigin) return;

                const data = event.data;
                if (!data || typeof data !== 'object') return;

                if (data === 'newdtrader:ready' || data.type === 'newdtrader:ready' || data === 'deriv:dtrader:ready') {
                    setIsReady(true);
                    setIsLoading(false);
                    sendAuth();
                }

                if (data.type === 'deriv:dtrader:reconnect-failed') {
                    // Child lost auth — reload iframe
                    if (iframeRef.current) {
                        iframeRef.current.src = BOT_BUILDER_URL;
                    }
                }

                if (data.type === 'deriv:dtrader:need-relogin') {
                    // Auth expired — full reload
                    window.location.reload();
                }
            };

            window.addEventListener('message', handleMessage);
            return () => window.removeEventListener('message', handleMessage);
        }, [sendAuth]);

        // Re-send auth on account switch
        useEffect(() => {
            if (isReady) {
                sendAuth();
                sendToChild({ type: 'deriv:account-switch', loginid: client.loginid });
            }
        }, [client.loginid, isReady, sendAuth, sendToChild]);

        // Deliver pending XML/run commands from AI Scanner
        useEffect(() => {
            if (!isReady || !pendingXml) return;

            sendToChild({ type: 'dbot:load-xml', xml: pendingXml });

            if (pendingRun) {
                // Small delay to let the workspace parse and render the XML first
                const t = setTimeout(() => sendToChild({ type: 'dbot:run-bot' }), 800);
                return () => clearTimeout(t);
            }

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
    }
);

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
            const xml = ev.target?.result as string;
            if (xml) {
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
                    ⬆️ Upload XML
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
                    <h2>Upload Your Bot XML</h2>
                    <p>Select a <code>.xml</code> file exported from DBot or any compatible Blockly workspace.</p>
                    <div className='bot-builder-page__upload-zone'>
                        <div className='bot-builder-page__upload-icon'>📂</div>
                        <p>Drag & drop or click to select</p>
                        <input
                            ref={fileInputRef}
                            type='file'
                            accept='.xml'
                            className='bot-builder-page__upload-input'
                            onChange={handleUpload}
                            id='bot-xml-upload'
                        />
                        <label htmlFor='bot-xml-upload' className='bot-builder-page__upload-btn'>
                            Choose XML File
                        </label>
                    </div>
                    <div className='bot-builder-page__upload-tips'>
                        <h4>Tips</h4>
                        <ul>
                            <li>Export your bot from DBot as an XML file.</li>
                            <li>The file will be loaded into the Bot Builder workspace.</li>
                            <li>You can edit it before running.</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
});

export default BotBuilder;
