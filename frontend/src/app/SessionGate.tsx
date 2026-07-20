import { useEffect, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from './hooks';
import { fetchCurrentUser, logout } from '@features/auth/authSlice';
import { tokenStorage } from '@services/api/client';

/**
 * PORTERO DE SESION
 * ---------------------------------------------------------------------------
 * Antes de mostrar la app, confirma con el backend (/auth/me) QUIEN es el usuario
 * y que permisos tiene AHORA MISMO. Asi:
 *
 *  - La sesion guardada en localStorage deja de ser "la verdad": si el token ya
 *    no vale (expirado o revocado), el backend responde 401 y aqui limpiamos todo.
 *  - Nadie puede editar localStorage para aparentar ser superadmin: al recargar,
 *    /auth/me devuelve los permisos reales (o cierra la sesion).
 *
 * Mientras revalida se muestra una pantalla de carga, evitando el parpadeo de una
 * interfaz con permisos desactualizados.
 */
export const SessionGate = ({ children }: { children: ReactNode }) => {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hasToken = Boolean(tokenStorage.getAccess() ?? tokenStorage.getRefresh());

    if (!hasToken) {
      // Estado persistido sin token real = inconsistente. Reconciliamos.
      if (isAuthenticated) dispatch(logout());
      setReady(true);
      return;
    }

    // Hay token: preguntamos al backend quienes somos antes de pintar la app.
    void dispatch(fetchCurrentUser()).finally(() => setReady(true));
    // Solo debe correr una vez, al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Cierre de sesion forzado desde el interceptor de axios (401 y el refresh fallo).
  useEffect(() => {
    const onForcedLogout = () => dispatch(logout());
    window.addEventListener('auth:logout', onForcedLogout);
    return () => window.removeEventListener('auth:logout', onForcedLogout);
  }, [dispatch]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loader2 className="size-8 animate-spin text-brand-600" />
        <span className="sr-only">Verificando tu sesion...</span>
      </div>
    );
  }

  return <>{children}</>;
};
