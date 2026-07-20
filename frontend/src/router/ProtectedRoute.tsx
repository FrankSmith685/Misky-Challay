import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '@app/hooks';
import { usePermissions } from '@hooks/usePermissions';
import { ROUTES } from '@constants/routes';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Debe tener TODOS estos permisos. */
  permissions?: string[];
  /** Le basta con UNO de estos permisos. */
  anyPermission?: string[];
}

/**
 * Guard de navegacion.
 *
 * Filtra por PERMISO, no por rol: asi un rol nuevo creado desde el panel
 * (por ejemplo "nutricionista junior") funciona sin tocar el router.
 *
 * Es solo experiencia de usuario. La autorizacion real la valida el backend:
 * si alguien fuerza la URL, el API responde 403 igual (seccion 7.1).
 */
export const ProtectedRoute = ({ children, permissions, anyPermission }: ProtectedRouteProps) => {
  const location = useLocation();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { can, canAny } = usePermissions();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} state={{ from: location.pathname }} replace />;
  }

  if (permissions && !can(...permissions)) {
    return <Navigate to={ROUTES.home} replace />;
  }

  if (anyPermission && !canAny(...anyPermission)) {
    return <Navigate to={ROUTES.home} replace />;
  }

  return <>{children}</>;
};
