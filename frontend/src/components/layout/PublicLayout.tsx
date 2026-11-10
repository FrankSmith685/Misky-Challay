import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { LocationModal } from '@features/geo/components/LocationModal';
import { RouteEffects } from './RouteEffects';
import { CookieConsent } from './CookieConsent';
import { ActiveOrderPill } from './ActiveOrderPill';
import { ROUTES } from '@constants/routes';

const AUTH_PATHS: Set<string> = new Set([
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
  ROUTES.mobileResetPassword,
]);

export const PublicLayout = () => {
  const { pathname } = useLocation();
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const isAuthRoute = AUTH_PATHS.has(normalizedPathname);

  if (isAuthRoute) {
    return (
      <div className="auth-public-shell flex min-h-screen flex-col bg-surface-muted">
        <RouteEffects />
        <a href="#main-content" className="skip-link">Saltar al contenido</a>
        <main id="main-content" className="flex-1" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    );
  }

  return (
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
};
