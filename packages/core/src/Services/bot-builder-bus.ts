/**
 * BotBuilderBus
 * -------------
 * A tiny in-process event bus so any component (e.g. AiScannerModal) can
 * instruct the BotBuilder page to load XML and optionally auto-run the bot,
 * without the two components needing to share React state or be co-mounted.
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

    /** Fire from AI Scanner (or Free Bots panel) to load XML into the iframe. */
    loadXml(xml: string, opts: LoadXmlOptions = {}) {
        this.listeners.forEach(fn => {
            try {
                fn(xml, opts);
            } catch (e) {
                console.error('[BotBuilderBus] listener error:', e);
            }
        });
    }

    /** Subscribe from the BotBuilder page. Returns an unsubscribe function. */
    onLoadXml(listener: LoadXmlListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

export const botBuilderBus = new BotBuilderBus();
