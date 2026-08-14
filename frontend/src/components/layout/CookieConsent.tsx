import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';
import { getAnalyticsConsent, setAnalyticsConsent } from '@services/analytics';

/** Consentimiento separado: rechazar medición no bloquea sesión, carrito ni compra. */
export const CookieConsent = () => {
  const [choice, setChoice] = useState(getAnalyticsConsent);
  if (choice) return null;

  const choose = (next: 'accepted' | 'rejected') => {
    setAnalyticsConsent(next);
    setChoice(next);
  };

  /* El banner se apilaba encima de StickyActionBar y tapaba "Agregar", "Continuar" y
   * "Confirmar pedido" en las cuatro pantallas con barra fija. Se levanta lo que mida
   * la barra (variable que ella publica) y se toma el mayor frente al safe-area porque
   * el alto de la barra ya lo incluye. El respaldo de 5.5rem cubre el hueco entre el
   * primer pintado y la medicion de la barra: sin el, el banner tapa el CTA mientras
   * la pantalla carga. En las rutas sin barra fija eso deja el banner algo mas alto. */
  const bottomOffset =
    'calc(0.75rem + max(env(safe-area-inset-bottom, 0px), var(--sticky-action-bar-h, 5.5rem)))';

  return (
    <aside
      aria-label="Preferencias de privacidad"
      /* z-40: por encima de la barra fija (z-30) y por debajo de los modales de MUI
       * (1300). El bottom-3 queda como red: si un navegador viejo no entiende el
       * calc de abajo, descarta esa declaracion y el banner vuelve a su sitio. */
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-3xl rounded-card border border-line bg-white p-4 shadow-e5 sm:flex sm:items-center sm:justify-between sm:gap-5"
      style={{ bottom: bottomOffset }}
    >
      <p className="text-sm leading-6 text-ink-muted">
        Usamos almacenamiento necesario para sesión y carrito. Con tu permiso, también medimos de
        forma propia cómo funciona la web, sin redes publicitarias.{' '}
        <Link className="font-bold text-brand-700 underline" to={ROUTES.cookies}>Ver detalles</Link>.
      </p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <Button size="sm" variant="outline" onClick={() => choose('rejected')}>Solo necesario</Button>
        <Button size="sm" onClick={() => choose('accepted')}>Aceptar medición</Button>
      </div>
    </aside>
  );
};
