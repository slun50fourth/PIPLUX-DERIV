/**
 * PIPLUX host bridge.
 *
 * Protocol (same-origin postMessage):
 *   host -> app : { type: 'dbot:load-xml', xml, strategyName?, autoRun? }
 *   host -> app : { type: 'dbot:run-bot' } | { type: 'dbot:stop-bot' }
 *   app -> host : { type: 'newdtrader:ready' }            (store + workspace ready)
 *   app -> host : { type: 'dbot:xml-loaded', ok, error? }
 *   app -> host : { type: 'piplux:need-login' }           (run attempted while logged out)
 *   app -> host : { type: 'piplux:auth-invalid' }         (API rejected the shared token)
 *
 * Authentication is NOT passed over postMessage: the host and this app share the same
 * origin, so the OAuth `auth_info` (sessionStorage) and `active_loginid` (localStorage)
 * written by the host are read directly by this app's own OTP/WebSocket layer.
 */
import { load } from '@/external/bot-skeleton';
import { save_types } from '@/external/bot-skeleton/constants/save-type';
import { DBOT_TABS } from '@/constants/bot-contents';
import { IS_EMBEDDED, postToHost } from '@/utils/embed';

type TAny = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const waitFor = async <T>(probe: () => T | undefined | null | false, timeout_ms = 30000, step_ms = 200): Promise<T> => {
    const started = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const value = probe();
        if (value) return value as T;
        if (Date.now() - started > timeout_ms) throw new Error('Timed out waiting for Bot Builder to initialise');
        await new Promise(resolve => setTimeout(resolve, step_ms));
    }
};

const getStore = () => (window as TAny).__piplux_store__ as TAny | undefined;

const loadXml = async (xml: string, name: string, auto_run: boolean) => {
    try {
        const store = await waitFor(getStore);
        store.dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
        const workspace = await waitFor(() => (window as TAny).Blockly?.derivWorkspace);

        const result = await load({
            block_string: xml,
            file_name: name,
            workspace,
            from: save_types.UNSAVED,
            drop_event: null,
            strategy_id: null,
            showIncompatibleStrategyDialog: null,
            show_snackbar: false,
        });
        if (result?.error) throw new Error(result.error);

        postToHost({ type: 'dbot:xml-loaded', ok: true });
        if (auto_run) {
            await waitFor(() => workspace.getAllBlocks?.().some((b: TAny) => b.type === 'trade_definition'), 10000);
            await store.run_panel.onRunButtonClick();
        }
    } catch (error) {
        postToHost({ type: 'dbot:xml-loaded', ok: false, error: (error as Error).message });
    }
};

export const initPipluxBridge = (): void => {
    if (!IS_EMBEDDED) return;

    window.addEventListener('message', (event: MessageEvent) => {
        if (event.origin !== window.location.origin || event.source !== window.parent) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        switch (data.type) {
            case 'dbot:load-xml':
                if (typeof data.xml === 'string') loadXml(data.xml, data.strategyName || 'Strategy', !!data.autoRun);
                break;
            case 'dbot:run-bot':
                getStore()?.run_panel.onRunButtonClick();
                break;
            case 'dbot:stop-bot':
                getStore()?.run_panel.onStopBotClick();
                break;
            default:
        }
    });

    waitFor(getStore)
        .then(() => postToHost({ type: 'newdtrader:ready' }))
        .catch(() => undefined);
};
