import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LocationModal } from '@features/geo/components/LocationModal';
import { RouteEffects } from './RouteEffects';
import { CookieConsent } from './CookieConsent';
import { ActiveOrderPill } from './ActiveOrderPill';

export const PublicLayout = () => (
  <div className="public-shell flex min-h-screen flex-col">
    <RouteEffects />
    <a href="#main-content" className="skip-link">Saltar al contenido</a>
    <Header />
    <ActiveOrderPill />
    <main id="main-content" className="flex-1" tabIndex={-1}>
      <Outlet />
    </main>
    <Footer />
    <LocationModal />
    <CookieConsent />
  </div>
);
