import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { StyledEngineProvider } from '@mui/material/styles';
import GlobalStyles from '@mui/material/GlobalStyles';
import { AppProviders } from '@app/providers';
import { router } from '@/router';
import 'leaflet/dist/leaflet.css';
import '@/styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontro el elemento #root');

createRoot(container).render(
  <StrictMode>
    <StyledEngineProvider enableCssLayer>
      <GlobalStyles styles="@layer theme, base, mui, components, utilities;" />
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StyledEngineProvider>
  </StrictMode>,
);

// El service worker vuelve instalable el panel y recibe las alertas del KDS.
// En desarrollo se registra tambien: cocina se prueba precisamente en tablets de
// la red local, donde los defectos de instalacion no deben aparecer al desplegar.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // La aplicacion sigue operativa sin PWA; el tablero conserva sonido y SSE.
    });
  });
}
