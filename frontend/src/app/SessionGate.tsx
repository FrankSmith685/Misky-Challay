import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const attempt = useRef(0);

  useEffect(() => {
    const version = ++attempt.current;
    const hasToken = Boolean(tokenStorage.getAccess() || tokenStorage.getRefresh());

    if (!hasToken) {
      // Estado persistido sin token real = inconsistente. Reconciliamos.
      if (isAuthenticated) dispatch(logout());
      setReady(true);
      return;
    }

    // Hay token: preguntamos al backend quienes somos antes de pintar la app.
    void dispatch(fetchCurrentUser()).finally(() => {
      if (attempt.current === version) setReady(true);
    });
    // Solo debe correr una vez, al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Cierre de sesion forzado desde el interceptor de axios (401 y el refresh fallo).
  useEffect(() => {
    let storageTimer: number | undefined;
    const onForcedLogout = () => {
      attempt.current++;
      dispatch(logout());
      setReady(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage
        || (event.key !== null && !tokenStorage.isKey(event.key))) return;
      tokenStorage.invalidateRequests();
      attempt.current++;
      window.clearTimeout(storageTimer);
      if (!tokenStorage.getAccess() && !tokenStorage.getRefresh()) {
        onForcedLogout();
        return;
      }
      // Otra pestaña pudo cambiar de cliente. Se oculta la experiencia anterior
      // hasta confirmar la identidad y el reducer descarta sus datos si cambió.
      setReady(false);
      storageTimer = window.setTimeout(() => {
        const version = ++attempt.current;
        void dispatch(fetchCurrentUser()).finally(() => {
          if (attempt.current === version) setReady(true);
        });
      }, 0);
    };
    window.addEventListener('auth:logout', onForcedLogout);
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearTimeout(storageTimer);
      window.removeEventListener('auth:logout', onForcedLogout);
      window.removeEventListener('storage', onStorage);
    };
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
