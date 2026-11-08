/**
 * Optional Sentry error tracking.
 *
 * Sentry is only loaded when VITE_SENTRY_DSN is set. The SDK is pulled in with
 * a dynamic import so it stays out of the main bundle until a DSN is provided —
 * until then ManiPOS relies on the Telegram error pipeline
 * (src/lib/errorReporter.js) instead.
 *
 * To enable: create a project at sentry.io and set
 *   VITE_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
 * in .env, then redeploy.
 */
export async function initSentry() {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) return;

    try {
        const Sentry = await import('@sentry/react');
        Sentry.init({
            dsn,
            environment: import.meta.env.MODE,
            release: `manipos@${import.meta.env.VITE_APP_VERSION || 'dev'}`,
            // ManiPOS is a multi-tenant product: never attach tenant data.
            sendDefaultPii: false,
            beforeSend(event) {
                delete event.server_name;
                return event;
            },
        });
    } catch (error) {
        console.warn('[ManiPOS] Sentry could not be initialised:', error);
    }
}
