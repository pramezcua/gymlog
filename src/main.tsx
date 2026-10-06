import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { seedIfEmpty } from './lib/seed';
import './index.css';

registerSW({ immediate: true });
// Pide al navegador que no borre IndexedDB (clave en iOS/Safari)
navigator.storage?.persist?.().catch(() => {});
seedIfEmpty().catch(console.error);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
