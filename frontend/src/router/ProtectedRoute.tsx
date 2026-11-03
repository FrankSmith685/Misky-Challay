import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { ShieldAlert } from 'lucide-react';
import { useAppSelector } from '@app/hooks';
import { usePermissions } from '@hooks/usePermissions';
import { ROUTES } from '@constants/routes';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Debe tener TODOS estos permisos. */
  permissions?: string[];
  /** Le basta con UNO de estos permisos. */
  anyPermission?: string[];
  /** No se puede delegar mediante roles o permisos. */
  superAdminOnly?: boolean;
}

/**
 * Guard de navegacion.
 *
 * Filtra por PERMISO, no por rol: asi un rol nuevo creado desde el panel
 * (por ejemplo "editor de pastelería") funciona sin tocar el router.
 *
 * Es solo experiencia de usuario. La autorizacion real la valida el backend:
 * si alguien fuerza la URL, el API responde 403 igual (seccion 7.1).
 */
export const ProtectedRoute = ({ children, permissions, anyPermission, superAdminOnly }: ProtectedRouteProps) => {
  const location = useLocation();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { can, canAny, isSuperAdmin } = usePermissions();

  if (!isAuthenticated) {
    // Con el search: volver a "/cuenta/pedidos" perdiendo "?estado=EN_CAMINO" es
    // devolverlo a media pantalla de donde estaba.
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={ROUTES.login} state={{ from }} replace />;
  }

  if ((superAdminOnly && !isSuperAdmin) || (permissions && !can(...permissions)) || (anyPermission && !canAny(...anyPermission))) return (
    <main className="container-shell py-12"><EmptyState icon={ShieldAlert} title="No tienes acceso a esta vista" description="Tu cuenta no tiene los permisos necesarios para abrir este aviso o tus permisos cambiaron. Puedes consultar los avisos de tu cuenta." action={<Button component={Link} to={ROUTES.account}>Ir a mi cuenta</Button>} /></main>
  );

  return <>{children}</>;
};

