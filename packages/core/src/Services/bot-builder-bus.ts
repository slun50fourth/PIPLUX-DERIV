/**
 * BotBuilderBus
 * -------------
 * A tiny in-process event bus so any component (e.g. AiScannerModal) can
 * instruct the BotBuilder page to load XML and optionally auto-run the bot,
 * without the two components needing to share React state or be co-mounted.
 *
 * The BotBuilder page usually is NOT mounted yet when the AI Scanner fires
 * (the scanner navigates to /bot right after calling loadXml). So the latest
 * request is held as "pending" and replayed to the first listener that subscribes.
 *
 * Usage (sender — AI Scanner):
 *   import { botBuilderBus } from 'Services/bot-builder-bus';
 *   botBuilderBus.loadXml(xmlString, { autoRun: true });
 *
 * Usage (receiver — BotBuilder page, in a useEffect):
 *   import { botBuilderBus } from 'Services/bot-builder-bus';
 *   const unsub = botBuilderBus.onLoadXml((xml, opts) => { ... });
 *   return () => unsub();
 */

type LoadXmlOptions = {
    autoRun?: boolean;
};

type LoadXmlListener = (xml: string, opts: LoadXmlOptions) => void;

class BotBuilderBus {
    private listeners: Set<LoadXmlListener> = new Set();
    private pending: { xml: string; opts: LoadXmlOptions } | null = null;

    /** Fire from AI Scanner (or Free Bots panel) to load XML into the iframe. */
    loadXml(xml: string, opts: LoadXmlOptions = {}) {
        if (this.listeners.size === 0) {
            // Nobody is listening yet (page not mounted) — keep the latest request for the next subscriber.
            this.pending = { xml, opts };
            return;
        }
        this.listeners.forEach(fn => {
            try {
                fn(xml, opts);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[BotBuilderBus] listener error:', e);
            }
        });
    }

    /** Subscribe from the BotBuilder page. Returns an unsubscribe function. */
    onLoadXml(listener: LoadXmlListener): () => void {
        this.listeners.add(listener);
        if (this.pending) {
            const { xml, opts } = this.pending;
            this.pending = null;
            try {
                listener(xml, opts);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.error('[BotBuilderBus] listener error:', e);
            }
        }
        return () => {
            this.listeners.delete(listener);
        };
    }
}

export const botBuilderBus = new BotBuilderBus();
