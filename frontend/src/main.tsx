import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@app/providers';
import { router } from '@/router';
import 'leaflet/dist/leaflet.css';
import '@/styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontro el elemento #root');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
