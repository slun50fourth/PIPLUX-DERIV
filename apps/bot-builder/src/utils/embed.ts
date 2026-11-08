/**
 * PIPLUX embed helpers.
 *
 * This app is served same-origin inside an <iframe> on pipluxtrade.com (see /bot).
 * Because it shares localStorage/sessionStorage with the host, anything that wipes
 * storage or redirects to OAuth on its own must be disabled when embedded.
 */
export const IS_EMBEDDED = (() => {
    try {
        return window.self !== window.top;
    } catch {
        return true; // cross-origin top => definitely embedded
    }
})();

/** Post a message to the PIPLUX host page (same-origin only). */
export const postToHost = (message: Record<string, unknown>): void => {
    if (!IS_EMBEDDED) return;
    try {
        window.parent.postMessage(message, window.location.origin);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[piplux-embed] postMessage failed', error);
    }
};
