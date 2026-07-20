import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LocationModal } from '@features/geo/components/LocationModal';
import { RouteEffects } from './RouteEffects';

export const PublicLayout = () => (
  <div className="public-shell flex min-h-screen flex-col">
    <RouteEffects />
    <a href="#main-content" className="skip-link">Saltar al contenido</a>
    <Header />
    <main id="main-content" className="flex-1" tabIndex={-1}>
      <Outlet />
    </main>
    <Footer />
    <LocationModal />
  </div>
);
