import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Restablece el scroll al cambiar de ruta; evita aterrizar a mitad de la nueva pantalla. */
export const RouteEffects = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
};
