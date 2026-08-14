/**
 * Nombres legibles de los roles del sistema.
 *
 * El token solo transporta el CODIGO del rol (customer, kitchen, admin...).
 * Aqui lo traducimos a un nombre en espanol para mostrarlo en la interfaz.
 * Debe reflejar los roles sembrados en backend/src/database/seeders/rbac.seeder.ts.
 */
export const ROLE_LABELS: Record<string, string> = {
  customer: 'Cliente',
  kitchen: 'Cocina',
  waiter: 'Mozo',
  cashier: 'Cajero',
  dispatcher: 'Despachador',
  driver: 'Repartidor',
  support: 'Soporte',
  catalog_manager: 'Gestor de catalogo',
  nutritionist: 'Nutricionista',
  branch_admin: 'Admin de sucursal',
  admin: 'Administrador general',
  auditor: 'Auditor',
};

/** Traduce un codigo de rol a su nombre legible (o el propio codigo si no se conoce). */
export const roleLabel = (code: string): string => ROLE_LABELS[code] ?? code;

/** Une varios codigos de rol en un texto legible: "Cocina, Repartidor". */
export const rolesLabel = (codes: string[]): string => codes.map(roleLabel).join(', ');
