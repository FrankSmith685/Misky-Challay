import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import { useStorefront } from '@features/home/content/StorefrontContext';
import { applyStorefrontSeo } from '@features/home/content/storefrontSeo';
import { defaultStorefront } from '@features/home/content/storefront.schema';

const BRAND = 'Misky Challay';
const HOME_TITLE = `${BRAND} | Tortas personalizadas`;
const FALLBACK_CONTENT = defaultStorefront();

/** Titulo por ruta exacta. Se indexa por las constantes para que no se separen del router. */
const EXACT_TITLES: Record<string, string> = {
  '/experiencias/renzo': 'Experiencia web de Renzo',
  '/experiencias/renzo-qr': 'QR de la experiencia de Renzo',
  [ROUTES.business]: 'Para empresas',
  [ROUTES.howToOrder]: 'Cómo hacer tu pedido',
  [ROUTES.adminHomeContent]: 'Contenido del inicio',
  [ROUTES.menu]: 'Catálogo',
  [ROUTES.customCake]: 'Crea tu torta',
  [ROUTES.specialCake]: 'Solicitar diseño especial',
  [ROUTES.builder]: 'Crea tu torta',
  [ROUTES.designRequests]: 'Mis diseños',
  [ROUTES.adminCakes]: 'Producción de tortas',
  [ROUTES.plans]: 'Planes',
  [ROUTES.coverage]: 'Zonas de entrega',
  [ROUTES.cart]: 'Tu carrito',
  [ROUTES.checkout]: 'Finalizar compra',
  [ROUTES.checkoutSuccess]: 'Pedido confirmado',
  [ROUTES.paymentSimulator]: 'Simulador de pago',
  [ROUTES.login]: 'Ingresar',
  [ROUTES.register]: 'Crear cuenta',
  [ROUTES.forgotPassword]: 'Recuperar contraseña',
  [ROUTES.resetPassword]: 'Restablecer contraseña',
  [ROUTES.complaints]: 'Libro de reclamaciones',
  [ROUTES.privacy]: 'Política de privacidad',
  [ROUTES.terms]: 'Términos y condiciones',
  [ROUTES.cookies]: 'Política de cookies',
  [ROUTES.deleteAccount]: 'Eliminar mi cuenta',
  [ROUTES.account]: 'Mi cuenta',
  [ROUTES.accountNotifications]: 'Notificaciones',
  [ROUTES.accountProfile]: 'Mi perfil',
  [ROUTES.accountOrders]: 'Mis pedidos',
  [ROUTES.accountWallet]: 'Mi saldo',
  [ROUTES.accountAddresses]: 'Mis direcciones',
  [ROUTES.accountFavorites]: 'Mis favoritos',
  [ROUTES.accountSavedBowls]: 'Recetas guardadas',
};

/**
 * Rutas con parte variable. El titulo se arma con lo que ya viaja en la URL; las
 * paginas que conocen el dato real (nombre del plato) lo afinan despues, porque su
 * efecto corre por debajo del de este componente.
 */
const PATTERN_TITLES: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^\/tortas\/[^/]+$/, () => 'Crea tu torta'],
  [/^\/cuenta\/pedidos\/([^/]+)$/, (match) => `Pedido ${decodeURIComponent(match[1])}`],
  [
    /^\/menu\/([^/]+)$/,
    (match) => {
      const words = decodeURIComponent(match[1]).replace(/-/g, ' ').trim();
      return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Menú';
    },
  ],
  [/^\/admin(\/|$)/, () => 'Panel de gestión'],
];

const resolveTitle = (pathname: string, search = ''): string => {
  // Sin la barra final, "/menu/" y "/menu" no son la misma clave.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === ROUTES.home) return HOME_TITLE;
  if (new URLSearchParams(search).get('solicitud') === 'especial') {
    return `Solicitar diseño especial | ${BRAND}`;
  }
  const exact = EXACT_TITLES[path];
  if (exact) return `${exact} | ${BRAND}`;

  for (const [pattern, build] of PATTERN_TITLES) {
    const match = path.match(pattern);
    if (match) return `${build(match)} | ${BRAND}`;
  }

  return `Página no encontrada | ${BRAND}`;
};

/**
 * Efectos al cambiar de ruta:
 *  - Pone el titulo del navegador (pestañas, historial y lo que se comparte).
 *  - Sube el scroll al cambiar de pantalla; los filtros de la misma ruta conservan la posicion.
 *  - Mueve el foco al contenido principal (navegación por teclado / lectores).
 *  - Anuncia la página nueva por una región aria-live.
 */
export const RouteEffects = () => {
  const { pathname, search } = useLocation();
  const { content } = useStorefront();
  const seoContent = pathname === ROUTES.home || pathname === ROUTES.howToOrder ? content : FALLBACK_CONTENT;
  const [announcement, setAnnouncement] = useState('');
  const isFirstRender = useRef(true);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    const pathnameChanged = previousPathname.current !== pathname;
    previousPathname.current = pathname;
    if (pathnameChanged || isFirstRender.current) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    // En la carga inicial no robamos el foco del navegador.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const main = document.querySelector('main');
    if (main instanceof HTMLElement) {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }

    const timer = window.setTimeout(() => {
      const heading = document.querySelector('main h1')?.textContent?.trim();
      setAnnouncement(heading ? `${heading}. Página cargada.` : 'Página cargada.');
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pathname, search]);

  useEffect(() => {
    applyStorefrontSeo(pathname, seoContent, resolveTitle(pathname, search));
  }, [pathname, search, seoContent]);

  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </div>
  );
};
