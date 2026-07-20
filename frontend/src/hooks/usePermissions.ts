import { useMemo } from 'react';
import { useAppSelector } from '@app/hooks';

/**
 * Permisos del usuario que inicio sesion.
 *
 * OJO: esto es solo COMODIDAD VISUAL. Ocultar un boton no protege nada: si alguien
 * escribe la URL a mano, quien lo frena es el backend (403). Nunca confies en este
 * hook como medida de seguridad.
 */
export const usePermissions = () => {
  const user = useAppSelector((state) => state.auth.user);

  return useMemo(() => {
    const granted = new Set(user?.permissions ?? []);
    const isSuperAdmin = user?.isSuperAdmin ?? false;

    /** El superadmin los tiene todos por definicion. */
    const can = (...required: string[]): boolean =>
      isSuperAdmin || required.every((permission) => granted.has(permission));

    /** Basta con uno de ellos. */
    const canAny = (...allowed: string[]): boolean =>
      isSuperAdmin || allowed.some((permission) => granted.has(permission));

    return {
      can,
      canAny,
      isSuperAdmin,
      permissions: [...granted],
      /** Sucursales asignadas. Vacio = alcance global. */
      branchIds: user?.branchIds ?? [],
      /** true si el usuario puede entrar al panel (tiene algun permiso interno). */
      isStaff: isSuperAdmin || granted.size > 0,
    };
  }, [user]);
};
