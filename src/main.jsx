import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { reportError } from './lib/errorReporter'
import { initSentry } from './lib/sentry'

// Load Sentry only when a DSN is configured; otherwise the Telegram error
// pipeline handles reporting.
initSentry();

// Handle dynamic import failures (e.g. redeployments deleting old chunks)
if (typeof window !== 'undefined') {
  const handleChunkError = (error) => {
    if (!error) return false;
    const msg = error.message || "";
    const name = error.name || "";
    const isChunkError = 
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("loading chunk") ||
      name === "ChunkLoadError";
      
    if (isChunkError) {
      console.warn("Chunk loading error detected. Auto-reloading page for latest version...");
      window.location.reload();
      return true;
    }
    return false;
  };

  window.addEventListener('error', (event) => {
    if (handleChunkError(event.error)) {
      event.preventDefault();
      return;
    }
    // Everything else is a real bug — send it to the error pipeline.
    reportError(event.error || event.message, { severity: 'error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (handleChunkError(event.reason)) {
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
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[PWA] Service worker registration failed:', error);
    });
  });
}
