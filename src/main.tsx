import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import AuthGate from './components/AuthGate';
import './index.css';

registerSW({ immediate: true });
// Pide al navegador que no borre IndexedDB (clave en iOS/Safari)
navigator.storage?.persist?.().catch(() => {});
// Solo en desarrollo: utilidades para probar la sincronización desde el navegador
if (import.meta.env.DEV) import('./lib/devtools').then(m => m.install());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      {key => (
        <HashRouter>
          <App key={key} />
        </HashRouter>
      )}
    </AuthGate>
  </StrictMode>,
);
