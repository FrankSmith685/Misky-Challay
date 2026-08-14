import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';

export interface StaffAccess {
  to: string;
  shortLabel: string;
  actionLabel: string;
  menuLabel: string;
}

const PANEL: StaffAccess = {
  to: ROUTES.admin,
  shortLabel: 'Panel',
  actionLabel: 'Ir al panel de gestión',
  menuLabel: 'Panel de gestión',
};

const ACCESS_BY_ROLE: Record<string, StaffAccess> = {
  kitchen: { to: ROUTES.adminKitchen, shortLabel: 'Cocina', actionLabel: 'Ir a Cocina', menuLabel: 'Cocina' },
  waiter: { to: ROUTES.adminDining, shortLabel: 'Salón', actionLabel: 'Ir a Salón', menuLabel: 'Salón y comandas' },
  cashier: { to: ROUTES.adminCash, shortLabel: 'Caja', actionLabel: 'Ir a Caja', menuLabel: 'Caja y rendimiento' },
  dispatcher: { to: ROUTES.adminDelivery, shortLabel: 'Reparto', actionLabel: 'Ir a Reparto', menuLabel: 'Reparto' },
  driver: { to: ROUTES.adminDelivery, shortLabel: 'Entregas', actionLabel: 'Ver mis entregas', menuLabel: 'Mis entregas' },
  support: { to: ROUTES.adminOrders, shortLabel: 'Pedidos', actionLabel: 'Atender pedidos', menuLabel: 'Pedidos y soporte' },
  catalog_manager: { to: ROUTES.adminCatalog, shortLabel: 'Catálogo', actionLabel: 'Gestionar catálogo', menuLabel: 'Catálogo' },
  nutritionist: { to: ROUTES.adminCatalog, shortLabel: 'Nutrición', actionLabel: 'Gestionar nutrición', menuLabel: 'Catálogo y nutrición' },
  branch_admin: PANEL,
  admin: PANEL,
  auditor: PANEL,
};

/**
 * Resuelve la estación laboral visible desde la tienda y la cuenta personal.
 * Los roles del sistema ofrecen la etiqueta más humana. Para roles personalizados
 * se infiere el destino por permisos. Si una persona combina varios puestos se
 * conserva “Panel”, porque elegir solo uno ocultaría sus otros espacios de trabajo.
 */
export const resolveStaffAccess = (input: {
  roles?: string[];
  permissions?: string[];
  isSuperAdmin?: boolean;
}): StaffAccess => {
  if (input.isSuperAdmin) return PANEL;

  const staffRoles = (input.roles ?? []).filter((role) => role !== 'customer');
  if (staffRoles.length > 1) return PANEL;
  if (staffRoles.length === 1 && ACCESS_BY_ROLE[staffRoles[0]]) return ACCESS_BY_ROLE[staffRoles[0]];

  const granted = new Set(input.permissions ?? []);
  const hasAny = (...permissions: string[]) => permissions.some((permission) => granted.has(permission));

  if (hasAny(PERM.DINING_READ, PERM.DINING_OPERATE)) return ACCESS_BY_ROLE.waiter;
  if (hasAny(PERM.DELIVERY_READ, PERM.DELIVERY_ASSIGN, PERM.DELIVERY_OPERATE)) return ACCESS_BY_ROLE.driver;
  if (hasAny(PERM.KITCHEN_READ, PERM.KITCHEN_OPERATE)) return ACCESS_BY_ROLE.kitchen;
  if (hasAny(PERM.ORDER_READ, PERM.ORDER_UPDATE_STATUS, PERM.ORDER_CANCEL, PERM.PAYMENT_READ, PERM.PAYMENT_REFUND)) return ACCESS_BY_ROLE.support;
  if (hasAny(PERM.INVENTORY_READ, PERM.INVENTORY_MANAGE)) return { to: ROUTES.adminInventory, shortLabel: 'Inventario', actionLabel: 'Ir a Inventario', menuLabel: 'Inventario' };
  if (hasAny(PERM.CATALOG_PRODUCT_READ, PERM.CATALOG_PRODUCT_WRITE, PERM.NUTRITION_READ, PERM.NUTRITION_WRITE)) return ACCESS_BY_ROLE.catalog_manager;
  return PANEL;
};
