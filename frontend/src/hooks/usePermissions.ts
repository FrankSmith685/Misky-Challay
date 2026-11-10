import { useMemo } from 'react';
import { useAppSelector } from '@app/hooks';

const IMPLIED_PERMISSIONS: Record<string, readonly string[]> = {
  'catalog.product.write': ['catalog.product.read'],
  'catalog.product.publish': ['catalog.product.read'],
  'catalog.category.write': ['catalog.product.read'],
  'catalog.availability.write': ['catalog.product.read'],
  'catalog.customization.write': ['catalog.product.read'],
  'allergen.write': ['catalog.product.read'],
  'dietary_tag.write': ['catalog.product.read'],
  'geo.write': ['geo.read'],
  'order.update_status': ['order.read'],
  'order.cancel': ['order.read'],
  'experience.write': ['experience.read'],
  'experience.publish': ['experience.read'],
  'kitchen.operate': ['kitchen.read'],
  'dining.operate': ['dining.read'],
  'inventory.manage': ['inventory.read'],
  'procurement.manage': ['procurement.read'],
  'delivery.assign': ['delivery.read'],
  'delivery.operate': ['delivery.read'],
  'payment.verify': ['payment.read'],
  'payment.refund': ['payment.read'],
  'invoice.manage': ['payment.read', 'order.read'],
  'plan.manage': ['plan.read'],
  'cake.finance.manage': ['cake.finance.read'],
  'user.manage': ['user.read'],
  'customer.manage': ['customer.read'],
  'role.manage': ['role.read'],
  'audit.export': ['audit.read'],
  'audit.verify': ['audit.read'],
  'audit.retention': ['audit.read'],
  'settings.design.manage': ['settings.design.read'],
  'settings.design.publish': ['settings.design.read'],
  'communication.reply': ['communication.read'],
  'complaint.manage': ['complaint.read', 'complaint.respond', 'complaint.reopen', 'complaint.export'],
  'complaint.respond': ['complaint.read'],
  'complaint.reopen': ['complaint.read'],
  'complaint.export': ['complaint.read'],
};

const expandPermissions = (permissions: readonly string[]): Set<string> => {
  const expanded = new Set(permissions);
  let changed = true;
  while (changed) {
    changed = false;
    for (const permission of [...expanded]) {
      for (const implied of IMPLIED_PERMISSIONS[permission] ?? []) {
        if (!expanded.has(implied)) {
          expanded.add(implied);
          changed = true;
        }
      }
    }
  }
  return expanded;
};

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
    const granted = expandPermissions(user?.permissions ?? []);
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
      roles: user?.roles ?? [],
      permissions: [...granted],
      /** Sucursales asignadas. El alcance global automatico queda reservado al superadmin. */
      branchIds: user?.branchIds ?? [],
      /** true si el usuario puede entrar al panel (tiene algun permiso interno). */
      isStaff: isSuperAdmin || granted.size > 0,
    };
  }, [user]);
};
