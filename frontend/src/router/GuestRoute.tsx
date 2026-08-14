import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@app/hooks';
import { usePermissions } from '@hooks/usePermissions';
import { readReturnTo, resolveAfterAuthPath } from '@features/auth/authRedirect';
import { resolveStaffAccess } from '@features/auth/staffAccess';

/**
 * Guard inverso de ProtectedRoute.
 *
 * ProtectedRoute responde "esto exige sesion"; este responde lo contrario: acceder,
 * crear cuenta o recuperar la clave solo tienen sentido SIN sesion. Sin el, quien
 * ya entro puede volver a /ingresar con el boton atras o escribiendo la URL, y se
 * queda mirando un formulario de login mientras su sesion sigue abierta.
 *
 * Manda al mismo destino que el propio login (a donde volvia, o su portada segun
 * sea cliente o equipo), asi que da igual quien de los dos redirija primero.
 *
 * Es solo experiencia de usuario: quien manda sigue siendo el backend.
 */
export const GuestRoute = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const user = useAppSelector((state) => state.auth.user);
  const { isStaff } = usePermissions();

  if (!isAuthenticated) return <>{children}</>;

  return <Navigate to={resolveAfterAuthPath(readReturnTo(location), isStaff, resolveStaffAccess({ roles: user?.roles, permissions: user?.permissions, isSuperAdmin: user?.isSuperAdmin }).to)} replace />;
};
