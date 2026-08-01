import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary'

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
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (handleChunkError(event.reason)) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
