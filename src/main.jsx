import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { reportError } from './lib/errorReporter'
import { initSentry } from './lib/sentry'
import { recoverFromChunkError } from './lib/chunkRecovery'

// Load Sentry only when a DSN is configured; otherwise the Telegram error
// pipeline handles reporting.
initSentry();

// Handle dynamic import failures (e.g. redeployments deleting old chunks)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (recoverFromChunkError(event.error || event.message)) {
      event.preventDefault();
      return;
    }
    // Everything else is a real bug — send it to the error pipeline.
    reportError(event.error || event.message, { severity: 'error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (recoverFromChunkError(event.reason)) {
      event.preventDefault();
      return;
    }
    reportError(event.reason, { severity: 'unhandledrejection' });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Register the offline service worker in production builds only.
// import.meta.env.BASE_URL keeps staging (deployed under /staging/) from
// registering the production service worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch((error) => {
        console.warn('[PWA] Service worker registration failed:', error);
      });
  });
}
